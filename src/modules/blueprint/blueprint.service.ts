import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventStoreService } from '../../infrastructure/event-store/event-store.service';
import { SseService } from '../../infrastructure/sse/sse.service';
import { DecomposeService, DecomposedNode } from './decompose.service';
import { CreateBlueprintDto } from './dto/create-blueprint.dto';
import { UpdateBlueprintDto } from './dto/update-blueprint.dto';
import { CreateBlueprintNodeDto } from './dto/create-blueprint-node.dto';
import { UpdateBlueprintNodeDto } from './dto/update-blueprint-node.dto';
import { MaterializeBlueprintDto } from './dto/materialize-blueprint.dto';
import { AgentContext } from '../../shared/interfaces/agent-context.interface';
import { Blueprint, BlueprintNode } from '@prisma/client';

@Injectable()
export class BlueprintService {
  constructor(
    private prisma: PrismaService,
    private eventStore: EventStoreService,
    private sseService: SseService,
    private decomposeService: DecomposeService,
  ) {}

  private serializeBlueprint(bp: Blueprint & { nodes?: BlueprintNode[] }) {
    const result: any = { ...bp };
    if (bp.nodes) {
      result.nodes = bp.nodes.map((n) => ({
        ...n,
        dependsOn: JSON.parse(n.dependsOn),
      }));
    }
    return result;
  }

