# IO-Manager API 接口文档

> 供 AI 员工作为 MCP Server / Tool 调用
> Base URL: `http://182.92.83.121:7100/api/v1`

## 鉴权

所有接口（除 `/health`）需携带 Header:

```
x-api-key: <token>
```

或

```
x-agent-id: <token>
```

| 角色 | Token | 说明 |
|------|-------|------|
| boss | `boss_token_7100` | 管理员，拥有全部权限 |
| pm | `pm_token_7100` | 项目经理，与 boss 同权限 |
| worker | `worker_token_7100` | 开发者/AI员工，仅限执行类操作 |

## 统一响应格式

```json
{
  "code": 0,
  "data": { ... },
  "msg": "ok"
}
```

错误时 `code` 非 0，`msg` 为错误描述。

---

# 一、管理员接口 (boss / pm)

> 以下接口仅 boss 和 pm 角色可调用，worker 调用返回 403。

## 1. 项目管理

### POST /projects — 创建项目

```json
// Request Body
{
  "name": "电商平台",        // string, 必填
  "goal": "构建完整电商系统",  // string, 必填
  "owner": "yangxuebo"       // string, 可选
}

// Response 201
{
  "id": "uuid",
  "name": "电商平台",
  "goal": "构建完整电商系统",
  "owner": "yangxuebo",
  "createdAt": "2026-03-03T..."
}
```

## 2. 任务管理

### POST /tasks — 创建任务

```json
// Request Body
{
  "projectId": "uuid",          // string, 必填
  "title": "编写用户注册接口",    // string, 必填
  "assignee": "gaoyuanyuan",    // string, 可选（指定分配给谁）
  "type": "backend",            // string, 可选
  "dependsOn": ["task-uuid"],   // string[], 可选（前置依赖任务ID）
  "timeoutMinutes": 60,         // number, 可选（超时分钟数）
  "autoAssign": true            // boolean, 可选（自动分配给空闲worker）
}

// Response 201
{
  "id": "uuid",
  "title": "编写用户注册接口",
  "status": "Backlog",
  "assignee": "gaoyuanyuan",
  "projectId": "uuid",
  ...
}
```

### POST /tasks/batch — 批量创建任务

```json
// Request Body
{
  "projectId": "uuid",          // string, 必填
  "tasks": [                    // BatchTaskItem[], 必填
    {
      "title": "任务A",          // string, 必填
      "assignee": "worker1",    // string, 可选
      "type": "frontend",      // string, 可选
      "dependsOn": [],          // string[], 可选
      "timeoutMinutes": 30      // number, 可选
    },
    { "title": "任务B" }
  ],
  "autoAssign": true            // boolean, 可选
}

// Response 201
[
  { "id": "uuid", "title": "任务A", "status": "Backlog", ... },
  { "id": "uuid", "title": "任务B", "status": "Backlog", ... }
]
```

### GET /tasks/alerts — 获取风险告警

```
// 无参数

// Response 200
[
  {
    "taskId": "uuid",
    "title": "超时任务",
    "riskType": "timeout",
    "message": "任务已超时30分钟"
  }
]
```

## 3. 蓝图管理

### POST /blueprints — 创建蓝图（自动拆解需求）

将非结构化需求文本自动拆解为里程碑/模块/任务三级结构。

```json
// Request Body
{
  "projectId": "uuid",                    // string, 必填
  "title": "用户系统蓝图",                  // string, 可选
  "requirement": "# 用户系统\n## 注册模块\n### 实现注册页面\n### 编写注册接口"
                                           // string, 必填（支持 Markdown 格式）
}

// Response 201
{
  "id": "uuid",
  "projectId": "uuid",
  "title": "用户系统蓝图",
  "requirement": "...",
  "status": "Draft",
  "version": 1,
  "nodes": [
    { "id": "n1", "level": "milestone", "title": "用户系统", "parentId": null, "sortOrder": 0, "taskType": "Task" },
    { "id": "n2", "level": "module", "title": "注册模块", "parentId": "n1", "sortOrder": 1, "taskType": "backend" },
    { "id": "n3", "level": "task", "title": "实现注册页面", "parentId": "n2", "sortOrder": 2, "taskType": "frontend" },
    { "id": "n4", "level": "task", "title": "编写注册接口", "parentId": "n2", "sortOrder": 3, "taskType": "backend" }
  ]
}
```

