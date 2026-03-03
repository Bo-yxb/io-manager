import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentAgent } from '../../core/decorators/current-agent.decorator';
import { BlueprintService } from './blueprint.service';
import { AutoAssignService } from '../orchestrator/auto-assign.service';
import { WebhookService } from '../orchestrator/webhook.service';
import { CreateBlueprintDto } from './dto/create-blueprint.dto';
import { UpdateBlueprintDto } from './dto/update-blueprint.dto';
import { CreateBlueprintNodeDto } from './dto/create-blueprint-node.dto';
import { UpdateBlueprintNodeDto } from './dto/update-blueprint-node.dto';
import { MaterializeBlueprintDto } from './dto/materialize-blueprint.dto';
import { AgentContext } from '../../shared/interfaces/agent-context.interface';

@Controller()
export class BlueprintController {
  constructor(
    private readonly blueprintService: BlueprintService,
    private readonly autoAssignService: AutoAssignService,
    private readonly webhookService: WebhookService,
  ) {}

  // --- Templates (existing) ---

  @Get('templates')
  @Roles('boss', 'pm')
  findAllTemplates() {
    return this.blueprintService.findAllTemplates();
  }

  // --- Blueprint CRUD ---

  @Post('blueprints')
  @Roles('boss', 'pm')
  create(@Body() dto: CreateBlueprintDto, @CurrentAgent() agent: AgentContext) {
    return this.blueprintService.create(dto, agent);
  }

  @Get('blueprints')
  @Roles('boss', 'pm')
  findAll(@Query('projectId') projectId?: string) {
    return this.blueprintService.findAll(projectId);
  }

  @Get('blueprints/:id')
  @Roles('boss', 'pm')
  findOne(@Param('id') id: string) {
    return this.blueprintService.findOne(id);
  }

  @Patch('blueprints/:id')
  @Roles('boss', 'pm')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBlueprintDto,
    @CurrentAgent() agent: AgentContext,
  ) {
    return this.blueprintService.update(id, dto, agent);
  }

  @Post('blueprints/:id/decompose')
  @Roles('boss', 'pm')
  redecompose(@Param('id') id: string, @CurrentAgent() agent: AgentContext) {
    return this.blueprintService.redecompose(id, agent);
  }

  // --- Node CRUD ---

  @Post('blueprints/:id/nodes')
  @Roles('boss', 'pm')
  addNode(
    @Param('id') id: string,
    @Body() dto: CreateBlueprintNodeDto,
    @CurrentAgent() agent: AgentContext,
  ) {
    return this.blueprintService.addNode(id, dto, agent);
  }

  @Patch('blueprints/:id/nodes/:nodeId')
  @Roles('boss', 'pm')
  updateNode(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateBlueprintNodeDto,
    @CurrentAgent() agent: AgentContext,
  ) {
    return this.blueprintService.updateNode(id, nodeId, dto, agent);
  }

  @Delete('blueprints/:id/nodes/:nodeId')
  @Roles('boss', 'pm')
  deleteNode(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @CurrentAgent() agent: AgentContext,
  ) {
    return this.blueprintService.deleteNode(id, nodeId, agent);
  }

  // --- Materialize ---

  @Post('blueprints/:id/materialize')
  @Roles('boss', 'pm')
  async materialize(
    @Param('id') id: string,
    @Body() dto: MaterializeBlueprintDto,
    @CurrentAgent() agent: AgentContext,
  ) {
    const result = await this.blueprintService.materialize(
      id,
      dto,
      agent,
      (type) => this.autoAssignService.assignWorker(type),
    );

    for (const task of result.tasksCreated) {
      if (task.assignee && task.assignee !== 'unassigned') {
        this.webhookService.notifyTaskAssigned(task.assignee, task);
      }
    }

    return result;
  }
}
