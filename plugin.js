// plugin.js — ExpertHub 运行时插件（OpenCode ESM 插件入口）
// 注册 5 个自定义工具：expert_list / expert_dispatch / expert_inject / expert_skill / expert_rule
// + session.created 事件钩子
//
// 依赖：@opencode-ai/plugin（运行时由 OpenCode 提供）
// packs 目录发现复用 lib/pack.js（与 CLI 一致）
// 只扫描已 enable 的 pack（读 .opencode/expert-hub/enabled.json）
import { tool } from "@opencode-ai/plugin"
import {
  getPacksDir,
  scanAllExperts,
  scanAllRules,
  findExpert,
  findExpertInPack,
  findSkill,
  findRule,
  getEnabledPackNames,
  scanPackSkills,
  scanPackRules,
} from "./lib/pack.js"

// ────────────────────────────────────────────────────────────
// 辅助
// ────────────────────────────────────────────────────────────
function buildExpertSystemPrompt(expert, allSkills, allRules) {
  const lines = []
  lines.push(`<expert_context>`)
  lines.push(`<name>${expert.name}</name>`)
  lines.push(`<pack>${expert.pack}</pack>`)
  if (expert.role) lines.push(`<role>${expert.role}</role>`)
  if (expert.description) lines.push(`<description>${expert.description}</description>`)
  if (expert.mode) lines.push(`<mode>${expert.mode}</mode>`)
  if (expert.tags && expert.tags.length) lines.push(`<tags>${expert.tags.join(", ")}</tags>`)
  lines.push(`</expert_context>`)

  // 按 agent 声明的 skills 精确加载（逗号分隔）
  const declaredSkills = expert.skills
    ? expert.skills.split(",").map((s) => s.trim()).filter(Boolean)
    : []
  const skills = declaredSkills.length
    ? allSkills.filter((s) => declaredSkills.includes(s.name))
    : allSkills // 未声明则加载全部（向后兼容）

  if (skills.length) {
    lines.push("")
    for (const skill of skills) {
      lines.push(`<skill>`)
      lines.push(`<name>${skill.name}</name>`)
      if (skill.frontmatter.description) lines.push(`<description>${skill.frontmatter.description}</description>`)
      lines.push(`<content>${skill.body}</content>`)
      lines.push(`</skill>`)
    }
  }

  // 只加载 alwaysApply 的 rules
  const rules = allRules.filter((r) => r.alwaysApply !== false)
  if (rules.length) {
    lines.push("")
    for (const rule of rules) {
      lines.push(`<rule>`)
      lines.push(`<name>${rule.name}</name>`)
      if (rule.description) lines.push(`<description>${rule.description}</description>`)
      lines.push(`<content>${rule.body}</content>`)
      lines.push(`</rule>`)
    }
  }

  lines.push("")
  lines.push("## 可用工具")
  lines.push("你可以使用 expert_dispatch(expert, task) 工具调度同 pack 内的其他专家协助你完成任务。")
  lines.push("也可以使用 expert_list 查看所有可用专家。")
  lines.push("")
  lines.push(expert.body || expert.description || `You are ${expert.name}.`)
  return lines.join("\n")
}

function extractTextFromParts(parts) {
  if (!Array.isArray(parts)) return ""
  const texts = []
  for (const part of parts) {
    if (part && part.type === "text" && typeof part.text === "string") {
      texts.push(part.text)
    }
  }
  return texts.join("\n")
}

