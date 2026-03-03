import { Module, forwardRef } from '@nestjs/common';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';
import { TaskStateMachineService } from './state-machine/task-state-machine.service';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Module({
  imports: [forwardRef(() => OrchestratorModule)],
  controllers: [KanbanController],
  providers: [KanbanService, TaskStateMachineService],
  exports: [KanbanService],
})
export class KanbanModule {}
