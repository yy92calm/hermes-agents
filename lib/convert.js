// lib/convert.js — WorkBuddy/CodeBuddy → OpenCode pack 格式转换（零依赖）
import fs from "node:fs"
import path from "node:path"
import { parseFrontmatter, stringifyFrontmatter } from "./pack.js"

// 找 WorkBuddy 插件的 plugin.json（兼容两种位置）
function findWorkBuddyPluginJson(srcDir) {
  const candidates = [
    path.join(srcDir, ".codebuddy-plugin", "plugin.json"),
    path.join(srcDir, "plugin.json"),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

// WorkBuddy agent .md → OpenCode agent .md
// 规则（设计文档第 9.4 节）：
//   - 删 name（用文件名）/ category / model:inherit
//   - 加 mode: subagent
//   - 加 tools（默认 write:false edit:false bash:true）
//   - body 原样保留
export function convertAgentMd(srcPath, dstPath) {
  const text = fs.readFileSync(srcPath, "utf-8")
  const { frontmatter, body } = parseFrontmatter(text)
  const name = path.basename(srcPath, ".md")

  // 删除/转换字段
  delete frontmatter.name
  delete frontmatter.category
  if (frontmatter.model === "inherit") delete frontmatter.model

  // 强制 mode
  frontmatter.mode = frontmatter.mode || "subagent"

  // 默认 tools（若未提供）
  if (
    !frontmatter.tools ||
    typeof frontmatter.tools !== "object" ||
    Array.isArray(frontmatter.tools)
  ) {
    frontmatter.tools = { write: false, edit: false, bash: true }
  }

  fs.mkdirSync(path.dirname(dstPath), { recursive: true })
  const out = stringifyFrontmatter(frontmatter) + "\n" + body + "\n"
  fs.writeFileSync(dstPath, out, "utf-8")
  return { name, frontmatter }
}

// WorkBuddy skill 目录 → OpenCode skill 目录（格式兼容，补 compatibility）
export function convertSkillDir(srcDir, dstDir) {
  const srcSkillMd = path.join(srcDir, "SKILL.md")
  if (!fs.existsSync(srcSkillMd)) return null
  const text = fs.readFileSync(srcSkillMd, "utf-8")
  const { frontmatter, body } = parseFrontmatter(text)
  const name = frontmatter.name || path.basename(srcDir)

  // 补 compatibility
  if (!frontmatter.compatibility) frontmatter.compatibility = "opencode"

  fs.mkdirSync(dstDir, { recursive: true })
  // 复制 SKILL.md
  fs.writeFileSync(
    path.join(dstDir, "SKILL.md"),
    stringifyFrontmatter(frontmatter) + "\n" + body + "\n",
    "utf-8",
  )
  // 复制其他文件（reference.md / scripts/ 等）
  try {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === "SKILL.md") continue
      const s = path.join(srcDir, entry.name)
      const d = path.join(dstDir, entry.name)
      if (entry.isDirectory()) {
        copyDir(s, d)
      } else {
        fs.copyFileSync(s, d)
      }
    }
  } catch {
    // ignore
  }
  return { name }
}

// WorkBuddy rule .md → OpenCode rule .md（格式兼容，原样保留 frontmatter + body）
export function convertRuleMd(srcPath, dstPath) {
  const text = fs.readFileSync(srcPath, "utf-8")
  const { frontmatter, body } = parseFrontmatter(text)
  const name = path.basename(srcPath, ".md")
  // 清理 WorkBuddy 专有的时间戳字段（保留 description/alwaysApply/enabled）
  delete frontmatter.updatedAt
  fs.mkdirSync(path.dirname(dstPath), { recursive: true })
  fs.writeFileSync(dstPath, stringifyFrontmatter(frontmatter) + "\n" + body + "\n", "utf-8")
  return { name }
}

// 完整导入：WorkBuddy 插件目录 → pack 目录
export function importWorkBuddy(srcDir, dstPackDir, options = {}) {
  const packName = options.name || path.basename(path.resolve(srcDir))
  const pluginJsonPath = findWorkBuddyPluginJson(srcDir)

  let description = options.description || ""
  let version = "1.0.0"
  let agentRels = []

  if (pluginJsonPath) {
    try {
      const pj = JSON.parse(fs.readFileSync(pluginJsonPath, "utf-8"))
      description = pj.description || description
      version = pj.version || version
      agentRels = pj.agents || []
    } catch {
      // ignore
    }
  }

  // 若 plugin.json 未列出 agents，扫描 agents/ 目录
  let agentsSrcDir = path.join(srcDir, "agents")
  if (agentRels.length === 0 && fs.existsSync(agentsSrcDir)) {
    agentRels = fs
      .readdirSync(agentsSrcDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => `./agents/${f}`)
  }

  // 准备目录
  fs.mkdirSync(path.join(dstPackDir, "agents"), { recursive: true })
  fs.mkdirSync(path.join(dstPackDir, "skills"), { recursive: true })

  // 转换 agents
  const agents = []
  for (const rel of agentRels) {
    const srcAgent = path.join(srcDir, rel)
    if (!fs.existsSync(srcAgent)) continue
    const baseName = path.basename(rel)
    const dstAgent = path.join(dstPackDir, "agents", baseName)
    const res = convertAgentMd(srcAgent, dstAgent)
    agents.push(`./agents/${baseName}`)
    void res
  }

  // 转换 skills
  const skillsSrcDir = path.join(srcDir, "skills")
  const skills = []
  if (fs.existsSync(skillsSrcDir)) {
    const entries = fs.readdirSync(skillsSrcDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const srcSkill = path.join(skillsSrcDir, entry.name)
      if (!fs.existsSync(path.join(srcSkill, "SKILL.md"))) continue
      const dstSkill = path.join(dstPackDir, "skills", entry.name)
      convertSkillDir(srcSkill, dstSkill)
      skills.push(`./skills/${entry.name}`)
    }
  }

  // 转换 rules（.md 文件，文件名即规则名）
  const rulesSrcDir = path.join(srcDir, "rules")
  const rules = []
  if (fs.existsSync(rulesSrcDir)) {
    fs.mkdirSync(path.join(dstPackDir, "rules"), { recursive: true })
    const entries = fs.readdirSync(rulesSrcDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue
      const srcRule = path.join(rulesSrcDir, entry.name)
      const dstRule = path.join(dstPackDir, "rules", entry.name)
      convertRuleMd(srcRule, dstRule)
      rules.push(`./rules/${entry.name}`)
    }
  }

  // 写 pack.json（mcp 暂不处理）
  const packJson = {
    name: packName,
    description,
    version,
    agents,
    skills,
    rules,
    tags: options.tags || [],
  }
  fs.writeFileSync(
    path.join(dstPackDir, "pack.json"),
    JSON.stringify(packJson, null, 2) + "\n",
    "utf-8",
  )

  return {
    pack: packJson,
    agents,
    skills,
    rules,
    packDir: dstPackDir,
  }
}

// 辅助：递归复制目录
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}
