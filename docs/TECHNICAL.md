# 核心技术开发规范 (TECHNICAL DEV GUIDELINES)

## 1. 工程搭建规则与初始化

### 1.1 依赖库管理及脚手架 (基于 Node.js / TypeScript 与 NestJS)

为了更灵活处理 JSON 数据与高并发，以及和现有前端 Dashboard (如 React / Vue / Figma Token 解析等) 保持技术栈统一。本次后端核心架构重新立项推荐 TypeScript + NestJS 作为后端骨架。

- Node.js `^20.0.0`
- 包管理器 `pnpm i`
- 主框架：`NestJS` (`@nestjs/core`, `@nestjs/common`)
- ORM 映射层：`TypeORM` (或 `Prisma` 建议对于 AI 应用，因非结构化灵活性 Prisma 更优) 配合 PostgreSQL。
- 业务缓存与锁：`ioredis` 配合 Redis Server。

### 1.2 目录包结构规范

```bash
📦 src
 ┣ 📂 core                # 核心拦截器、异常过滤、管道与中间件
 ┣ 📂 infrastructure      # 数据库、Redis 连接与注入
 ┣ 📂 modules             # 各大核心业务模块
 ┃ ┣ 📂 project           # 老板项目入口模块
 ┃ ┣ 📂 blueprint         # 任务拆解与蓝图维护
 ┃ ┣ 📂 kanban            # 状态机与工作流卡点处理
 ┃ ┣ 📂 orchestrator      # Agent 交互与 Webhook 调度中心
 ┃ ┗ 📂 dashboard         # Module 4: 会汇报的主管专线 (老板大盘)
 ┣ 📂 shared              # 枚举值、业务公用 Types、DTO / Vo
 ┗ 📜 main.ts             # 应用入口点
```

## 2. API 契约与约定 (RESTful API Design)

- 接口强制统一带 `/api/v1/` 前缀。
- **状态码约定**:
  - `200` 成功，标准返回体 `{ code: 0, data: ..., msg: "ok" }`
  - `400` 参数错误，或状态机流转不合法 (例如尝试完成一个正在 Blocked 的任务)。
  - `403` 权限拦截。
  - `409` 状态流转冲突/并发修改争抢 (Optimistic Lock 异常)。
  - `500` 全局服务器异常兜底。

## 3. 命名约定

1. Entity (领域实体)：单数，如 `Project`, `Task`, 不要后缀。
2. DTO (数据传输对象)：用于出入参约束，加后缀，如 `CreateProjectReqDto`, `UpdateTaskStatusDto`。
3. Service (应用层逻辑)：`ProjectService` 承载业务组装。
4. Repository (数据隔离设施)：`TaskRepository` 处理持久层，或采用 Prisma Client 直接暴漏。

## 4. 关键领域逻辑与状态流转保障机制

- 使用类库库进行状态管理并注入日志 (如 `xstate` 等微内核库来管理一个工单在整个大生命周期里的扭转过程，避免散落的 `if status == 'blocked'`)。
- 每一次状态变更必须在事务包裹 (Transaction) 内同步插入一条基于 UUID 的事件溯源日志 (Event_Log)。

## 5. Agent 注册与身份验证 (Webhook 调度)

- 设计简单的 API Key / Header (例如 `X-Agent-ID: liuyifei`) 完成简易身份注入。
- 对于下发给某 Agent 的任务请求，考虑异步 Webhook 发送 + API 主动轮询的双保险，避免死信丢失。
- Dashboard 部分支持 SSE (Server-Sent Events) 来直接为老板展示最新的 Progress 打点。