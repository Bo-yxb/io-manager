import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentAgent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().agent,
);
