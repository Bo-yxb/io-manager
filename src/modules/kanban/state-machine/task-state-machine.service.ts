import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TASK_STATUS_TRANSITIONS, ALL_TASK_STATUSES } from './task-state-machine';

@Injectable()
export class TaskStateMachineService {
  private strict: boolean;

  constructor(config: ConfigService) {
    this.strict = config.get('STRICT_STATE_MACHINE', 'false') === 'true';
  }

  validate(currentStatus: string, targetStatus: string): void {
    if (!ALL_TASK_STATUSES.includes(targetStatus)) {
      throw new BadRequestException(`invalid status: ${targetStatus}`);
    }

    if (this.strict) {
      const allowed = TASK_STATUS_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(targetStatus)) {
        throw new BadRequestException(
          `invalid transition: ${currentStatus} -> ${targetStatus}. allowed: ${allowed?.join(', ') || 'none'}`,
        );
      }
    }
  }
}
