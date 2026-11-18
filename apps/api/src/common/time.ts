const IST = 'Asia/Kolkata';
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export function nowIso(): string {
  return new Date().toISOString();
}

export function istDay(input: Date | string = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return dayFormatter.format(date);
}

export function istDateTimeToEpoch(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00+05:30`);
}

export function isValidDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00+05:30`));
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00+05:30`);
  date.setUTCDate(date.getUTCDate() + days);
  return istDay(date);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function formatDateIndian(day: string | null | undefined): string {
  if (!day) return '';
  const [year, month, date] = day.split('-');
  return `${date}-${month}-${year}`;
}

export function formatTimeIndian(time: string | null | undefined): string {
  if (!time) return '';
  const [hourText, minute] = time.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(normalized).padStart(2, '0')}:${minute} ${suffix}`;
}

export function formatDateTimeIst(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${formatDateIndian(istDay(date))} ${timeFormatter.format(date)}`;
}

export function currentIstTime(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return parts.slice(0, 5);
}

export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

export function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}
