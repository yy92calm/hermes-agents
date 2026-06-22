// lib/pack.js — Pack 扫描/解析/查找（零依赖，CLI 与 plugin 共用）
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

// ────────────────────────────────────────────────────────────
// 1. 极简 YAML frontmatter 解析（支持 key:value / 引号 / 嵌套对象 / 内联数组 / 多行列表）
// ────────────────────────────────────────────────────────────

function coerceValue(raw) {
  const v = raw.trim()
  if (v === "") return ""
  // 引号字符串
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  // 内联数组 [a, b, c]
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim()
    if (inner === "") return []
    return inner.split(",").map((s) => coerceValue(s.trim()))
  }
  // 布尔
  if (v === "true") return true
  if (v === "false") return false
  if (v === "null" || v === "~") return null
  // 数字
  if (/^-?\d+$/.test(v)) return parseInt(v, 10)
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v)
  return v
}

export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return { frontmatter: {}, body: text }
  const yamlBlock = match[1]
  const body = match[2]
  const frontmatter = {}
  const lines = yamlBlock.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith("#")) {
      i++
      continue
    }
    const m = /^(\s*)([A-Za-z0-9_-]+)\s*:(.*)$/.exec(line)
    if (!m) {
      i++
      continue
    }
    const indent = m[1].length
    const key = m[2]
    const rest = m[3].trim()
    if (rest !== "") {
      // 块标量（>-/>/|/-|）：收集后续更深缩进行
      if (/^[>|][+-]?$/.test(rest)) {
        const isLiteral = rest.startsWith("|")
        i++
        const blockLines = []
        while (i < lines.length) {
          const cl = lines[i]
          if (cl.trim() === "") {
            blockLines.push("")
            i++
            continue
          }
          const cm = /^(\s+)/.exec(cl)
          const childIndent = cm ? cm[1].length : 0
          if (childIndent <= indent) break
          blockLines.push(cl.slice(cm ? cm[1].length : 0))
          i++
        }
        if (isLiteral) {
          frontmatter[key] = blockLines.join("\n").replace(/\n+$/, "")
        } else {
          // 折叠：段内换行→空格，空行→换行，压缩空白
          frontmatter[key] = blockLines
            .join("\n")
            .replace(/\n{2,}/g, "\n\n")
            .replace(/([^\n])\n([^\n])/g, "$1 $2")
            .replace(/\n+$/, "")
            .trim()
        }
      } else {
        frontmatter[key] = coerceValue(rest)
        i++
      }
    } else {
      // 多行：嵌套对象 或 列表
      i++
      const childLines = []
      while (i < lines.length) {
        const cl = lines[i]
        if (cl.trim() === "") {
          i++
          continue
        }
        const cm = /^(\s+)/.exec(cl)
        const childIndent = cm ? cm[1].length : 0
        if (childIndent <= indent) break
        childLines.push(cl)
        i++
      }
      if (childLines.length === 0) {
        frontmatter[key] = null
      } else {
        // 列表（以 - 开头）
        if (/^\s*-\s+/.test(childLines[0])) {
          frontmatter[key] = childLines.map((cl) =>
            coerceValue(cl.replace(/^\s*-\s+/, "")),
          )
        } else {
          // 嵌套对象
          const obj = {}
          for (const cl of childLines) {
            const om = /^\s+([A-Za-z0-9_-]+)\s*:(.*)$/.exec(cl)
            if (om) obj[om[1]] = coerceValue(om[2])
          }
          frontmatter[key] = obj
        }
      }
    }
  }
  return { frontmatter, body }
}

