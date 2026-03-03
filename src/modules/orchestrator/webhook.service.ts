import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventStoreService } from '../../infrastructure/event-store/event-store.service';

export interface WebhookPayload {
  event: string;
  data: Record<string, any>;
  timestamp: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private eventStore: EventStoreService,
  ) {
    this.maxRetries = Number(this.config.get('WEBHOOK_MAX_RETRIES', '3'));
    this.timeoutMs = Number(this.config.get('WEBHOOK_TIMEOUT_MS', '5000'));
  }

  async deliver(
    url: string,
    payload: WebhookPayload,
    actorId: string,
    actorRole: string,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          await this.eventStore.append(
            'WebhookDelivered',
            { url, event: payload.event, attempt, statusCode: response.status },
            actorId,
            actorRole,
          );
          return true;
        }

        this.logger.warn(
          `Webhook ${url} returned ${response.status}, attempt ${attempt}/${this.maxRetries}`,
        );
      } catch (err) {
        this.logger.warn(
          `Webhook ${url} failed, attempt ${attempt}/${this.maxRetries}: ${err.message}`,
        );
      }

      if (attempt < this.maxRetries) {
        await this.sleep(1000 * Math.pow(2, attempt - 1));
      }
    }

    await this.eventStore.append(
      'WebhookFailed',
      { url, event: payload.event, maxRetries: this.maxRetries },
      actorId,
      actorRole,
    );
    return false;
  }

  async notifyTaskAssigned(
    workerId: string,
    task: { id: string; title: string; projectId: string; type: string; status: string },
  ): Promise<void> {
    const worker = await this.prisma.worker.findUnique({ where: { id: workerId } });
    if (!worker?.callbackUrl) {
      this.logger.debug(`Worker ${workerId} has no callbackUrl, skipping webhook`);
      return;
    }

    const payload: WebhookPayload = {
      event: 'task_assigned',
      data: { task },
      timestamp: new Date().toISOString(),
    };

    this.deliver(worker.callbackUrl, payload, 'system', 'system').catch((err) =>
      this.logger.error(`notifyTaskAssigned failed: ${err.message}`),
    );
  }

  async notifyPmEscalation(
    task: { id: string; title: string; projectId: string; assignee: string; status: string },
    escalationType: 'timeout_blocked' | 'timeout_escalated',
  ): Promise<void> {
    const pmUrl = this.config.get<string>('PM_CALLBACK_URL');
    if (!pmUrl) {
      this.logger.debug('PM_CALLBACK_URL not set, skipping PM webhook');
      return;
    }

    const payload: WebhookPayload = {
      event: 'task_escalated',
      data: { task, escalationType },
      timestamp: new Date().toISOString(),
    };

    this.deliver(pmUrl, payload, 'system', 'system').catch((err) =>
      this.logger.error(`notifyPmEscalation failed: ${err.message}`),
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
