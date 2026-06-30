# ExpertHub

OpenCode 动态专家加载插件系统。以专家包（pack）为单位动态管理 agent、skill 和 rule，在运行中即时调度专业能力，无需重启会话。

## 架构

双层架构，packs 目录是唯一数据源，不复制任何文件：

```
teams/                            WorkBuddy 只读样本
  | experthub import（格式转换）
  v
.opencode/expert-hub/packs/      OpenCode 格式，唯一数据源
  | experthub enable（标记启用状态）
  v
enabled.json                      启用状态记录
  | plugin.js 启动时读取
  v
5 个 expert_* 工具                会话内即时调度
```

- **CLI 管理器**（cli.js）：管理 pack 与启用状态。import 转换 WorkBuddy 格式，enable/disable 只改 enabled.json，不复制文件。
- **运行时插件**（plugin.js）：注册 5 个自定义工具，直接从 packs 目录读取调度，只扫描已启用的 pack。

## 当前已安装 Packs

项目已导入并启用 6 个专家包，覆盖研究分析、开发架构、交易决策、运维、产品设计等领域：

| Pack | Agents | Skills | Rules | 描述 |
|------|--------|--------|-------|------|
| research | 3 | 7 | 1 | 研究分析团队，完成从调研到输出的完整工作流 |
| development | 2 | 1 | 1 | 开发架构专家包 |
| trading | 13 | 1 | 1 | 交易决策团队 |
| trading-agents | 12 | 14 | 1 | 交易分析多 Agent 协作 |
| devops | 2 | 1 | 1 | 运维自动化 |
| product-team | 5 | 11 | 1 | 产品设计开发测试全流程 |

合计 37 位专家、35 个技能、6 条规则。所有 pack 已启用，详情运行 `bun cli.js list` 查看。

## 核心概念

### Pack（专家包）

一组 agent + skill + rule 的集合，由 pack.json 清单描述：

```json
{
  "name": "research",
  "description": "研究分析团队 - 多 Agent 协作完成从调研到输出的完整工作流",
  "version": "1.0.0",
  "agents": ["./agents/researcher.md"],
  "skills": ["./skills/critical-analysis"],
  "rules": ["./rules/research_rules.md"],
  "tags": ["research"]
}
```

### Agent（专家）

一个 .md 文件，YAML frontmatter（description / mode / tools / model）+ body 系统提示。文件名即专家名。

```markdown
---
role: 高级研究员
description: 负责信息检索、文献调研和资料收集
skills: information-retrieval, critical-analysis
mode: subagent
tools:
  write: false
  edit: false
  bash: true
---

You are the 高级研究员 (researcher). 负责信息检索、文献调研和资料收集...
```

| frontmatter 字段 | 必需 | 说明 |
|---|---|---|
| description | 是 | 功能描述，用于列表展示与匹配 |
| role | 否 | 角色名称 |
| mode | 否 | subagent / primary / all（默认 subagent） |
| model | 否 | 指定模型，省略则继承主会话模型 |
| tools | 否 | 工具权限（write / edit / bash 等） |
| temperature | 否 | 0.0-1.0 |
| skills | 否 | 逗号分隔的技能名，精确加载对应 SKILL.md（未声明则加载全部） |

### Skill（技能）

一个目录，内含 SKILL.md（frontmatter + 操作指南）。

```markdown
---
name: critical-analysis
description: 批判性分析技能 - 评估论点、识别逻辑谬误、验证证据强度
compatibility: opencode
---

## 工作流
1. 识别核心论点和假设
2. 评估证据质量与来源
...
```

### Rule（规则）

一个 .md 文件（frontmatter: description / alwaysApply + 规范正文）。文件名即规则名。

```markdown
---
description: 研究引用规范，定义来源引用、数据质量标准
alwaysApply: true
---

## 来源引用
- 每个论断必须标注来源
- 使用完整 URL 引用网络来源
- 区分已验证信息与未确认信息
...
```

Rule 加载时机：alwaysApply 未显式设为 false 的规则在专家调度时自动注入；alwaysApply 为 false 的规则需通过 expert_rule 工具手动加载。

## 数据流

### WorkBuddy 导入流程

