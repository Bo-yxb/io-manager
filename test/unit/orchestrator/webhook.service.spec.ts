import { WebhookService } from '../../../src/modules/orchestrator/webhook.service';

describe('WebhookService', () => {
  let service: WebhookService;
  let mockEventStore: any;
  let mockPrisma: any;
  let mockConfig: any;

  beforeEach(() => {
    mockEventStore = {
      append: jest.fn().mockResolvedValue({}),
    };
    mockPrisma = {
      worker: {
        findUnique: jest.fn(),
      },
    };
    mockConfig = {
      get: jest.fn((key: string, defaultVal?: string) => {
        const map: Record<string, string> = {
          WEBHOOK_MAX_RETRIES: '2',
          WEBHOOK_TIMEOUT_MS: '1000',
          PM_CALLBACK_URL: '',
        };
        return map[key] ?? defaultVal ?? '';
      }),
    };

    service = new WebhookService(mockConfig, mockPrisma, mockEventStore);
  });

  describe('deliver', () => {
    it('succeeds on first attempt and logs WebhookDelivered', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const result = await service.deliver(
        'http://localhost:9999/hook',
        { event: 'test', data: {}, timestamp: new Date().toISOString() },
        'system',
        'system',
      );

      expect(result).toBe(true);
      expect(mockEventStore.append).toHaveBeenCalledWith(
        'WebhookDelivered',
        expect.objectContaining({ event: 'test', attempt: 1, statusCode: 200 }),
        'system',
        'system',
      );

      global.fetch = originalFetch;
    });

    it('retries on failure and logs WebhookFailed after max retries', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

      const result = await service.deliver(
        'http://localhost:9999/hook',
        { event: 'test', data: {}, timestamp: new Date().toISOString() },
        'system',
        'system',
      );

      expect(result).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(2); // maxRetries=2
      expect(mockEventStore.append).toHaveBeenCalledWith(
        'WebhookFailed',
        expect.objectContaining({ event: 'test', maxRetries: 2 }),
        'system',
        'system',
      );

      global.fetch = originalFetch;
    });

    it('retries on HTTP 500 and succeeds on second attempt', async () => {
      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ ok: false, status: 500 });
        return Promise.resolve({ ok: true, status: 200 });
      });

      const result = await service.deliver(
        'http://localhost:9999/hook',
        { event: 'test', data: {}, timestamp: new Date().toISOString() },
        'system',
        'system',
      );

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockEventStore.append).toHaveBeenCalledWith(
        'WebhookDelivered',
        expect.objectContaining({ attempt: 2 }),
        'system',
        'system',
      );

      global.fetch = originalFetch;
    });
  });

  describe('notifyTaskAssigned', () => {
    it('skips when worker has no callbackUrl', async () => {
      mockPrisma.worker.findUnique.mockResolvedValue({
        id: 'w1',
        callbackUrl: null,
      });

      const deliverSpy = jest.spyOn(service, 'deliver');
      await service.notifyTaskAssigned('w1', {
        id: 't1', title: 'Test', projectId: 'p1', type: 'Task', status: 'Backlog',
      });

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it('calls deliver when worker has callbackUrl', async () => {
      mockPrisma.worker.findUnique.mockResolvedValue({
        id: 'w1',
        callbackUrl: 'http://localhost:9999/hook',
      });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      await service.notifyTaskAssigned('w1', {
        id: 't1', title: 'Test', projectId: 'p1', type: 'Task', status: 'Backlog',
      });

      // Wait a tick for fire-and-forget
      await new Promise((r) => setTimeout(r, 50));
      expect(global.fetch).toHaveBeenCalledTimes(1);

      global.fetch = originalFetch;
    });
  });

  describe('notifyPmEscalation', () => {
    it('skips when PM_CALLBACK_URL is not set', async () => {
      const deliverSpy = jest.spyOn(service, 'deliver');
      await service.notifyPmEscalation(
        { id: 't1', title: 'Test', projectId: 'p1', assignee: 'w1', status: 'Blocked' },
        'timeout_blocked',
      );

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it('calls deliver when PM_CALLBACK_URL is set', async () => {
      mockConfig.get = jest.fn((key: string, defaultVal?: string) => {
        if (key === 'PM_CALLBACK_URL') return 'http://localhost:8888/pm';
        const map: Record<string, string> = {
          WEBHOOK_MAX_RETRIES: '2',
          WEBHOOK_TIMEOUT_MS: '1000',
        };
        return map[key] ?? defaultVal ?? '';
      });
      service = new WebhookService(mockConfig, mockPrisma, mockEventStore);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      await service.notifyPmEscalation(
        { id: 't1', title: 'Test', projectId: 'p1', assignee: 'w1', status: 'InProgress' },
        'timeout_blocked',
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(global.fetch).toHaveBeenCalledTimes(1);

      global.fetch = originalFetch;
    });
  });
});