**需求文本解析规则**:
- `#` 或 `1.` 开头 → milestone（里程碑）
- `##` 或 `-` 开头 → module（模块）
- `###` 或 `*` 开头 → task（任务）
- 纯文本 → 按段落/句子拆解

### GET /blueprints — 蓝图列表

```
// Query: ?projectId=uuid （可选）

// Response 200
[
  { "id": "uuid", "title": "...", "status": "Draft", "projectId": "uuid", ... }
]
```

### GET /blueprints/:id — 蓝图详情（含节点树）

```
// Response 200
{
  "id": "uuid",
  "title": "...",
  "status": "Draft",
  "requirement": "...",
  "nodes": [ ... ]     // 完整节点列表
}
```

### PATCH /blueprints/:id — 更新蓝图元数据/状态

```json
// Request Body
{
  "title": "新标题",                        // string, 可选
  "status": "Approved"                     // string, 可选 (Draft|Review|Approved)
}

// 蓝图状态流转: Draft → Review → Approved → Materialized
// Materialized 状态不可回退

// Response 200
{ "id": "uuid", "status": "Approved", ... }
```

### POST /blueprints/:id/decompose — 重新拆解

重新解析需求文本，替换所有节点。仅 Draft 状态可用。

```
// 无 Body

// Response 201
{ "id": "uuid", "status": "Draft", "nodes": [ ... ] }
```

### POST /blueprints/:id/nodes — 添加节点

```json
// Request Body
{
  "parentId": "node-uuid",    // string, 可选
  "level": "task",            // string, 必填 (milestone|module|task)
  "title": "新增任务",         // string, 必填
  "description": "详细描述",   // string, 可选
  "taskType": "frontend",    // string, 可选
  "assignee": "gaoyuanyuan", // string, 可选
  "timeoutMin": 60,          // number, 可选
  "dependsOn": ["node-id"],  // string[], 可选
  "sortOrder": 5             // number, 可选
}

// Response 201
{ "id": "uuid", "level": "task", "title": "新增任务", ... }
```

### PATCH /blueprints/:id/nodes/:nodeId — 编辑节点

```json
// Request Body（所有字段可选）
{
  "title": "更新后标题",
  "description": "更新描述",
  "taskType": "backend",
  "assignee": "zhaojinmai",
  "timeoutMin": 120,
  "dependsOn": [],
  "sortOrder": 3
}

// Response 200
{ "id": "uuid", "title": "更新后标题", ... }
```

### DELETE /blueprints/:id/nodes/:nodeId — 删除节点

级联删除子节点。

```
// Response 200
{ "deleted": true }
```

### POST /blueprints/:id/materialize — 蓝图物化为任务

将 Approved 蓝图中的 task 级节点转化为真实 Kanban 任务。

```json
// Request Body
{
  "autoAssign": true    // boolean, 可选（自动分配给空闲worker）
}

// 前置条件: 蓝图 status 必须为 "Approved"

// Response 201
{
  "blueprint": { "id": "uuid", "status": "Materialized", ... },
  "tasksCreated": [
    { "id": "task-uuid", "title": "实现注册页面", "status": "Backlog", "assignee": "gaoyuanyuan", ... },
    { "id": "task-uuid", "title": "编写注册接口", "status": "Backlog", ... }
  ]
}
```

## 4. 模板管理

### GET /templates — 获取任务模板列表

```
// Response 200
[
  {
    "id": "uuid",
    "name": "Web全栈项目",
    "description": "...",
    "category": "fullstack",
    "tags": ["web", "fullstack"],
    "tasks": [ { "title": "...", "type": "..." } ]
  }
]
```

## 5. Worker 管理

### PATCH /workers/:id/callback — 设置 Worker 回调 URL

```json
// Request Body
{
  "callbackUrl": "http://localhost:9999/hook"   // string, 可选（不传则清空）
}

// Response 200
{ "id": "worker_gaoyuanyuan", "callbackUrl": "http://localhost:9999/hook", ... }
```

## 6. 监控与审计

### GET /audit/logs — 审计日志

```
// Query: ?limit=100 （可选，默认100）

// Response 200
[
  {
    "type": "task.status.changed",
    "payload": { "taskId": "uuid", "from": "Backlog", "to": "InProgress" },
    "timestamp": "2026-03-03T..."
  }
]
```

