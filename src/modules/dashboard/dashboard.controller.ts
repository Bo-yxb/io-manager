import { Controller, Get, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Roles } from '../../core/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { SseService } from './sse/sse.service';

@Controller()
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly sseService: SseService,
  ) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'io-manager-api',
      version: '2.0.0',
      time: new Date().toISOString(),
    };
  }

  @Get('dashboard/overview')
  @Roles('boss', 'pm', 'worker')
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('audit/logs')
  @Roles('boss', 'pm')
  getAuditLogs(@Query('limit') limit?: string) {
    return this.dashboardService.getAuditLogs(limit ? Number(limit) : 100);
  }

  @Sse('dashboard/stream')
  @Roles('boss', 'pm', 'worker')
  stream(@Query('events') events?: string): Observable<MessageEvent> {
    const eventTypes = events ? events.split(',') : undefined;
    return this.sseService.stream(eventTypes);
  }
}
