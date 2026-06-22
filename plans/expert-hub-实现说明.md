# ExpertHub 实现说明

> 本文档与代码实现一致，描述当前真实架构与设计决策。
> 项目源码：`plugin.js` / `cli.js` / `lib/pack.js` / `lib/convert.js`

---

## 一、架构

双层架构，**packs 目录是唯一数据源，不复制任何文件**：

```
teams/ (WorkBuddy 只读样本)
   │  experthub import（格式转换）
   ▼
.opencode/expert-hub/packs/ (OpenCode 格式，唯一数据源)
   │  experthub enable（标记状态）
   ▼
enabled.json (启用状态)
   │  plugin.js 读取
   ▼
5 个 expert_* 工具（会话内调度）
```

- **CLI（cli.js）**：管理 pack 与启用状态。`import` 转换 WorkBuddy 格式，`enable`/`disable` 只改 `enabled.json`，不复制文件。
- **运行时插件（plugin.js）**：注册 5 个工具，直接从 packs 目录读取调度，只扫已 enable 的 pack。

---

## 二、核心概念

- **Pack（专家包）** = 一组 agent + skill + rule 的集合，由 `pack.json` 描述
- **Agent（专家）** = `.md` 文件 = YAML frontmatter（description/mode/tools/model）+ body。**文件名即专家名**
- **Skill（技能）** = 目录，内含 `SKILL.md`（frontmatter + 操作指南）
- **Rule（规则）** = `.md` 文件（frontmatter：description/alwaysApply + 正文）。**文件名即规则名**
- **MCP**：暂不处理（与 agent/skill/rule 机制不同，后续按需扩展）

### pack.json

```json
{
  "name": "development",
  "description": "开发架构专家包",
  "version": "1.0.0",
  "agents": ["./agents/backend-architect.md"],
  "skills": ["./skills/code-review"],
  "rules": ["./rules/dev-standards.md"],
  "tags": ["dev"]
}
```

---

## 三、运行时 5 个工具（plugin.js）

| 工具 | 参数 | 实现 |
|------|------|------|
| `expert_list` | 无 | 扫描已启用 pack，列出专家 + 规则 |
| `expert_dispatch` | expert, task | `ctx.client.session.create` + `prompt(system=专家body, parts=task)`，提取 parts.text 返回；SDK 不可用回退 inject |
| `expert_inject` | expert, task | 构造 `<expert_context>` XML 文本块返回 |
| `expert_skill` | skill | 加载 SKILL.md 内容，`<skill>` XML 块返回 |
| `expert_rule` | rule | 加载规则 .md，`<rule>` XML 块返回 |

**所有工具只扫描已 enable 的 pack**（读 `enabled.json` 的 `getEnabledPackNames()` 过滤）。

---

## 四、目录结构

```
AgentTeam/
├── plugin.js                       ← ESM 插件入口（5 tool + session.created 钩子）
├── cli.js                          ← CLI（ESM，零依赖，node:fs 同步）
├── lib/
│   ├── pack.js                     ← packs 发现/扫描/极简YAML解析/查找（CLI+plugin 共用）
│   └── convert.js                  ← WorkBuddy → OpenCode 转换
├── package.json                    ← name: opencode-experthub, type: module
├── AGENTS.md                       ← Agent 项目说明
├── README.md                       ← 用户文档
├── teams/                          ← WorkBuddy 格式样本（只读，import 输入）
└── .opencode/                      ← 运行时生成（gitignore）
    ├── plugins/expert-hub.js       ← install 后软链到根 plugin.js
    ├── expert-hub/packs/           ← 专家包仓库（唯一数据源）
    ├── expert-hub/enabled.json     ← 启用状态
    └── opencode.json               ← 主配置（plugin 字段）
```

---

## 五、CLI 命令

```
experthub list                          列出所有 pack 及启用状态
experthub info <pack>                   查看 pack 详情（agents/skills/rules）
experthub enable <pack>                 启用（仅标记 enabled.json，不复制文件）
experthub disable <pack>                禁用
experthub sync                          校验并清理失效的启用记录
experthub import <src-dir> [--name X]   WorkBuddy → pack 转换（agents/skills/rules）
experthub install                       软链 plugin.js + 写 opencode.json plugin 字段
```

---

## 六、设计决策（为什么这样做）

### 6.1 不复制文件到 .opencode/agents 等
专家/技能/规则留在 packs 目录，`enable` 只改 `enabled.json` 状态。packs 是唯一数据源，避免文件分散与同步问题。plugin 直接从 packs 读取调度。

### 6.2 enable 是"激活标记"而非"文件分发"
plugin 读 `enabled.json` 决定扫描范围。未 enable 的 pack 不被 `expert_list` 列出、不被 dispatch/inject/skill/rule 调度。这样按需启用，避免无关专家干扰。

### 6.3 import 复制到 packs 是因为格式转换
teams 是 WorkBuddy 格式（frontmatter 含 name/role/color/skills），packs 是 OpenCode 格式（删 name、加 mode/tools）。转换不可逆，故保留一份转换后副本。teams 作为只读样本保留。

转换规则（convert.js）：
- 删 frontmatter 的 `name`（用文件名）、`category`、`model: inherit`
- 强制 `mode: subagent` + 默认 `tools: {write:false, edit:false, bash:true}`
- rules 原样保留（清理 updatedAt）
- body 原样保留

### 6.4 SDK client 从 ctx 获取，不自建
plugin 入口收到 `ctx.client`（已是 `createOpencodeClient` 实例），`expert_dispatch` 直接用 `ctx.client.session.create/prompt`，不自己 `import @opencode-ai/sdk`。

### 6.5 expert_dispatch 一步到位
SDK 的 `session.prompt` body 支持 `system` 字段，专家提示词（system）+ 任务（parts）一次调用完成，无需"先发 system 后发 task"两次 prompt。

### 6.6 install 用软链
`.opencode/plugins/expert-hub.js` 软链到根 `plugin.js`，保留 `./lib/pack.js` 相对路径完整性（软链失败 fallback 复制 plugin.js + lib/）。

### 6.7 tool 返回文本而非任意对象
`ToolResult` 类型只允许 `string | {title?, output, metadata?}`。注入专家/规则上下文用 XML 文本块返回（主会话 LLM 读到文本即"扮演"），不用文档设想的 `{context_injection}` 结构。

### 6.8 极简 YAML 解析（零依赖）
lib/pack.js 手写 frontmatter 解析，支持：key:value、引号、内联数组、嵌套对象、多行列表、**块标量 `>-`/`|`**（WorkBuddy 的 rule 用 `>-` 折叠多行 description）。不引入 js-yaml。

---

## 七、Packs 目录发现优先级

1. 环境变量 `EXPERTHUB_PACKS_DIR`
2. `.opencode/expert-hub/packs/`（项目级）
3. `~/.config/opencode/expert-hub/packs/`（全局）
4. `./expert-hub-packs/`（项目根）

---

## 八、关键约束

1. **ESM 全包**：`type: "module"`，所有文件 `.js`
2. **CLI/lib 零依赖**：只用 `node:fs/path/os`
3. **plugin.js 唯一依赖**：`@opencode-ai/plugin`
4. **文件操作用同步 API**（node:fs sync）
5. **CLI 与 plugin 共用 `lib/pack.js`**：发现逻辑一致（`getPacksDir()`）
