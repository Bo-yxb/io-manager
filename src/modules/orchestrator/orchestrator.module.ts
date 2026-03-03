import { Module } from '@nestjs/common';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';
import { AutoAssignService } from './auto-assign.service';
import { WebhookService } from './webhook.service';
import { EscalationService } from './escalation.service';

@Module({
  controllers: [OrchestratorController],
  providers: [OrchestratorService, AutoAssignService, WebhookService, EscalationService],
  exports: [AutoAssignService, WebhookService],
})
export class OrchestratorModule {}
