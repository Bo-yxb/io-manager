import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class AgentAuthGuard implements CanActivate {
  private tokenMap: Record<string, { role: string; id: string }>;

  constructor(
    private reflector: Reflector,
    private config: ConfigService,
  ) {
    this.tokenMap = {
      [this.config.get('BOSS_TOKEN', 'boss_token_7100')]: { role: 'boss', id: 'boss' },
      [this.config.get('PM_TOKEN', 'pm_token_7100')]: { role: 'pm', id: 'pm' },
      [this.config.get('WORKER_TOKEN', 'worker_token_7100')]: { role: 'worker', id: 'worker' },
    };
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-api-key'] || request.headers['x-agent-id'] || '';
    const agent = this.tokenMap[token];

    if (!agent) {
      throw new UnauthorizedException('unauthorized: missing/invalid credentials');
    }
    if (!requiredRoles.includes(agent.role)) {
      throw new ForbiddenException('forbidden');
    }

    request.agent = agent;
    return true;
  }
}