// ────────────────────────────────────────────────────────────
// expert_list — 列出所有已启用专家（含 rules）
// ────────────────────────────────────────────────────────────
function toolExpertList(packsDir, enabledPacks) {
  return tool({
    description:
      "列出所有可用的专家(expert)、技能(skill)和规则(rule)。返回每个的名称、所属包与描述，便于选择用 expert_dispatch / expert_inject / expert_skill / expert_rule 调用。",
    args: {},
    execute() {
      const experts = scanAllExperts(packsDir, enabledPacks)
      const rules = scanAllRules(packsDir, enabledPacks)
      if (experts.length === 0 && rules.length === 0) {
        return "当前没有已启用的专家包(pack)。请先用 CLI 的 import 导入并用 enable 启用 pack。"
      }
      const lines = []
      if (experts.length) {
        lines.push(`【专家】共 ${experts.length} 位：`)
        for (const e of experts) {
          const role = e.role ? ` [${e.role}]` : ""
          const tags = e.tags && e.tags.length ? ` [${e.tags.join(", ")}]` : ""
          lines.push(`• ${e.name} (pack: ${e.pack})${role}${tags}`)
          if (e.description) lines.push(`    ${e.description}`)
        }
      }
      if (rules.length) {
        lines.push(`\n【规则】共 ${rules.length} 条：`)
        for (const r of rules) {
          const apply = r.alwaysApply === false ? "" : " (always)"
          lines.push(`• ${r.name} (pack: ${r.pack})${apply}`)
          if (r.description) lines.push(`    ${r.description.replace(/\s+/g, " ").slice(0, 80)}`)
        }
      }
      lines.push(
        "\n调用方式：\n- expert_dispatch(expert, task)：隔离模式\n- expert_inject(expert, task)：轻量模式\n- expert_skill(skill)：加载技能\n- expert_rule(rule)：加载规则",
      )
      return lines.join("\n")
    },
  })
}

// ────────────────────────────────────────────────────────────
// expert_dispatch — 隔离模式
// ────────────────────────────────────────────────────────────
function toolExpertDispatch(packsDir, enabledPacks, client) {
  return tool({
    description:
      "隔离模式调用专家。在独立子会话中运行指定专家处理任务，专家的输出返回给当前会话。适合需要专注、不受当前上下文干扰的复杂任务。",
    args: {
      expert: tool.schema.string().describe("专家名称（expert_list 中列出的 name）"),
      task: tool.schema.string().describe("要交给专家处理的任务描述"),
      pack: tool.schema.string().optional().describe("可选，指定 pack 名称以消除同名歧义"),
    },
    async execute(args, context) {
      const expert = args.pack
        ? findExpertInPack(packsDir, args.pack, args.expert, enabledPacks)
        : findExpert(packsDir, args.expert, enabledPacks)
      if (!expert) {
        const hint = args.pack ? `（pack: ${args.pack}）` : ""
        return `未找到专家 "${args.expert}"${hint}（或其所在 pack 未启用）。请调用 expert_list 查看可用专家。`
      }
      if (!client || !client.session) {
        return fallbackInject(expert, args.task)
      }
      try {
        const skills = scanPackSkills(packsDir, expert.pack)
        const rules = scanPackRules(packsDir, expert.pack)
        const systemPrompt = buildExpertSystemPrompt(expert, skills, rules)
        const created = await client.session.create({
          body: { title: `expert:${expert.name}` },
        })
        const sessionId = created.data?.id
        if (!sessionId) return fallbackInject(expert, args.task)
        const promptBody = {
          system: systemPrompt,
          parts: [{ type: "text", text: args.task }],
        }
        if (expert.model) promptBody.model = expert.model
        if (expert.temperature != null) promptBody.temperature = expert.temperature
        if (expert.steps != null) promptBody.steps = expert.steps
        if (expert.tools && Object.keys(expert.tools).length) promptBody.tools = expert.tools
        const prompted = await client.session.prompt({
          path: { id: sessionId },
          body: promptBody,
        })
        const output = extractTextFromParts(prompted.data?.parts)
        // 清理子会话
        try { await client.session.delete({ path: { id: sessionId } }) } catch { /* ignore */ }
        if (!output) return fallbackInject(expert, args.task)
        return `【专家 ${expert.name}（${expert.pack}）隔离模式输出】\n\n${output}`
      } catch (err) {
        return `隔离模式调用失败（${err?.message || err}），回退到注入模式：\n\n${fallbackInject(expert, args.task)}`
      }
    },
  })
}

// ────────────────────────────────────────────────────────────
// expert_inject — 轻量模式
// ────────────────────────────────────────────────────────────
function toolExpertInject(packsDir, enabledPacks) {
  return tool({
    description:
      "轻量模式调用专家。直接注入专家的身份与指令到当前会话上下文，由你在当前对话中扮演该专家处理任务。适合快速问答和无需隔离的场景。",
    args: {
      expert: tool.schema.string().describe("专家名称"),
      task: tool.schema.string().describe("要处理的任务描述"),
      pack: tool.schema.string().optional().describe("可选，指定 pack 名称以消除同名歧义"),
    },
    execute(args) {
      const expert = args.pack
        ? findExpertInPack(packsDir, args.pack, args.expert, enabledPacks)
        : findExpert(packsDir, args.expert, enabledPacks)
      if (!expert) {
        const hint = args.pack ? `（pack: ${args.pack}）` : ""
        return `未找到专家 "${args.expert}"${hint}（或其所在 pack 未启用）。请调用 expert_list 查看可用专家。`
      }
      return fallbackInject(expert, args.task)
    },
  })
}

