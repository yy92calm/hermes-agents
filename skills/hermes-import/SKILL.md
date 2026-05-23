---
name: hermes-import
description: 将 Hermes Agents 多 Agent 协作方案导入当前 OpenCode 项目。支持 hermes-fullstack、lite-review、doc-writer、mini-runner 四套方案。用户说"导入 hermes 方案"、"使用 hermes 全栈套件"、"导入 lite-review"等时触发。
---

# Hermes Agents 导入工具

## 功能

将 Hermes Agents 项目中 `suites/` 目录下的指定方案导入到当前 OpenCode 项目的 `.opencode/agents/` 目录，并更新 `opencode.json` 注册所有代理。

## 可用方案

| 方案名称 | 文件夹 | 代理数量 | 说明 |
|---------|--------|---------|------|
| Hermes 全栈开发 | `hermes-fullstack` | 7 | Hermes + Scout + Architect + Coder + Reviewer + ShellRunner + Researcher |
| 轻量审查 | `lite-review` | 3 | Hermes Lite + Scout + Reviewer |
| 文档写作 | `doc-writer` | 3 | Hermes Doc + Researcher + Reviewer |
| 极简执行 | `mini-runner` | 3 | Hermes Mini + Coder + ShellRunner |

## 导入流程

### 步骤 1：确定方案

从用户输入中识别方案名称。关键词映射：
- "全栈"、"full"、"完整"、"全部"、"7 个" → `hermes-fullstack`
- "轻量"、"审查"、"lite"、"review" → `lite-review`
- "文档"、"写作"、"doc"、"write" → `doc-writer`
- "极简"、"mini"、"执行"、"运行" → `mini-runner`

如无法确定，列出 4 个方案让用户选择。

### 步骤 2：定位 hermes-agents 项目

首选方式：执行 `tools/import_suite.py --list` 自动检测项目位置。

兜底方式：在用户系统中搜索 `hermes-agents` 项目目录：
```bash
find ~ -maxdepth 4 -type d -name "hermes-agents" -path "*/hermes-agents" 2>/dev/null | head -5
```

### 步骤 3：执行导入

使用项目中提供的 `tools/import_suite.py` 脚本：

```bash
python <hermes-agents路径>/tools/import_suite.py <方案名> --target <当前项目路径>
```

示例：
```bash
python ~/Desktop/projects/hermes-agents/tools/import_suite.py hermes-fullstack --target .
```

脚本会自动：
1. 复制 agent .md 文件到 `.opencode/agents/`
2. 解析 YAML frontmatter 提取配置
3. 合并更新 `opencode.json` 的 `agents` 字段
4. 保留 opencode.json 中已有的其他字段

### 步骤 4：确认完成

列出所有已导入的 agent 文件路径和更新的配置摘要。

提醒用户：在 OpenCode 中执行 `/agents reload` 使新配置生效。

## 脚本工作原理

`tools/import_suite.py` 的执行流程：
- 从 `suites/<方案>/.opencode/agents/` 读取所有 .md 文件
- 解析 YAML frontmatter 提取 description / model / mode / color / temperature / max_iterations / tools
- 创建目标 `.opencode/agents/` 目录（如不存在）
- 复制所有 agent .md 文件
- 以合并方式更新 `opencode.json`（保留已有字段）
- 输出详细的导入报告

## 故障排除

| 问题 | 解决方案 |
|------|---------|
| 找不到 suites/ 目录 | 确认 hermes-agents 项目结构完整，suites/ 目录存在 |
| opencode.json 权限错误 | 检查目标项目目录是否有写入权限 |
| 方案名称错误 | 使用 `--list` 查看所有可用方案 |
| Agent 名称冲突 | 脚本会覆盖同名 agent，如有重要配置请先备份 |

## 注意事项

- 导入会覆盖目标目录中同名的 agent 文件
- 导入后需要重新加载 OpenCode 或使用 `/agents reload` 使配置生效
- 脚本会自动检测 hermes-agents 项目根目录（基于脚本自身位置）
- 如需在非标准位置，可手动指定脚本路径