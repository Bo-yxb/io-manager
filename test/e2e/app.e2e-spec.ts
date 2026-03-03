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
  });
});