### GET /dashboard/charts/task-graph — 任务依赖关系图

```
// Query: ?projectId=uuid （必填）

// Response 200
{
  "nodes": [
    { "id": "uuid", "title": "任务A", "status": "InProgress", "assignee": "worker1" }
  ],
  "edges": [
    { "from": "uuid-A", "to": "uuid-B" }
  ],
  "truncated": false
}
```

### GET /dashboard/charts/worker-load — Worker 负载分布

```
// Response 200
{
  "workers": ["gaoyuanyuan", "zhaojinmai", "liudehua"],
  "statuses": ["Triage", "Backlog", "InProgress", "Blocked", "Review", "Done"],
  "series": [
    { "status": "InProgress", "data": [2, 1, 0] },
    { "status": "Backlog", "data": [3, 2, 1] }
  ]
}
```

---

# 二、开发者接口 (worker)

> 以下接口 worker 角色可调用（boss/pm 也可调用）。
> 这是 AI 员工日常工作中最常用的接口集合。

## 1. 查询类

### GET /projects — 获取项目列表

```
// Response 200
[
  { "id": "uuid", "name": "电商平台", "goal": "...", "createdAt": "..." }
]
```

### GET /tasks — 获取任务列表

```
// Query: ?projectId=uuid （可选）

// Response 200
[
  {
    "id": "uuid",
    "title": "编写用户注册接口",
    "status": "Backlog",
    "assignee": "gaoyuanyuan",
    "type": "backend",
    "projectId": "uuid",
    "dependsOn": [],
    "timeoutMinutes": 60,
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

### GET /workers — 获取 Worker 列表

```
// Response 200
[
  {
    "id": "worker_gaoyuanyuan",
    "name": "gaoyuanyuan",
    "skills": ["frontend", "backend"],
    "status": "idle",
    "callbackUrl": null,
    "currentTaskCount": 2
  }
]
```

### GET /dashboard/overview — 大盘总览

```
// Response 200
{
  "projectCount": 3,
  "taskCount": 15,
  "statusStats": {
    "Backlog": 5,
    "InProgress": 4,
    "Done": 6
  },
  "riskSummary": {
    "timeoutTasks": 2,
    "blockedTasks": 1
  }
}
```

### GET /dashboard/charts/burndown — 燃尽图

```
// Query: ?projectId=uuid&days=14 （均可选）

// Response 200
{
  "dates": ["2026-02-17", "2026-02-18", ...],
  "totalTasks": [10, 10, 12, ...],
  "remainingTasks": [10, 9, 8, ...]
}
```

### GET /health — 健康检查

```
// 无需鉴权

// Response 200
{
  "status": "ok",
  "service": "io-manager-api",
  "uptime": 123456
}
```

## 2. 操作类

### PATCH /tasks/:id/status — 更新任务状态

这是 AI 员工最核心的接口：领取任务、汇报进度、完成任务。

```json
// Request Body
{
  "status": "InProgress",    // string, 必填
  "note": "开始编写接口"      // string, 可选
}

// 合法状态值: Triage | Backlog | InProgress | Blocked | Review | Done
// 状态流转: Backlog → InProgress → Review → Done
//          InProgress → Blocked （遇到阻塞）

// 依赖校验: 如果任务有 dependsOn，前置任务未完成时不可进入 InProgress (返回 409)

// Response 200
{
  "id": "uuid",
  "title": "编写用户注册接口",
  "status": "InProgress",
  "updatedAt": "..."
}
```

### POST /worker/report — Worker 汇报任务结果

```json
// Request Body
{
  "taskId": "uuid",             // string, 必填
  "status": "Done",             // string, 必填
  "note": "接口已完成，通过测试",  // string, 可选
  "artifacts": {                // any, 可选（交付物）
    "files": ["src/user.controller.ts"],
    "testsPassed": 12
  }
}

// Response 200
{ "received": true }
```

### PATCH /workers/:id/status — 更新 Worker 状态

```json
// Request Body
{
  "status": "busy"    // string, 必填 (idle|busy)
}

// Response 200
{ "id": "worker_gaoyuanyuan", "status": "busy", ... }
```

### PATCH /workers/:id/callback — 注册回调 URL

AI 员工可注册自己的 Webhook，当有新任务分配时接收通知。

```json
// Request Body
{
  "callbackUrl": "http://my-agent:8080/webhook"  // string, 可选
}

