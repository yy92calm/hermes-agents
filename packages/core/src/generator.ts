import type { ExpertTeam, ExpertAgent } from "./types.js"

const MODEL_MAP: Record<string, string> = {
  "claude-sonnet-4": "anthropic/claude-sonnet-4-20250514",
  "claude-opus-4": "anthropic/claude-opus-4-20250514",
  "claude-haiku-4": "anthropic/claude-haiku-4-20250514",
  "claude-sonnet-4.5": "anthropic/claude-sonnet-4-5-20250514",
  "claude-opus-4.5": "anthropic/claude-opus-4-5-20250514",
  "gpt-4o": "openai/gpt-4o",
  "gpt-4.1": "openai/gpt-4-1",
  "gpt-5": "openai/gpt-5",
  "gemini-2.5-flash": "google/gemini-2-5-flash",
  "gemini-2.5-pro": "google/gemini-2-5-pro",
  "deepseek-v3": "deepseek/deepseek-v3",
  "deepseek-r1": "deepseek/deepseek-r1",
}

function resolveModel(model: string | undefined): string | undefined {
  if (!model) return undefined
  return MODEL_MAP[model] ?? model
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function toPascalCase(name: string): string {
  return name.split(/[-\s]+/).map(capitalize).join("")
}

function safeIdent(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_")
}

function agentToolDesc(team: string, agent: ExpertAgent): string {
  let desc = `[${team}] ${agent.name} - ${agent.role}: ${agent.description}`
  if (agent.skills?.length) desc += ` | skills: ${agent.skills.map((s) => s.name).join(", ")}`
  if (agent.rules?.length) desc += ` | rules: ${agent.rules.length} defined`
  if (agent.mcpServers?.length) desc += ` | mcp: ${agent.mcpServers.map((m) => m.name).join(", ")}`
  if (agent.agentConfig?.model) desc += ` | model: ${agent.agentConfig.model}`
  return desc
}

function agentContextBlock(agent: ExpertAgent): string {
  const parts: string[] = []
  parts.push(`agent: "${agent.name}"`)
  parts.push(`role: "${agent.role}"`)

  if (agent.skills?.length) {
    parts.push(`skills: [${agent.skills.map((s) => `\`${s.name}: ${s.description}\``).join(", ")}]`)
  }
  if (agent.rules?.length) {
    parts.push(`rules: [${agent.rules.map((r) => `\`${r.title}\``).join(", ")}]`)
  }
  if (agent.mcpServers?.length) {
    parts.push(`mcp_servers: [${agent.mcpServers.map((m) => `\`${m.name}\``).join(", ")}]`)
  }
  if (agent.agentConfig?.model) {
    parts.push(`model: "${agent.agentConfig.model}"`)
  }

  return parts.join(",\n    ")
}

/** Build relative path prefix like "teams/research/generated" */
function generatedPrefix(teamName: string): string {
  return `teams/${teamName}/generated`
}

export function generatePluginSource(team: ExpertTeam): string {
  const pascalName = toPascalCase(team.name)
  const prefix = generatedPrefix(team.name)

  const agentHandlers = team.agents.map((agent) => {
    const sf = safeIdent(`${team.name}_${agent.name}`)
    const skillPaths = agent.skills?.map((s) =>
      `${prefix}/skills/${agent.name}-${s.name}/SKILL.md`
    ) ?? []
    const rulePaths = agent.rules?.length
      ? [`${prefix}/rules/${agent.name}.md`]
      : []

    return `
async function handle_${sf}(args, context) {
  const baseDir = context.directory ?? process.cwd()

  const dispatch = {
    ${agentContextBlock(agent)},
    instructions: [${agent.instructions.map((i) => `\`${i.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``).join(", ")}],
    task: args.task ?? null,
    context: args.context ?? null,
    team: "${team.name}",
    ${skillPaths.length ? `skill_paths: [${skillPaths.map((p) => `"${p}"`).join(", ")}],` : ""}
    ${rulePaths.length ? `rule_paths: [${rulePaths.map((p) => `"${p}"`).join(", ")}],` : ""}
  }

  return JSON.stringify(dispatch, null, 2)
}`
  }).join("\n")

  const agentTools = team.agents.map((agent) => {
    const toolName = `${team.name}-${agent.name}`
    const handlerIdent = safeIdent(`${team.name}_${agent.name}`)
    return `
      "${toolName}": tool({
        description: ${JSON.stringify(agentToolDesc(team.name, agent))},
        args: {
          task: tool.schema.string().optional().describe("The task to assign to this expert"),
          context: tool.schema.string().optional().describe("Additional context"),
        },
        async execute(args, context) {
          return await handle_${handlerIdent}(args, context)
        },
      }),`
  }).join("\n")

  const expertEntries = team.agents.map((a) => {
    const info: Record<string, unknown> = { name: a.name, role: a.role, description: a.description }
    if (a.skills?.length) info.skills = a.skills.map((s) => s.name)
    if (a.mcpServers?.length) info.mcpServers = a.mcpServers.map((m) => m.name)
    return JSON.stringify(info)
  }).join(",\n")

  const allMcpServers = team.agents.flatMap((a) => a.mcpServers ?? [])

  return `import { tool } from "@opencode-ai/plugin"

${agentHandlers}

export const server = async () => {
  return {
    tool: {${agentTools}
      "team-${team.name}-delegate": tool({
        description: ${JSON.stringify(`Delegate a task to the best expert in ${team.name}`)},
        args: {
          task: tool.schema.string().describe("Task description"),
          expert: tool.schema.string().optional().describe("Specific expert name"),
          context: tool.schema.string().optional().describe("Additional context"),
        },
        async execute(args) {
          const experts = [${expertEntries}]
          if (args.expert) {
            const match = experts.find(e => e.name === args.expert)
            if (!match) return \`Expert "\${args.expert}" not found. Available: \${experts.map(e => e.name).join(", ")}\`
            return \`Delegating "\${args.task}" to \${match.name} (\${match.role})\`
          }
          return \`Available experts:\\n\${experts.map(e => {
            let s = \`  \${e.name} (\${e.role}): \${e.description}\`
            if (e.skills) s += \` [skills: \${e.skills.join(", ")}]\`
            return s
          }).join("\\n")}\`
        },
      }),
      "team-${team.name}-list": tool({
        description: ${JSON.stringify(`List all experts in ${team.name} with their skills, rules, MCPs`)},
        args: {},
        async execute() {
          const experts = [${expertEntries}]
          let out = \`Team: ${team.name} | ${team.description}\\nExperts:\`
          for (const e of experts) {
            out += \`\\n  \${e.name} (\${e.role}): \${e.description}\`
            if (e.skills) out += \`\\n     skills: \${e.skills.join(", ")}\`
            if (e.mcpServers) out += \`\\n     mcp: \${e.mcpServers.join(", ")}\`
          }
          ${allMcpServers.length > 0 ? `out += \`\\n\\nTeam MCPs: ${allMcpServers.map((m) => `${m.name}`).join(", ")}\`` : ""}
          out += \`\\n\\nGenerated files: ${prefix}/\`
          return out
        },
      }),
    },
  }
}

export default server`
}

/**
 * Generate a plugin that uses the config hook to register agents as native OpenCode subagents.
 * No markdown files needed — agents are injected via config.agent at runtime.
 */
export function generateConfigBasedPluginSource(team: ExpertTeam): string {
  const agents = team.agents.map((a) => {
    const promptParts: string[] = []

    promptParts.push(`You are the **${a.role}** (${a.name}) in the **${team.name}** team. ${a.description}`)
    promptParts.push("")

    if (a.instructions.length > 0) {
      promptParts.push("## Instructions")
      for (const inst of a.instructions) promptParts.push(`- ${inst}`)
      promptParts.push("")
    }

    if (a.skills?.length) {
      promptParts.push("## Skills")
      for (const skill of a.skills) {
        promptParts.push(`- **${skill.name}**: ${skill.description}`)
        if (skill.instructions?.length) {
          for (const si of skill.instructions) promptParts.push(`  - ${si}`)
        }
      }
      promptParts.push("")
    }

    if (a.rules?.length) {
      promptParts.push("## Rules")
      for (const rule of a.rules) {
        promptParts.push(`- **${rule.title}**`)
        for (const c of rule.content) promptParts.push(`  - ${c}`)
      }
      promptParts.push("")
    }

    if (a.mcpServers?.length) {
      promptParts.push("## Available MCP Servers")
      for (const mcp of a.mcpServers) promptParts.push(`- ${mcp.name}: ${mcp.command.join(" ")}`)
      promptParts.push("")
    }

    return {
      agentKey: `${team.name}-${a.name}`,
      description: `${a.role} - ${a.description}`,
      prompt: promptParts.join("\n"),
      model: resolveModel(a.agentConfig?.model),
      temperature: a.agentConfig?.temperature,
      permissions: a.agentConfig?.permissions,
      color: a.agentConfig?.color,
      maxSteps: a.agentConfig?.maxSteps,
      tools: Array.isArray(a.tools) ? Object.fromEntries(a.tools.map((t) => [t, true])) : a.tools,
    }
  })

  // Deduplicate MCP servers across all agents
  const mcpMap = new Map<string, ExpertMcpServer>()
  for (const a of team.agents) {
    for (const m of (a.mcpServers ?? [])) {
      if (!mcpMap.has(m.name)) mcpMap.set(m.name, m)
    }
  }
  const mcpServers = Array.from(mcpMap.values())

  const agentsJson = JSON.stringify(agents)
  const mcpJson = JSON.stringify(mcpServers.map(m => ({
    name: m.name,
    command: m.command,
    description: m.description ?? `MCP server for ${team.name}`,
    env: m.env,
  })))

  return `import { tool } from "@opencode-ai/plugin"

const AGENTS = ${agentsJson}
const MCPS = ${mcpJson}

export const server = async () => {
  return {
    config: async (config) => {
      config.agent = config.agent || {}
      config.mcp = config.mcp || {}

      for (const a of AGENTS) {
        const entry = {
          description: a.description,
          prompt: a.prompt,
          mode: "subagent",
        }
        if (a.model) entry.model = a.model
        if (a.temperature != null) entry.temperature = a.temperature
        if (a.permissions) entry.permission = a.permissions
        if (a.color) entry.color = a.color
        if (a.maxSteps != null) entry.maxSteps = a.maxSteps
        if (a.tools) entry.tools = a.tools
        config.agent[a.agentKey] = entry
      }

      for (const m of MCPS) {
        config.mcp[m.name] = {
          command: m.command,
          description: m.description || "MCP server",
          enabled: true,
        }
      }
    },
    tool: {
      "${team.name}-list": tool({
        description: ${JSON.stringify(`List all experts in the ${team.name} team`)},
        args: {},
        async execute() {
          let out = ${JSON.stringify(`Team: ${team.name} | ${team.description}\n\nExperts:`)};
          for (const a of AGENTS) {
            out += "\\n  @" + a.agentKey + " - " + a.description
          }
          if (MCPS.length) {
            out += "\\n\\nMCP servers:"
            for (const m of MCPS) {
              out += "\\n  " + m.name + " (" + m.command.join(" ") + ")"
            }
          }
          return out
        },
      }),
    },
  }
}

export default server`
}
