#!/usr/bin/env node
// cli.js — ExpertHub CLI 管理器（ESM，零依赖，node:fs 同步 API）
// enable/disable 只管理 enabled.json 状态，不复制任何文件到 .opencode/
// 专家/技能/规则全部留在 packs 目录，由 plugin.js 运行时调度
import fs from "node:fs"
import path from "node:path"
import {
  getPacksDir,
  getExpertHubDir,
  scanAllPacks,
  findPack,
  readEnabled,
  writeEnabled,
  isPackEnabled,
  getOpencodeJsonPath,
} from "./lib/pack.js"
import { importWorkBuddy } from "./lib/convert.js"

const PROJECT_DIR = process.cwd()

// ────────────────────────────────────────────────────────────
// 辅助
// ────────────────────────────────────────────────────────────
function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function getPluginsDir() {
  return path.join(PROJECT_DIR, ".opencode", "plugins")
}

// ────────────────────────────────────────────────────────────
// enable / disable（纯状态管理，不复制文件）
// ────────────────────────────────────────────────────────────
function enablePack(packName) {
  const packsDir = getPacksDir(PROJECT_DIR)
  const pack = findPack(packsDir, packName)
  if (!pack) {
    console.error(`✗ 未找到 pack "${packName}"。运行 'experthub list' 查看可用 pack。`)
    process.exit(1)
  }
  const agentNames = pack.agents.map((a) => path.basename(a, ".md"))
  const skillNames = pack.skills.map((s) => path.basename(s))
  const ruleNames = pack.rules.map((r) => path.basename(r, ".md"))

  const data = readEnabled(PROJECT_DIR)
  data.enabled = (data.enabled || []).filter((e) => e.name !== pack.name)
  data.enabled.push({
    name: pack.name,
    agents: agentNames,
    skills: skillNames,
    rules: ruleNames,
  })
  writeEnabled(PROJECT_DIR, data)

  console.log(`✓ 已启用 pack "${pack.name}"（运行时可调度）`)
  console.log(`  agents: ${agentNames.join(", ") || "(无)"}`)
  console.log(`  skills: ${skillNames.join(", ") || "(无)"}`)
  console.log(`  rules : ${ruleNames.join(", ") || "(无)"}`)
  console.log(`\n专家/技能/规则留在 packs 目录，由 plugin 的 expert_* 工具调度。`)
}

function disablePack(packName) {
  const data = readEnabled(PROJECT_DIR)
  const entry = (data.enabled || []).find((e) => e.name === packName)
  if (!entry) {
    console.error(`✗ pack "${packName}" 未启用。`)
    process.exit(1)
  }
  data.enabled = (data.enabled || []).filter((e) => e.name !== packName)
  writeEnabled(PROJECT_DIR, data)
  console.log(`✓ 已禁用 pack "${packName}"`)
}

// 校验：移除 packs 目录中已不存在的 pack 记录
function syncAll() {
  const data = readEnabled(PROJECT_DIR)
  const packsDir = getPacksDir(PROJECT_DIR)
  const existing = new Set(scanAllPacks(packsDir).map((p) => p.name))
  const valid = (data.enabled || []).filter((e) => existing.has(e.name))
  const removed = (data.enabled || []).filter((e) => !existing.has(e.name))
  if (removed.length) {
    writeEnabled(PROJECT_DIR, { enabled: valid })
    console.log(`✓ 移除 ${removed.length} 个失效 pack：${removed.map((e) => e.name).join(", ")}`)
  }
  console.log(
    `已启用 ${valid.length} 个 pack：${valid.map((e) => e.name).join(", ") || "(无)"}`,
  )
}

// ────────────────────────────────────────────────────────────
// install（软链 plugin.js + 写 opencode.json plugin 配置）
// ────────────────────────────────────────────────────────────
function installPlugin() {
  const srcPlugin = path.join(PROJECT_DIR, "plugin.js")
  if (!fs.existsSync(srcPlugin)) {
    console.error("✗ 未找到 plugin.js，请在项目根目录运行此命令。")
    process.exit(1)
  }
  const pluginsDir = getPluginsDir()
  fs.mkdirSync(pluginsDir, { recursive: true })
  const dst = path.join(pluginsDir, "expert-hub.js")
  fs.rmSync(dst, { force: true })
  let usedSymlink = false
  try {
    fs.symlinkSync(srcPlugin, dst)
    usedSymlink = true
  } catch {
    copyFile(srcPlugin, dst)
    copyDir(path.join(PROJECT_DIR, "lib"), path.join(pluginsDir, "lib"))
  }
  fs.mkdirSync(path.join(getExpertHubDir(PROJECT_DIR), "packs"), { recursive: true })

  // 写 opencode.json plugin 配置
  const opencodePath = getOpencodeJsonPath(PROJECT_DIR)
  let cfg = {}
  if (fs.existsSync(opencodePath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(opencodePath, "utf-8"))
    } catch {
      cfg = {}
    }
  }
  cfg.$schema = "https://opencode.ai/config.json"
  cfg.plugin = ["./plugins/expert-hub.js"]
  fs.mkdirSync(path.dirname(opencodePath), { recursive: true })
  fs.writeFileSync(opencodePath, JSON.stringify(cfg, null, 2) + "\n", "utf-8")

  console.log(`✓ 插件已安装（${usedSymlink ? "软链" : "复制"}）：${dst}`)
  console.log(`  packs 目录：${path.join(getExpertHubDir(PROJECT_DIR), "packs")}`)
  console.log(`  已写入 ${opencodePath} 的 plugin 字段`)
  console.log(
    `\n5 个工具已就绪：expert_list / expert_dispatch / expert_inject / expert_skill / expert_rule`,
  )
}

