import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { RiskEngineService } from './risk-engine.service';
import { KanbanModule } from '../kanban/kanban.module';

@Module({
  imports: [KanbanModule],
  controllers: [DashboardController],
  providers: [DashboardService, RiskEngineService],
})
export class DashboardModule {}
