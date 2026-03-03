import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import Redis from 'ioredis';

const app = express();
const port = Number(process.env.PORT || 7100);
const DATA_FILE = path.resolve(process.cwd(), '../../data/state.json');
const STATUS = ['Triage', 'Backlog', 'InProgress', 'Blocked', 'Review', 'Done'];

const REDIS_HOST = process.env.REDIS_HOST || '';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const REDIS_DB = Number(process.env.REDIS_DB || 0);

const BOSS_TOKEN = process.env.BOSS_TOKEN || 'boss_token_7100';
const PM_TOKEN = process.env.PM_TOKEN || 'pm_token_7100';
const WORKER_TOKEN = process.env.WORKER_TOKEN || 'worker_token_7100';

const REDIS_KEYS = {
  projects: 'io:projects',
  tasks: 'io:tasks',
  events: 'io:events',
  templates: 'io:templates',
  workers: 'io:workers'
};

app.use(cors());
app.use(express.json());

const defaultState = { projects: [], tasks: [], events: [] };

function cloneDefault() {
  return JSON.parse(JSON.stringify(defaultState));
}

function loadFileState() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultState, null, 2));
      return cloneDefault();
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return cloneDefault();
  }
}

function saveFileState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

let redis = null;
let storeMode = 'file';

async function initStore() {
  if (!REDIS_HOST) return;
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD || undefined,
    db: REDIS_DB,
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  try {
    await client.connect();
    await client.ping();
    redis = client;
    storeMode = 'redis';
    await initDefaults();
  } catch {
    try { client.disconnect(); } catch {}
    redis = null;
    storeMode = 'file';
  }
}

async function initDefaults() {
  const tplKey = REDIS_KEYS.templates;
  const workersKey = REDIS_KEYS.workers;
  
  const [tplExists, workersExist] = await Promise.all([
    redis.exists(tplKey),
    redis.exists(workersKey)
  ]);

  if (!tplExists) {
    const defaultTemplates = [
      { id: 'tpl_frontend', name: '前端页面', tags: ['frontend'], defaultTimeout: 120 },
      { id: 'tpl_backend', name: '后端接口', tags: ['backend'], defaultTimeout: 180 },
      { id: 'tpl_db', name: '数据库设计', tags: ['backend', 'db'], defaultTimeout: 240 },
      { id: 'tpl_test', name: '测试用例', tags: ['qa'], defaultTimeout: 60 },
      { id: 'tpl_doc', name: '文档撰写', tags: ['doc'], defaultTimeout: 30 }
    ];
    await redis.set(tplKey, JSON.stringify(defaultTemplates));
  }

  if (!workersExist) {
    const defaultWorkers = [
      { id: 'worker_gaoyuanyuan', name: '高圆圆', tags: ['frontend'], status: 'idle' },
      { id: 'worker_zhaoliying', name: '赵丽颖', tags: ['backend'], status: 'idle' },
      { id: 'worker_zhaojinmai', name: '赵今麦', tags: ['qa', 'doc'], status: 'idle' }
    ];
    await redis.set(workersKey, JSON.stringify(defaultWorkers));
  }
}

async function loadState() {
  if (!redis) return loadFileState();

  const [projectsRaw, tasksRaw, eventsRaw] = await Promise.all([
    redis.get(REDIS_KEYS.projects),
    redis.get(REDIS_KEYS.tasks),
    redis.get(REDIS_KEYS.events)
  ]);

  return {
    projects: projectsRaw ? JSON.parse(projectsRaw) : [],
    tasks: tasksRaw ? JSON.parse(tasksRaw) : [],
    events: eventsRaw ? JSON.parse(eventsRaw) : []
  };
}

async function saveState(state) {
  if (!redis) {
    saveFileState(state);
    return;
  }

  await redis
    .multi()
    .set(REDIS_KEYS.projects, JSON.stringify(state.projects))
    .set(REDIS_KEYS.tasks, JSON.stringify(state.tasks))
    .set(REDIS_KEYS.events, JSON.stringify(state.events))
    .exec();
}

function resolveActor(req) {
  const token = req.header('x-api-key') || '';
  if (token === BOSS_TOKEN) return { role: 'boss', id: 'boss' };
  if (token === PM_TOKEN) return { role: 'pm', id: 'pm' };
  if (token === WORKER_TOKEN) return { role: 'worker', id: 'worker' };
  return null;
}

function requireRoles(...roles) {
  return (req, res, next) => {
    const actor = resolveActor(req);
    if (!actor) return res.status(401).json({ code: 401, msg: 'unauthorized: missing/invalid x-api-key' });
    if (!roles.includes(actor.role)) return res.status(403).json({ code: 403, msg: 'forbidden' });
    req.actor = actor;
    next();
  };
}

function pushEvent(state, type, payload) {
  state.events.push({ id: nanoid(), type, payload, at: new Date().toISOString() });
}

function unresolvedDeps(state, task) {
  return (task.dependsOn || []).filter(depId => {
    const depTask = state.tasks.find(t => t.id === depId);
    return !depTask || depTask.status !== 'Done';
  });
}

