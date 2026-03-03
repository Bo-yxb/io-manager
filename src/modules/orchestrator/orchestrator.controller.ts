import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentAgent } from '../../core/decorators/current-agent.decorator';
import { OrchestratorService } from './orchestrator.service';
import { WorkerReportDto } from './dto/worker-report.dto';
import { UpdateWorkerStatusDto } from './dto/update-worker-status.dto';
import { UpdateWorkerCallbackDto } from './dto/update-worker-callback.dto';
import { AgentContext } from '../../shared/interfaces/agent-context.interface';

@Controller()
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Post('worker/report')
  @Roles('boss', 'pm', 'worker')
  report(@Body() dto: WorkerReportDto, @CurrentAgent() agent: AgentContext) {
    return this.orchestratorService.workerReport(dto, agent);
  }

  @Get('workers')
  @Roles('boss', 'pm', 'worker')
  findAllWorkers() {
    return this.orchestratorService.findAllWorkers();
  }

  @Patch('workers/:id/status')
  @Roles('boss', 'pm', 'worker')
  updateWorkerStatus(
    @Param('id') id: string,
    @Body() dto: UpdateWorkerStatusDto,
  ) {
    return this.orchestratorService.updateWorkerStatus(id, dto.status);
  }

  @Patch('workers/:id/callback')
  @Roles('boss', 'pm', 'worker')
  updateWorkerCallback(
    @Param('id') id: string,
    @Body() dto: UpdateWorkerCallbackDto,
  ) {
    return this.orchestratorService.updateWorkerCallback(id, dto.callbackUrl);
  }
}
