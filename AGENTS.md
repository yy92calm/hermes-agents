# AgentTeam - 专家团脚手架

基于 OpenCode 插件系统的专家团（Expert Team）框架。定义多 Agent 团队，自动生成为 OpenCode 插件，支持热加载替换。

## 项目结构

- `packages/core/` - 核心：团队类型定义 + 插件代码生成引擎
- `packages/cli/` - CLI：团队创建、Agent 管理、插件构建、热加载监听
- `teams/` - 团队定义目录（每个团队一个独立子目录）
- `teams/{name}/team.json` - 团队定义文件
- `teams/{name}/generated/plugin.js` - 生成的 OpenCode 插件
- `teams/{name}/generated/skills/` - 专家技能文件（SKILL.md）
- `teams/{name}/generated/rules/` - 专家规则文件
- `opencode.json` - 项目配置，激活团队后 `plugin` 指向对应团队的插件

## 工作流

```bash
# 1. 创建专家团
bun agent-team create-team research "研究分析团队"

# 2. 添加专家
bun agent-team add-agent research researcher "高级研究员"
bun agent-team add-agent research analyst "数据分析师"

# 3. 编辑 team.json 丰富专家配置（技能、规则、MCP、模型等）
#    vim teams/research/team.json

# 4. 或用 CLI 快速配置
bun agent-team add-skill research researcher information-retrieval "信息检索" "搜索并交叉验证"
bun agent-team add-rule research researcher "引用规范" "每个结论必须标注来源"
bun agent-team add-mcp research analyst data-query python -m data_query_server
bun agent-team set-model research researcher claude-sonnet-4

# 5. 生成 OpenCode 插件（自动产出 .js + skill + rule 文件）
bun agent-team build-plugin research

# 6. 激活团队（更新 opencode.json 指向 teams/{name}/generated/）
bun agent-team activate-team research

# 7. 查看当前激活的团队
bun agent-team status

# 8. 热更新：修改 team.json 后自动重建
bun agent-team watch

# 修改后自动重建（--rebuild 或 -r）
bun agent-team add-skill research writer report-writing "报告撰写" -r
```

每个团队独立文件夹，激活只改 opencode.json 引用路径：

## 每位专家可配置的能力

| 字段 | 说明 | 示例 |
|------|------|------|
| `agentConfig.model` | 指定模型 | `"claude-sonnet-4"` |
| `agentConfig.permissions` | 工具权限 | `{"web_search": "allow"}` |
| `agentConfig.temperature` | 温度参数 | `0.2` |
| `skills[]` | 技能定义，自动生成 SKILL.md | 见下方示例 |
| `rules[]` | 规则定义，自动生成 .md 规则文件 | 见下方示例 |
| `mcpServers[]` | MCP 服务器配置 | 生成 opencode.json 片段 |

## team.json 完整示例

```json
{
  "name": "research",
  "description": "研究分析团队",
  "agents": [
    {
      "name": "researcher",
      "role": "高级研究员",
      "instructions": ["搜索和收集信息", "交叉验证准确性"],
      "agentConfig": {
        "model": "claude-sonnet-4",
        "permissions": { "web_search": "allow" }
      },
      "skills": [{
        "name": "information-retrieval",
        "description": "Systematic information gathering",
        "instructions": ["Start broad then narrow", "Cross-reference sources"]
      }],
      "rules": [{
        "title": "Source Citation",
        "content": ["Every claim must cite its source"]
      }],
      "mcpServers": [{
        "name": "web-search",
        "command": ["npx", "-y", "@anthropic/search"]
      }]
    }
  ]
}
```

## 命令

### 团队管理
- `create-team <name> <description>` - 创建专家团
- `activate-team <name>` - 激活指定团队
- `status` - 查看当前激活的团队
- `list teams|plugins|agents <team>` - 列出资源

### Agent 管理
- `add-agent <team> <name> <role>` - 添加专家
- `remove-agent <team> <name>` - 移除专家

### 技能 (Skills)
- `add-skill <team> <agent> <name> <desc> [instructions...]` - 添加技能，可附带指令
- `remove-skill <team> <agent> <name>` - 移除技能

### 规则 (Rules)
- `add-rule <team> <agent> <title> <content...>` - 添加规则，每个参数为一条内容
- `remove-rule <team> <agent> <title>` - 移除规则

### MCP 服务器
- `add-mcp <team> <agent> <name> <command...> [--env KEY=VALUE]` - 添加 MCP
- `remove-mcp <team> <agent> <name>` - 移除 MCP

### Agent 配置
- `set-model <team> <agent> <model>` - 设置模型 (如 claude-sonnet-4)
- `set-temperature <team> <agent> <n>` - 设置温度 (0-1)
- `set-permissions <team> <agent> <json>` - 设置权限

### 构建
- `build-plugin <team>` - 生成插件
- `build-all` - 生成所有团队插件
- `watch` - 监听 teams/ 变更自动重建

所有命令支持 `--rebuild` (或 `-r`) 参数，修改后自动调用 `build-plugin`。
