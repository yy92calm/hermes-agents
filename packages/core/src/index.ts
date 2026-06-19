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
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs"
import { join, dirname } from "path"
import type { ExpertTeam, ExpertAgent, PluginGenerationResult } from "./types.js"

// ── WorkBuddy format helpers ──────────────────────────────────────

function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: text }
  const meta: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      let val = line.slice(idx + 1).trim()
      if (val.startsWith(">-")) { meta[key] = ""; continue }
      if (val.startsWith(">")) val = val.slice(1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      meta[key] = val
    }
  }
  return { meta, body: match[2].trim() }
}

function encodeFrontmatter(meta: Record<string, string>): string {
  const lines: string[] = ["---"]
  for (const [k, v] of Object.entries(meta)) {
    if (v.includes("\n")) lines.push(`${k}: >-\n  ${v.replace(/\n/g, "\n  ")}`)
    else lines.push(`${k}: "${v}"`)
  }
  lines.push("---")
  return lines.join("\n")
}

function teamDir(teamsDir: string, teamName: string): string {
  return join(teamsDir, teamName)
}

function pluginJsonPath(teamsDir: string, teamName: string): string {
  return join(teamDir(teamsDir, teamName), "plugin.json")
}

function agentsDir(teamsDir: string, teamName: string): string {
  return join(teamDir(teamsDir, teamName), "agents")
}

// ── Team I/O ───────────────────────────────────────────────────────

export function loadTeam(teamsDir: string, teamName: string): ExpertTeam | null {
  let pp = join(teamsDir, teamName, "plugin.json")
  if (!existsSync(pp)) {
    pp = join(teamsDir, teamName, ".codebuddy-plugin", "plugin.json")
  }
  if (!existsSync(pp)) return null
  try {
    const plugin = JSON.parse(readFileSync(pp, "utf-8"))
    const ad = agentsDir(teamsDir, teamName)
    const agents: ExpertAgent[] = []

    if (existsSync(ad)) {
      for (const file of readdirSync(ad)) {
        if (!file.endsWith(".md")) continue
        const content = readFileSync(join(ad, file), "utf-8")
        const { meta, body } = parseFrontmatter(content)
        agents.push({
          name: meta.name || file.replace(".md", ""),
          role: meta.role || meta.name || file.replace(".md", ""),
          description: meta.description || "",
          instructions: [],
          agentConfig: {
            color: meta.color,
          },
          skills: [],
          rules: [],
          mcpServers: [],
          _rawPrompt: body,
          _rawMeta: meta,
        } as any)
      }
    }

    return {
      name: teamName,
      description: plugin.description || "",
      version: plugin.version || "0.1.0",
      agents,
    }
  } catch {
    return null
  }
}

export function saveTeam(team: ExpertTeam, teamsDir: string): boolean {
  const td = teamDir(teamsDir, team.name)
  mkdirSync(td, { recursive: true })

  // Write plugin.json
  const plugin = {
    name: team.name,
    version: team.version || "0.1.0",
    description: team.description,
    agents: team.agents.map((a) => `./agents/${a.name}.md`),
  }
  writeFileSync(join(td, "plugin.json"), JSON.stringify(plugin, null, 2) + "\n", "utf-8")

  // Write agents/*.md
  const ad = agentsDir(teamsDir, team.name)
  mkdirSync(ad, { recursive: true })
  for (const agent of team.agents) {
    const meta: Record<string, string> = {
      name: agent.name,
      description: agent.description || `${agent.role}`,
    }
    if (agent.agentConfig?.color) meta.color = agent.agentConfig.color

    const body = (agent as any)._rawPrompt || buildAgentBody(agent)
    writeFileSync(join(ad, `${agent.name}.md`), encodeFrontmatter(meta) + "\n\n" + body + "\n", "utf-8")
  }

  return true
}

function buildAgentBody(agent: ExpertAgent): string {
  const parts: string[] = []
  parts.push(`You are the **${agent.role}** (${agent.name}). ${agent.description}`)
  parts.push("")

  if (agent.instructions?.length) {
    parts.push("## Instructions")
    for (const inst of agent.instructions) parts.push(`- ${inst}`)
    parts.push("")
  }

  if (agent.skills?.length) {
    parts.push("## Skills")
    for (const skill of agent.skills) {
      parts.push(`- **${skill.name}**: ${skill.description}`)
      if (skill.instructions?.length) {
        for (const si of skill.instructions) parts.push(`  - ${si}`)
      }
    }
    parts.push("")
  }

  if (agent.rules?.length) {
    parts.push("## Rules")
    for (const rule of agent.rules) {
      parts.push(`- **${rule.title}**`)
      for (const c of rule.content) parts.push(`  - ${c}`)
    }
    parts.push("")
  }

  if (agent.mcpServers?.length) {
    parts.push("## Available MCP Servers")
    for (const mcp of agent.mcpServers) parts.push(`- ${mcp.name}: ${mcp.command.join(" ")}`)
    parts.push("")
  }

  return parts.join("\n")
}

// ── Agent manipulation ─────────────────────────────────────────────

export function addAgentToTeam(team: ExpertTeam, agent: ExpertAgent): ExpertTeam {
  const existing = team.agents.findIndex((a) => a.name === agent.name)
  if (existing >= 0) team.agents[existing] = agent
  else team.agents.push(agent)
  return team
}

function findAgent(team: ExpertTeam, agentName: string): ExpertAgent {
  const a = team.agents.find((x) => x.name === agentName)
  if (!a) throw new Error(`Agent "${agentName}" not found in team "${team.name}"`)
  return a
}

