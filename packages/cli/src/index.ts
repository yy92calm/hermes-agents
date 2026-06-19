import { join } from "path"
import { existsSync, readFileSync, watch } from "fs"
import {
  saveTeam,
  loadTeam,
  addAgentToTeam,
  activateTeam,
  activeTeamFromConfig,
  listTeams,
  addSkillToAgent,
  removeSkillFromAgent,
  addRuleToAgent,
  removeRuleFromAgent,
  addMcpToAgent,
  removeMcpFromAgent,
  setAgentModel,
  setAgentTemperature,
  setAgentPermissions,
  setAgentColor,
  setAgentMaxSteps,
  setAgentTools,
} from "@agent-team/core"
import type { ExpertTeam, ExpertAgent, ExpertSkill, ExpertRule, ExpertMcpServer } from "@agent-team/core"

const TEAMS_DIR = join(process.cwd(), "teams")

function showHelp() {
  console.log(`AgentTeam - 专家团脚手架 (Expert Team Scaffolder)

基于 OpenCode 插件系统的专家团框架。定义多 Agent 团队，注册为原生 Subagent，支持 @mention 调用。

Usage:
  bun agent-team <command> [options]

Teams:
  create-team <name> <description>    创建专家团
  activate-team <name>                激活指定团队
  status                              查看当前激活的团队
  list teams|plugins|agents <team>    列出资源

Agents:
  add-agent <team> <name> <role>      添加专家
  remove-agent <team> <name>          移除专家
  add-skill <team> <agent> <name> <desc> [instructions...]
                                      添加技能
  remove-skill <team> <agent> <name>  移除技能
  add-rule <team> <agent> <title> <content...>
                                      添加规则（每个参数为一条内容）
  remove-rule <team> <agent> <title>  移除规则
  add-mcp <team> <agent> <name> <cmd...>
                                      添加 MCP 服务器（cmd 为命令+参数）
  remove-mcp <team> <agent> <name>    移除 MCP 服务器
  set-model <team> <agent> <model>    设置模型 (如 claude-sonnet-4)
  set-temperature <team> <agent> <n>  设置温度 (0-1)
  set-permissions <team> <agent> <json>
                                      设置权限 (JSON: {"web_search":"allow"})
  set-color <team> <agent> <color>    设置颜色 (如 "#D4A017")
  set-max-steps <team> <agent> <n>    设置最大迭代步数
  set-tools <team> <agent> <json>     设置工具映射 (JSON: {"read":true,"bash":false})

Example:
  bun agent-team create-team research "研究分析团队"
  bun agent-team add-agent research researcher "高级研究员"
  bun agent-team add-skill research researcher info-retrieval "信息检索"
  bun agent-team add-mcp research analyst data-query python -m data_query_server
  bun agent-team set-model research researcher claude-sonnet-4
  bun agent-team activate-team research
  # 然后在 OpenCode 中用 @"research-researcher" 调用专家
`)
}

function loadTeamOrExit(teamName: string): ExpertTeam {
  const team = loadTeam(TEAMS_DIR, teamName)
  if (!team) {
    console.error(`Team "${teamName}" not found. Create: bun agent-team create-team ${teamName} "..."`)
    process.exit(1)
  }
  return team
}

function findAgentOrExit(team: ExpertTeam, agentName: string): ExpertAgent {
  const agent = team.agents.find((a) => a.name === agentName)
  if (!agent) {
    console.error(`Agent "${agentName}" not found in team "${team.name}". Use: bun agent-team add-agent ${team.name} ${agentName} "<role>"`)
    process.exit(1)
  }
  return agent
}

