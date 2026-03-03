import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('io-manager API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const BOSS = { 'x-api-key': 'boss_token_7100' };
  const WORKER = { 'x-api-key': 'worker_token_7100' };

  describe('Health', () => {
    it('GET /api/v1/health returns ok', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.data.status).toBe('ok');
          expect(res.body.data.service).toBe('io-manager-api');
        });
    });
  });

  describe('Auth', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/projects')
        .expect(401);
    });

    it('returns 403 for wrong role', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects')
        .set(WORKER)
        .send({ name: 'test', goal: 'test' })
        .expect(403);
    });
  });

  describe('Projects', () => {
    it('creates and lists projects', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set(BOSS)
        .send({ name: 'E2E项目', goal: '端到端测试' })
        .expect(201);

      expect(createRes.body.data.name).toBe('E2E项目');
      expect(createRes.body.data.id).toBeDefined();

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/projects')
        .set(BOSS)
        .expect(200);

      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Tasks', () => {
    let projectId: string;
    let taskId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set(BOSS)
        .send({ name: 'TaskTest', goal: 'test tasks' });
      projectId = res.body.data.id;
    });

    it('creates a task', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set(BOSS)
        .send({ projectId, title: '编写前端', assignee: 'gaoyuanyuan', timeoutMinutes: 30 })
        .expect(201);

      expect(res.body.data.title).toBe('编写前端');
      expect(res.body.data.status).toBe('Backlog');
      taskId = res.body.data.id;
    });

    it('updates task status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}/status`)
        .set(BOSS)
        .send({ status: 'InProgress' })
        .expect(200);

      expect(res.body.data.status).toBe('InProgress');
    });

    it('rejects invalid status', async () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}/status`)
        .set(BOSS)
        .send({ status: 'InvalidStatus' })
        .expect(400);
    });

    it('batch creates tasks', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks/batch')
        .set(BOSS)
        .send({
          projectId,
          tasks: [
            { title: '任务A' },
            { title: '任务B' },
          ],
        })
        .expect(201);

      expect(res.body.data).toHaveLength(2);
    });

    it('enforces dependency check', async () => {
      const depTask = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set(BOSS)
        .send({ projectId, title: '前置任务' });

      const depId = depTask.body.data.id;

      const childTask = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set(BOSS)
        .send({ projectId, title: '后续任务', dependsOn: [depId] });

      return request(app.getHttpServer())
        .patch(`/api/v1/tasks/${childTask.body.data.id}/status`)
        .set(BOSS)
        .send({ status: 'InProgress' })
        .expect(409);
    });
  });

  describe('Workers', () => {
    it('lists workers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/workers')
        .set(BOSS)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('sets worker callbackUrl', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/workers/worker_gaoyuanyuan/callback')
        .set(BOSS)
        .send({ callbackUrl: 'http://localhost:9999/hook' })
        .expect(200);

      expect(res.body.data.callbackUrl).toBe('http://localhost:9999/hook');
    });

    it('clears worker callbackUrl when not provided', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/workers/worker_gaoyuanyuan/callback')
        .set(BOSS)
        .send({})
        .expect(200);

      expect(res.body.data.callbackUrl).toBeNull();
    });

    it('returns 404 for unknown worker callback', async () => {
      return request(app.getHttpServer())
        .patch('/api/v1/workers/nonexistent/callback')
        .set(BOSS)
        .send({ callbackUrl: 'http://localhost:9999/hook' })
        .expect(404);
    });
  });

  describe('Templates', () => {
    it('lists templates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/templates')
        .set(BOSS)
        .expect(200);

      expect(res.body.data.length).toBe(5);
      expect(res.body.data[0].tags).toBeInstanceOf(Array);
    });
  });

  describe('Blueprints', () => {
    let projectId: string;
    let blueprintId: string;
    let nodeId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set(BOSS)
        .send({ name: 'BlueprintTest', goal: 'test blueprints' });
      projectId = res.body.data.id;
    });

    it('creates a blueprint with auto-decomposition', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/blueprints')
        .set(BOSS)
        .send({
          projectId,
          requirement: '# 用户系统\n## 注册模块\n### 实现注册页面\n### 编写注册接口\n## 登录模块\n### 实现登录页面',
        })
        .expect(201);

      expect(res.body.data.status).toBe('Draft');
      expect(res.body.data.nodes.length).toBe(6);
      expect(res.body.data.nodes[0].level).toBe('milestone');
      expect(res.body.data.nodes[0].title).toBe('用户系统');
      blueprintId = res.body.data.id;
    });

    it('lists blueprints', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/blueprints')
        .set(BOSS)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('gets blueprint detail with nodes', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/blueprints/${blueprintId}`)
        .set(BOSS)
        .expect(200);

      expect(res.body.data.nodes).toBeInstanceOf(Array);
      expect(res.body.data.nodes.length).toBe(6);
    });

    it('adds a node to blueprint', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/blueprints/${blueprintId}/nodes`)
        .set(BOSS)
        .send({ level: 'task', title: '手动添加的任务', taskType: 'qa' })
        .expect(201);

      expect(res.body.data.title).toBe('手动添加的任务');
      expect(res.body.data.taskType).toBe('qa');
      nodeId = res.body.data.id;
    });

    it('updates a node', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/blueprints/${blueprintId}/nodes/${nodeId}`)
        .set(BOSS)
        .send({ title: '更新后的任务', assignee: 'zhaojinmai' })
        .expect(200);

      expect(res.body.data.title).toBe('更新后的任务');
      expect(res.body.data.assignee).toBe('zhaojinmai');
    });

    it('deletes a node', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/blueprints/${blueprintId}/nodes/${nodeId}`)
        .set(BOSS)
        .expect(200);

      expect(res.body.data.deleted).toBe(true);
    });

    it('approves a blueprint', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/blueprints/${blueprintId}`)
        .set(BOSS)
        .send({ status: 'Approved' })
        .expect(200);

      expect(res.body.data.status).toBe('Approved');
    });

    it('materializes blueprint into tasks', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/blueprints/${blueprintId}/materialize`)
        .set(BOSS)
        .send({ autoAssign: true })
        .expect(201);

      expect(res.body.data.blueprint.status).toBe('Materialized');
      expect(res.body.data.tasksCreated.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.tasksCreated[0].status).toBe('Backlog');
    });

    it('rejects update on materialized blueprint', async () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/blueprints/${blueprintId}`)
        .set(BOSS)
        .send({ status: 'Draft' })
        .expect(400);
    });

    it('redecomposes a draft blueprint', async () => {
      // Create a new blueprint for redecompose test
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/blueprints')
        .set(BOSS)
        .send({ projectId, requirement: '1. 第一阶段\n- 模块A' });
      const newBpId = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/blueprints/${newBpId}/decompose`)
        .set(BOSS)
        .expect(201);

      expect(res.body.data.status).toBe('Draft');
      expect(res.body.data.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects worker creating blueprints', async () => {
      return request(app.getHttpServer())
        .post('/api/v1/blueprints')
        .set(WORKER)
        .send({ projectId, requirement: 'test' })
        .expect(403);
    });
  });

  describe('Dashboard', () => {
    it('returns overview', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/overview')
        .set(BOSS)
        .expect(200);

      expect(res.body.data.projectCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.statusStats).toBeDefined();
      expect(res.body.data.riskSummary).toBeDefined();
    });

    it('returns audit logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/logs')
        .set(BOSS)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].type).toBeDefined();
      expect(res.body.data[0].payload).toBeDefined();
    });

    it('returns burndown chart data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/charts/burndown')
        .set(BOSS)
        .expect(200);

      expect(res.body.data.dates).toBeInstanceOf(Array);
      expect(res.body.data.totalTasks).toBeInstanceOf(Array);
      expect(res.body.data.remainingTasks).toBeInstanceOf(Array);
      expect(res.body.data.dates.length).toBeGreaterThanOrEqual(1);
    });

    it('returns task graph data', async () => {
      // Use the TaskTest project created in Tasks describe block
      const projects = await request(app.getHttpServer())
        .get('/api/v1/projects')
        .set(BOSS);
      const projectId = projects.body.data[0].id;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/dashboard/charts/task-graph?projectId=${projectId}`)
        .set(BOSS)
        .expect(200);

      expect(res.body.data.nodes).toBeInstanceOf(Array);
      expect(res.body.data.edges).toBeInstanceOf(Array);
      expect(typeof res.body.data.truncated).toBe('boolean');
      expect(res.body.data.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it('returns worker load data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/charts/worker-load')
        .set(BOSS)
        .expect(200);

      expect(res.body.data.workers).toBeInstanceOf(Array);
      expect(res.body.data.statuses).toBeInstanceOf(Array);
      expect(res.body.data.series).toBeInstanceOf(Array);
      expect(res.body.data.statuses).toEqual(['Triage', 'Backlog', 'InProgress', 'Blocked', 'Review', 'Done']);
    });
  });
});
