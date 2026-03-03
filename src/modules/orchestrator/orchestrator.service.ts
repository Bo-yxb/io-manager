import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventStoreService } from '../../infrastructure/event-store/event-store.service';
import { WorkerReportDto } from './dto/worker-report.dto';
import { AgentContext } from '../../shared/interfaces/agent-context.interface';
import { ALL_TASK_STATUSES } from '../kanban/state-machine/task-state-machine';

@Injectable()
export class OrchestratorService {
  constructor(
    private prisma: PrismaService,
    private eventStore: EventStoreService,
  ) {}

  async findAllWorkers() {
    const workers = await this.prisma.worker.findMany();
    return workers.map((w) => ({
      ...w,
      tags: JSON.parse(w.tags),
    }));
  }

  async updateWorkerStatus(id: string, status: string) {
    const worker = await this.prisma.worker.findUnique({ where: { id } });
    if (!worker) throw new NotFoundException('worker not found');

    const updated = await this.prisma.worker.update({
      where: { id },
      data: { status },
    });

    return { ...updated, tags: JSON.parse(updated.tags) };
  }

  async updateWorkerCallback(id: string, callbackUrl?: string) {
    const worker = await this.prisma.worker.findUnique({ where: { id } });
    if (!worker) throw new NotFoundException('worker not found');

    const updated = await this.prisma.worker.update({
      where: { id },
      data: { callbackUrl: callbackUrl || null },
    });

    return { ...updated, tags: JSON.parse(updated.tags) };
  }

  async workerReport(dto: WorkerReportDto, agent: AgentContext) {
    if (!ALL_TASK_STATUSES.includes(dto.status)) {
      throw new BadRequestException(`invalid status: ${dto.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: dto.taskId } });
      if (!task) throw new NotFoundException('task not found');

      if (dto.status === 'InProgress') {
        const deps: string[] = JSON.parse(task.dependsOn);
        if (deps.length > 0) {
          const resolvedTasks = await tx.task.findMany({
            where: { id: { in: deps }, status: 'Done' },
            select: { id: true },
          });
          const resolvedIds = new Set(resolvedTasks.map((t) => t.id));
          const unresolved = deps.filter((d) => !resolvedIds.has(d));
          if (unresolved.length > 0) {
            throw new ConflictException({
              message: 'dependency not resolved',
              data: { unresolvedDependsOn: unresolved },
            });
          }
        }
      }

      const updated = await tx.task.update({
        where: { id: dto.taskId },
        data: {
          status: dto.status,
          note: dto.note || task.note,
          artifacts: dto.artifacts ? JSON.stringify(dto.artifacts) : task.artifacts,
        },
      });

      await this.eventStore.append(
        'WorkerReported',
        {
          taskId: task.id,
          status: dto.status,
          note: updated.note,
          artifacts: dto.artifacts,
        },
        agent.id,
        agent.role,
        tx,
      );

      return {
        ...updated,
        dependsOn: JSON.parse(updated.dependsOn),
        artifacts: updated.artifacts ? JSON.parse(updated.artifacts) : null,
      };
    });
  }
}
