import { Module } from '@nestjs/common';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';
import { AutoAssignService } from './auto-assign.service';

@Module({
  controllers: [OrchestratorController],
  providers: [OrchestratorService, AutoAssignService],
  exports: [AutoAssignService],
})
export class OrchestratorModule {}
