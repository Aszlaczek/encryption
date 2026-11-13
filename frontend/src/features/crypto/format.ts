const numberFormatter = new Intl.NumberFormat('pl-PL');
const dateTimeFormatter = new Intl.DateTimeFormat('pl-PL', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Groups digits the Polish way (for example `10 000`). */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Formats an ISO timestamp for display; unparsable values are returned unchanged. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}