// Response 200
{ "id": "worker_gaoyuanyuan", "callbackUrl": "http://my-agent:8080/webhook" }
```

## 3. 实时推送

### GET /dashboard/stream — SSE 实时事件流

```
// Query: ?events=task.created,task.status.changed （可选，逗号分隔，不传则接收全部）

// Response: text/event-stream
data: {"type":"task.status.changed","payload":{"taskId":"uuid","from":"Backlog","to":"InProgress"}}

data: {"type":"task.created","payload":{"taskId":"uuid","title":"新任务"}}

// 事件类型:
//   task.created          — 新任务创建
//   task.status.changed   — 任务状态变更
//   task.assigned         — 任务被分配
//   task.timeout          — 任务超时
//   blueprint.created     — 蓝图创建
//   blueprint.materialized — 蓝图物化
```

---

# 三、MCP Tool 定义参考

以下是将核心接口封装为 MCP Tool 的推荐定义，AI 员工可直接集成。

## Worker 常用 Tools

```json
[
  {
    "name": "list_my_tasks",
    "description": "获取当前所有任务，可按项目过滤",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": { "type": "string", "description": "项目ID，可选" }
      }
    },
    "method": "GET",
    "endpoint": "/api/v1/tasks"
  },
  {
    "name": "update_task_status",
    "description": "更新任务状态（领取/完成/阻塞）",
    "inputSchema": {
      "type": "object",
      "properties": {
        "taskId": { "type": "string", "description": "任务ID" },
        "status": { "type": "string", "enum": ["Triage","Backlog","InProgress","Blocked","Review","Done"] },
        "note": { "type": "string", "description": "状态说明" }
      },
      "required": ["taskId", "status"]
    },
    "method": "PATCH",
    "endpoint": "/api/v1/tasks/{taskId}/status"
  },
  {
    "name": "report_task_result",
    "description": "汇报任务完成结果和交付物",
    "inputSchema": {
      "type": "object",
      "properties": {
        "taskId": { "type": "string" },
        "status": { "type": "string" },
        "note": { "type": "string" },
        "artifacts": { "type": "object", "description": "交付物（文件列表、测试结果等）" }
      },
      "required": ["taskId", "status"]
    },
    "method": "POST",
    "endpoint": "/api/v1/worker/report"
  },
  {
    "name": "get_project_list",
    "description": "获取所有项目列表",
    "inputSchema": { "type": "object", "properties": {} },
    "method": "GET",
    "endpoint": "/api/v1/projects"
  },
  {
    "name": "get_dashboard_overview",
    "description": "获取项目大盘总览（任务统计、风险摘要）",
    "inputSchema": { "type": "object", "properties": {} },
    "method": "GET",
    "endpoint": "/api/v1/dashboard/overview"
  },
  {
    "name": "set_my_status",
    "description": "设置自身工作状态（idle/busy）",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workerId": { "type": "string" },
        "status": { "type": "string", "enum": ["idle", "busy"] }
      },
      "required": ["workerId", "status"]
    },
    "method": "PATCH",
    "endpoint": "/api/v1/workers/{workerId}/status"
  },
  {
    "name": "register_callback",
    "description": "注册任务通知回调URL，有新任务分配时自动推送",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workerId": { "type": "string" },
        "callbackUrl": { "type": "string", "format": "uri" }
      },
      "required": ["workerId"]
    },
    "method": "PATCH",
    "endpoint": "/api/v1/workers/{workerId}/callback"
  }
]
```

## 管理员 Tools

```json
[
  {
    "name": "create_project",
    "description": "创建新项目",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "goal": { "type": "string" },
        "owner": { "type": "string" }
      },
      "required": ["name", "goal"]
    },
    "method": "POST",
    "endpoint": "/api/v1/projects"
  },
  {
    "name": "create_task",
    "description": "创建单个任务，可指定分配人和依赖",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": { "type": "string" },
        "title": { "type": "string" },
        "assignee": { "type": "string" },
        "type": { "type": "string" },
        "dependsOn": { "type": "array", "items": { "type": "string" } },
        "timeoutMinutes": { "type": "number" },
        "autoAssign": { "type": "boolean" }
      },
      "required": ["projectId", "title"]
    },
    "method": "POST",
    "endpoint": "/api/v1/tasks"
  },
  {
    "name": "batch_create_tasks",
    "description": "批量创建任务",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": { "type": "string" },
        "tasks": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "assignee": { "type": "string" },
              "type": { "type": "string" },
              "dependsOn": { "type": "array", "items": { "type": "string" } },
              "timeoutMinutes": { "type": "number" }
            },
            "required": ["title"]
          }
        },
        "autoAssign": { "type": "boolean" }
      },
      "required": ["projectId", "tasks"]
    },
    "method": "POST",
    "endpoint": "/api/v1/tasks/batch"
  },
  {
    "name": "create_blueprint",
    "description": "从需求文本创建蓝图，自动拆解为里程碑/模块/任务",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": { "type": "string" },
        "title": { "type": "string" },
        "requirement": { "type": "string", "description": "需求文本，支持Markdown格式" }
      },
      "required": ["projectId", "requirement"]
    },
    "method": "POST",
    "endpoint": "/api/v1/blueprints"
  },
  {
    "name": "approve_blueprint",
    "description": "审批蓝图（将状态推进到 Approved）",
    "inputSchema": {
      "type": "object",
      "properties": {
        "blueprintId": { "type": "string" },
        "status": { "type": "string", "enum": ["Draft", "Review", "Approved"] }
      },
      "required": ["blueprintId", "status"]
    },
    "method": "PATCH",
    "endpoint": "/api/v1/blueprints/{blueprintId}"
  },
  {
    "name": "materialize_blueprint",
    "description": "将已审批蓝图物化为实际Kanban任务",
    "inputSchema": {
      "type": "object",
      "properties": {
        "blueprintId": { "type": "string" },
        "autoAssign": { "type": "boolean" }
      },
      "required": ["blueprintId"]
    },
    "method": "POST",
    "endpoint": "/api/v1/blueprints/{blueprintId}/materialize"
  },
  {
    "name": "get_task_alerts",
    "description": "获取超时和风险告警",
    "inputSchema": { "type": "object", "properties": {} },
    "method": "GET",
    "endpoint": "/api/v1/tasks/alerts"
  },
  {
    "name": "get_audit_logs",
    "description": "获取操作审计日志",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": { "type": "number", "description": "返回条数，默认100" }
      }
    },
    "method": "GET",
    "endpoint": "/api/v1/audit/logs"
  },
  {
    "name": "get_task_graph",
    "description": "获取任务依赖关系图数据",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": { "type": "string" }
      },
      "required": ["projectId"]
    },
    "method": "GET",
    "endpoint": "/api/v1/dashboard/charts/task-graph"
  },
  {
    "name": "get_worker_load",
    "description": "获取各Worker负载分布",
    "inputSchema": { "type": "object", "properties": {} },
    "method": "GET",
    "endpoint": "/api/v1/dashboard/charts/worker-load"
  }
]
```

---

# 四、AI 员工典型工作流

## 工作流 1: 领取并完成任务

```
1. list_my_tasks()                           → 查看待办任务
2. update_task_status(taskId, "InProgress")   → 领取任务
3. set_my_status(workerId, "busy")            → 标记忙碌
4. ... 执行开发工作 ...
5. report_task_result(taskId, "Done", note, artifacts)  → 汇报完成
6. set_my_status(workerId, "idle")            → 标记空闲
```

## 工作流 2: 被动接收任务（Webhook）

```
1. register_callback(workerId, "http://my-agent:8080/webhook")  → 注册回调
2. 等待 Webhook 推送: POST http://my-agent:8080/webhook
   Body: { "type": "task.assigned", "task": { "id": "...", "title": "..." } }
3. update_task_status(taskId, "InProgress")
4. ... 执行工作 ...
5. report_task_result(taskId, "Done", ...)
```

## 工作流 3: 管理员创建蓝图并下发

```
1. create_project(name, goal)                          → 创建项目
2. create_blueprint(projectId, requirement)             → 提交需求文本
3. 审阅自动拆解结果（nodes 树）
4. approve_blueprint(blueprintId, "Approved")           → 审批通过
5. materialize_blueprint(blueprintId, autoAssign=true)  → 物化为任务 + 自动分配
6. get_dashboard_overview()                             → 查看大盘
```