  async findAll(projectId?: string) {
    const where = projectId ? { projectId } : {};
    const blueprints = await this.prisma.blueprint.findMany({
      where,
      include: { nodes: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return blueprints.map((bp) => this.serializeBlueprint(bp));
  }

  async findOne(id: string) {
    const bp = await this.prisma.blueprint.findUnique({
      where: { id },
      include: { nodes: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!bp) throw new NotFoundException('blueprint not found');
    return this.serializeBlueprint(bp);
  }

  async create(dto: CreateBlueprintDto, agent: AgentContext) {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('project not found');

      const title = dto.title || project.name + ' - 蓝图';

      const blueprint = await tx.blueprint.create({
        data: {
          projectId: dto.projectId,
          title,
          requirement: dto.requirement,
          status: 'Draft',
          version: 1,
        },
      });

      const decomposed = this.decomposeService.decompose(dto.requirement);
      const nodes = await this.createNodesFromDecomposed(tx, blueprint.id, decomposed);

      await this.eventStore.append(
        'BlueprintCreated',
        { blueprintId: blueprint.id, projectId: dto.projectId, nodeCount: nodes.length },
        agent.id,
        agent.role,
        tx,
      );

      const full = await tx.blueprint.findUnique({
        where: { id: blueprint.id },
        include: { nodes: { orderBy: { sortOrder: 'asc' } } },
      });

      this.sseService.emit('BlueprintCreated', { blueprintId: blueprint.id });

      return this.serializeBlueprint(full!);
    });
  }

  async update(id: string, dto: UpdateBlueprintDto, agent: AgentContext) {
    return this.prisma.$transaction(async (tx) => {
      const bp = await tx.blueprint.findUnique({ where: { id } });
      if (!bp) throw new NotFoundException('blueprint not found');

      if (bp.status === 'Materialized') {
        throw new BadRequestException('cannot update a materialized blueprint');
      }

      if (dto.status) {
        const validTransitions: Record<string, string[]> = {
          Draft: ['Review', 'Approved'],
          Review: ['Draft', 'Approved'],
          Approved: ['Draft', 'Review'],
        };
        const allowed = validTransitions[bp.status] || [];
        if (!allowed.includes(dto.status)) {
          throw new BadRequestException(
            `cannot transition from ${bp.status} to ${dto.status}`,
          );
        }
      }

      const data: any = {};
      if (dto.title) data.title = dto.title;
      if (dto.status) data.status = dto.status;
      if (dto.status || dto.title) data.version = bp.version + 1;

      const updated = await tx.blueprint.update({
        where: { id },
        data,
        include: { nodes: { orderBy: { sortOrder: 'asc' } } },
      });

      await this.eventStore.append(
        'BlueprintUpdated',
        { blueprintId: id, changes: dto },
        agent.id,
        agent.role,
        tx,
      );

      this.sseService.emit('BlueprintUpdated', { blueprintId: id });

      return this.serializeBlueprint(updated);
    });
  }

  async redecompose(id: string, agent: AgentContext) {
    return this.prisma.$transaction(async (tx) => {
      const bp = await tx.blueprint.findUnique({ where: { id } });
      if (!bp) throw new NotFoundException('blueprint not found');

      if (bp.status === 'Materialized') {
        throw new BadRequestException('cannot redecompose a materialized blueprint');
      }

      await tx.blueprintNode.deleteMany({ where: { blueprintId: id } });

      const decomposed = this.decomposeService.decompose(bp.requirement);
      const nodes = await this.createNodesFromDecomposed(tx, id, decomposed);

      await tx.blueprint.update({
        where: { id },
        data: { version: bp.version + 1, status: 'Draft' },
      });

      await this.eventStore.append(
        'BlueprintRedecomposed',
        { blueprintId: id, nodeCount: nodes.length },
        agent.id,
        agent.role,
        tx,
      );

      const full = await tx.blueprint.findUnique({
        where: { id },
        include: { nodes: { orderBy: { sortOrder: 'asc' } } },
      });

      this.sseService.emit('BlueprintUpdated', { blueprintId: id });

      return this.serializeBlueprint(full!);
    });
  }

  // --- Node CRUD ---

  async addNode(blueprintId: string, dto: CreateBlueprintNodeDto, agent: AgentContext) {
    return this.prisma.$transaction(async (tx) => {
      const bp = await tx.blueprint.findUnique({ where: { id: blueprintId } });
      if (!bp) throw new NotFoundException('blueprint not found');
      if (bp.status === 'Materialized') {
        throw new BadRequestException('cannot modify a materialized blueprint');
      }

      const node = await tx.blueprintNode.create({
        data: {
          blueprintId,
          parentId: dto.parentId || null,
          level: dto.level,
          title: dto.title,
          description: dto.description || '',
          taskType: dto.taskType || 'Task',
          assignee: dto.assignee || null,
          timeoutMin: dto.timeoutMin || 60,
          dependsOn: JSON.stringify(dto.dependsOn || []),
          sortOrder: dto.sortOrder || 0,
        },
      });

      await tx.blueprint.update({
        where: { id: blueprintId },
        data: { version: bp.version + 1 },
      });

      await this.eventStore.append(
        'BlueprintNodeAdded',
        { blueprintId, nodeId: node.id },
        agent.id,
        agent.role,
        tx,
      );

      return { ...node, dependsOn: JSON.parse(node.dependsOn) };
    });
  }

  async updateNode(
    blueprintId: string,
    nodeId: string,
    dto: UpdateBlueprintNodeDto,
    agent: AgentContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const bp = await tx.blueprint.findUnique({ where: { id: blueprintId } });
      if (!bp) throw new NotFoundException('blueprint not found');
      if (bp.status === 'Materialized') {
        throw new BadRequestException('cannot modify a materialized blueprint');
      }

      const node = await tx.blueprintNode.findFirst({
        where: { id: nodeId, blueprintId },
      });
      if (!node) throw new NotFoundException('node not found');

      const data: any = {};
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.taskType !== undefined) data.taskType = dto.taskType;
      if (dto.assignee !== undefined) data.assignee = dto.assignee || null;
      if (dto.timeoutMin !== undefined) data.timeoutMin = dto.timeoutMin;
      if (dto.dependsOn !== undefined) data.dependsOn = JSON.stringify(dto.dependsOn);
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

      const updated = await tx.blueprintNode.update({
        where: { id: nodeId },
        data,
      });

      await tx.blueprint.update({
        where: { id: blueprintId },
        data: { version: bp.version + 1 },
      });

      await this.eventStore.append(
        'BlueprintNodeUpdated',
        { blueprintId, nodeId },
        agent.id,
        agent.role,
        tx,
      );

      return { ...updated, dependsOn: JSON.parse(updated.dependsOn) };
    });
  }

  async deleteNode(blueprintId: string, nodeId: string, agent: AgentContext) {
    return this.prisma.$transaction(async (tx) => {
      const bp = await tx.blueprint.findUnique({ where: { id: blueprintId } });
      if (!bp) throw new NotFoundException('blueprint not found');
      if (bp.status === 'Materialized') {
        throw new BadRequestException('cannot modify a materialized blueprint');
      }

      const node = await tx.blueprintNode.findFirst({
        where: { id: nodeId, blueprintId },
      });
      if (!node) throw new NotFoundException('node not found');

      await this.deleteNodeAndChildren(tx, blueprintId, nodeId);

      await tx.blueprint.update({
        where: { id: blueprintId },
        data: { version: bp.version + 1 },
      });

      await this.eventStore.append(
        'BlueprintNodeDeleted',
        { blueprintId, nodeId },
        agent.id,
        agent.role,
        tx,
      );

      return { deleted: true };
    });
  }

