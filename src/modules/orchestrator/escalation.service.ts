import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventStoreService } from '../../infrastructure/event-store/event-store.service';
import { SseService } from '../../infrastructure/sse/sse.service';
import { WebhookService } from './webhook.service';

@Injectable()
export class EscalationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EscalationService.name);
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private eventStore: EventStoreService,
    private sseService: SseService,
    private webhookService: WebhookService,
    private config: ConfigService,
  ) {
    this.intervalMs = Number(
      this.config.get('ESCALATION_SCAN_INTERVAL_MS', '120000'),
    );
  }

  onModuleInit() {
    this.timer = setInterval(() => {
      this.scanAndEscalate().catch((err) =>
        this.logger.error('Escalation scan failed', err.stack),
      );
    }, this.intervalMs);
    this.logger.log(`Escalation scanner started, interval=${this.intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async scanAndEscalate(): Promise<number> {
    const now = new Date();

    const timedOutTasks = await this.prisma.task.findMany({
      where: {
        status: { in: ['InProgress', 'Blocked'] },
        timeoutAt: { lt: now },
      },
    });

    const reEscalateAfterMs = this.intervalMs * 5;

    const needsEscalation = timedOutTasks.filter((task) => {
      if (!task.escalatedAt) return true;
      if (!task.timeoutAt) return false;
      if (task.escalatedAt < task.timeoutAt) return true;
      if (task.status === 'Blocked') {
        return now.getTime() - task.escalatedAt.getTime() > reEscalateAfterMs;
      }
      return false;
    });

    for (const task of needsEscalation) {
      const escalationType =
        task.status === 'InProgress' ? 'timeout_blocked' : 'timeout_escalated';

      if (task.status === 'InProgress') {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'Blocked',
            note: `[自动升级] 任务超时，已自动标记为阻塞 (${now.toISOString()})`,
            escalatedAt: now,
          },
        });
      } else {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { escalatedAt: now },
        });
      }

      await this.eventStore.append(
        'TaskEscalated',
        {
          taskId: task.id,
          title: task.title,
          projectId: task.projectId,
          assignee: task.assignee,
          previousStatus: task.status,
          escalationType,
          timeoutAt: task.timeoutAt?.toISOString(),
        },
        'system',
        'system',
      );

      this.sseService.emit('task_escalated', {
        taskId: task.id,
        title: task.title,
        assignee: task.assignee,
        escalationType,
        previousStatus: task.status,
      });

      this.webhookService
        .notifyPmEscalation(
          {
            id: task.id,
            title: task.title,
            projectId: task.projectId,
            assignee: task.assignee,
            status: task.status,
          },
          escalationType as 'timeout_blocked' | 'timeout_escalated',
        )
        .catch(() => {});

      this.logger.warn(
        `Task ${task.id} (${task.title}) escalated: ${escalationType}`,
      );
    }

    if (needsEscalation.length > 0) {
      this.logger.log(
        `Escalation scan: ${needsEscalation.length} task(s) escalated`,
      );
    }

    return needsEscalation.length;
  }
}