export function stringifyFrontmatter(frontmatter) {
  const lines = []
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === null || value === undefined) continue
    if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const [k, v] of Object.entries(value)) {
        lines.push(`  ${k}: ${v}`)
      }
    } else if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`)
    } else if (typeof value === "string" && /[:#\[\]]/.test(value)) {
      lines.push(`${key}: "${value}"`)
    } else {
      lines.push(`${key}: ${value}`)
    }
  }
  return `---\n${lines.join("\n")}\n---\n`
}

export function parseAgentMd(filePath) {
  const text = fs.readFileSync(filePath, "utf-8")
  const { frontmatter, body } = parseFrontmatter(text)
  const name = path.basename(filePath, ".md")
  return { name, frontmatter, body: body.trim() }
}

export function parseSkillMd(filePath) {
  const text = fs.readFileSync(filePath, "utf-8")
  const { frontmatter, body } = parseFrontmatter(text)
  return { frontmatter, body: body.trim() }
}

// rule = .md 文件（文件名即规则名），frontmatter（description/alwaysApply 等）+ body
export function parseRuleMd(filePath) {
  const text = fs.readFileSync(filePath, "utf-8")
  const { frontmatter, body } = parseFrontmatter(text)
  const name = path.basename(filePath, ".md")
  return { name, frontmatter, body: body.trim() }
}

// ────────────────────────────────────────────────────────────
// 2. Packs 目录发现（设计文档第七节优先级）
// ────────────────────────────────────────────────────────────

export function getPacksDir(projectDir) {
  // 1. 环境变量
  if (process.env.EXPERTHUB_PACKS_DIR) return process.env.EXPERTHUB_PACKS_DIR
  const base = projectDir || process.cwd()
  // 2. 项目级 .opencode/expert-hub/packs/
  const projectPacks = path.join(base, ".opencode", "expert-hub", "packs")
  if (fs.existsSync(projectPacks)) return projectPacks
  // 3. 全局 ~/.config/opencode/expert-hub/packs/
  const globalPacks = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "expert-hub",
    "packs",
  )
  if (fs.existsSync(globalPacks)) return globalPacks
  // 4. 项目根 ./expert-hub-packs/
  const rootPacks = path.join(base, "expert-hub-packs")
  if (fs.existsSync(rootPacks)) return rootPacks
  // 默认返回项目级路径（即使不存在，调用方自行处理空情况）
  return projectPacks
}

export function getExpertHubDir(projectDir) {
  const base = projectDir || process.cwd()
  return path.join(base, ".opencode", "expert-hub")
}

export function getEnabledJsonPath(projectDir) {
  return path.join(getExpertHubDir(projectDir), "enabled.json")
}

export function getOpencodeJsonPath(projectDir) {
  const base = projectDir || process.cwd()
  return path.join(base, ".opencode", "opencode.json")
}

// ────────────────────────────────────────────────────────────
// 3. Pack 扫描
// ────────────────────────────────────────────────────────────

export function readPack(packDir) {
  const packJsonPath = path.join(packDir, "pack.json")
  if (!fs.existsSync(packJsonPath)) return null
  let json
  try {
    json = JSON.parse(fs.readFileSync(packJsonPath, "utf-8"))
  } catch {
    return null
  }
  const resolveRel = (rel) => path.join(packDir, rel)
  const agents = (json.agents || [])
    .map((rel) => resolveRel(rel))
    .filter((p) => fs.existsSync(p))
  const skills = (json.skills || [])
    .map((rel) => resolveRel(rel))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory())
  const rules = (json.rules || [])
    .map((rel) => resolveRel(rel))
    .filter((p) => fs.existsSync(p))
  return {
    dir: packDir,
    name: json.name || path.basename(packDir),
    description: json.description || "",
    version: json.version || "0.1.0",
    tags: json.tags || [],
    agents,
    skills,
    rules,
    json,
  }
}

export function scanAllPacks(packsDir, enabledPacks) {
  const filter = enabledPacks ? new Set(enabledPacks) : null
  const packs = []
  if (!fs.existsSync(packsDir)) return packs
  let entries = []
  try {
    entries = fs.readdirSync(packsDir, { withFileTypes: true })
  } catch {
    return packs
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pack = readPack(path.join(packsDir, entry.name))
    if (pack && (!filter || filter.has(pack.name))) packs.push(pack)
  }
  return packs
}

export function findPack(packsDir, packName) {
  const packs = scanAllPacks(packsDir)
  return packs.find((p) => p.name === packName) || null
}

// 扁平化所有 agent：返回 {name, pack, description, mode, tools, model, temperature, body, filePath}
export function scanAllExperts(packsDir, enabledPacks) {
  const packs = scanAllPacks(packsDir, enabledPacks)
  const experts = []
  for (const pack of packs) {
    for (const agentPath of pack.agents) {
      try {
        const parsed = parseAgentMd(agentPath)
        experts.push({
          name: parsed.name,
          pack: pack.name,
          description: parsed.frontmatter.description || "",
          mode: parsed.frontmatter.mode || "subagent",
          role: parsed.frontmatter.role || "",
          color: parsed.frontmatter.color || "",
          model: parsed.frontmatter.model,
          temperature: parsed.frontmatter.temperature,
          tools: parsed.frontmatter.tools || {},
          steps: parsed.frontmatter.steps,
          skills: parsed.frontmatter.skills || "",
          tags: pack.tags || [],
          filePath: agentPath,
          body: parsed.body,
        })
      } catch {
        // 跳过无法解析的 agent
      }
    }
  }
  return experts
}

export function findExpert(packsDir, expertName, enabledPacks) {
  const experts = scanAllExperts(packsDir, enabledPacks)
  return experts.find((e) => e.name === expertName) || null
}

export function findExpertInPack(packsDir, packName, expertName, enabledPacks) {
  const experts = scanAllExperts(packsDir, enabledPacks)
  return experts.find((e) => e.name === expertName && e.pack === packName) || null
}

export function scanPackSkills(packsDir, packName) {
  const pack = findPack(packsDir, packName)
  if (!pack) return []
  const skills = []
  for (const skillDir of pack.skills) {
    const skillMd = path.join(skillDir, "SKILL.md")
    if (!fs.existsSync(skillMd)) continue
    try {
      const parsed = parseSkillMd(skillMd)
      skills.push({
        name: parsed.frontmatter.name || path.basename(skillDir),
        frontmatter: parsed.frontmatter,
        body: parsed.body,
      })
    } catch { /* skip */ }
  }
  return skills
}

export function scanPackRules(packsDir, packName) {
  const pack = findPack(packsDir, packName)
  if (!pack) return []
  const rules = []
  for (const rulePath of pack.rules) {
    try {
      const parsed = parseRuleMd(rulePath)
      rules.push({
        name: parsed.name,
        description: parsed.frontmatter.description || "",
        alwaysApply: parsed.frontmatter.alwaysApply,
        body: parsed.body,
      })
    } catch { /* skip */ }
  }
  return rules
}

export function findSkill(packsDir, skillName, enabledPacks) {
  const packs = scanAllPacks(packsDir, enabledPacks)
  for (const pack of packs) {
    for (const skillDir of pack.skills) {
      const skillMd = path.join(skillDir, "SKILL.md")
      if (!fs.existsSync(skillMd)) continue
      try {
        const parsed = parseSkillMd(skillMd)
        const name = parsed.frontmatter.name || path.basename(skillDir)
        if (name === skillName || path.basename(skillDir) === skillName) {
          return {
            name,
            pack: pack.name,
            skillDir,
            frontmatter: parsed.frontmatter,
            body: parsed.body,
          }
        }
      } catch {
        // skip
      }
    }
  }
  return null
}

// 扁平化所有 rule：返回 {name, pack, description, body, filePath}
export function scanAllRules(packsDir, enabledPacks) {
  const packs = scanAllPacks(packsDir, enabledPacks)
  const rules = []
  for (const pack of packs) {
    for (const rulePath of pack.rules) {
      try {
        const parsed = parseRuleMd(rulePath)
        rules.push({
          name: parsed.name,
          pack: pack.name,
          description: parsed.frontmatter.description || "",
          alwaysApply: parsed.frontmatter.alwaysApply,
          filePath: rulePath,
          body: parsed.body,
        })
      } catch {
        // skip
      }
    }
  }
  return rules
}

export function findRule(packsDir, ruleName, enabledPacks) {
  const rules = scanAllRules(packsDir, enabledPacks)
  return rules.find((r) => r.name === ruleName) || null
}

// ────────────────────────────────────────────────────────────
// 4. enabled.json 读写
// ────────────────────────────────────────────────────────────

export function readEnabled(projectDir) {
  const p = getEnabledJsonPath(projectDir)
  if (!fs.existsSync(p)) return { enabled: [] }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"))
  } catch {
    return { enabled: [] }
  }
}

export function writeEnabled(projectDir, data) {
  const p = getEnabledJsonPath(projectDir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8")
}

export function isPackEnabled(projectDir, packName) {
  const { enabled } = readEnabled(projectDir)
  return enabled.some((e) => e.name === packName)
}

// 返回已启用 pack 名数组（plugin 用此过滤扫描范围）
export function getEnabledPackNames(projectDir) {
  const { enabled } = readEnabled(projectDir)
  return (enabled || []).map((e) => e.name)
}
