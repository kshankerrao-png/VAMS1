import type { NotificationStatus, RequestStatus } from '@vams/shared';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00+05:30`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatDate(day: string | null | undefined): string {
  if (!day) return '—';
  const [year, month, date] = day.split('-');
  return `${date}-${month}-${year}`;
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return '—';
  const [hourText, minute] = time.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(normalized).padStart(2, '0')}:${minute} ${suffix}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return '—';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return formatDateTime(iso);
}

export function isSlotInPast(date: string | null | undefined, time: string | null | undefined): boolean {
  if (!date || !time) return false;
  const epoch = Date.parse(`${date}T${time}:00+05:30`);
  return Number.isFinite(epoch) && epoch <= Date.now();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function truncate(value: string, max = 90): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export const statusTone: Record<RequestStatus, 'amber' | 'green' | 'red' | 'blue'> = {
  PENDING_APPROVAL: 'amber',
  APPROVED: 'blue',
  REJECTED: 'red',
  MATERIALIZED: 'green',
};

export const notificationTone: Record<
  NotificationStatus,
  'amber' | 'green' | 'red' | 'blue' | 'slate'
> = {
  QUEUED: 'amber',
  SENT: 'blue',
  DELIVERED: 'green',
  FAILED: 'red',
  SKIPPED: 'slate',
};
