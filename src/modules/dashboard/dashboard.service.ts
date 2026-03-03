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
}
