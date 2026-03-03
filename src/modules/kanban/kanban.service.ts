import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventStoreService } from '../../infrastructure/event-store/event-store.service';
import { TaskStateMachineService } from './state-machine/task-state-machine.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTasksBatchDto } from './dto/create-tasks-batch.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { AgentContext } from '../../shared/interfaces/agent-context.interface';
import { Task } from '@prisma/client';

@Injectable()
export class KanbanService {
  constructor(
    private prisma: PrismaService,
    private eventStore: EventStoreService,
    private stateMachine: TaskStateMachineService,
  ) {}

  private serializeTask(task: Task) {
    return {
      ...task,
      dependsOn: JSON.parse(task.dependsOn),
      artifacts: task.artifacts ? JSON.parse(task.artifacts) : null,
    };
  }

  async findAll(projectId?: string) {
    const where = projectId ? { projectId } : {};
    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((t) => this.serializeTask(t));
  }

  async create(dto: CreateTaskDto, agent: AgentContext, assignWorker?: (type: string) => Promise<string>) {
    let finalAssignee = dto.assignee || 'unassigned';
    if (dto.autoAssign && finalAssignee === 'unassigned' && assignWorker) {
      finalAssignee = await assignWorker(dto.type || 'Task');
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          projectId: dto.projectId,
          title: dto.title,
          assignee: finalAssignee,
          type: dto.type || 'Task',
          dependsOn: JSON.stringify(dto.dependsOn || []),
          status: 'Backlog',
          timeoutAt: new Date(Date.now() + (dto.timeoutMinutes || 60) * 60 * 1000),
        },
      });

      await this.eventStore.append(
        'TaskCreated',
        { taskId: task.id },
        agent.id,
        agent.role,
        tx,
      );

      return this.serializeTask(task);
    });
  }

  async createBatch(dto: CreateTasksBatchDto, agent: AgentContext, assignWorker?: (type: string) => Promise<string>) {
    return this.prisma.$transaction(async (tx) => {
      const created = [];

      for (const t of dto.tasks) {
        let finalAssignee = t.assignee || 'unassigned';
        if (dto.autoAssign && finalAssignee === 'unassigned' && assignWorker) {
          finalAssignee = await assignWorker(t.type || 'Task');
        }

        const task = await tx.task.create({
          data: {
            projectId: dto.projectId,
            title: t.title,
            assignee: finalAssignee,
            type: t.type || 'Task',
            dependsOn: JSON.stringify(t.dependsOn || []),
            status: 'Backlog',
            timeoutAt: new Date(Date.now() + (t.timeoutMinutes || 60) * 60 * 1000),
          },
        });
        created.push(task);
      }

      await this.eventStore.append(
        'TasksBatchCreated',
        { projectId: dto.projectId, count: created.length },
        agent.id,
        agent.role,
        tx,
      );

      return created.map((t) => this.serializeTask(t));
    });
  }

  async updateStatus(id: string, dto: UpdateTaskStatusDto, agent: AgentContext) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id } });
      if (!task) throw new NotFoundException('task not found');

      this.stateMachine.validate(task.status, dto.status);

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
        where: { id },
        data: {
          status: dto.status,
          note: dto.note || task.note,
        },
      });

      await this.eventStore.append(
        'TaskStatusChanged',
        { taskId: id, status: dto.status, note: updated.note },
        agent.id,
        agent.role,
        tx,
      );

      return this.serializeTask(updated);
    });
  }

  async computeAlerts() {
    const now = new Date();

    const [blocked, timedOut] = await Promise.all([
      this.prisma.task.findMany({
        where: { status: 'Blocked' },
        select: { id: true, title: true, assignee: true, note: true },
      }),
      this.prisma.task.findMany({
        where: {
          status: { in: ['InProgress', 'Blocked'] },
          timeoutAt: { lt: now },
        },
        select: { id: true, title: true, assignee: true, timeoutAt: true },
      }),
    ]);

    return [
      ...blocked.map((t) => ({
        taskId: t.id,
        title: t.title,
        type: 'blocked',
        assignee: t.assignee,
        note: t.note || '未填写阻塞原因',
      })),
      ...timedOut.map((t) => ({
        taskId: t.id,
        title: t.title,
        type: 'timeout',
        assignee: t.assignee,
        note: `任务超时: ${t.timeoutAt?.toISOString()}`,
      })),
    ];
  }
}
