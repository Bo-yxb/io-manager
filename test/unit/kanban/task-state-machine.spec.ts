import { TASK_STATUS_TRANSITIONS, ALL_TASK_STATUSES } from '../../../src/modules/kanban/state-machine/task-state-machine';

describe('TaskStateMachine', () => {
  it('should define all 6 statuses', () => {
    expect(ALL_TASK_STATUSES).toEqual([
      'Triage', 'Backlog', 'InProgress', 'Blocked', 'Review', 'Done',
    ]);
  });

  it('Triage can only go to Backlog', () => {
    expect(TASK_STATUS_TRANSITIONS['Triage']).toEqual(['Backlog']);
  });

  it('Backlog can go to InProgress, Blocked, Triage', () => {
    expect(TASK_STATUS_TRANSITIONS['Backlog']).toEqual(['InProgress', 'Blocked', 'Triage']);
  });

  it('InProgress can go to Blocked, Review, Done', () => {
    expect(TASK_STATUS_TRANSITIONS['InProgress']).toEqual(['Blocked', 'Review', 'Done']);
  });

  it('Blocked can go to InProgress, Backlog, Triage', () => {
    expect(TASK_STATUS_TRANSITIONS['Blocked']).toEqual(['InProgress', 'Backlog', 'Triage']);
  });

  it('Review can go to Done or back to InProgress', () => {
    expect(TASK_STATUS_TRANSITIONS['Review']).toEqual(['Done', 'InProgress']);
  });

  it('Done is terminal', () => {
    expect(TASK_STATUS_TRANSITIONS['Done']).toEqual([]);
  });
});
