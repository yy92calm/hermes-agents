# ExpertHub

> OpenCode 动态专家加载插件系统。以"专家包(pack)"为单位动态管理 agent、skill 和 rule。

ExpertHub 采用**双层架构**：

- **CLI 管理器**（`cli.js`）— 管理 pack 与启用状态，`import` 转换 WorkBuddy 团队，`enable` 标记可调度
- **运行时插件**（`plugin.js`）— 注册 5 个自定义工具，会话内即时调用专家/技能/规则，无需重启

**不复制文件**：专家/技能/规则全部留在 packs 目录，`enable` 只标记状态，插件运行时直接从 packs 读取。

## 安装

```bash
bun install

# 验证 CLI
bun cli.js help

# 安装运行时插件（软链 plugin.js → .opencode/plugins/expert-hub.js，并写 opencode.json）
bun cli.js install
```

`install` 会自动在 `.opencode/opencode.json` 写入：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./plugins/expert-hub.js"]
}
```

## 快速开始

```bash
# 1. 导入一个 WorkBuddy 团队作为 pack（自动转换 agents/skills/rules）
bun cli.js import teams/research --name research

# 2. 启用（标记为可调度，不复制文件）
bun cli.js enable research

# 3. 查看状态
bun cli.js list

# 4. 重启 OpenCode，在对话中即可：
#    expert_list                           列出已启用专家与规则
#    expert_dispatch(expert:"researcher", task:"...")   隔离运行
#    expert_inject(expert:"researcher", task:"...")     轻量注入
#    expert_skill(skill:"research-workflow")            加载技能
#    expert_rule(rule:"research_rules")                 加载规则
```

## Pack 结构

```
.opencode/expert-hub/packs/<pack-name>/
├── pack.json           ← 包清单
├── agents/             ← 专家 .md 文件（文件名即专家名）
│   └── my-expert.md
├── skills/             ← 技能目录
│   └── my-skill/
│       └── SKILL.md
└── rules/              ← 规则 .md 文件（文件名即规则名）
    └── team-rules.md
```

### pack.json

```json
{
  "name": "my-pack",
  "description": "我的专家包",
  "version": "1.0.0",
  "agents": ["./agents/my-expert.md"],
  "skills": ["./skills/my-skill"],
  "rules": ["./rules/team-rules.md"],
  "tags": ["custom"]
}
```

### Agent .md（文件名即专家名）

```markdown
---
description: 我的自定义专家，擅长 XXX
mode: subagent
tools:
  write: false
  edit: false
  bash: true
---

你是一位 XXX 专家。

When invoked:
1. 分析需求
2. 给出方案
```

| frontmatter 字段 | 必需 | 说明 |
|---|---|---|
| description | ✅ | 功能描述，用于 AI 自动匹配 |
| mode | ❌ | subagent / primary / all（默认 subagent） |
| model | ❌ | 省略即继承主会话模型 |
| tools | ❌ | 工具权限（write/edit/bash 等） |
| temperature | ❌ | 0.0–1.0 |

### Skill SKILL.md

```markdown
---
name: my-skill
description: 技能描述
compatibility: opencode
---

## 功能
- ...

## 工作流
1. ...
```

### Rule .md（文件名即规则名）

```markdown
---
description: 团队/项目规范，定义引用标准、编码约定等约束
alwaysApply: true
---

## 命名约定
- 变量使用 camelCase
- 常量使用 UPPER_SNAKE_CASE

## 安全实践
- 永不提交密钥到版本控制
```

## CLI 命令参考

| 命令 | 说明 |
|------|------|
| `list` | 列出所有 pack 及启用状态 |
| `info <pack>` | 查看 pack 详情（agents/skills/rules） |
| `enable <pack>` | 启用 pack（标记状态，不复制文件） |
| `disable <pack>` | 禁用 pack |
| `sync` | 校验并清理失效的启用记录 |
| `import <src> [--name X] [--tags a,b]` | 从 WorkBuddy 插件目录导入并转换（含 agents/skills/rules） |
| `install` | 安装运行时插件（软链 + 配置 opencode.json） |

### 从 WorkBuddy / CodeBuddy 导入

```bash
# 兼容两种 WorkBuddy 目录结构：
#   src/plugin.json + src/agents/*.md        （简化格式）
#   src/.codebuddy-plugin/plugin.json        （标准格式）
bun cli.js import teams/trading-agent-workbuddy --name trading
```

转换规则：
- 删除 frontmatter 的 `name`（用文件名）、`category`、`model: inherit`
- 强制 `mode: subagent` + 默认 `tools: {write:false, edit:false, bash:true}`
- rules：原样保留（清理 updatedAt 时间戳），复制到 `rules/`
- body 原样保留

## 运行时工具

在 OpenCode 对话中（只调度已 enable 的 pack）：

### expert_list
列出所有已启用的专家和规则。

### expert_dispatch（隔离模式）
```js
expert_dispatch({ expert: "backend-architect", task: "设计一个用户认证系统的 API" })
```
创建独立子会话运行专家，专家输出返回当前会话。适合需要专注的复杂任务。
（SDK client 不可用时自动回退到 inject 模式）

### expert_inject（轻量模式）
```js
expert_inject({ expert: "backend-architect", task: "这个表设计合理吗？" })
```
注入专家身份与指令到当前上下文，由当前会话扮演专家。适合快速问答。

### expert_skill
```js
expert_skill({ skill: "code-review" })
```
加载技能的完整操作指南到当前上下文。

### expert_rule
```js
expert_rule({ rule: "dev-standards" })
```
加载规则的完整内容到当前上下文，后续工作严格遵守。

## Packs 目录发现优先级

1. 环境变量 `EXPERTHUB_PACKS_DIR`
2. `.opencode/expert-hub/packs/`（项目级）
3. `~/.config/opencode/expert-hub/packs/`（全局）
4. `./expert-hub-packs/`（项目根）

## 技术细节

- **ESM 全包**，`type: "module"`
- **CLI/lib 零依赖**：仅用 `node:fs/path/os`，手写极简 YAML frontmatter 解析（支持 `>-`/`|` 块标量）
- **plugin.js 唯一依赖**：`@opencode-ai/plugin`；SDK client 通过 `ctx.client` 获取
- **不复制文件**：packs 目录是唯一数据源，enable 只是状态标记
- **install 用软链**：保留 `./lib/pack.js` 相对路径完整性

## 文档

- [实现说明与设计决策](./plans/expert-hub-实现说明.md)

## License

MIT