```
teams/research/plugin.json                 teams/research/agents/researcher.md
  name: "research"                           ---
  agents: ["./agents/researcher.md", ...]    name: "researcher"        ← 删除，用文件名
  skills: [catalog from skills/ dirs]        category: ...             ← 删除
  rules: [catalog from rules/ dirs]          model: inherit            ← 删除
                                             role: 高级研究员          ← 保留
  ─────────────── experthub import ───────────────  color: "#D4A017"    ← 保留
                                             skills: "info-retrieval"  ← 保留
                                             ---                       + mode: subagent
                                                                       + tools:{write:false,...}

.opencode/expert-hub/packs/research/pack.json   .opencode/expert-hub/packs/research/agents/researcher.md
  name: "research"                                ---
  agents: ["./agents/researcher.md"]              role: 高级研究员
  skills: ["./skills/critical-analysis", ...]     description: 负责信息检索...
  rules: ["./rules/research_rules.md"]            skills: information-retrieval, critical-analysis
                                                  mode: subagent
                                                  tools:
                                                    write: false
                                                    edit: false
                                                    bash: true
                                                  ---
                                                  (body 原样保留)
```

### 运行时调度流程

```
enabled.json (已启用包列表)
  |
  v
plugin.js 启动 → getEnabledPackNames() → 只扫描已启用 pack
  |
  ├── expert_list:   scanAllExperts(已启用过滤) → 返回列表
  ├── expert_dispatch: findExpert → ctx.client.session.create + prompt(system, parts)
  |                                   └── 不可用时回退 fallbackInject
  ├── expert_inject:   findExpert → 返回 <expert_context> + <task> XML
  ├── expert_skill:    findSkill → 返回 <skill> XML
  └── expert_rule:     findRule → 返回 <rule> XML
```

调度时自动行为：
- 按 agent 的 skills 字段精确加载对应技能（逗号分隔匹配），未声明则加载 pack 内全部技能
- 自动注入 alwaysApply !== false 的规则
- dispatch 模式独立子会话，inject 模式注入主会话

## 安装

```bash
bun install

# 验证 CLI
bun cli.js help

# 安装运行时插件（软链 plugin.js + 配置 opencode.json）
bun cli.js install
```

install 命令执行：
- 在 .opencode/plugins/expert-hub.js 创建软链（或 fallback 复制）
- 写入 .opencode/opencode.json 的 plugin 字段

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./plugins/expert-hub.js"]
}
```

## 快速开始

```bash
# 1. 导入 WorkBuddy 团队为 pack（自动转换 agents/skills/rules）
bun cli.js import teams/research --name research

# 2. 启用（标记为可调度，不复制文件）
bun cli.js enable research

# 3. 查看状态
bun cli.js list

# 4. 重启 OpenCode，在对话中使用 expert_* 工具
```

## CLI 命令参考

| 命令 | 说明 |
|------|------|
| list | 列出所有 pack 及启用状态 |
| info <pack> | 查看 pack 详情（agents / skills / rules） |
| enable <pack> | 启用 pack（标记 enabled.json 状态，不复制文件） |
| disable <pack> | 禁用 pack |
| sync | 校验并清理 packs 目录中已不存在 pack 的启用记录 |
| import <src> [--name X] [--desc ...] [--tags a,b] | 从 WorkBuddy 插件目录导入并转换 |
| install | 安装运行时插件（软链 + 写 opencode.json） |
| help | 显示帮助信息 |

### import 转换规则

从 WorkBuddy / CodeBuddy 格式导入时自动执行：

- Agent：删除 frontmatter 的 name（改用文件名）、category、model: inherit；强制 mode: subagent；补默认 tools: {write: false, edit: false, bash: true}；body 原样保留
- Skill：补 compatibility: opencode；目录结构与 SKILL.md 原样保留；附属文件（reference.md / scripts/ 等）一并复制
- Rule：清理 updatedAt 字段，frontmatter 与 body 原样保留
- 兼容两种目录结构：src/plugin.json + src/agents/*.md（简化格式）、src/.codebuddy-plugin/plugin.json（标准格式）

## 运行时工具

在 OpenCode 对话中调用，所有工具只调度已启用的 pack。

### expert_list

列出所有已启用的专家和规则，显示名称、所属 pack、角色、描述与标签。

### expert_dispatch（隔离模式）

```js
expert_dispatch({ expert: "researcher", task: "调研当前 AI Agent 框架的最新进展" })
```

创建独立子会话运行专家，专家输出返回当前会话。适合需要专注且不受当前上下文干扰的复杂任务。SDK 不可用时自动回退到 inject 模式。

构建逻辑：buildExpertSystemPrompt() 按 expert 的 skills 字段精确加载对应 SKILL.md，自动注入 alwaysApply 的规则，组装 system prompt，一次 session.prompt(system + parts) 调用完成。

### expert_inject（轻量模式）

```js
expert_inject({ expert: "researcher", task: "这个数据来源可信吗？" })
```

注入专家身份与指令到当前上下文，由当前会话扮演专家处理任务。适合快速问答和无需隔离的场景。

### expert_skill

```js
expert_skill({ skill: "critical-analysis" })
```

加载指定技能的完整操作指南到当前上下文，后续任务按技能指引执行。

### expert_rule

```js
expert_rule({ rule: "research_rules" })
```

加载指定规则的完整内容到当前上下文，后续工作严格遵守规则约束。

### 同名专家消歧

多个 pack 中存在同名专家时（如 trading 与 trading-agents 均有 fundamentals-analyst），使用 pack 参数指定：

```js
expert_dispatch({ expert: "fundamentals-analyst", pack: "trading", task: "..." })
```

## Packs 目录结构

```
.opencode/expert-hub/packs/<pack-name>/
├── pack.json              包清单（名称、版本、描述、标签、引用路径）
├── agents/                专家 .md 文件
│   ├── expert-a.md
│   └── expert-b.md
├── skills/                技能目录
│   └── skill-name/
│       ├── SKILL.md       技能操作指南
│       └── ...             附属文件（脚本、参考等）
└── rules/                 规则 .md 文件
    └── team-rules.md
