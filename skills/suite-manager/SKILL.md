---
name: suite-manager
description: Hermes Agents 方案管理。列出、切换、卸载 OpenCode 的多 Agent 配置方案。
---

# Suite 管理技能

## 功能

管理 Hermes Agents 的多 Agent 配置方案，支持列出、切换、卸载操作。

## 使用方式

### 列出所有可用方案

```
列出所有可用的 agent 方案
```

输出 `suites/` 目录中所有方案的名称和描述。

### 切换到指定方案

```
切换到 hermes-fullstack 方案
使用 lite-review 方案
导入 doc-writer 配置
```

执行步骤：
1. 清空当前 `.opencode/agents/` 目录
2. 复制目标方案的 agent 配置到 `.opencode/agents/`
3. 更新 `opencode.json` 的 `agents` 字段
4. 提示用户执行 `/agents reload`

### 卸载当前方案

```
卸载所有 agent 配置
清空当前方案
移除所有 agents
```

执行步骤：
1. 删除 `.opencode/agents/` 中的所有 `.md` 文件
2. 清空 `opencode.json` 中的 `agents` 字段
3. 提示用户执行 `/agents reload`

## 可用方案

| 方案名称 | Agent 数量 | 适用场景 |
|---------|-----------|---------|
| `hermes-fullstack` | 7 个 | 全栈开发：架构设计 + 编码 + 审查 + 执行 + 调研 |
| `lite-review` | 3 个 | 轻量审查：代码探索 + 审查 |
| `doc-writer` | 3 个 | 文档写作：调研 + 文档审查 |
| `mini-runner` | 3 个 | 极简执行：编码 + 命令执行 |

## 注意事项

- 切换方案会覆盖当前配置，请确保已备份重要修改
- 操作完成后需执行 `/agents reload` 使配置生效
- 如果 hermes-agents 项目不在默认路径，需先设置环境变量 `HERMES_AGENTS_PATH`
