# io-manager

AI-PM 服务的独立后端系统，负责项目规划、看板管理、任务拆解与 Agent 协作。

## Tech Stack
- Java 17
- Spring Boot 3
- Spring Web
- Spring Data JPA
- Lombok
- H2 (dev runtime)

## Quick Start
```bash
mvn spring-boot:run
```

Health check:
```bash
curl http://localhost:8080/api/health
```

## Package Structure
- `controller` - HTTP 接口
- `service` - 业务逻辑
- `domain` - 领域模型
- `config` - 配置
