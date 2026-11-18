import { RequestStatus } from './constants';

const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['MATERIALIZED'],
  REJECTED: [],
  MATERIALIZED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: RequestStatus): RequestStatus[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

export function isTerminal(status: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export function isOpen(status: RequestStatus): boolean {
  return status === 'PENDING_APPROVAL' || status === 'APPROVED';
}

export const TRANSITION_LABELS: Record<string, string> = {
  approve: 'Approve',
  reject: 'Reject',
  materialize: 'Mark Materialized',
  reschedule: 'Reschedule',
};
