# io-manager

AI-PM 服务的独立异步后端调度系统，负责微观节点流转、状态机维护、高并发分发与上帝视角大盘透出。

> ⚠️ 该项目已全面升级为基于 **TypeScript + Node.js** 的事件驱动异步流架构。

## 详细技术选型与规划详见以下设计文档：

- 📂 [产品需求概要 (PRD)](./docs/PRD.md)
- 📂 [系统架构设计与选型分析 (DESIGN)](./docs/DESIGN.md)
- 📂 [工程/目录代码接口规范 (TECHNICAL)](./docs/TECHNICAL.md)

## 当前开发拆分

- `apps/api`：后端接口服务（默认端口 `7100`）
- `apps/web`：老板大盘静态前端（默认端口 `7101`）
- `data/state.json`：轻量状态存储（v1 演示）
- `KANBAN.json`：开发任务看板

## 本地启动

```bash
./scripts/run-local.sh
```

访问：
- API: `http://localhost:7100/api/health`
- Dashboard: `http://localhost:7101`

