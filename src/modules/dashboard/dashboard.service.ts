import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventStoreService } from '../../infrastructure/event-store/event-store.service';
import { KanbanService } from '../kanban/kanban.service';
import { RiskEngineService } from './risk-engine.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private eventStore: EventStoreService,
    private kanbanService: KanbanService,
    private riskEngine: RiskEngineService,
  ) {}

  async getOverview() {
    const [projectCount, taskCount, statusStats, risks, recentEvents] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.task.count(),
      this.prisma.task.groupBy({ by: ['status'], _count: true }),
      this.kanbanService.computeAlerts(),
      this.eventStore.findRecent(20),
    ]);

    const stats = statusStats.reduce(
      (acc, s) => {
        acc[s.status] = s._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      projectCount,
      taskCount,
      statusStats: stats,
      riskCount: risks.length,
      riskSummary: this.riskEngine.generateRiskSummary(risks),
      risks,
      recentEvents: recentEvents.map((e) => ({
        ...e,
        payload: JSON.parse(e.payload),
      })),
    };
  }

  async getAuditLogs(limit: number = 100) {
    const events = await this.eventStore.findRecent(limit);
    return events.map((e) => ({
      ...e,
      payload: JSON.parse(e.payload),
    }));
  }

  async getBurndownData(projectId?: string, days: number = 14) {
    const safeDays = Math.min(Math.max(days, 1), 90);
    const where = projectId ? { projectId } : {};
    const tasks = await this.prisma.task.findMany({
      where,
      select: { createdAt: true, updatedAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - safeDays);
    startDate.setHours(0, 0, 0, 0);

    if (tasks.length > 0 && tasks[0].createdAt < startDate) {
      startDate.setTime(tasks[0].createdAt.getTime());
      startDate.setHours(0, 0, 0, 0);
    }

    const dates: string[] = [];
    const totalTasks: number[] = [];
    const remainingTasks: number[] = [];

    const cursor = new Date(startDate);
    while (cursor <= now) {
      const endOfDay = new Date(cursor);
      endOfDay.setHours(23, 59, 59, 999);

      dates.push(cursor.toISOString().slice(0, 10));

      let total = 0;
      let done = 0;
      for (const t of tasks) {
        if (t.createdAt <= endOfDay) {
          total++;
          if (t.status === 'Done' && t.updatedAt <= endOfDay) {
            done++;
          }
        }
      }
      totalTasks.push(total);
      remainingTasks.push(total - done);

      cursor.setDate(cursor.getDate() + 1);
    }

    return { dates, totalTasks, remainingTasks };
  }

  async getTaskGraphData(projectId: string) {
    const MAX_NODES = 200;
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      take: MAX_NODES,
    });

    const nodeIds = new Set(tasks.map((t) => t.id));
    const nodes = tasks.map((t) => ({
      id: t.id,
      name: t.title,
      status: t.status,
      assignee: t.assignee,
    }));

    const edges: { source: string; target: string }[] = [];
    for (const t of tasks) {
      const deps: string[] = JSON.parse(t.dependsOn);
      for (const depId of deps) {
        if (nodeIds.has(depId)) {
          edges.push({ source: depId, target: t.id });
        }
      }
    }

    const totalCount = await this.prisma.task.count({ where: { projectId } });

    return { nodes, edges, truncated: totalCount > MAX_NODES };
  }

  async getWorkerLoadData() {
    const [groupedTasks, workers] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['assignee', 'status'],
        _count: true,
      }),
      this.prisma.worker.findMany({ select: { id: true, name: true } }),
    ]);

    const workerNameMap = new Map<string, string>();
    for (const w of workers) {
      workerNameMap.set(w.id, w.name);
      workerNameMap.set(w.name, w.name);
    }

    const assigneeList = Array.from(new Set(groupedTasks.map((g) => g.assignee)));
    const statuses = ['Triage', 'Backlog', 'InProgress', 'Blocked', 'Review', 'Done'];

    const countMap = new Map<string, Map<string, number>>();
    for (const g of groupedTasks) {
      if (!countMap.has(g.assignee)) countMap.set(g.assignee, new Map());
      countMap.get(g.assignee)!.set(g.status, g._count);
    }

    const series = statuses.map((status) => ({
      status,
      data: assigneeList.map((a) => countMap.get(a)?.get(status) || 0),
    }));

    const workerNames = assigneeList.map((a) => workerNameMap.get(a) || a);

    return { workers: workerNames, statuses, series };
  }
}
