# 方案 A：永久壳 Agent + 动态工具加载（expert-proxy）

> 状态：已验证可行，但 skill/mcp 无法真正连接，仅 agent prompt 动态生效

## 原理

注册一个永远不变的 primary agent（`expert-proxy`），通过插件自定义工具在运行时动态加载当前团队的专家配置。agent 每次回答前调用工具获取专家 prompt，按专家身份回答。

## 架构

```
用户提问 → expert-proxy（永久壳 agent，config hook 注册一次）
              ↓ 调用 load_expert_context 工具
          读取 .opencode/.team-active + teams/{name}/agents/*.md
              ↓ 返回当前团队所有专家的 prompt
          expert-proxy 以专家身份回答
```

## 实现要点

### 1. 插件文件 `.opencode/plugins/agent-team.js`

- 依赖：需要在 `.opencode/` 下安装 `@opencode-ai/plugin`
- config hook 注册永久 `expert-proxy` agent（mode: primary）
- 注册 3 个工具：
  - `load_expert_context`：读取 `.team-active` + `teams/{name}/agents/*.md`，返回专家 prompt
  - `switch_team`：修改 `.team-active`，对话内直接切换
  - `list_teams`：列出所有可用团队

### 2. expert-proxy prompt 设计

```
你是专家团调度器。每次回答用户问题前：
1. 调用 load_expert_context 获取当前专家团配置
2. 根据用户问题选择最合适的专家
3. 按照该专家的指令回答
不要说"我是代理"，直接以专家身份回答。
```

### 3. 切换流程

- CLI：`bun packages/cli/bin/agent-team.ts activate-team trading-agents`
- 对话内：直接说"切换到 trading-agents 团队"（触发 switch_team 工具）
- **零重启**

## 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 免重启切换 | ❌ Skill 只是文本，未通过 OpenCode 原生 skill 系统加载 |
| ✅ 对话内直接切换团队 | ❌ MCP 未注册到运行时，agent 无工具能力 |
| ✅ 所有团队共享一个 agent 入口 | ❌ 每次回答多一轮工具调用（延迟） |
| ✅ 实现简单（一个插件文件） | ❌ 不是真正的 subagent，无法 @team-agent 直接调用 |

## 适用场景

- 不需要 MCP 工具的轻量团队
- 需要在对话中频繁切换团队
- 对 skill/mcp 连接没有要求

## 不适用场景

- 需要专家调用真实 MCP 工具（如 web-search、data-query）
- 需要通过 @team-agent-name 直接调用特定专家
- 需要专家有独立的工具权限控制

## 关键代码片段

```js
import { tool } from "@opencode-ai/plugin"

export const server = async () => {
  return {
    config: async (config) => {
      config.agent["expert-proxy"] = {
        description: "专家团调度器",
        prompt: "你是专家团调度器。每次回答前调用 load_expert_context...",
        mode: "primary",
      }
    },
    tool: {
      "load_expert_context": tool({
        description: "加载当前激活的专家团配置",
        args: {},
        async execute() {
          // 读取 .team-active + teams/{name}/agents/*.md
          // 返回 JSON
        },
      }),
      "switch_team": tool({
        description: "切换专家团",
        args: { team: tool.schema.string() },
        async execute(args) {
          // 写 .team-active
        },
      }),
    },
  }
}
```
