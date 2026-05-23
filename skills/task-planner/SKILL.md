---
name: task-planner
description: 多 Agent 任务规划与拆解。将复杂需求分解为可并行的子任务，指定依赖关系，生成最优调度方案。
---

# 任务规划技能

## 功能

将用户的复杂需求拆解为结构化的任务 DAG（有向无环图），明确每个子任务的目标、产出物、依赖关系和负责任 agent。

## 输入

- 用户原始需求（自然语言）
- 已知的项目上下文（代码结构、现有功能）

## 输出格式

```json
{
  "tasks": [
    {
      "id": "task-1",
      "description": "任务描述",
      "agent": "scout | architect | coder | reviewer | shellrunner | researcher",
      "depends_on": ["task-0"],
      "output": "预期产出物说明"
    }
  ],
  "parallel_groups": [
    ["task-1", "task-2"],
    ["task-3"]
  ]
}
```

## 规划原则

1. **最小依赖**：尽可能设计可并行的任务，减少串行依赖
2. **职责匹配**：根据任务类型分派给最合适的 agent
3. **产出明确**：每个任务必须有可验证的产出物
4. **粒度适中**：每个任务应在 1-3 次 agent 交互内完成
5. **先探索后实施**：涉及修改的任务，先派 Scout 探索现有代码