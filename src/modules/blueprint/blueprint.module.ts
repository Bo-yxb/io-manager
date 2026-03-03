import { Module } from '@nestjs/common';
import { BlueprintController } from './blueprint.controller';
import { BlueprintService } from './blueprint.service';
import { DecomposeService } from './decompose.service';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Module({
  imports: [OrchestratorModule],
  controllers: [BlueprintController],
  providers: [BlueprintService, DecomposeService],
  exports: [BlueprintService],
})
export class BlueprintModule {}
