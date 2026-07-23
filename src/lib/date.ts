export const APP_TIME_ZONE = 'Asia/Jakarta';

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: APP_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: APP_TIME_ZONE,
    dateStyle: 'medium',
  }).format(date);
}

export function getDateParts(value: string | Date): { year: string; month: string; day: string } {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
  };
}

export function toDateInputValue(date: Date): string {
  const { year, month, day } = getDateParts(date);
  return `${year}-${month}-${day}`;
}

export function startOfJakartaDate(dateText: string): string {
  return new Date(`${dateText}T00:00:00+07:00`).toISOString();
}

export function endOfJakartaDate(dateText: string): string {
  return new Date(`${dateText}T23:59:59.999+07:00`).toISOString();
}
