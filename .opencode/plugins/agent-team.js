// AgentTeam Meta Plugin — 公共入口，运行时动态加载专家团
// 支持 WorkBuddy 格式：plugin.json + agents/*.md (YAML frontmatter + Markdown body)
// 切换团队只需改 .opencode/.team-active 标记文件

import { existsSync, readFileSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { tool } from "@opencode-ai/plugin"

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: text }
  const meta = {}
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      let val = line.slice(idx + 1).trim()
      if (val.startsWith(">-")) {
        meta[key] = ""
        continue
      }
      if (val.startsWith(">")) val = val.slice(1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      meta[key] = val
    }
  }
  return { meta, body: match[2].trim() }
}

function loadWorkbuddyTeam(baseDir, teamName) {
  const teamDir = join(baseDir, "teams", teamName)
  // plugin.json may be at root or in .codebuddy-plugin/
  let pluginPath = join(teamDir, "plugin.json")
  if (!existsSync(pluginPath)) {
    pluginPath = join(teamDir, ".codebuddy-plugin", "plugin.json")
  }
  if (!existsSync(pluginPath)) return null

  try {
    const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"))
    const agentsDir = join(teamDir, "agents")
    const agents = []

    if (existsSync(agentsDir)) {
      for (const file of readdirSync(agentsDir)) {
        if (!file.endsWith(".md")) continue
        const content = readFileSync(join(agentsDir, file), "utf-8")
        const { meta, body } = parseFrontmatter(content)
        agents.push({
          name: meta.name || file.replace(".md", ""),
          description: meta.description || "",
          color: meta.color,
          prompt: body,
        })
      }
    }

    return {
      name: teamName,
      description: plugin.description || "",
      agents,
    }
  } catch (e) {
    console.error(`[AgentTeam] Failed to load team "${teamName}":`, e.message)
    return null
  }
}

export const server = async () => {
  const baseDir = process.cwd()
  const marker = join(baseDir, ".opencode", ".team-active")
  if (!existsSync(marker)) {
    console.error("[AgentTeam] No active team. Run: bun agent-team activate-team <name>")
    return {}
  }

  const teamName = readFileSync(marker, "utf-8").trim()
  const team = loadWorkbuddyTeam(baseDir, teamName)
  if (!team) {
    console.error(`[AgentTeam] Team "${teamName}" not found at teams/${teamName}/plugin.json`)
    return {}
  }

  console.log(`[AgentTeam] Loaded team: ${teamName} (${team.agents.length} experts)`)

  return {
    config: async (config) => {
      config.agent = config.agent || {}

      for (const a of team.agents) {
        const entry = {
          description: a.description,
          prompt: a.prompt,
          mode: "subagent",
        }
        if (a.color) entry.color = a.color
        config.agent[`${team.name}-${a.name}`] = entry
      }
    },
    tool: {
      [`${team.name}-list`]: tool({
        description: `List all experts in the ${team.name} team`,
        args: {},
        async execute() {
          let out = `Team: ${team.name} | ${team.description}\n\nExperts:`
          for (const a of team.agents) {
            out += `\n  @${team.name}-${a.name} - ${a.description}`
          }
          return out
        },
      }),
    },
  }
}

export default server
