export type {
  ExpertAgent,
  ExpertTeam,
  ExpertSkill,
  ExpertRule,
  ExpertMcpServer,
  ExpertAgentConfig,
  OrchestrationStrategy,
  PluginGenerationResult,
  TeamFile,
} from "./types.js"
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, cpSync } from "fs"
import { join, dirname } from "path"
import type { ExpertTeam, ExpertAgent, PluginGenerationResult } from "./types.js"
import { generatePluginSource, generateConfigBasedPluginSource } from "./generator.js"
export { generatePluginSource as generatePluginCode }

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

/** The generated directory for a team: teams/{name}/generated */
export function teamGeneratedDir(teamsDir: string, teamName: string): string {
  return join(teamsDir, teamName, "generated")
}

/** Relative path from project root to the team's generated plugin */
export function teamPluginRelPath(teamName: string): string {
  return `teams/${teamName}/generated/plugin.js`
}

export function loadTeam(teamsDir: string, teamName: string): ExpertTeam | null {
  const file = join(teamsDir, teamName, "team.json")
  if (!existsSync(file)) return null
  try {
    const data = JSON.parse(readFileSync(file, "utf-8"))
    return data.team ?? data
  } catch {
    return null
  }
}

export function saveTeam(team: ExpertTeam, teamsDir: string): boolean {
  const dir = join(teamsDir, team.name)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, "team.json")
  const data = { team, updatedAt: new Date().toISOString() }
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8")
  return true
}

export function addAgentToTeam(team: ExpertTeam, agent: ExpertAgent): ExpertTeam {
  const existing = team.agents.findIndex((a) => a.name === agent.name)
  if (existing >= 0) team.agents[existing] = agent
  else team.agents.push(agent)
  return team
}

// --- Agent config manipulation ---

function findAgent(team: ExpertTeam, agentName: string): ExpertAgent {
  const agent = team.agents.find((a) => a.name === agentName)
  if (!agent) throw new Error(`Agent "${agentName}" not found in team "${team.name}"`)
  return agent
}

export function addSkillToAgent(team: ExpertTeam, agentName: string, skill: ExpertSkill): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.skills) agent.skills = []
  const existing = agent.skills.findIndex((s) => s.name === skill.name)
  if (existing >= 0) agent.skills[existing] = skill
  else agent.skills.push(skill)
  return team
}

export function removeSkillFromAgent(team: ExpertTeam, agentName: string, skillName: string): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.skills) return team
  agent.skills = agent.skills.filter((s) => s.name !== skillName)
  return team
}

export function addRuleToAgent(team: ExpertTeam, agentName: string, rule: ExpertRule): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.rules) agent.rules = []
  const existing = agent.rules.findIndex((r) => r.title === rule.title)
  if (existing >= 0) agent.rules[existing] = rule
  else agent.rules.push(rule)
  return team
}

export function removeRuleFromAgent(team: ExpertTeam, agentName: string, ruleTitle: string): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.rules) return team
  agent.rules = agent.rules.filter((r) => r.title !== ruleTitle)
  return team
}

export function addMcpToAgent(team: ExpertTeam, agentName: string, mcp: ExpertMcpServer): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.mcpServers) agent.mcpServers = []
  const existing = agent.mcpServers.findIndex((m) => m.name === mcp.name)
  if (existing >= 0) agent.mcpServers[existing] = mcp
  else agent.mcpServers.push(mcp)
  return team
}

export function removeMcpFromAgent(team: ExpertTeam, agentName: string, mcpName: string): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.mcpServers) return team
  agent.mcpServers = agent.mcpServers.filter((m) => m.name !== mcpName)
  return team
}

export function setAgentModel(team: ExpertTeam, agentName: string, model: string): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.agentConfig) agent.agentConfig = {}
  agent.agentConfig.model = model
  return team
}

export function setAgentTemperature(team: ExpertTeam, agentName: string, temperature: number): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.agentConfig) agent.agentConfig = {}
  agent.agentConfig.temperature = temperature
  return team
}

export function setAgentPermissions(team: ExpertTeam, agentName: string, permissions: Record<string, "allow" | "deny" | "ask">): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.agentConfig) agent.agentConfig = {}
  agent.agentConfig.permissions = permissions
  return team
}

export function setAgentColor(team: ExpertTeam, agentName: string, color: string): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.agentConfig) agent.agentConfig = {}
  agent.agentConfig.color = color
  return team
}

