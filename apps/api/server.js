import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

const app = express();
const port = process.env.PORT || 7100;
const DATA_FILE = path.resolve(process.cwd(), '../../data/state.json');
const STATUS = ['Triage', 'Backlog', 'InProgress', 'Blocked', 'Review', 'Done'];

app.use(cors());
app.use(express.json());

const defaultState = { projects: [], tasks: [], events: [] };

function loadState() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultState, null, 2));
      return structuredClone(defaultState);
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'io-manager-api', time: new Date().toISOString() });
});

app.get('/api/projects', (_req, res) => {
  res.json({ code: 0, data: loadState().projects });
});

app.post('/api/projects', (req, res) => {
  const { name, goal, owner = 'boss' } = req.body || {};
  if (!name || !goal) return res.status(400).json({ code: 1, msg: 'name and goal required' });

  const state = loadState();
  const project = {
    id: nanoid(),
    name,
    goal,
    owner,
    status: 'Active',
    createdAt: new Date().toISOString()
  };
  state.projects.push(project);
  pushEvent(state, 'ProjectCreated', { projectId: project.id });
  saveState(state);
  res.status(201).json({ code: 0, data: project });
});

app.get('/api/tasks', (req, res) => {
  const { projectId } = req.query;
  const state = loadState();
  const tasks = projectId ? state.tasks.filter(t => t.projectId === projectId) : state.tasks;
  res.json({ code: 0, data: tasks });
});

app.post('/api/tasks', (req, res) => {
  const {
    projectId,
    title,
    assignee = 'unassigned',
    type = 'Task',
    dependsOn = [],
    timeoutMinutes = 60
  } = req.body || {};

  if (!projectId || !title) return res.status(400).json({ code: 1, msg: 'projectId and title required' });

  const state = loadState();
  const task = {
    id: nanoid(),
    projectId,
    title,
    assignee,
    type,
    dependsOn,
    status: 'Backlog',
    note: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeoutAt: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString()
  };

  state.tasks.push(task);
  pushEvent(state, 'TaskCreated', { taskId: task.id });
  saveState(state);
  res.status(201).json({ code: 0, data: task });
});

app.patch('/api/tasks/:id/status', (req, res) => {
  const { status, note } = req.body || {};
  if (!STATUS.includes(status)) return res.status(400).json({ code: 1, msg: 'invalid status' });

  const state = loadState();
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

  pushEvent(state, 'TaskStatusChanged', { taskId: task.id, status, note: task.note });
  saveState(state);
  res.json({ code: 0, data: task });
});

app.get('/api/tasks/alerts', (_req, res) => {
  const state = loadState();
  res.json({ code: 0, data: computeRisks(state) });
});

app.get('/api/dashboard/overview', (_req, res) => {
  const state = loadState();
  const stats = state.tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  const risks = computeRisks(state);
  res.json({
    code: 0,
    data: {
      projectCount: state.projects.length,
      taskCount: state.tasks.length,
      statusStats: stats,
      riskCount: risks.length,
      risks,
      recentEvents: state.events.slice(-20).reverse()
    }
  });
});

app.listen(port, () => {
  console.log(`io-manager-api running on :${port}`);
});
