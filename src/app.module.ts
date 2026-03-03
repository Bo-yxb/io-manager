import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { join } from 'path';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { EventStoreModule } from './infrastructure/event-store/event-store.module';
import { AgentAuthGuard } from './core/guards/agent-auth.guard';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';
import { LegacyRedirectMiddleware } from './core/middleware/legacy-redirect.middleware';
import { ProjectModule } from './modules/project/project.module';
import { BlueprintModule } from './modules/blueprint/blueprint.module';
import { KanbanModule } from './modules/kanban/kanban.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'apps', 'web'),
      serveRoot: '/',
      exclude: ['/api/(.*)'],
    }),
    PrismaModule,
    RedisModule,
    EventStoreModule,
    ProjectModule,
    BlueprintModule,
    KanbanModule,
    OrchestratorModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AgentAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LegacyRedirectMiddleware).forRoutes('*');
  }
}