function computeRisks(state) {
  const now = Date.now();
  const blocked = state.tasks.filter(t => t.status === 'Blocked').map(t => ({
    taskId: t.id,
    title: t.title,
    type: 'blocked',
    assignee: t.assignee,
    note: t.note || '未填写阻塞原因'
  }));

  const timedOut = state.tasks
    .filter(t => ['InProgress', 'Blocked'].includes(t.status) && t.timeoutAt)
    .filter(t => new Date(t.timeoutAt).getTime() < now)
    .map(t => ({
      taskId: t.id,
      title: t.title,
      type: 'timeout',
      assignee: t.assignee,
      note: `任务超时: ${t.timeoutAt}`
    }));

  return [...blocked, ...timedOut];
}

function generateRiskSummary(risks) {
  if (!risks.length) return '暂无风险，项目推进顺利';
  
  const blocked = risks.filter(r => r.type === 'blocked').length;
  const timedOut = risks.filter(r => r.type === 'timeout').length;
  
  let summary = '';
  if (blocked > 0) summary += `${blocked}个任务被阻塞 `;
  if (timedOut > 0) summary += `${timedOut}个任务超时 `;
  
  const assignees = [...new Set(risks.map(r => r.assignee).filter(Boolean))];
  if (assignees.length > 0) summary += `责任人: ${assignees.join(', ')}`;
  
  return summary.trim();
}

async function autoAssign(taskType, state) {
  if (!redis) return 'unassigned';
  
  const workersData = await redis.get(REDIS_KEYS.workers);
  if (!workersData) return 'unassigned';
  
  const workers = JSON.parse(workersData);
  const templatesData = await redis.get(REDIS_KEYS.templates);
  const templates = templatesData ? JSON.parse(templatesData) : [];
  
  const matchedTemplate = templates.find(t => t.id === taskType || t.name.includes(taskType));
  if (!matchedTemplate) return 'unassigned';
  
  const requiredTags = matchedTemplate.tags || [];
  
  const availableWorkers = workers.filter(w => 
    w.status === 'idle' && 
    w.tags.some(tag => requiredTags.includes(tag))
  );
  
  if (availableWorkers.length === 0) return 'unassigned';
  
  return availableWorkers[0].id;
}

app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    service: 'io-manager-api',
    time: new Date().toISOString(),
    storeMode
  });
});

app.get('/api/projects', requireRoles('boss', 'pm', 'worker'), async (_req, res) => {
  const state = await loadState();
  res.json({ code: 0, data: state.projects });
});

app.post('/api/projects', requireRoles('boss', 'pm'), async (req, res) => {
  const { name, goal, owner = 'boss' } = req.body || {};
  if (!name || !goal) return res.status(400).json({ code: 1, msg: 'name and goal required' });

  const state = await loadState();
  const project = {
    id: nanoid(),
    name,
    goal,
    owner,
    status: 'Active',
    createdAt: new Date().toISOString()
  };
  state.projects.push(project);
  pushEvent(state, 'ProjectCreated', { projectId: project.id, actor: req.actor.id, role: req.actor.role });
  await saveState(state);
  res.status(201).json({ code: 0, data: project });
});

app.get('/api/tasks', requireRoles('boss', 'pm', 'worker'), async (req, res) => {
  const { projectId } = req.query;
  const state = await loadState();
  const tasks = projectId ? state.tasks.filter(t => t.projectId === projectId) : state.tasks;
  res.json({ code: 0, data: tasks });
});

app.post('/api/tasks', requireRoles('boss', 'pm'), async (req, res) => {
  const {
    projectId,
    title,
    assignee,
    type = 'Task',
    dependsOn = [],
    timeoutMinutes = 60,
    autoAssign: doAutoAssign = false
  } = req.body || {};

  if (!projectId || !title) return res.status(400).json({ code: 1, msg: 'projectId and title required' });

  const state = await loadState();
  
  let finalAssignee = assignee || 'unassigned';
  if (doAutoAssign && finalAssignee === 'unassigned') {
    finalAssignee = await autoAssign(type, state);
  }

  const task = {
    id: nanoid(),
    projectId,
    title,
    assignee: finalAssignee,
    type,
    dependsOn,
    status: 'Backlog',
    note: '',
    artifacts: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeoutAt: new Date(Date.now() + Number(timeoutMinutes) * 60 * 1000).toISOString()
  };

  state.tasks.push(task);
  pushEvent(state, 'TaskCreated', { taskId: task.id, actor: req.actor.id, role: req.actor.role });
  await saveState(state);
  res.status(201).json({ code: 0, data: task });
});

app.post('/api/tasks/batch', requireRoles('boss', 'pm'), async (req, res) => {
  const { projectId, tasks = [], autoAssign: doAutoAssign = false } = req.body || {};
  if (!projectId || !tasks.length) return res.status(400).json({ code: 1, msg: 'projectId and tasks array required' });

  const state = await loadState();
  const created = [];

  for (const t of tasks) {
    let finalAssignee = t.assignee || 'unassigned';
    if (doAutoAssign && finalAssignee === 'unassigned') {
      finalAssignee = await autoAssign(t.type || 'Task', state);
    }

    const task = {
      id: nanoid(),
      projectId,
      title: t.title,
      assignee: finalAssignee,
      type: t.type || 'Task',
      dependsOn: t.dependsOn || [],
      status: 'Backlog',
      note: '',
      artifacts: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeoutAt: new Date(Date.now() + Number(t.timeoutMinutes || 60) * 60 * 1000).toISOString()
    };
    state.tasks.push(task);
    created.push(task);
  }

  pushEvent(state, 'TasksBatchCreated', { projectId, count: created.length, actor: req.actor.id, role: req.actor.role });
  await saveState(state);
  res.status(201).json({ code: 0, data: created });
});

