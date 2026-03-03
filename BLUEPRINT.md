# io-manager (AI-PM Service Construction) - Project Blueprint
*Initialized: 2026-03-02*

## 1. Project Goal
从零开始构建 `io-manager` 服务。核心定位：作为 AI-PM (AI项目管理) 项目的独立后端系统，提供项目规划、看板管理、任务拆解以及与其他智能体(Worker Agents)互动的支撑平台。这是之前 AI-Orchestrator 工作流的平台化落地。

## 2. Architecture & Tech Stack
- 后端语言：Java / Spring Boot 3 / JDK 17
- 关键模块：
  - 项目实体(Project, Blueprint)
  - 任务与流转看板状态机(Task, Kanban, TaskStatus)
  - Agent 指令派发与事件中心(Orchestrator Webhook)
  - 老板专属大盘与展示模块(Dashboard & Boss View)

## 3. Module Breakdown
- [ ] Module 1: 初始化核心骨架与配置项。搭建 Spring Boot 基础环境，制定好工程规范、包结构。
- [ ] Module 2: 设计并定义核心 Domain Entity（项目、看板、任务、执行者）和对外的 RESTful API (Swagger/Springdoc)。
- [ ] Module 3: 结合当前 `ai-orchestrator` 的痛点，持续迭代反馈机制到这个新服务中。
- [ ] Module 4: 会汇报且看得懂的老板专属展示模块 (Boss Dashboard)。通过图表/层级树/时间轴等形式，将项目整体规划、具体任务拆解以及 Agent 当前执行状态聚合透传给分配者（你）。