// ────────────────────────────────────────────────────────────
// 命令实现
// ────────────────────────────────────────────────────────────
function cmdList() {
  const packsDir = getPacksDir(PROJECT_DIR)
  const packs = scanAllPacks(packsDir)
  if (packs.length === 0) {
    console.log(`packs 目录：${packsDir}`)
    console.log("当前没有任何 pack。")
    console.log("\n创建第一个 pack：")
    console.log("  experthub import <WorkBuddy插件目录> --name <包名>")
    console.log("  或手动在 packs/ 下创建 pack.json")
    return
  }
  console.log(`packs 目录：${packsDir}\n`)
  for (const pack of packs) {
    const enabled = isPackEnabled(PROJECT_DIR, pack.name)
    const mark = enabled ? "[✓ 启用]" : "[  禁用]"
    console.log(`${mark} ${pack.name} v${pack.version}`)
    console.log(`         ${pack.description}`)
    console.log(
      `         agents: ${pack.agents.length} | skills: ${pack.skills.length} | rules: ${pack.rules.length}`,
    )
  }
}

function cmdInfo(packName) {
  const packsDir = getPacksDir(PROJECT_DIR)
  const pack = findPack(packsDir, packName)
  if (!pack) {
    console.error(`✗ 未找到 pack "${packName}"`)
    process.exit(1)
  }
  console.log(`名称：${pack.name}`)
  console.log(`版本：${pack.version}`)
  console.log(`描述：${pack.description}`)
  console.log(`目录：${pack.dir}`)
  console.log(`标签：${(pack.tags || []).join(", ") || "(无)"}`)
  console.log(`\nAgents (${pack.agents.length})：`)
  for (const a of pack.agents) console.log(`  - ${path.basename(a, ".md")}`)
  console.log(`\nSkills (${pack.skills.length})：`)
  for (const s of pack.skills) console.log(`  - ${path.basename(s)}`)
  console.log(`\nRules (${pack.rules.length})：`)
  for (const r of pack.rules) console.log(`  - ${path.basename(r, ".md")}`)
  console.log(`\n启用状态：${isPackEnabled(PROJECT_DIR, pack.name) ? "✓ 已启用" : "未启用"}`)
}

function cmdImport(args) {
  const positional = []
  let name = null
  let desc = ""
  let tags = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--name" || a === "-n") name = args[++i]
    else if (a === "--desc" || a === "-d") desc = args[++i]
    else if (a === "--tags" || a === "-t") tags = (args[++i] || "").split(",")
    else positional.push(a)
  }
  const srcDir = positional[0]
  if (!srcDir) {
    console.error("用法：experthub import <src-dir> [--name X] [--desc ...] [--tags a,b]")
    process.exit(1)
  }
  const resolvedSrc = path.resolve(PROJECT_DIR, srcDir)
  if (!fs.existsSync(resolvedSrc)) {
    console.error(`✗ 源目录不存在：${resolvedSrc}`)
    process.exit(1)
  }
  const packName = name || path.basename(path.resolve(resolvedSrc))
  const packsDir = getPacksDir(PROJECT_DIR)
  const dstPackDir = path.join(packsDir, packName)
  const result = importWorkBuddy(resolvedSrc, dstPackDir, {
    name: packName,
    description: desc,
    tags,
  })
  console.log(`✓ 已导入 pack "${result.pack.name}"`)
  console.log(`  目录：${result.packDir}`)
  console.log(`  agents: ${result.agents.length} 个`)
  console.log(`  skills: ${result.skills.length} 个`)
  console.log(`  rules : ${result.rules.length} 个`)
  console.log(`\n运行 'experthub enable ${result.pack.name}' 启用。`)
}

// ────────────────────────────────────────────────────────────
// 命令分发
// ────────────────────────────────────────────────────────────
function help() {
  console.log(`ExpertHub — OpenCode 动态专家加载插件系统

用法：
  experthub <command> [args]

命令：
  list                          列出所有 pack 及启用状态
  info <pack>                   查看 pack 详情
  enable <pack>                 启用 pack（标记为可调度，不复制文件）
  disable <pack>                禁用 pack
  sync                          校验并清理失效的启用记录
  import <src-dir> [options]    从 WorkBuddy 插件目录导入并转换
                                选项：--name <名> --desc <描述> --tags <a,b,c>
  install                       安装运行时插件到 .opencode/plugins/expert-hub.js
  help                          显示此帮助

说明：
  专家/技能/规则留在 packs 目录，不复制到 .opencode/。
  plugin 的 expert_* 工具只调度已 enable 的 pack。
  mcp 配置暂不处理。

环境变量：
  EXPERTHUB_PACKS_DIR           自定义 packs 目录路径

示例：
  experthub import teams/research --name research
  experthub enable research
  experthub install
  experthub list`)
}

async function main() {
  const [, , cmd, ...rest] = process.argv
  switch (cmd) {
    case "list":
    case "ls":
      cmdList()
      break
    case "info":
      if (!rest[0]) {
        console.error("用法：experthub info <pack>")
        process.exit(1)
      }
      cmdInfo(rest[0])
      break
    case "enable":
      if (!rest[0]) {
        console.error("用法：experthub enable <pack>")
        process.exit(1)
      }
      enablePack(rest[0])
      break
    case "disable":
      if (!rest[0]) {
        console.error("用法：experthub disable <pack>")
        process.exit(1)
      }
      disablePack(rest[0])
      break
    case "sync":
      syncAll()
      break
    case "import":
      cmdImport(rest)
      break
    case "install":
      installPlugin()
      break
    case undefined:
    case "help":
    case "--help":
    case "-h":
      help()
      break
    default:
      console.error(`未知命令：${cmd}`)
      help()
      process.exit(1)
  }
}

main().catch((err) => {
  console.error("✗", err?.message || err)
  process.exit(1)
})
