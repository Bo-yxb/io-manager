import { EscalationService } from '../../../src/modules/orchestrator/escalation.service';

describe('EscalationService', () => {
  let service: EscalationService;
  let mockPrisma: any;
  let mockEventStore: any;
  let mockSseService: any;
  let mockWebhookService: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockEventStore = {
      append: jest.fn().mockResolvedValue({}),
    };
    mockSseService = {
      emit: jest.fn(),
    };
    mockWebhookService = {
      notifyPmEscalation: jest.fn().mockResolvedValue(undefined),
    };
    mockConfig = {
      get: jest.fn((key: string, defaultVal?: string) => {
        if (key === 'ESCALATION_SCAN_INTERVAL_MS') return '120000';
        return defaultVal ?? '';
      }),
    };

    service = new EscalationService(
      mockPrisma,
      mockEventStore,
      mockSseService,
      mockWebhookService,
      mockConfig,
    );
  });

  it('does nothing when no timed-out tasks', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);

    const count = await service.scanAndEscalate();
    expect(count).toBe(0);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
    expect(mockEventStore.append).not.toHaveBeenCalled();
  });

  it('changes InProgress timed-out task to Blocked', async () => {
    const task = {
      id: 't1',
      title: 'Test Task',
      projectId: 'p1',
      assignee: 'worker1',
      status: 'InProgress',
      timeoutAt: new Date(Date.now() - 60000),
      escalatedAt: null,
    };
    mockPrisma.task.findMany.mockResolvedValue([task]);

    const count = await service.scanAndEscalate();

    expect(count).toBe(1);
    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({
        status: 'Blocked',
        escalatedAt: expect.any(Date),
      }),
    });
  });

  it('does not change status of already Blocked task', async () => {
    const task = {
      id: 't2',
      title: 'Blocked Task',
      projectId: 'p1',
      assignee: 'worker1',
      status: 'Blocked',
      timeoutAt: new Date(Date.now() - 60000),
      escalatedAt: null,
    };
    mockPrisma.task.findMany.mockResolvedValue([task]);

    await service.scanAndEscalate();

    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: 't2' },
      data: { escalatedAt: expect.any(Date) },
    });
  });

  it('records TaskEscalated event', async () => {
    const task = {
      id: 't1',
      title: 'Test',
      projectId: 'p1',
      assignee: 'w1',
      status: 'InProgress',
      timeoutAt: new Date(Date.now() - 60000),
      escalatedAt: null,
    };
    mockPrisma.task.findMany.mockResolvedValue([task]);

    await service.scanAndEscalate();

    expect(mockEventStore.append).toHaveBeenCalledWith(
      'TaskEscalated',
      expect.objectContaining({
        taskId: 't1',
        escalationType: 'timeout_blocked',
      }),
      'system',
      'system',
    );
  });

  it('emits SSE event for escalated task', async () => {
    const task = {
      id: 't1',
      title: 'Test',
      projectId: 'p1',
      assignee: 'w1',
      status: 'InProgress',
      timeoutAt: new Date(Date.now() - 60000),
      escalatedAt: null,
    };
    mockPrisma.task.findMany.mockResolvedValue([task]);

    await service.scanAndEscalate();

    expect(mockSseService.emit).toHaveBeenCalledWith(
      'task_escalated',
      expect.objectContaining({
        taskId: 't1',
        escalationType: 'timeout_blocked',
      }),
    );
  });

  it('notifies PM via webhook', async () => {
    const task = {
      id: 't1',
      title: 'Test',
      projectId: 'p1',
      assignee: 'w1',
      status: 'InProgress',
      timeoutAt: new Date(Date.now() - 60000),
      escalatedAt: null,
    };
    mockPrisma.task.findMany.mockResolvedValue([task]);

    await service.scanAndEscalate();

    expect(mockWebhookService.notifyPmEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      'timeout_blocked',
    );
  });

  it('skips already-escalated tasks', async () => {
    const task = {
      id: 't1',
      title: 'Test',
      projectId: 'p1',
      assignee: 'w1',
      status: 'InProgress',
      timeoutAt: new Date(Date.now() - 60000),
      escalatedAt: new Date(Date.now() - 30000), // escalated AFTER timeout
    };
    mockPrisma.task.findMany.mockResolvedValue([task]);

    const count = await service.scanAndEscalate();
    expect(count).toBe(0);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });

  it('re-escalates Blocked tasks after re-escalation window', async () => {
    const task = {
      id: 't1',
      title: 'Stuck Blocked',
      projectId: 'p1',
      assignee: 'w1',
      status: 'Blocked',
      timeoutAt: new Date(Date.now() - 900000), // 15 min ago
      escalatedAt: new Date(Date.now() - 700000), // 11+ min ago (> 5 * 120s = 600s)
    };
    mockPrisma.task.findMany.mockResolvedValue([task]);

    const count = await service.scanAndEscalate();

    expect(count).toBe(1);
    expect(mockEventStore.append).toHaveBeenCalledWith(
      'TaskEscalated',
      expect.objectContaining({ escalationType: 'timeout_escalated' }),
      'system',
      'system',
    );
  });

  it('handles multiple tasks in one scan', async () => {
    const tasks = [
      {
        id: 't1', title: 'A', projectId: 'p1', assignee: 'w1',
        status: 'InProgress', timeoutAt: new Date(Date.now() - 60000), escalatedAt: null,
      },
      {
        id: 't2', title: 'B', projectId: 'p1', assignee: 'w2',
        status: 'Blocked', timeoutAt: new Date(Date.now() - 60000), escalatedAt: null,
      },
    ];
    mockPrisma.task.findMany.mockResolvedValue(tasks);

    const count = await service.scanAndEscalate();

    expect(count).toBe(2);
    expect(mockPrisma.task.update).toHaveBeenCalledTimes(2);
    expect(mockEventStore.append).toHaveBeenCalledTimes(2);
    expect(mockSseService.emit).toHaveBeenCalledTimes(2);
  });
});