function ensureRawPrompt(agent: ExpertAgent): string {
  if (!(agent as any)._rawPrompt) {
    (agent as any)._rawPrompt = buildAgentBody(agent)
  }
  return (agent as any)._rawPrompt
}

function appendToBody(agent: ExpertAgent, section: string, ...lines: string[]): void {
  let body = ensureRawPrompt(agent)
  if (!body.includes(`## ${section}`)) {
    body += `\n\n## ${section}\n`
  }
  for (const line of lines) {
    body += `- ${line}\n`
  }
  (agent as any)._rawPrompt = body
}

function removeFromBody(agent: ExpertAgent, section: string, matchPattern: string): void {
  let rawText = ensureRawPrompt(agent)
  const sIdx = rawText.indexOf(`## ${section}`)
  if (sIdx < 0) return
  const nIdx = rawText.indexOf("\n## ", sIdx + 1)
  const sEnd = nIdx > 0 ? nIdx : rawText.length
  const sText = rawText.slice(sIdx, sEnd)
  const sLines = sText.split("\n")
  const sFiltered = sLines.filter((l) => !l.includes(matchPattern))
  rawText = rawText.slice(0, sIdx) + sFiltered.join("\n") + rawText.slice(sEnd)
  ;(agent as any)._rawPrompt = rawText
}

export function addSkillToAgent(team: ExpertTeam, agentName: string, skill: ExpertSkill): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.skills) agent.skills = []
  const existing = agent.skills.findIndex((s) => s.name === skill.name)
  if (existing >= 0) agent.skills[existing] = skill
  else agent.skills.push(skill)
  appendToBody(agent, "Skills", `**${skill.name}**: ${skill.description}`)
  if (skill.instructions) {
    for (const inst of skill.instructions) appendToBody(agent, "Skills", `  - ${inst}`)
  }
  return team
}

export function removeSkillFromAgent(team: ExpertTeam, agentName: string, skillName: string): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (agent.skills) agent.skills = agent.skills.filter((s) => s.name !== skillName)
  removeFromBody(agent, "Skills", skillName)
  return team
}

export function addRuleToAgent(team: ExpertTeam, agentName: string, rule: ExpertRule): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.rules) agent.rules = []
  const existing = agent.rules.findIndex((r) => r.title === rule.title)
  if (existing >= 0) agent.rules[existing] = rule
  else agent.rules.push(rule)
  appendToBody(agent, "Rules", `**${rule.title}**`)
  for (const c of rule.content) appendToBody(agent, "Rules", `  - ${c}`)
  return team
}

export function removeRuleFromAgent(team: ExpertTeam, agentName: string, ruleTitle: string): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (agent.rules) agent.rules = agent.rules.filter((r) => r.title !== ruleTitle)
  removeFromBody(agent, "Rules", ruleTitle)
  return team
}

export function addMcpToAgent(team: ExpertTeam, agentName: string, mcp: ExpertMcpServer): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (!agent.mcpServers) agent.mcpServers = []
  const existing = agent.mcpServers.findIndex((m) => m.name === mcp.name)
  if (existing >= 0) agent.mcpServers[existing] = mcp
  else agent.mcpServers.push(mcp)
  appendToBody(agent, "Available MCP Servers", `${mcp.name}: ${mcp.command.join(" ")}`)
  return team
}

export function removeMcpFromAgent(team: ExpertTeam, agentName: string, mcpName: string): ExpertTeam {
  const agent = findAgent(team, agentName)
  if (agent.mcpServers) agent.mcpServers = agent.mcpServers.filter((m) => m.name !== mcpName)
  removeFromBody(agent, "Available MCP Servers", mcpName)
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

// ── Skill / Rule file generation ───────────────────────────────────

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

// ── Team listing ───────────────────────────────────────────────────

export function listTeams(teamsDir: string): string[] {
  if (!existsSync(teamsDir)) return []
  try {
    return readdirSync(teamsDir).filter((d) => {
      const p = join(teamsDir, d)
      try {
        return existsSync(join(p, "plugin.json"))
          || existsSync(join(p, ".codebuddy-plugin", "plugin.json"))
          || existsSync(join(p, "team.json"))
      } catch { return false }
    })
  } catch {
    return []
  }
}

export function listGeneratedPlugins(teamsDir: string): string[] {
  return listTeams(teamsDir)
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

// ── Activate ───────────────────────────────────────────────────────

export function activateTeam(teamName: string, baseDir: string): PluginGenerationResult {
  const teamsDir = join(baseDir, "teams")
  const team = loadTeam(teamsDir, teamName)
  if (!team) return { success: false, error: `Team "${teamName}" not found` }
  if (team.agents.length === 0) return { success: false, error: `Team "${teamName}" has no agents` }

  // 1. Generate skill files → .opencode/skills/
  const skillsDir = join(baseDir, ".opencode", "skills")
  const skillFiles = generateSkillFiles(team, skillsDir)

  // 2. Generate rule files → .opencode/rules/
  const rulesDir = join(baseDir, ".opencode", "rules")
  const ruleFiles = generateRuleFiles(team, rulesDir)

  // 3. Write active marker
  const markerDir = join(baseDir, ".opencode")
  mkdirSync(markerDir, { recursive: true })
  writeFileSync(join(markerDir, ".team-active"), teamName, "utf-8")

  return {
    success: true,
    pluginPath: join(baseDir, ".opencode", "plugins", "agent-team.js"),
    generatedFiles: [...skillFiles, ...ruleFiles],
  }
}

// ── Legacy compat ──────────────────────────────────────────────────

export function teamGeneratedDir(teamsDir: string, teamName: string): string {
  return join(teamsDir, teamName, "generated")
}

export function teamPluginRelPath(teamName: string): string {
  return `teams/${teamName}/plugin.json`
}
