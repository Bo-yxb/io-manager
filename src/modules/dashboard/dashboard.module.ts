import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { RiskEngineService } from './risk-engine.service';
import { SseService } from './sse/sse.service';
import { KanbanModule } from '../kanban/kanban.module';

@Module({
  imports: [KanbanModule],
  controllers: [DashboardController],
  providers: [DashboardService, RiskEngineService, SseService],
  exports: [SseService],
})
export class DashboardModule {}
