# ExpertHub (opencode-experthub)

OpenCode 动态专家加载插件系统。以"专家包(pack)"为单位动态管理 agent、skill 和 rule。

双层架构：**CLI 管理器**（管理 pack 与启用状态）+ **运行时插件 plugin.js**（5 个自定义 tool，即时调度）。

**不复制文件**：专家/技能/规则全部留在 packs 目录，enable 只标记状态，plugin 运行时直接从 packs 读取调度。

## 项目结构

```
AgentTeam/                          ← 目录名（npm 包名 opencode-experthub）
├── plugin.js                       ← 运行时插件入口（ESM，5 tool + session.created 钩子）
├── cli.js                          ← CLI 管理器（ESM，零依赖，node:fs 同步 API）
├── lib/
│   ├── pack.js                     ← pack 发现/扫描/解析/查找（CLI 与 plugin 共用，含极简 YAML 解析）
│   └── convert.js                  ← WorkBuddy → OpenCode 格式转换
├── package.json                    ← type: module，依赖 @opencode-ai/plugin
├── teams/                          ← WorkBuddy 格式样本数据（import 测试用，只读）
├── expert-hub-design.md            ← 设计文档 v2.0
├── plans/                          ← 方案文档
└── .opencode/                      ← 运行时生成（gitignore）
    ├── plugins/expert-hub.js       ← install 后软链到根 plugin.js
    ├── expert-hub/packs/           ← 专家包仓库（唯一数据源）
    ├── expert-hub/enabled.json     ← 启用状态
    └── opencode.json               ← 主配置（plugin 字段）
```

## 核心概念

- **Pack（专家包）** = 一组 agent + skill + rule 的集合，由 `pack.json` 清单描述
- **Agent（专家）** = 一个 `.md` 文件 = YAML frontmatter（description/mode/tools/model）+ 系统提示词 body。**文件名即专家名**
- **Skill（技能）** = 一个目录，内含 `SKILL.md`（frontmatter + 操作指南）
- **Rule（规则）** = 一个 `.md` 文件（frontmatter：description/alwaysApply + 规范正文）。**文件名即规则名**
- ~~MCP~~ 暂不处理（与 agent/skill/rule 不同，后续按需扩展）

## 运行时 5 个 tool（plugin.js）

| 工具 | 参数 | 功能 |
|------|------|------|
| `expert_list` | 无 | 列出所有已启用专家与规则 |
| `expert_dispatch` | expert, task | 隔离模式：用 `ctx.client.session` 创建独立子会话运行专家（SDK 不可用回退 inject） |
| `expert_inject` | expert, task | 轻量模式：注入专家 `<expert_context>` XML 块到当前会话 |
| `expert_skill` | skill | 加载 SKILL.md 内容到当前上下文 |
| `expert_rule` | rule | 加载规则 `.md` 内容到当前上下文 |

**所有 tool 只扫描已 enable 的 pack**（读 `enabled.json`），未启用的 pack 不被列出/调度。

## CLI 命令

```
experthub list                          列出所有 pack 及启用状态
experthub info <pack>                   查看 pack 详情（agents/skills/rules）
experthub enable <pack>                 启用（仅标记状态，不复制文件）
experthub disable <pack>                禁用
experthub sync                          校验并清理失效的启用记录
experthub import <src-dir> [--name X]   WorkBuddy → pack 转换（含 agents/skills/rules）
experthub install                       软链 plugin.js + 写 opencode.json
```

所有命令用 `bun cli.js <cmd>` 运行（或 `bun run cli`）。

## 关键约束

1. **ESM 全包**：`type: "module"`，所有文件 `.js`
2. **CLI/lib 零依赖**：只用 `node:fs/path/os`，手写极简 YAML frontmatter 解析（支持块标量 `>-`/`|`，不引入 js-yaml）
3. **plugin.js 唯一依赖**：`@opencode-ai/plugin`；SDK client 通过 `ctx.client` 获取，**不自己 createOpencodeClient**
4. **tool execute 返回值**：`string | {title?, output, metadata?}`；注入专家/规则上下文用文本/XML 块返回
5. **不复制文件**：enable/disable 只更新 `enabled.json` 状态，packs 目录是唯一数据源
6. **plugin 只扫已启用 pack**：读 `getEnabledPackNames()` 过滤 `scanAll*`/`find*`
7. **install 用软链**：`.opencode/plugins/expert-hub.js` 软链到根 `plugin.js`，保留 `./lib/pack.js` 相对路径（软链失败 fallback 复制 plugin.js + lib/）
8. **CLI 与 plugin 共用 `lib/pack.js`**：packs 目录发现逻辑一致（`getPacksDir()`）
9. **Packs 目录发现优先级**：`EXPERTHUB_PACKS_DIR` 环境变量 → `.opencode/expert-hub/packs/` → `~/.config/opencode/expert-hub/packs/` → `./expert-hub-packs/`
10. **文件操作用同步 API**（node:fs sync）

## 工作流

```bash
# 1. 导入 WorkBuddy 团队为 pack（自动转换 agents/skills/rules）
bun cli.js import teams/research --name research

# 2. 启用 pack（标记状态，不复制文件）
bun cli.js enable research

# 3. 安装运行时插件（软链 + 配置 opencode.json）
bun cli.js install

# 4. 在 OpenCode 对话中使用
#    expert_list
#    expert_dispatch(expert: "researcher", task: "...")
#    expert_rule(rule: "research_rules")
#    expert_skill(skill: "research-workflow")
```

## 详细文档

见 `plans/expert-hub-实现说明.md`（实现说明与设计决策，与代码一致）。
