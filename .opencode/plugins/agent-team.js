// AgentTeam — 永久壳 Agent + 动态专家团加载
// 注册一个固定的 expert-proxy agent，通过工具动态加载当前团队配置
// 切换团队只需改 .opencode/.team-active，零重启

import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { tool } from "@opencode-ai/plugin"

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = dirname(dirname(__dirname))

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: text }
  const meta = {}
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      let val = line.slice(idx + 1).trim().replace(/^[">-]+/, "").replace(/^["]|["]$/g, "")
      meta[key] = val
    }
  }
  return { meta, body: match[2].trim() }
}

function getActiveTeam() {
  const marker = join(baseDir, ".opencode", ".team-active")
  if (!existsSync(marker)) return null
  return readFileSync(marker, "utf-8").trim()
}

function getTeamAgents(teamName) {
  const agentsDir = join(baseDir, "teams", teamName, "agents")
  if (!existsSync(agentsDir)) return []

  const agents = []
  for (const file of readdirSync(agentsDir)) {
    if (!file.endsWith(".md")) continue
    const content = readFileSync(join(agentsDir, file), "utf-8")
    const { meta, body } = parseFrontmatter(content)
    agents.push({
      name: meta.name || file.replace(".md", ""),
      role: meta.role || meta.name || "",
      description: meta.description || "",
      skills: meta.skills || "",
      prompt: body,
    })
  }
  return agents
}

function getTeamInfo(teamName) {
  const pluginPath = join(baseDir, "teams", teamName, "plugin.json")
  if (!existsSync(pluginPath)) return { description: "" }
  try {
    return JSON.parse(readFileSync(pluginPath, "utf-8"))
  } catch {
    return { description: "" }
  }
}

function listAllTeams() {
  const teamsDir = join(baseDir, "teams")
  if (!existsSync(teamsDir)) return []
  return readdirSync(teamsDir).filter((d) => {
    return existsSync(join(teamsDir, d, "plugin.json")) ||
           existsSync(join(teamsDir, d, ".codebuddy-plugin", "plugin.json"))
  })
}

const PROXY_PROMPT = `你是**专家团调度器（Expert Proxy）**。

## 核心职责

你不是某一个固定专家，而是根据当前激活的专家团动态切换身份。

## 工作流程

每次回答用户问题前，**必须**：
1. 调用 \`load_expert_context\` 工具获取当前激活的专家团配置
2. 根据用户问题，选择最合适的专家
3. 完全按照该专家的 prompt（角色、指令、规则）来回答

## 团队切换

- 用户说"切换到 xxx 团队"时，调用 \`switch_team\` 工具
- 切换后立即用新团队的专家身份继续回答

## 重要约束

- 不要说"我是一个代理"或"让我帮你转接"，直接以专家身份回答
- 如果当前问题不属于任何专家的领域，坦诚告知并建议切换团队
- 回答质量和专业程度必须与真正的专家一致`

export const server = async () => {
  const teamName = getActiveTeam()
  const teamInfo = teamName ? getTeamInfo(teamName) : null

  console.log(`[AgentTeam] Active team: ${teamName || "(none)"}`)

  return {
    config: async (config) => {
      config.agent = config.agent || {}

      // 永久壳 agent — 配置不变，行为通过工具动态加载
      config.agent["expert-proxy"] = {
        description: teamInfo?.description
          ? `专家团调度器 — 当前: ${teamInfo.description}`
          : "专家团调度器 — 使用前请先激活团队",
        prompt: PROXY_PROMPT,
        mode: "primary",
      }
    },

    tool: {
      // 加载当前专家团配置
      "load_expert_context": tool({
        description: "加载当前激活的专家团的全部专家配置。每次回答用户问题前必须调用。",
        args: {},
        async execute() {
          const active = getActiveTeam()
          if (!active) {
            return JSON.stringify({
              error: "没有激活的团队",
              hint: "使用 switch_team 工具激活一个团队",
              available_teams: listAllTeams(),
            })
          }

          const info = getTeamInfo(active)
          const agents = getTeamAgents(active)

          return JSON.stringify({
            team: active,
            description: info.description,
            experts: agents.map((a) => ({
              name: a.name,
              role: a.role,
              description: a.description,
              skills: a.skills,
              prompt: a.prompt,
            })),
          })
        },
      }),

      // 切换专家团
      "switch_team": tool({
        description: "切换专家团。切换后立即生效，无需重启。",
        args: {
          team: tool.schema.string().describe("团队名称，如 research / trading-agents / product-team / devops"),
        },
        async execute(args) {
          const teams = listAllTeams()
          if (!teams.includes(args.team)) {
            return JSON.stringify({
              error: `团队 "${args.team}" 不存在`,
              available: teams,
            })
          }

          const markerDir = join(baseDir, ".opencode")
          writeFileSync(join(markerDir, ".team-active"), args.team, "utf-8")

          const info = getTeamInfo(args.team)
          const agents = getTeamAgents(args.team)

          return JSON.stringify({
            success: true,
            team: args.team,
            description: info.description,
            experts: agents.map((a) => `${a.name} (${a.role})`),
            hint: "已切换，现在以新团队的专家身份回答用户问题",
          })
        },
      }),

      // 列出所有可用团队
      "list_teams": tool({
        description: "列出所有可用的专家团",
        args: {},
        async execute() {
          const teams = listAllTeams()
          const active = getActiveTeam()
          const result = teams.map((t) => {
            const info = getTeamInfo(t)
            const agents = getTeamAgents(t)
            return {
              name: t,
              description: info.description,
              experts: agents.length,
              active: t === active,
            }
          })
          return JSON.stringify(result)
        },
      }),
    },
  }
}

export default server