export function setAgentMaxSteps(team: ExpertTeam, agentName: string, maxSteps: number): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.agentConfig) agent.agentConfig = {}
  agent.agentConfig.maxSteps = maxSteps
  return team
}

export function setAgentTools(team: ExpertTeam, agentName: string, tools: Record<string, boolean>): ExpertTeam {
  const agent = findAgent(team, agentName)
  agent.tools = tools
  return team
}

// --- File generation ---

export function generateSkillFiles(team: ExpertTeam, skillsDir: string): string[] {
  const generated: string[] = []
  for (const agent of team.agents) {
    if (!agent.skills?.length) continue
    for (const skill of agent.skills) {
      const skillDirName = `${agent.name}-${skill.name}`
      const skillDir = join(skillsDir, skillDirName)
      mkdirSync(skillDir, { recursive: true })
      const instructions = skill.instructions?.map((i) => `- ${i}`).join("\n") ?? ""
      const content = `---
name: ${skillDirName}
description: ${skill.description}
---

# ${skill.name}

Expert: **${agent.name}** (${agent.role}) in **${team.name}**

## Instructions

${instructions || "- Follow best practices for this domain"}
`
      const file = join(skillDir, "SKILL.md")
      writeFileSync(file, content, "utf-8")
      generated.push(file)
    }
  }
  return generated
}

export function generateRuleFiles(team: ExpertTeam, rulesDir: string): string[] {
  const generated: string[] = []
  for (const agent of team.agents) {
    if (!agent.rules?.length) continue
    mkdirSync(rulesDir, { recursive: true })
    const sections = agent.rules.map(
      (r) => `## ${r.title}\n\n${r.content.map((c) => `- ${c}`).join("\n")}`,
    )
    const content = `# ${team.name}-${agent.name} Rules\n\n${sections.join("\n\n")}\n`
    const file = join(rulesDir, `${agent.name}.md`)
    writeFileSync(file, content, "utf-8")
    generated.push(file)
  }
  return generated
}

export function generateAgentFiles(team: ExpertTeam, agentsDir: string): string[] {
  const generated: string[] = []
  mkdirSync(agentsDir, { recursive: true })

  for (const agent of team.agents) {
    const agentName = `${team.name}-${agent.name}`
    const lines: string[] = []

    // Frontmatter
    lines.push("---")
    lines.push(`description: ${agent.role} - ${agent.description}`)
    lines.push("mode: subagent")

    const model = resolveModel(agent.agentConfig?.model)
    if (model) lines.push(`model: ${model}`)

    if (agent.agentConfig?.temperature !== undefined) {
      lines.push(`temperature: ${agent.agentConfig.temperature}`)
    }

    if (agent.agentConfig?.permissions) {
      lines.push("permission:")
      for (const [key, val] of Object.entries(agent.agentConfig.permissions)) {
        lines.push(`  ${key}: ${val}`)
      }
    }

    lines.push("---")
    lines.push("")

    // Body
    lines.push(`You are the **${agent.role}** (${agent.name}) in the **${team.name}** team.`)

    if (agent.instructions?.length) {
      lines.push("")
      lines.push("## Instructions")
      for (const inst of agent.instructions) {
        lines.push(`- ${inst}`)
      }
    }

    if (agent.skills?.length) {
      lines.push("")
      lines.push("## Skills")
      for (const skill of agent.skills) {
        lines.push(`- **${skill.name}**: ${skill.description}`)
        if (skill.instructions?.length) {
          for (const si of skill.instructions) {
            lines.push(`  - ${si}`)
          }
        }
      }
    }

    if (agent.rules?.length) {
      lines.push("")
      lines.push("## Rules")
      for (const rule of agent.rules) {
        lines.push(`- **${rule.title}**`)
        for (const c of rule.content) {
          lines.push(`  - ${c}`)
        }
      }
    }

    if (agent.mcpServers?.length) {
      lines.push("")
      lines.push("## Available MCP Servers")
      for (const mcp of agent.mcpServers) {
        lines.push(`- ${mcp.name}: ${mcp.command.join(" ")}`)
      }
    }

    lines.push("")

    const content = lines.join("\n")
    const file = join(agentsDir, `${agentName}.md`)
    writeFileSync(file, content, "utf-8")
    generated.push(file)
  }

  return generated
}

