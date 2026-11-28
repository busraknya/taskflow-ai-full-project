/**
 * Date and number formatting in the interface language (English), so dates
 * never mix with another language's month names. Times use the viewer's zone.
 */
const LOCALE = 'en-US';

const date = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });
const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const time = new Intl.DateTimeFormat(LOCALE, { timeStyle: 'short' });
const utcDate = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: 'UTC' });
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
const weekdayYear = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export const formatDate = (iso: string) => date.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));
/** Calendar dates stored as UTC midnight (date-only due dates). */
export const formatUtcDate = (iso: string) => utcDate.format(new Date(iso));
export const formatNumber = (n: number) => n.toLocaleString(LOCALE);

/** "Today", "Yesterday" or a weekday with the date. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return (d.getFullYear() === today.getFullYear() ? weekday : weekdayYear).format(d);
}
