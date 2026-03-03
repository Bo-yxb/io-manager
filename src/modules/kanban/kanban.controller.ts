import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentAgent } from '../../core/decorators/current-agent.decorator';
import { KanbanService } from './kanban.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTasksBatchDto } from './dto/create-tasks-batch.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { AgentContext } from '../../shared/interfaces/agent-context.interface';
import { AutoAssignService } from '../orchestrator/auto-assign.service';

@Controller('tasks')
export class KanbanController {
  constructor(
    private readonly kanbanService: KanbanService,
    private readonly autoAssignService: AutoAssignService,
  ) {}

  @Get()
  @Roles('boss', 'pm', 'worker')
  findAll(@Query('projectId') projectId?: string) {
    return this.kanbanService.findAll(projectId);
  }

  @Post()
  @Roles('boss', 'pm')
  create(@Body() dto: CreateTaskDto, @CurrentAgent() agent: AgentContext) {
    return this.kanbanService.create(
      dto,
      agent,
      (type) => this.autoAssignService.assignWorker(type),
    );
  }

  @Post('batch')
  @Roles('boss', 'pm')
  createBatch(@Body() dto: CreateTasksBatchDto, @CurrentAgent() agent: AgentContext) {
    return this.kanbanService.createBatch(
      dto,
      agent,
      (type) => this.autoAssignService.assignWorker(type),
    );
  }

  @Patch(':id/status')
  @Roles('boss', 'pm', 'worker')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentAgent() agent: AgentContext,
  ) {
    return this.kanbanService.updateStatus(id, dto, agent);
  }

  @Get('alerts')
  @Roles('boss', 'pm')
  getAlerts() {
    return this.kanbanService.computeAlerts();
  }
}