export function generateMcpConfigSnippet(team: ExpertTeam): string {
  const servers = team.agents.flatMap((a) => a.mcpServers ?? [])
  if (servers.length === 0) return ""
  const mcp: Record<string, unknown> = {}
  for (const s of servers) {
    mcp[s.name] = {
      command: s.command,
      description: s.description ?? `MCP server for ${team.name}`,
      enabled: true,
      type: s.type ?? "local",
      ...(s.env ? { env: s.env } : {}),
    }
  }
  return JSON.stringify({ mcp }, null, 2)
}

export function buildPlugin(team: ExpertTeam, teamsDir: string): PluginGenerationResult {
  const generatedDir = teamGeneratedDir(teamsDir, team.name)
  mkdirSync(generatedDir, { recursive: true })

  // Clean stale agent files (no longer needed — config hook handles agents)
  const staleAgents = join(generatedDir, "agents")
  if (existsSync(staleAgents)) rmSync(staleAgents, { recursive: true, force: true })

  // 1. Skill files for native OpenCode skill discovery
  const skillsDir = join(generatedDir, "skills")
  const skillFiles = generateSkillFiles(team, skillsDir)

  // 2. Rule files for native OpenCode rule discovery
  const rulesDir = join(generatedDir, "rules")
  const ruleFiles = generateRuleFiles(team, rulesDir)

  // 3. Plugin with config hook that injects agents + MCP at runtime
  const source = generateConfigBasedPluginSource(team)
  const pluginFile = join(generatedDir, "plugin.js")
  writeFileSync(pluginFile, source, "utf-8")

  const allFiles = [pluginFile, ...skillFiles, ...ruleFiles]

  return {
    success: true,
    pluginPath: pluginFile,
    generatedFiles: allFiles,
  }
}

export function listTeams(teamsDir: string): string[] {
  if (!existsSync(teamsDir)) return []
  try {
    return readdirSync(teamsDir).filter((d) => existsSync(join(teamsDir, d, "team.json")))
  } catch {
    return []
  }
}

export function listGeneratedPlugins(teamsDir: string): string[] {
  const teams = listTeams(teamsDir)
  return teams.filter((t) => existsSync(join(teamsDir, t, "generated", "plugin.js")))
}

export function activeTeamFromConfig(baseDir: string): string | null {
  const marker = join(baseDir, ".opencode", ".team-active")
  if (!existsSync(marker)) return null
  try {
    return readFileSync(marker, "utf-8").trim()
  } catch {
    return null
  }
}

export function updateOpendcodeConfig(teamName: string, baseDir: string): void {
  const configFile = join(baseDir, "opencode.json")
  const pluginPath = teamPluginRelPath(teamName)

  let config: Record<string, unknown> = {}
  if (existsSync(configFile)) {
    try {
      config = JSON.parse(readFileSync(configFile, "utf-8"))
    } catch {
      config = {}
    }
  }

  config["$schema"] = "https://opencode.ai/config.json"
  config.plugin = [pluginPath]

  // Plugin's config hook injects agents + MCP at runtime — no need to set them here
  delete config.agent
  delete config.mcp

  writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n", "utf-8")
}

function copyDirContents(src: string, dest: string): void {
  if (!existsSync(src)) return
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const s = join(src, entry)
    const d = join(dest, entry)
    if (existsSync(d)) rmSync(d, { recursive: true, force: true })
    cpSync(s, d, { recursive: true })
  }
}

export function activateTeam(teamName: string, baseDir: string): PluginGenerationResult {
  const teamsDir = join(baseDir, "teams")
  const team = loadTeam(teamsDir, teamName)
  if (!team) return { success: false, error: `Team "${teamName}" not found` }
  if (team.agents.length === 0) return { success: false, error: `Team "${teamName}" has no agents` }

  // 1. Build all artifacts into teams/{name}/generated/
  const pluginResult = buildPlugin(team, teamsDir)
  const generatedDir = teamGeneratedDir(teamsDir, teamName)

  // 2. Copy skill files → .opencode/skills/
  copyDirContents(join(generatedDir, "skills"), join(baseDir, ".opencode", "skills"))

  // 3. Copy rule files → .opencode/rules/
  copyDirContents(join(generatedDir, "rules"), join(baseDir, ".opencode", "rules"))

  // 4. Update opencode.json to point to this plugin
  updateOpendcodeConfig(teamName, baseDir)

  // 5. Write active marker
  const markerDir = join(baseDir, ".opencode")
  mkdirSync(markerDir, { recursive: true })
  writeFileSync(join(markerDir, ".team-active"), teamName, "utf-8")

  return {
    success: true,
    pluginPath: pluginResult.pluginPath,
    generatedFiles: pluginResult.generatedFiles ?? [],
  }
}
