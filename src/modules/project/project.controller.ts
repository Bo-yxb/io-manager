import { Controller, Get, Post, Body } from '@nestjs/common';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentAgent } from '../../core/decorators/current-agent.decorator';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AgentContext } from '../../shared/interfaces/agent-context.interface';

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @Roles('boss', 'pm', 'worker')
  findAll() {
    return this.projectService.findAll();
  }

  @Post()
  @Roles('boss', 'pm')
  create(@Body() dto: CreateProjectDto, @CurrentAgent() agent: AgentContext) {
    return this.projectService.create(dto, agent);
  }
}
