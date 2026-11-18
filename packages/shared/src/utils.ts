export function normalizeMobile(input: string | null | undefined): string {
  if (!input) return '';
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : '';
}

export function displayMobile(normalized: string | null | undefined): string {
  if (!normalized) return '';
  const digits = String(normalized).replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : String(normalized);
}

export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function renderTemplate(text: string, vars: Record<string, string | number | undefined | null>): string {
  return String(text ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function truncate(value: string | null | undefined, max = 80): string {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}
