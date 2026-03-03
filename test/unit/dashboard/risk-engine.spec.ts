import { RiskEngineService } from '../../../src/modules/dashboard/risk-engine.service';

describe('RiskEngineService', () => {
  let service: RiskEngineService;

  beforeEach(() => {
    service = new RiskEngineService();
  });

  it('returns no-risk message when empty', () => {
    expect(service.generateRiskSummary([])).toBe('暂无风险，项目推进顺利');
  });

  it('summarizes blocked tasks', () => {
    const risks = [
      { type: 'blocked', assignee: 'Alice', title: 'T1', note: '' },
      { type: 'blocked', assignee: 'Bob', title: 'T2', note: '' },
    ];
    const summary = service.generateRiskSummary(risks);
    expect(summary).toContain('2个任务被阻塞');
    expect(summary).toContain('Alice');
    expect(summary).toContain('Bob');
  });

  it('summarizes timeout tasks', () => {
    const risks = [
      { type: 'timeout', assignee: 'Charlie', title: 'T3', note: '' },
    ];
    const summary = service.generateRiskSummary(risks);
    expect(summary).toContain('1个任务超时');
    expect(summary).toContain('Charlie');
  });

  it('summarizes mixed risks', () => {
    const risks = [
      { type: 'blocked', assignee: 'Alice', title: 'T1', note: '' },
      { type: 'timeout', assignee: 'Alice', title: 'T2', note: '' },
    ];
    const summary = service.generateRiskSummary(risks);
    expect(summary).toContain('1个任务被阻塞');
    expect(summary).toContain('1个任务超时');
    expect(summary).toContain('Alice');
  });

  it('deduplicates assignees', () => {
    const risks = [
      { type: 'blocked', assignee: 'Alice', title: 'T1', note: '' },
      { type: 'timeout', assignee: 'Alice', title: 'T2', note: '' },
    ];
    const summary = service.generateRiskSummary(risks);
    const matches = summary.match(/Alice/g);
    expect(matches).toHaveLength(1);
  });
});
