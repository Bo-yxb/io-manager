import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventStoreService } from '../../infrastructure/event-store/event-store.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AgentContext } from '../../shared/interfaces/agent-context.interface';

@Injectable()
export class ProjectService {
  constructor(
    private prisma: PrismaService,
    private eventStore: EventStoreService,
  ) {}

  async findAll() {
    return this.prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateProjectDto, agent: AgentContext) {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          goal: dto.goal,
          owner: dto.owner || 'boss',
          status: 'Active',
        },
      });

      await this.eventStore.append(
        'ProjectCreated',
        { projectId: project.id },
        agent.id,
        agent.role,
        tx,
      );

      return project;
    });
  }
}
