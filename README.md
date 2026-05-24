# Hermes Agents — OpenCode 多 Agent 配置管理工具

> 一套可视化配置工具，帮助您轻松维护 OpenCode 的多 Agent 协作配置

## 项目定位

本项目是一个**配置管理工具集**，用于方便地为 [OpenCode](https://opencode.ai) 维护多 Agent 配置。项目提供：

- **可视化配置工具** — 浏览器中编辑 Agent 配置，实时预览 Markdown
- **预设方案样例** — 4 套开箱即用的 Agent 配置样例
- **验证与导入导出** — Python 脚本检查配置一致性、导入导出方案

`suites/` 目录中的配置仅为**样例**，您可以根据需要修改或创建自己的 Agent 配置。

## 快速开始

### 方式一：可视化配置工具（推荐）

直接双击打开 `config-tool.html`，或在浏览器中打开：

```bash
open config-tool.html
```

**核心功能：**

| 功能 | 说明 |
|------|------|
| **加载预设** | 一键导入 4 套预设样例（全栈/轻量审查/文档写作/极简执行） |
| **📤 导出方案 / 📥 导入方案** | 将配置导出为 JSON 分享，或从 JSON 导入 |
| **导出到 suites/** | 将配置写入 `suites/` 目录持久化 |
| **从 suites 加载** | 从 `suites/` 读取已有配置继续编辑 |
| **验证 suites** | 检查配置完整性和一致性 |
| **写入 suites & OpenCode** | 一键写入 `suites/` 和 `.opencode/agents/` 并更新 `opencode.json` |

**编辑功能：**
- 左侧列表管理 Agent（增删改查），支持多方案切换
- 中间表单编辑配置（名称、模式、描述、模型、温度、颜色、系统提示词）
- 右侧勾选工具/技能 + 配置权限 + 实时 Markdown 预览
- 智能输入防抖 — 编辑长文本时自动 200ms 防抖

### 方式二：命令行工具（CLI）— 推荐

项目提供完整的命令行工具 `hermes-cli.py`：

```bash
# 方案管理
python3 hermes-cli.py suite list                    # 列出所有可用方案
python3 hermes-cli.py suite use hermes-fullstack    # 切换到指定方案
python3 hermes-cli.py suite uninstall              # 卸载当前方案

# Agent 管理
python3 hermes-cli.py agent list                   # 列出当前 Agent
python3 hermes-cli.py agent show coder             # 显示 Agent 详情
python3 hermes-cli.py agent create my-agent        # 创建新 Agent
python3 hermes-cli.py agent edit coder             # 编辑 Agent（打开编辑器）
python3 hermes-cli.py agent delete my-agent        # 删除 Agent

# 配置管理
python3 hermes-cli.py config validate              # 验证配置
python3 hermes-cli.py config export my-suite.json  # 导出为 JSON
python3 hermes-cli.py config import my-suite.json  # 从 JSON 导入
```

### 方式三：底层脚本（供程序调用）

`tools/` 目录中的脚本可作为 Python 库被其他程序导入：

```bash
# 命令行使用
python3 tools/import_suite.py --list
python3 tools/import_suite.py hermes-fullstack --target /path/to/project
python3 tools/verify_suites.py --fix

# Python 代码导入
from tools._shared import parse_frontmatter, list_suites, uninstall_suite
from tools.import_suite import import_suite
```

## 预设样例

`suites/` 目录包含 4 套预设样例，供参考和快速上手：

| 方案 | Agent 数量 | 适用场景 |
|------|-----------|---------|
| **hermes-fullstack** | 7 个 | 全栈开发：架构设计 + 编码 + 审查 + 执行 + 调研 |
| **lite-review** | 3 个 | 轻量审查：代码探索 + 审查 |
| **doc-writer** | 3 个 | 文档写作：调研 + 文档审查 |
| **mini-runner** | 3 个 | 极简执行：编码 + 命令执行 |

这些样例展示了如何配置不同职责的 Agent，您可以根据实际需求修改或创建新配置。

## Agent 配置说明

每个 Agent 配置包含以下字段：

### 基本信息

| 字段 | 说明 | 示例 |
|------|------|------|
| `name` | Agent 名称（文件名） | `hermes`, `coder` |
| `mode` | 模式 | `primary`（主代理）或 `subagent`（子代理） |
| `description` | 描述 | 简要说明 Agent 的功能 |
| `model` | 使用的模型 | `opencode/gpt-5.1-codex` |
| `color` | 显示颜色 | `#D4A017` |
| `temperature` | 温度参数 | 0.0 ~ 1.0 |
| `max_iterations` | 最大迭代次数 | 10 ~ 30 |

### 工具配置

在 `tools` 字段中声明 Agent 可使用的工具：

```yaml
tools:
  read: true       # 读取文件
  write: true      # 创建文件
  edit: true       # 编辑文件
  bash: true       # 执行命令
  list: true       # 列出目录
  grep: true       # 搜索代码
  glob: true       # 文件名匹配
  todo_write: true # 任务管理
  task: true       # 调用子代理
  web_search: true # 联网搜索
  web_fetch: true  # 获取网页
```

### 技能关联

在 `skills` 字段中声明 Agent 可使用的技能：

```yaml
skills:
  - suite-manager      # 方案管理技能
  - hermes-import      # 方案导入技能
  - task-planner       # 任务规划技能
  - test-generator     # 测试生成技能
  - security-checklist # 安全审查技能
  - tech-comparison    # 技术对比技能
```

### 权限配置

在 `permissions` 字段中控制敏感操作：

```yaml
permissions:
  skill: allow    # allow / ask / deny
  edit: ask       # allow / ask / deny
  bash: ask       # allow / ask / deny
  webfetch: deny  # allow / ask / deny
```

- `allow` — 自动执行，无需确认
- `ask` — 每次询问用户
- `deny` — 禁止使用

## 项目结构

```
hermes-agents/
├── config-tool.html           # 可视化配置工具（单文件 Web 应用）
├── hermes-cli.py              # 命令行工具（CLI）
├── opencode.json              # 项目配置（代理注册）
├── suites/                    # 预设方案样例
│   ├── hermes-fullstack/      # 全栈开发样例
│   ├── lite-review/           # 轻量审查样例
│   ├── doc-writer/            # 文档写作样例
│   └── mini-runner/           # 极简执行样例
├── tools/                     # 辅助脚本
│   ├── _shared.py             # 公共模块
│   ├── import_suite.py        # 方案导入脚本
│   └── verify_suites.py       # 配置验证脚本
├── skills/                    # 配置工具专用技能（不随方案导入）
│   ├── suite-manager/         # 方案管理技能
│   ├── hermes-import/         # 方案导入技能
│   ├── task-planner/          # 任务规划技能
│   ├── test-generator/        # 测试生成技能
│   ├── security-checklist/    # 安全审查技能
│   └── tech-comparison/       # 技术对比技能
└── .opencode/
    └── agents/                # Agent 配置文件
```

## 常见问题

### Q: 如何创建自己的 Agent 配置？

1. 打开 `config-tool.html`
2. 点击「+ 新建」创建新 Agent
3. 填写基本信息、选择工具、配置权限
4. 编写系统提示词
5. 点击「导出到 suites/」保存

### Q: 如何将配置应用到 OpenCode 项目？

**方法一：** 在 `config-tool.html` 中点击「写入 suites & OpenCode」，选择目标项目目录

**方法二：** 使用命令行：
```bash
python3 tools/import_suite.py hermes-fullstack --target /path/to/your-project
```

然后在 OpenCode 中执行 `/agents reload`

### Q: 如何分享我的 Agent 配置？

在 `config-tool.html` 中点击「📤 导出方案」，会生成一个 JSON 文件，发送给他人后，对方点击「📥 导入方案」即可导入。

### Q: 配置验证失败怎么办？

运行 `python3 tools/verify_suites.py --fix` 自动修复常见问题。

## 技能扩展

OpenCode 支持两种技能来源：

### 项目级技能

位于 `skills/` 目录（配置工具专用，不随方案导入）：

| 技能 | 用途 |
|------|------|
| `suite-manager` | 方案管理：列出、切换、卸载 |
| `hermes-import` | 方案导入 |
| `task-planner` | 任务规划与拆解 |
| `test-generator` | 系统化测试生成 |
| `security-checklist` | 安全审查清单 |
| `tech-comparison` | 结构化技术对比 |

创建新技能：在 `skills/` 下创建目录和 `SKILL.md` 文件。

### 全局级技能

位于 `~/.claude/skills/` 目录，对所有项目生效：

- 用户自行安装和管理
- 适合通用技能（如 pdf、xlsx、frontend-design 等）
- 可在任意项目的 Agent 配置中引用

查看已安装的全局技能：
```bash
ls ~/.claude/skills/
```

## 许可证

MIT