function fallbackInject(expert, task) {
  const tags = expert.tags && expert.tags.length ? expert.tags.join(", ") : ""
  return [
    "<expert_context>",
    `<name>${expert.name}</name>`,
    `<pack>${expert.pack}</pack>`,
    expert.role ? `<role>${expert.role}</role>` : null,
    `<mode>${expert.mode || "subagent"}</mode>`,
    tags ? `<tags>${tags}</tags>` : null,
    `<description>${expert.description || ""}</description>`,
    "<instructions>",
    expert.body || "",
    "</instructions>",
    "</expert_context>",
    "",
    "<task>",
    task,
    "</task>",
    "",
    "请以上述专家的身份与专长处理上述任务，给出专业、准确的回答。",
  ]
    .filter((l) => l !== null)
    .join("\n")
}

// ────────────────────────────────────────────────────────────
// expert_skill — 加载 SKILL.md
// ────────────────────────────────────────────────────────────
function toolExpertSkill(packsDir, enabledPacks) {
  return tool({
    description:
      "加载指定技能(skill)的完整内容到当前上下文。技能是一套结构化的操作指南，加载后按其指引执行任务。",
    args: { skill: tool.schema.string().describe("技能名称") },
    execute(args) {
      const skill = findSkill(packsDir, args.skill, enabledPacks)
      if (!skill) {
        return `未找到技能 "${args.skill}"（或其所在 pack 未启用）。`
      }
      return [
        "<skill>",
        `<name>${skill.name}</name>`,
        `<pack>${skill.pack}</pack>`,
        `<description>${skill.frontmatter.description || ""}</description>`,
        "<content>",
        skill.body,
        "</content>",
        "</skill>",
        "",
        "请按上述技能的指引处理后续任务。",
      ].join("\n")
    },
  })
}

// ────────────────────────────────────────────────────────────
// expert_rule — 加载规则到当前上下文
// ────────────────────────────────────────────────────────────
function toolExpertRule(packsDir, enabledPacks) {
  return tool({
    description:
      "加载指定规则(rule)的完整内容到当前上下文。规则定义了团队/项目的规范与约束（引用标准、数据质量、编码规范等），加载后在执行任务时严格遵守。",
    args: { rule: tool.schema.string().describe("规则名称") },
    execute(args) {
      const rule = findRule(packsDir, args.rule, enabledPacks)
      if (!rule) {
        return `未找到规则 "${args.rule}"（或其所在 pack 未启用）。`
      }
      return [
        "<rule>",
        `<name>${rule.name}</name>`,
        `<pack>${rule.pack}</pack>`,
        `<description>${rule.description || ""}</description>`,
        rule.alwaysApply === false ? null : "<always_apply>true</always_apply>",
        "<content>",
        rule.body,
        "</content>",
        "</rule>",
        "",
        "请在后续工作中严格遵守上述规则。",
      ]
      .filter((l) => l !== null)
      .join("\n")
    },
  })
}

// ────────────────────────────────────────────────────────────
// 插件入口
// ────────────────────────────────────────────────────────────
export default async function ExpertHubPlugin(ctx) {
  const projectDir = ctx?.directory || process.cwd()
  const packsDir = getPacksDir(projectDir)
  // 只扫描已启用的 pack（enabled.json 状态）
  const enabledPacks = getEnabledPackNames(projectDir)
  const client = ctx?.client

  return {
    tool: {
      expert_list: toolExpertList(packsDir, enabledPacks),
      expert_dispatch: toolExpertDispatch(packsDir, enabledPacks, client),
      expert_inject: toolExpertInject(packsDir, enabledPacks),
      expert_skill: toolExpertSkill(packsDir, enabledPacks),
      expert_rule: toolExpertRule(packsDir, enabledPacks),
    },
    event: async ({ event }) => {
      if (event?.type === "session.created") {
        // 会话创建钩子（首版占位，可扩展自动注入专家列表）
      }
    },
  }
}

export const server = ExpertHubPlugin