function saveAndPrint(team: ExpertTeam, teamName: string, action: string): void {
  saveTeam(team, TEAMS_DIR)
  console.log(`${action} in teams/${teamName}/plugin.json`)
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--rebuild" && a !== "-r")

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    showHelp()
    return
  }

  const cmd = args[0]

  switch (cmd) {
    // ─── Teams ───────────────────────────────────────────

    case "create-team": {
      const name = args[1]
      const description = args.slice(2).join(" ") || "An expert team"

      if (!name) {
        console.error("Usage: bun agent-team create-team <name> <description>")
        process.exit(1)
      }

      if (loadTeam(TEAMS_DIR, name)) {
        console.error(`Team "${name}" already exists`)
        process.exit(1)
      }

      const team: ExpertTeam = {
        name,
        description,
        version: "0.1.0",
        agents: [],
        orchestration: { strategy: "parallel", maxConcurrency: 3 },
      }

      saveTeam(team, TEAMS_DIR)
      console.log(`Created team "${name}" at teams/${name}/plugin.json`)
      console.log(`Add experts: bun agent-team add-agent ${name} <agent-name> "<role>"`)
      break
    }

    // ─── Agents ──────────────────────────────────────────

    case "add-agent": {
      const teamName = args[1]
      const agentName = args[2]
      const role = args[3] || "Specialist"

      if (!teamName || !agentName) {
        console.error("Usage: bun agent-team add-agent <team> <name> <role>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)

      if (team.agents.find((a) => a.name === agentName)) {
        console.error(`Agent "${agentName}" already exists in team "${teamName}"`)
        process.exit(1)
      }

      const agent: ExpertAgent = {
        name: agentName,
        role,
        description: `An expert ${role.toLowerCase()} in the ${teamName} team`,
        instructions: [`Act as an expert ${role.toLowerCase()}`, "Analyze the task thoroughly", "Provide high-quality output"],
        tools: { read: true, write: true, edit: true, bash: true, grep: true, glob: true },
      }

      addAgentToTeam(team, agent)
      saveAndPrint(team, teamName, `Added "${agentName}" (${role})`)
      console.log(`\nAfter activation, use @"${teamName}-${agentName}" in OpenCode`)
      break
    }

    case "remove-agent": {
      const teamName = args[1]
      const agentName = args[2]

      if (!teamName || !agentName) {
        console.error("Usage: bun agent-team remove-agent <team> <name>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      team.agents = team.agents.filter((a) => a.name !== agentName)
      saveAndPrint(team, teamName, `Removed "${agentName}"`)
      break
    }

    // ─── Skills ──────────────────────────────────────────

    case "add-skill": {
      const teamName = args[1]
      const agentName = args[2]
      const skillName = args[3]
      const description = args[4] || skillName

      if (!teamName || !agentName || !skillName) {
        console.error("Usage: bun agent-team add-skill <team> <agent> <name> <description> [instructions...]")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      const instructions = args.slice(5)
      const skill: ExpertSkill = { name: skillName, description, instructions: instructions.length ? instructions : undefined }

      addSkillToAgent(team, agentName, skill)
      saveAndPrint(team, teamName, `Added skill "${skillName}" to "${agentName}"`)
      break
    }

    case "remove-skill": {
      const teamName = args[1]
      const agentName = args[2]
      const skillName = args[3]

      if (!teamName || !agentName || !skillName) {
        console.error("Usage: bun agent-team remove-skill <team> <agent> <name>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      removeSkillFromAgent(team, agentName, skillName)
      saveAndPrint(team, teamName, `Removed skill "${skillName}" from "${agentName}"`)
      break
    }

    // ─── Rules ───────────────────────────────────────────

    case "add-rule": {
      const teamName = args[1]
      const agentName = args[2]
      const title = args[3]

      if (!teamName || !agentName || !title) {
        console.error("Usage: bun agent-team add-rule <team> <agent> <title> <content...>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      const content = args.slice(4).filter(Boolean)
      const rule: ExpertRule = { title, content }
      addRuleToAgent(team, agentName, rule)
      saveAndPrint(team, teamName, `Added rule "${title}" to "${agentName}"`)
      break
    }

    case "remove-rule": {
      const teamName = args[1]
      const agentName = args[2]
      const ruleTitle = args.slice(3).join(" ")

      if (!teamName || !agentName || !ruleTitle) {
        console.error("Usage: bun agent-team remove-rule <team> <agent> <title>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      removeRuleFromAgent(team, agentName, ruleTitle)
      saveAndPrint(team, teamName, `Removed rule "${ruleTitle}" from "${agentName}"`)
      break
    }

    // ─── MCP ─────────────────────────────────────────────

    case "add-mcp": {
      const teamName = args[1]
      const agentName = args[2]
      const mcpName = args[3]

      if (!teamName || !agentName || !mcpName) {
        console.error("Usage: bun agent-team add-mcp <team> <agent> <name> <command...>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      const rawArgs = args.slice(4)
      const env: Record<string, string> = {}
      const cmdArgs: string[] = []
      let i = 0
      while (i < rawArgs.length) {
        if (rawArgs[i] === "--env" && i + 1 < rawArgs.length) {
          const pair = rawArgs[i + 1]
          const eqIdx = pair.indexOf("=")
          if (eqIdx > 0) {
            env[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1)
          }
          i += 2
        } else {
          cmdArgs.push(rawArgs[i])
          i++
        }
      }

      if (cmdArgs.length === 0) {
        console.error("Usage: bun agent-team add-mcp <team> <agent> <name> <command...>")
        process.exit(1)
      }

      const mcp: ExpertMcpServer = {
        name: mcpName,
        command: cmdArgs,
        description: `MCP server for ${agentName}`,
        ...(Object.keys(env).length ? { env } : {}),
      }

      addMcpToAgent(team, agentName, mcp)
      saveAndPrint(team, teamName, `Added MCP "${mcpName}" to "${agentName}"`)
      break
    }

    case "remove-mcp": {
      const teamName = args[1]
      const agentName = args[2]
      const mcpName = args[3]

      if (!teamName || !agentName || !mcpName) {
        console.error("Usage: bun agent-team remove-mcp <team> <agent> <name>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      removeMcpFromAgent(team, agentName, mcpName)
      saveAndPrint(team, teamName, `Removed MCP "${mcpName}" from "${agentName}"`)
      break
    }

    // ─── Agent config ────────────────────────────────────

    case "set-model": {
      const teamName = args[1]
      const agentName = args[2]
      const model = args[3]

      if (!teamName || !agentName || !model) {
        console.error("Usage: bun agent-team set-model <team> <agent> <model>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      setAgentModel(team, agentName, model)
      saveAndPrint(team, teamName, `Set model for "${agentName}" to "${model}"`)
      break
    }

    case "set-temperature": {
      const teamName = args[1]
      const agentName = args[2]
      const temperature = parseFloat(args[3])

      if (!teamName || !agentName || isNaN(temperature)) {
        console.error("Usage: bun agent-team set-temperature <team> <agent> <temperature>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      setAgentTemperature(team, agentName, temperature)
      saveAndPrint(team, teamName, `Set temperature for "${agentName}" to ${temperature}`)
      break
    }

    case "set-permissions": {
      const teamName = args[1]
      const agentName = args[2]
      const permissionsStr = args.slice(3).join(" ")

      if (!teamName || !agentName || !permissionsStr) {
        console.error("Usage: bun agent-team set-permissions <team> <agent> <json>")
        process.exit(1)
      }

      let permissions: Record<string, "allow" | "deny" | "ask">
      try {
        permissions = JSON.parse(permissionsStr)
      } catch {
        console.error("Permissions must be valid JSON, e.g. {\"web_search\":\"allow\"}")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      setAgentPermissions(team, agentName, permissions)
      saveAndPrint(team, teamName, `Set permissions for "${agentName}"`)
      break
    }

    case "set-color": {
      const teamName = args[1]
      const agentName = args[2]
      const color = args[3]

      if (!teamName || !agentName || !color) {
        console.error("Usage: bun agent-team set-color <team> <agent> <color>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      setAgentColor(team, agentName, color)
      saveAndPrint(team, teamName, `Set color for "${agentName}" to "${color}"`)
      break
    }

    case "set-max-steps": {
      const teamName = args[1]
      const agentName = args[2]
      const maxSteps = parseInt(args[3])

      if (!teamName || !agentName || isNaN(maxSteps)) {
        console.error("Usage: bun agent-team set-max-steps <team> <agent> <n>")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      setAgentMaxSteps(team, agentName, maxSteps)
      saveAndPrint(team, teamName, `Set maxSteps for "${agentName}" to ${maxSteps}`)
      break
    }

    case "set-tools": {
      const teamName = args[1]
      const agentName = args[2]
      const toolsStr = args.slice(3).join(" ")

      if (!teamName || !agentName || !toolsStr) {
        console.error("Usage: bun agent-team set-tools <team> <agent> <json>")
        process.exit(1)
      }

      let tools: Record<string, boolean>
      try {
        tools = JSON.parse(toolsStr)
      } catch {
        console.error("Tools must be valid JSON, e.g. {\"read\":true,\"bash\":false}")
        process.exit(1)
      }

      const team = loadTeamOrExit(teamName)
      findAgentOrExit(team, agentName)

      setAgentTools(team, agentName, tools)
      saveAndPrint(team, teamName, `Set tools for "${agentName}"`)
      break
    }

    // ─── List ────────────────────────────────────────────

    case "list": {
      const sub = args[1]
      switch (sub) {
        case "teams": {
          const teams = listTeams(TEAMS_DIR)
          if (teams.length === 0) {
            console.log("No teams found.")
          } else {
            console.log("Expert Teams:")
            for (const t of teams) {
              const team = loadTeam(TEAMS_DIR, t)
              const count = team?.agents.length ?? 0
              console.log(`  ${t} (${count} experts)`)
            }
          }
          break
        }
        case "agents": {
          const teamName = args[2]
          if (!teamName) {
            console.error("Usage: bun agent-team list agents <team>")
            process.exit(1)
          }
          const team = loadTeamOrExit(teamName)
          console.log(`Team: ${team.name} | ${team.description} (${team.agents.length} experts)`)
          for (const a of team.agents) {
            const ref = `${team.name}-${a.name}`
            console.log(`\n  @"${ref}" (${a.role})`)
            console.log(`     ${a.description}`)
            if (a.agentConfig?.model) console.log(`     model: ${a.agentConfig.model}`)
            if (a.agentConfig?.temperature) console.log(`     temperature: ${a.agentConfig.temperature}`)
            if (a.agentConfig?.color) console.log(`     color: ${a.agentConfig.color}`)
            if (a.agentConfig?.maxSteps) console.log(`     maxSteps: ${a.agentConfig.maxSteps}`)
            if (a.agentConfig?.permissions) console.log(`     permissions: ${JSON.stringify(a.agentConfig.permissions)}`)
            if (a.tools) {
              const enabled = Array.isArray(a.tools) ? a.tools : Object.entries(a.tools).filter(([, v]) => v).map(([k]) => k)
              console.log(`     tools: ${enabled.join(", ")}`)
            }
            if (a.skills?.length) console.log(`     skills: ${a.skills.map((s) => s.name).join(", ")}`)
            if (a.rules?.length) console.log(`     rules: ${a.rules.map((r) => r.title).join(", ")}`)
            if (a.mcpServers?.length) console.log(`     mcp: ${a.mcpServers.map((m) => `${m.name} (${m.command.join(" ")})`).join(", ")}`)
          }
          break
        }
        default:
          console.error("Usage: bun agent-team list <teams|plugins|agents <team>>")
          process.exit(1)
      }
      break
    }

    // ─── Activate / Status ───────────────────────────────

    case "activate-team": {
      const teamName = args[1]
      if (!teamName) {
        console.error("Usage: bun agent-team activate-team <name>")
        process.exit(1)
      }
      const result = activateTeam(teamName, process.cwd())
      if (result.success) {
        console.log(`\n=== Activated: ${teamName} ===`)
        console.log(`Plugin: .opencode/plugins/agent-team.js → teams/${teamName}/plugin.json`)
        const team = loadTeam(TEAMS_DIR, teamName)
        if (team) {
          console.log(`\nSubagents (runtime from plugin.json + agents/*.md):`)
          for (const a of team.agents) {
            const extras: string[] = []
            if (a.skills?.length) extras.push("skills")
            if (a.rules?.length) extras.push("rules")
            if (a.mcpServers?.length) extras.push("mcp")
            if (a.agentConfig?.model) extras.push(a.agentConfig.model)
            const tag = extras.length ? ` [${extras.join(", ")}]` : ""
            console.log(`  @"${teamName}-${a.name}" — ${a.role}${tag}`)
          }
        }
        console.log(`\nReady! OpenCode will load these subagents on next start.`)
        console.log(`Use @"${teamName}-agent-name" to invoke an expert.`)
      } else {
        console.error(`Failed: ${result.error}`)
      }
      break
    }

    case "status": {
      const active = activeTeamFromConfig(process.cwd())
      if (active) {
        console.log(`Active team: ${active}`)
        const team = loadTeam(TEAMS_DIR, active)
        if (team) {
          console.log(`Description: ${team.description}`)
          console.log(`Experts:`)
          for (const a of team.agents) {
            console.log(`  @"${active}-${a.name}" — ${a.role}`)
          }
        }
      } else {
        console.log("No team is currently activated.")
        console.log("Run: bun agent-team activate-team <name>")
      }
      break
    }

    // ─── Watch ───────────────────────────────────────────

    case "watch": {
      if (!existsSync(TEAMS_DIR)) {
        console.log("teams/ directory does not exist yet. Create a team first.")
        return
      }
      console.log("Watching teams/ for changes... (Ctrl+C to stop)")
      const watcher = watch(TEAMS_DIR, { recursive: true }, (event, filename) => {
        if (filename && (filename.endsWith("plugin.json") || filename.endsWith(".md"))) {
          const teamName = filename.split("/")[0]
          if (teamName) {
            console.log(`\nChange detected: ${filename}`)
            const team = loadTeam(TEAMS_DIR, teamName)
            if (team) {
              saveTeam(team, TEAMS_DIR)
              console.log(`  Rebuilt: teams/${teamName}/plugin.json`)
            }
          }
        }
      })
      process.on("SIGINT", () => { watcher.close(); process.exit(0) })
      await new Promise(() => {})
      break
    }

    default:
      console.error(`Unknown command: ${cmd}`)
      showHelp()
      process.exit(1)
  }
}
