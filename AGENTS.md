# Hermes Agents — OpenCode 多 Agent 配置管理工具

## 项目简介

Hermes Agents 是一套用于维护 OpenCode 多 Agent 配置的工具集。它提供可视化配置工具、预设方案样例、验证脚本等，帮助开发者轻松创建和管理 Agent 配置。

**核心定位：**
- **配置管理工具** — 可视化编辑、导入导出、验证修复
- **预设方案样例** — 4 套开箱即用的配置样例供参考
- **技能扩展机制** — 内置 5 个技能，支持自定义扩展

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    config-tool.html                          │
│              可视化配置工具（单文件 Web 应用）                  │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌──────────┐
    │ suites/ │    │  tools/  │    │.opencode/│
    │ 预设样例 │    │ 辅助脚本  │    │ Agent配置 │
    └─────────┘    └──────────┘    └──────────┘
```

## 使用方式

### 1. 可视化配置工具

打开 `config-tool.html` 进行可视化配置。

### 2. 命令行工具（CLI）— 推荐

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

### 3. 底层脚本（供程序调用）

`tools/` 目录中的脚本可作为 Python 库被其他程序导入：

```python
# Python 代码导入
from tools._shared import parse_frontmatter, list_suites, uninstall_suite
from tools.import_suite import import_suite
```

**架构关系：**
- `hermes-cli.py` — 用户友好的统一入口，调用 tools 中的函数
- `tools/` — 底层库，提供核心功能，可被其他程序导入

## 预设样例

`suites/` 目录包含 4 套预设样例：

| 方案 | Agent 数量 | 说明 |
|------|-----------|------|
| **hermes-fullstack** | 7 个 | 全栈开发：Hermes + Scout + Architect + Coder + Reviewer + ShellRunner + Researcher |
| **lite-review** | 3 个 | 轻量审查：Hermes-Lite + Scout + Reviewer |
| **doc-writer** | 3 个 | 文档写作：Hermes-Doc + Researcher + Reviewer |
| **mini-runner** | 3 个 | 极简执行：Hermes-Mini + Coder + ShellRunner |

## Agent 配置字段

### 基本信息

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `name` | string | Agent 名称（文件名） | `hermes`, `coder` |
| `mode` | string | 模式 | `primary` 或 `subagent` |
| `description` | string | 描述 | 简要说明功能 |
| `model` | string | 使用的模型 | `opencode/gpt-5.1-codex` |
| `color` | string | 显示颜色 | `#D4A017` |
| `temperature` | float | 温度参数 | 0.0 ~ 1.0 |
| `max_iterations` | int | 最大迭代次数 | 10 ~ 30 |
| `hidden` | bool | 是否隐藏 | `true` / `false` |

### 工具配置

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

```yaml
permissions:
  skill: allow    # allow / ask / deny
  edit: ask       # allow / ask / deny
  bash: ask       # allow / ask / deny
  webfetch: deny  # allow / ask / deny
```

## 内置技能

项目内置 6 个技能，位于 `skills/` 目录（配置工具专用，不随方案导入）：

| 技能 | 文件 | 用途 |
|------|------|------|
| `suite-manager` | `skills/suite-manager/SKILL.md` | 方案管理：列出、切换、卸载 agent 配置 |
| `hermes-import` | `skills/hermes-import/SKILL.md` | 方案导入，从 suites/ 导入配置到项目 |
| `task-planner` | `skills/task-planner/SKILL.md` | 任务规划与拆解，输出任务 DAG |
| `test-generator` | `skills/test-generator/SKILL.md` | 系统化测试生成，覆盖正常/边界/异常场景 |
| `security-checklist` | `skills/security-checklist/SKILL.md` | 安全审查清单，按 OWASP 检查漏洞 |
| `tech-comparison` | `skills/tech-comparison/SKILL.md` | 结构化技术对比，多维度分析 |

### 技能来源

OpenCode 支持两种技能来源：

1. **项目级技能** — `skills/` 目录
   - 仅对当前项目生效
   - 随项目代码一起管理
   - 适合项目特定的技能

2. **全局级技能** — `~/.claude/skills/` 目录
   - 对所有项目生效
   - 用户自行安装和管理
   - 适合通用技能（如 pdf、xlsx 等）

Agent 配置中的 `skills` 字段可以引用两种来源的技能。

### 创建新技能

1. 在 `skills/` 下创建目录，如 `my-skill/`
2. 创建 `SKILL.md` 文件，包含 YAML frontmatter 和技能说明：

```markdown
---
name: my-skill
description: 技能描述
---

# 技能名称

## 功能
...
```

3. 在 Agent 的 `skills` 字段中引用（仅对配置工具项目本身生效）

## 项目结构

```
hermes-agents/
├── config-tool.html           # 可视化配置工具（单文件 Web 应用）
├── hermes-cli.py              # 命令行工具（CLI）
├── opencode.json              # 项目配置（代理注册）
├── AGENTS.md                  # 本文件（开发者文档）
├── README.md                  # 用户使用指南
├── suites/                    # 预设方案样例
│   ├── hermes-fullstack/      # 全栈开发样例
│   │   └── .opencode/agents/
│   ├── lite-review/           # 轻量审查样例
│   ├── doc-writer/            # 文档写作样例
│   └── mini-runner/           # 极简执行样例
├── tools/                     # 辅助脚本
│   ├── _shared.py             # 公共模块（YAML 解析、字段验证、文件操作）
│   ├── import_suite.py        # 方案导入脚本（支持回滚 + suites 同步）
│   └── verify_suites.py       # suites 配置一致性检查脚本（支持 --fix 自动修复）
├── skills/                    # 配置工具专用技能（不随方案导入）
│   ├── suite-manager/         # 方案管理技能
│   ├── hermes-import/         # 方案导入技能
│   ├── task-planner/          # 任务规划技能
│   ├── test-generator/        # 测试生成技能
│   ├── security-checklist/    # 安全审查技能
│   └── tech-comparison/       # 技术对比技能
└── .opencode/
    └── agents/                # Agent 配置文件
        ├── hermes.md
        ├── scout.md
        ├── architect.md
        ├── coder.md
        ├── reviewer.md
        ├── shellrunner.md
        └── researcher.md
```

## 设计原则

1. **工具优先** — 提供可视化配置工具，降低配置门槛
2. **样例驱动** — 提供多套预设样例，覆盖常见场景
3. **职责单一** — 每个 Agent 只做一类事情，边界清晰
4. **权限最小化** — 只读代理绝不赋予写权限，降低风险
5. **可扩展** — 添加新 Agent 或技能只需创建新文件

## 扩展指南

### 添加新 Agent

1. 使用 `config-tool.html` 创建新 Agent
2. 或手动在 `.opencode/agents/` 下创建 `.md` 文件
3. 在 `opencode.json` 的 `agents` 字段中注册

### 添加新技能

1. 在 `.opencode/skill/` 下创建目录和 `SKILL.md`
2. 在 Agent 的 `skills` 字段中引用
3. 设置 `permissions.skill` 控制使用权限

### 添加新方案

1. 在 `suites/` 下创建新目录
2. 创建 `.opencode/agents/` 子目录
3. 放入 Agent 配置文件
4. 运行 `python3 tools/verify_suites.py` 验证

## 版本

v1.6.0 — 2026-05-24 新增 CLI 工具：支持方案管理、Agent 管理、配置导入导出
