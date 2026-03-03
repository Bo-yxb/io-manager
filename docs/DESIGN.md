# 系统架构与模块设计文档 (DESIGN)

## 1. 原则与理念 (Why these choices?)

放弃单纯单体与短视的阻塞型架构模式 (例如仅用 Spring Web MVC 同步回调)。鉴于 `io-manager` 的受众是 AI Agent（高并发长连、随时挂起、状态驱动），我们采用完全异步和事件驱动(Event-Driven) 的响应式架构底座。这是 AI-OS 概念里的核心中间件。

## 2. 核心技术选型 (Core Tech Stack)

- **语言生态**: **Go (Golang) / Python** （或轻量的 **TypeScript/Node.js** 或 **Java 21 Virtual Threads** 只要支撑真正的非阻塞异步，基于团队基因，建议采用 **Go** 搭配 Gin / Fiber 或 **TypeScript** 搭配 NestJS。此处假设转型采用 **Go** 来获取单机最高并发效能）。
- **进程/协议**: RESTful HTTP + WebSocket(对于老板大盘的实时透出)，或极小量级的 gRPC 用于内部模块间调用。
- **存储引擎**:
  - **持久化配置中心 & 领域存储**: **PostgreSQL**。使用 JSONB 直接装载非结构化的 Artifacts。
  - **状态机 & 派发中间件缓存**: **Redis**。极度依赖 pub/sub 及过期 Key 机制构建 “AI执行超时告警锁”。
- **架构模式**:
  - Event Sourcing (事件溯源)。记录每个需求节点的快照 (Created -> Dispatched -> Blocked)。
  - Clean Architecture (领域驱动设计 DDD 核心思路)。隔离核心状态机流转与底层的基础设施调用。

## 3. 核心领域模型 (Domain Model)

### 3.1 Project / Blueprint (项目定义)
管理老板下发的总目标。
- `id` UUID
- `owner` (分配者/老板)
- `description` Text
- `status` (Draft, Active, Paused, Completed)
- `created_at`

### 3.2 Task & TaskNode (流转单元)
每一个具体的子工序，由 AI-PM 拆解出来的微观任务。
- `id` UUID
- `blueprint_id`
- `assignee` (指派的具体 AI 打工人，如 'GaoYuanYuan')
- `type` (Code, Design, Review)
- `status` (Todo, InProgress, Blocked, Done)
- `dependencies` (Array of Task ID 前置依赖节点)
- `payload` JSON (传给 Agent 的 Prompt 素材和产出规格)
- `artifacts` JSON (反馈的代码片、报告等)
- `started_at`, `timeout_at` (倒计时阈值，过期则 AI-PM 介入)

### 3.3 Event / Webhook (智能体信使)
负责记录和分发每个任务流转时的数据变更。
- `event_id`
- `event_type` (TaskStatusChanged, AgentBlocked, TimeoutTriage)

## 4. 架构分层图解

```plaintext
======================================================
  Boss Dashboard UI             AI Worker Agents (Clients)
======================================================
           |                              | (REST / WebSocket)
------------------------------------------------------
  [ API Gateway & Auth ] / Load Balancer
------------------------------------------------------
  [ Presentation/API Layer ]
    - Project Controller / Websocket Emitter
    - Agent Interaction Endpoint
------------------------------------------------------
  [ Service / UseCase Layer ]
    - Blueprint Engine (解析，生成状态树)
    - Kanban Workflow (卡点与死锁判定)
    - Orchestrator (任务分发、超时回收机制)
    - Dashboard Aggregator (组装老板大盘视图)
------------------------------------------------------
  [ Domain Model Layer ] (纯核心逻辑，无框架依赖)
    - State Machine Evaluator (Triage -> Backlog ...)
------------------------------------------------------
  [ Data & Infrastructure Layer ]
    - PostgreSQL Repository
    - Redis Event Bus / Pub-Sub
    - AI Model Adapters (可选，直接调大模型做辅助判断)
======================================================
```

## 5. 交互流程序列 (Sequence)

1. **老板发需求**: Boss -> API -> Project Core -> 创建 `Blueprint`。
2. **AI-PM拆解**: Blueprint 被下发至 AI-PM，通过 AI-PM 引擎拆解出 3 个 `Task`。
3. **入池看板**: 3 个 `Task` 进入 PostgreSQL 并压入 Redis 待办队列。
4. **派发打工**: Orchestrator 监听队列，将任务通过 HTTP 分发给对应的 AI Worker (如 `Agent:前端`)。
5. **打卡干活**: Worker 执行完毕，调用 API `PATCH /tasks/{id}/status (Done + 产物)`。
6. **大盘透出**: Redis 发布 `Task Completed`，API 中 WebSocket 同步发送给前端 Dashboard。老板实时看到节点变绿。