  // --- Materialize ---

  async materialize(
    id: string,
    dto: MaterializeBlueprintDto,
    agent: AgentContext,
    assignWorker?: (type: string) => Promise<string>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const bp = await tx.blueprint.findUnique({
        where: { id },
        include: { nodes: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!bp) throw new NotFoundException('blueprint not found');

      if (bp.status !== 'Approved') {
        throw new BadRequestException(
          'blueprint must be Approved before materialization',
        );
      }

      const taskNodes = bp.nodes.filter((n) => n.level === 'task');
      if (taskNodes.length === 0) {
        throw new BadRequestException('blueprint has no task-level nodes to materialize');
      }

      const nodeToTaskId = new Map<string, string>();
      const createdTasks = [];

      for (const node of taskNodes) {
        let finalAssignee = node.assignee || 'unassigned';

        if (dto.autoAssign && finalAssignee === 'unassigned' && assignWorker) {
          finalAssignee = await assignWorker(node.taskType || 'Task');
        }

        const nodeDeps: string[] = JSON.parse(node.dependsOn);
        const taskDeps = nodeDeps
          .map((depNodeId) => nodeToTaskId.get(depNodeId))
          .filter(Boolean) as string[];

        const task = await tx.task.create({
          data: {
            projectId: bp.projectId,
            title: node.title,
            assignee: finalAssignee,
            type: node.taskType || 'Task',
            dependsOn: JSON.stringify(taskDeps),
            status: 'Backlog',
            note: node.description || '',
            timeoutAt: new Date(Date.now() + (node.timeoutMin || 60) * 60 * 1000),
          },
        });

        nodeToTaskId.set(node.id, task.id);
        createdTasks.push(task);
      }

      await tx.blueprint.update({
        where: { id },
        data: { status: 'Materialized', version: bp.version + 1 },
      });

      await this.eventStore.append(
        'BlueprintMaterialized',
        {
          blueprintId: id,
          projectId: bp.projectId,
          taskCount: createdTasks.length,
          taskIds: createdTasks.map((t) => t.id),
        },
        agent.id,
        agent.role,
        tx,
      );

      this.sseService.emit('BlueprintMaterialized', {
        blueprintId: id,
        taskCount: createdTasks.length,
      });

      return {
        blueprint: { id: bp.id, status: 'Materialized' },
        tasksCreated: createdTasks.map((t) => ({
          ...t,
          dependsOn: JSON.parse(t.dependsOn),
          artifacts: t.artifacts ? JSON.parse(t.artifacts) : null,
        })),
      };
    });
  }

  // --- Templates (keep existing) ---

  async findAllTemplates() {
    const templates = await this.prisma.template.findMany();
    return templates.map((t) => ({
      ...t,
      tags: JSON.parse(t.tags),
    }));
  }

  // --- Private helpers ---

  private async createNodesFromDecomposed(
    tx: any,
    blueprintId: string,
    decomposed: DecomposedNode[],
  ) {
    const createdNodes: { id: string }[] = [];

    for (const node of decomposed) {
      const parentId =
        node.parentIndex !== null ? createdNodes[node.parentIndex]?.id || null : null;

      const created = await tx.blueprintNode.create({
        data: {
          blueprintId,
          parentId,
          level: node.level,
          title: node.title,
          description: node.description,
          taskType: node.taskType,
          sortOrder: node.sortOrder,
          dependsOn: '[]',
        },
      });
      createdNodes.push(created);
    }

    return createdNodes;
  }

  private async deleteNodeAndChildren(
    tx: any,
    blueprintId: string,
    nodeId: string,
  ) {
    const children = await tx.blueprintNode.findMany({
      where: { blueprintId, parentId: nodeId },
      select: { id: true },
    });

    for (const child of children) {
      await this.deleteNodeAndChildren(tx, blueprintId, child.id);
    }

    await tx.blueprintNode.delete({ where: { id: nodeId } });
  }
}
