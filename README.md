# Hermes Agents — 多 Agent 协作框架

> 基于 OpenCode Agents 机制的智能多 Agent 协作系统

## 快速开始

### 前提条件

- 已安装 [OpenCode](https://opencode.ai) 客户端
- OpenCode 已配置好模型提供商（如 OpenCode Zen 的 `opencode/gpt-5.1-codex`）

### 方式一：可视化配置工具（推荐）

直接双击打开 `config-tool.html`，或在浏览器中打开：

```bash
open ~/Desktop/projects/hermes-agents/config-tool.html
```

功能：
- 点击 **「加载预设」** 一键导入全部 7 个 Agent
- 左侧列表管理 Agent（增删改查）
- 中间表单编辑配置（名称、模式、描述、模型、温度、颜色、系统提示词）
- 右侧勾选工具/技能 + 配置权限 + 实时 Markdown 预览
- **「导出当前」** 或 **「全部导出」** 一键下载 .md 文件到 `.opencode/agents/`

### 方式二：手动配置

**1. 克隆或下载本项目**

```bash
# 或直接使用已有路径
cd ~/Desktop/projects/hermes-agents
```

**2. 在 OpenCode 中打开项目**

在终端中进入项目目录后启动 OpenCode：

```bash
cd ~/Desktop/projects/hermes-agents
opencode
```

或通过 OpenCode UI 打开该目录作为工作区。

**3. 切换到 Hermes 主代理**

在 OpenCode 会话中，按 **Tab** 键切换到 **Hermes** 代理。

**4. 开始使用**

直接向 Hermes 描述你的需求，例如：

- "给这个项目添加用户认证功能"
- "帮我审查 src/ 下所有代码的质量"
- "调研 React 19 的新特性并评估是否值得升级"
- "运行项目测试套件并修复失败的测试"

Hermes 会自动分析需求、拆分任务、调度专业子代理，并整合结果交付给你。

## 代理详解

### Hermes — 总调度官

**主代理 (primary)**，负责接收用户输入、理解意图、拆解任务、调度子代理、整合结果。

- 权限：只读（可阅读文件和搜索代码库）
- 核心工具：Task（调度子代理）、todo_write（任务追踪）
- 不写代码、不执行命令、不修改文件

### Scout — 代码探索专家

**子代理 (subagent)**，快速搜索代码库、查找文件、回答代码库问题。

- 权限：只读
- 工具：read, list, grep, glob
- 适用：找文件、搜代码、了解项目结构
- 不适用：写代码、执行命令、联网搜索

### Architect — 架构设计专家

**子代理 (subagent)**，分析需求、设计系统架构、输出技术方案文档。

- 权限：只读 + 联网
- 工具：read, list, grep, glob, web_search, web_fetch
- 适用：系统架构设计、技术选型、方案对比
- 不适用：写代码、代码审查

### Coder — 代码编写专家

**子代理 (subagent)**，实际编写代码、修改文件、运行测试。

- 权限：读写 + 命令执行
- 工具：read, write, edit, list, grep, glob, bash, todo_write
- 适用：编写新功能、修复 Bug、重构代码
- 注意：edit 和 bash 需要用户确认（ask）

### Reviewer — 代码审查专家

**子代理 (subagent)**，审查代码质量、安全、性能、可维护性。

- 权限：只读
- 工具：read, list, grep, glob, web_search
- 适用：代码审查、安全审计、性能分析
- 不适用：修改代码、执行命令

### ShellRunner — 命令行专家

**子代理 (subagent)**，执行 Shell 命令、运行脚本、管理环境。

- 权限：命令执行
- 工具：bash, read, list
- 适用：运行脚本、安装依赖、环境管理、Git 操作
- 注意：bash 需要用户确认（ask）

### Researcher — 调研检索专家

**子代理 (subagent)**，联网搜索、阅读文档、总结分析。

- 权限：只读 + 联网
- 工具：web_search, web_fetch, read
- 适用：技术调研、文档查询、方案对比
- 不适用：写代码、执行命令

## 定制化

### 修改代理模型

编辑对应 Markdown 文件的 YAML frontmatter 中的 `model` 字段：

```yaml
model: anthropic/claude-sonnet-4-20250514
```

### 修改代理权限

编辑 `permissions` 字段：

```yaml
permissions:
  edit: allow     # allow / ask / deny
  bash: allow     # allow / ask / deny
  webfetch: allow # allow / ask / deny
```

### 添加新代理

1. 在 `.opencode/agents/` 下创建新的 `.md` 文件
2. 编写 YAML frontmatter 配置和系统提示词正文
3. 在 `opencode.json` 的 `agents` 字段注册新代理
4. 在 `hermes.md` 的调度决策表中添加映射规则

### 修改代理颜色

编辑 `color` 字段，支持十六进制颜色值或主题颜色：

```yaml
color: "#FF5733"  # 自定义颜色
color: "success"  # 主题颜色
```

## 常见问题

### Q: 如何让 Hermes 不调度某个子代理？

在 `opencode.json` 中将该子代理的 `hidden` 设为 `true`，或在 Hermes 的 `permissions` 中限制 task 调用范围。

### Q: 能否让某个子代理完全自动运行，不弹确认？

将对应权限设为 `allow`：

```yaml
permissions:
  edit: allow
  bash: allow
```

### Q: 如何查看子代理的工作过程？

使用 `<Leader>+Right`（或配置的 `session_child_cycle` 快捷键）在父会话和子会话之间切换，查看子代理的工作详情。

### Q: 子代理可以互相调用吗？

默认配置中子代理没有 Task 工具权限，不可互相调用。如需启用，在对应代理的 `tools` 中添加 `task: true`。

## 项目结构

```
hermes-agents/
├── opencode.json              # 项目配置（代理注册、权限、工具）
├── config-tool.html           # 🔥 可视化配置工具（单文件 Web 应用）
├── AGENTS.md                  # 开发者文档
├── README.md                  # 本文件
├── suites/                    # 多套方案隔离存放
│   ├── hermes-fullstack/      # Hermes 全栈开发套件（7 Agent）
│   ├── lite-review/           # 轻量审查套件（3 Agent）
│   ├── doc-writer/            # 文档写作套件（3 Agent）
│   └── mini-runner/           # 极简执行套件（3 Agent）
├── tools/                     # 辅助脚本
│   ├── import_suite.py        # 命令行方案导入脚本
│   └── verify_suites.py       # suites 配置一致性检查脚本
└── .opencode/
    ├── agents/                # 当前激活的 Agent（可被覆盖）
    └── skill/hermes-import/   # OpenCode Skill：导入方案
        └── SKILL.md
```

## 使用 OpenCode Skill 导入方案

项目包含一个 OpenCode Skill，可在任何 OpenCode 项目中导入 Hermes Agents 方案。

### 安装 Skill

1. 将 `.opencode/skill/hermes-import/SKILL.md` 复制到你的目标 OpenCode 项目目录：
   ```bash
   cp -r .opencode/skill/hermes-import ~/your-project/.opencode/skill/
   ```

2. 重启 OpenCode 或执行 `/skill reload`

### 使用 Skill

在 OpenCode 中，直接说：

- "导入 hermes 全栈方案"
- "使用 lite-review 套件"
- "导入 doc-writer 方案"
- "导入 mini-runner 套件"

Skill 会自动定位 hermes-agents 项目，调用 `tools/import_suite.py` 执行复制和 opencode.json 更新。

### 命令行导入

如果需要在 OpenCode 之外使用，可以直接运行 Python 脚本：

```bash
# 列出所有可用方案
python tools/import_suite.py --list

# 导入到指定项目
python tools/import_suite.py hermes-fullstack --target /path/to/your-project
python tools/import_suite.py lite-review --target .
```

脚本会自动：
- 复制 agent .md 文件到 `.opencode/agents/`
- 解析 YAML frontmatter 提取配置
- 合并更新 `opencode.json`（保留已有字段）

### 检查配置一致性

```bash
python tools/verify_suites.py
```

逐个检查 suites/ 下所有方案的 agent 文件是否完整、跨方案配置是否一致。

## 故障排除

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| Skill 提示找不到 suites/ 目录 | hermes-agents 项目不在默认路径 | 执行 `find ~ -name "hermes-agents" -maxdepth 4 -type d` 定位实际路径，或使用命令行导入 |
| 导入后 agent 不生效 | OpenCode 未重新加载 | 在 OpenCode 中执行 `/agents reload` |
| `opencode.json` 配置损坏 | JSON 格式错误被覆盖 | 备份原文件后重新导入，脚本会合并而非覆盖 |
| config-tool.html 无法保存 | 浏览器不支持 localStorage | 更换现代浏览器（Chrome/Firefox/Edge 最新版） |
| 「写入 suites & OpenCode」失败 | 浏览器不支持 File System Access API | 使用「导出到 suites/」降级到下载模式，然后手动放入目录 |
| 跨方案同名 agent 颜色不一致 | suits/ 和预设数据不同步 | 运行 `python tools/verify_suites.py` 检查，然后用 config-tool 的「从 suites 加载」同步 |
| 预设方案 agent 数量不对 | localStorage 旧数据残留 | 点击「清空当前方案」，然后「加载预设」重新导入 |

## 常见问题

### Q: 如何让 Hermes 不调度某个子代理？

在 `opencode.json` 中将该子代理的 `hidden` 设为 `true`，或在 Hermes 的 `permissions` 中限制 task 调用范围。

### Q: 能否让某个子代理完全自动运行，不弹确认？

将对应权限设为 `allow`：

```yaml
permissions:
  edit: allow
  bash: allow
```

### Q: 如何查看子代理的工作过程？

使用 `<Leader>+Right`（或配置的 `session_child_cycle` 快捷键）在父会话和子会话之间切换，查看子代理的工作详情。

### Q: 子代理可以互相调用吗？

默认配置中子代理没有 Task 工具权限，不可互相调用。如需启用，在对应代理的 `tools` 中添加 `task: true`。

### Q: config-tool.html 和 suites/ 目录是什么关系？

`config-tool.html` 是编辑工具（数据存在浏览器 localStorage 中），`suites/` 是持久化的方案库。通过「写入 suites & OpenCode」将编辑好的配置导出到 suites/ 目录，或通过「从 suites 加载」将 suites/ 中的已有配置读回工具继续编辑。

### Q: 如何验证 suites/ 目录下的配置是否正确？

在浏览器中打开 config-tool.html，点击「验证 suites」按钮选择 hermes-agents 项目根目录即可。也可以运行命令行脚本：

```bash
python tools/verify_suites.py
```

## 许可证

MIT