app.patch('/api/tasks/:id/status', requireRoles('boss', 'pm', 'worker'), async (req, res) => {
  const { status, note } = req.body || {};
  if (!STATUS.includes(status)) return res.status(400).json({ code: 1, msg: 'invalid status' });

  const state = await loadState();
  const task = state.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ code: 1, msg: 'task not found' });

  if (status === 'InProgress') {
    const deps = unresolvedDeps(state, task);
    if (deps.length) {
      return res.status(409).json({
        code: 2,
        msg: 'dependency not resolved',
        data: { unresolvedDependsOn: deps }
      });
    }
  }

  task.status = status;
  task.note = note || task.note;
  task.updatedAt = new Date().toISOString();

  pushEvent(state, 'TaskStatusChanged', {
    taskId: task.id,
    status,
    note: task.note,
    actor: req.actor.id,
    role: req.actor.role
  });
  await saveState(state);
  res.json({ code: 0, data: task });
});

app.post('/api/worker/report', requireRoles('boss', 'pm', 'worker'), async (req, res) => {
  const { taskId, status, note = '', artifacts = null } = req.body || {};
  if (!taskId || !status) return res.status(400).json({ code: 1, msg: 'taskId and status required' });
  if (!STATUS.includes(status)) return res.status(400).json({ code: 1, msg: 'invalid status' });

  const state = await loadState();
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ code: 1, msg: 'task not found' });

  if (status === 'InProgress') {
    const deps = unresolvedDeps(state, task);
    if (deps.length) {
      return res.status(409).json({ code: 2, msg: 'dependency not resolved', data: { unresolvedDependsOn: deps } });
    }
  }

  task.status = status;
  task.note = note || task.note;
  task.artifacts = artifacts;
  task.updatedAt = new Date().toISOString();

  pushEvent(state, 'WorkerReported', {
    taskId: task.id,
    status,
    note: task.note,
    artifacts,
    actor: req.actor.id,
    role: req.actor.role
  });

  await saveState(state);
  res.json({ code: 0, data: task });
});

app.get('/api/templates', requireRoles('boss', 'pm'), async (_req, res) => {
  if (!redis) return res.json({ code: 0, data: [] });
  const data = await redis.get(REDIS_KEYS.templates);
  res.json({ code: 0, data: data ? JSON.parse(data) : [] });
});

app.get('/api/workers', requireRoles('boss', 'pm', 'worker'), async (_req, res) => {
  if (!redis) return res.json({ code: 0, data: [] });
  const data = await redis.get(REDIS_KEYS.workers);
  res.json({ code: 0, data: data ? JSON.parse(data) : [] });
});

app.patch('/api/workers/:id/status', requireRoles('boss', 'pm', 'worker'), async (req, res) => {
  const { status } = req.body || {};
  if (!['idle', 'busy'].includes(status)) return res.status(400).json({ code: 1, msg: 'invalid status' });
  
  if (!redis) return res.status(503).json({ code: 1, msg: 'redis not available' });
  
  const data = await redis.get(REDIS_KEYS.workers);
  if (!data) return res.status(404).json({ code: 1, msg: 'workers not found' });
  
  const workers = JSON.parse(data);
  const worker = workers.find(w => w.id === req.params.id);
  if (!worker) return res.status(404).json({ code: 1, msg: 'worker not found' });
  
  worker.status = status;
  await redis.set(REDIS_KEYS.workers, JSON.stringify(workers));
  
  res.json({ code: 0, data: worker });
});

app.get('/api/tasks/alerts', requireRoles('boss', 'pm'), async (_req, res) => {
  const state = await loadState();
  res.json({ code: 0, data: computeRisks(state) });
});

app.get('/api/audit/logs', requireRoles('boss', 'pm'), async (req, res) => {
  const state = await loadState();
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
  res.json({ code: 0, data: state.events.slice(-limit).reverse() });
});

app.get('/api/dashboard/overview', requireRoles('boss', 'pm', 'worker'), async (_req, res) => {
  const state = await loadState();
  const stats = state.tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  const risks = computeRisks(state);
  const riskSummary = generateRiskSummary(risks);
  
  res.json({
    code: 0,
    data: {
      projectCount: state.projects.length,
      taskCount: state.tasks.length,
      statusStats: stats,
      riskCount: risks.length,
      riskSummary,
      risks,
      recentEvents: state.events.slice(-20).reverse()
    }
  });
});

initStore().finally(() => {
  app.listen(port, () => {
    console.log(`io-manager-api running on :${port}, store=${storeMode}`);
  });
});
