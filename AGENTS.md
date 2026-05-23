# Hermes Agents — 多 Agent 协作框架

## 项目简介

Hermes Agents 是基于 OpenCode 代理（Agents）机制构建的多 Agent 协作框架。它由一个 Router 主代理（Hermes）和六个专业 Sub Agent 组成，各司其职、协同工作。

## 架构

```
用户
  │
  ▼
┌─────────────────────────────────────┐
│         Hermes (Router 主代理)        │
│     总调度官：分析意图、拆解任务、调度     │
└──────┬──────┬──────┬──────┬──────┬────┘
       │      │      │      │      │
   ┌───▼──┐┌──▼───┐┌──▼──┐┌──▼───┐┌─▼────┐┌──▼──────┐
   │Scout ││Architect││Coder││Reviewer││ShellRunner││Researcher│
   │探索  ││ 架构  ││编码  ││ 审查  ││  命令行  ││  调研   │
   │只读  ││ 只读  ││读写  ││ 只读  ││ 命令执行 ││ 只读+联网│
   └──────┘└───────┘└─────┘└───────┘└────────┘└─────────┘
```

## 代理清单

| 代理 | 模式 | 角色 | 权限 | 颜色 |
|------|------|------|------|------|
| **Hermes** | primary | 总调度指挥官 | 只读 + Task | `#D4A017` |
| **Scout** | subagent | 代码探索专家 | 只读 | `#2E86C1` |
| **Architect** | subagent | 架构设计专家 | 只读 + 联网 | `#8E44AD` |
| **Coder** | subagent | 代码编写专家 | 读写 + 命令 | `#27AE60` |
| **Reviewer** | subagent | 代码审查专家 | 只读 | `#E74C3C` |
| **ShellRunner** | subagent | 命令行专家 | 命令执行 | `#E67E22` |
| **Researcher** | subagent | 调研检索专家 | 只读 + 联网 | `#17A589` |

## 使用方式

### 1. 项目配置

在 OpenCode 中打开本目录作为项目。项目根目录的 `opencode.json` 会自动加载所有代理配置。

### 2. 直接使用 Hermes

在 OpenCode 会话中切换到 **Hermes** 主代理（Tab 键循环），直接描述你的需求：

```
帮我给这个项目添加用户认证功能
```

Hermes 会自动：分析需求 → 调度 Scout 了解现有代码 → 调度 Architect 设计方案 → 调度 Coder 实现 → 调度 Reviewer 审查。

### 3. 手动 @ 调用子代理

你也可以在任意会话中手动调用子代理：

```
@scout 找到所有与用户认证相关的代码
@architect 设计一个微服务间通信的方案
@coder 实现 JWT token 刷新逻辑
@reviewer 审查 src/auth/ 下的代码
@shellrunner 运行全部测试套件
@researcher 调研 2025 年 Node.js 最佳实践
```

## 典型工作流示例

### 新功能开发

```
用户: "添加文件上传功能"
  ↓
Hermes: "我先让 Scout 了解一下项目结构"
  → Scout: 搜索现有上传相关代码、路由定义
  ↓
Hermes: "让 Architect 设计方案"
  → Architect: 输出文件上传模块架构文档
  ↓
Hermes: "交给 Coder 实现"
  → Coder: 编写代码、添加测试
  ↓
Hermes: "最后让 Reviewer 把关"
  → Reviewer: 代码审查报告
  ↓
Hermes: 整合所有产出，交付最终结果
```

### Bug 修复

```
用户: "登录后 token 不刷新"
  ↓
Hermes: "派 Scout 定位问题"
  → Scout: 找到 auth.ts 中 token 刷新逻辑
  ↓
Hermes: "派 Coder 修复"
  → Coder: 修复 token 刷新 bug
  ↓
Hermes: "派 Reviewer 确认修复质量"
  → Reviewer: 确认修复无新问题
```

## 项目结构

```
hermes-agents/
├── opencode.json              # OpenCode 项目配置
├── AGENTS.md                  # 本说明文件
├── README.md                  # 用户使用指南
└── .opencode/
    └── agents/
        ├── hermes.md         # Router 主代理
        ├── scout.md          # 代码探索专家
        ├── architect.md      # 架构设计专家
        ├── coder.md          # 代码编写专家
        ├── reviewer.md       # 代码审查专家
        ├── shellrunner.md    # 命令行专家
        └── researcher.md     # 调研检索专家
```

## 设计原则

1. **职责单一**：每个代理只做一类事情，边界清晰
2. **权限最小化**：只读代理绝不赋予写权限，降低风险
3. **人设驱动**：每个代理有鲜明的人设和沟通风格，便于理解和调试
4. **声明式配置**：所有配置集中在 `opencode.json` 和 Markdown frontmatter 中
5. **可扩展**：添加新代理只需创建新的 Markdown 文件并注册到配置中

## 扩展指南

### 添加新子代理

1. 在 `.opencode/agents/` 下创建 `newagent.md`，配置 YAML frontmatter 和系统提示词
2. 在 `opencode.json` 的 `agents` 字段中添加配置
3. 在 Hermes 的调度策略清单中添加新代理的映射规则

### 修改代理权限

编辑对应 Markdown 文件的 YAML frontmatter 中的 `tools` 和 `permissions` 字段，或修改 `opencode.json` 中的对应配置。

## 版本

v1.0.0 — 2026-05-22 初始版本