```

## Packs 目录发现优先级

1. 环境变量 `EXPERTHUB_PACKS_DIR`
2. `.opencode/expert-hub/packs/`（项目级）
3. `~/.config/opencode/expert-hub/packs/`（全局级）
4. `./expert-hub-packs/`（项目根）

## 设计决策

### 不复制文件

专家、技能、规则全部留在 packs 目录，enable 只改 enabled.json 状态。packs 是唯一数据源，避免文件分散与同步问题。plugin 运行时直接从 packs 读取调度。

### enable 是激活标记而非文件分发

plugin 读 enabled.json 决定扫描范围。未 enable 的 pack 不被 expert_list 列出、不被任何调度工具访问。按需启用，避免无关专家干扰对话上下文。

### import 复制到 packs 因格式转换

teams 是 WorkBuddy 格式（frontmatter 含 name / role / color / skills），packs 是 OpenCode 格式（删 name、加 mode / tools）。转换不可逆，保留转换后副本。teams 作为只读样本保留。

### SDK client 从 ctx 获取，不自建

plugin 入口收到 ctx.client（已为 createOpencodeClient 实例），expert_dispatch 直接用 ctx.client.session.create / prompt，不引入 @opencode-ai/sdk。

### expert_dispatch 一步到位

SDK 的 session.prompt body 支持 system 字段，专家 system prompt 与任务 parts 一次调用完成。

### install 用软链

.opencode/plugins/expert-hub.js 软链到根 plugin.js，保留 ./lib/pack.js 相对路径完整性。软链失败 fallback 复制 plugin.js + lib/。

### tool 返回文本

ToolResult 类型只允许 string | {title?, output, metadata?}。注入专家 / 规则上下文用 XML 文本块返回（主会话 LLM 读到文本即扮演），不使用结构化的对象返回。

### 极简 YAML 解析（零依赖）

lib/pack.js 手写 frontmatter 解析，支持：key:value、引号字符串、内联数组、嵌套对象、多行列表、块标量 >- / |（WorkBuddy 的 rule 用 >- 折叠多行 description）。不引入 js-yaml。

## 技术约束

1. ESM 全包：type: module，所有文件 .js
2. CLI / lib 零依赖：只用 node:fs / path / os
3. plugin.js 唯一依赖：@opencode-ai/plugin；SDK client 通过 ctx.client 获取，不自行创建
4. 文件操作用同步 API（node:fs sync）
5. CLI 与 plugin 共用 lib/pack.js，发现逻辑一致（getPacksDir()）

## session.created 钩子

plugin.js 注册了 session.created 事件钩子（当前为空占位），可扩展用于自动注入启用的专家列表或规则到新会话。

## 项目文件

| 文件 | 职责 |
|------|------|
| plugin.js | 运行时插件入口，5 个 expert_* 工具 + session.created 事件 |
| cli.js | CLI 管理器，7 个命令（list / info / enable / disable / sync / import / install） |
| lib/pack.js | pack 发现、扫描、解析、查找，含极简 YAML frontmatter 解析，CLI 与 plugin 共用 |
| lib/convert.js | WorkBuddy / CodeBuddy 到 OpenCode 格式转换 |

## 详细文档

实现说明与设计决策详见 [plans/expert-hub-实现说明.md](./plans/expert-hub-实现说明.md)。
