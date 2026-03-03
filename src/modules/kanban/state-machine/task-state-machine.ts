import { createMachine } from 'xstate';

export const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  Triage: ['Backlog'],
  Backlog: ['InProgress', 'Blocked', 'Triage'],
  InProgress: ['Blocked', 'Review', 'Done'],
  Blocked: ['InProgress', 'Backlog', 'Triage'],
  Review: ['Done', 'InProgress'],
  Done: [],
};

export const ALL_TASK_STATUSES = Object.keys(TASK_STATUS_TRANSITIONS);

export const taskStateMachine = createMachine({
  id: 'task',
  initial: 'Backlog',
  states: {
    Triage: {
      on: { TO_BACKLOG: 'Backlog' },
    },
    Backlog: {
      on: {
        TO_IN_PROGRESS: 'InProgress',
        TO_BLOCKED: 'Blocked',
        TO_TRIAGE: 'Triage',
      },
    },
    InProgress: {
      on: {
        TO_BLOCKED: 'Blocked',
        TO_REVIEW: 'Review',
        TO_DONE: 'Done',
      },
    },
    Blocked: {
      on: {
        TO_IN_PROGRESS: 'InProgress',
        TO_BACKLOG: 'Backlog',
        TO_TRIAGE: 'Triage',
      },
    },
    Review: {
      on: {
        TO_DONE: 'Done',
        TO_IN_PROGRESS: 'InProgress',
      },
    },
    Done: {
      type: 'final',
    },
  },
});
