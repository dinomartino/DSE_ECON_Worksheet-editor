import type { UiLanguage } from '@/settings/language';
import { uiLanguage } from './language';

/**
 * How long ago, in words.
 *
 * A file list is scanned for "the one I had open before lunch", and an absolute
 * timestamp makes the reader do that subtraction themselves. Falls back to the date
 * past a week, where "8 days ago" stops being easier than the date it names.
 * English keeps its own wording; 中文 takes Hong Kong forms from `Intl` (5 分鐘前, 昨日).
 */
export function relativeTime(iso: string, now = Date.now(), lang: UiLanguage = uiLanguage()): string {
  const zh = lang === 'zh-HK';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return zh ? '不明' : 'unknown';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return zh ? '剛剛' : 'just now';
  const words = zh ? new Intl.RelativeTimeFormat('zh-HK', { numeric: 'auto' }) : null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    if (words) return words.format(-minutes, 'minute');
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    if (words) return words.format(-hours, 'hour');
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    if (words) return words.format(-days, 'day');
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
  return zh ? new Date(iso).toLocaleDateString('zh-HK') : new Date(iso).toLocaleDateString();
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A calendar date ("2026-09-24") in words: "24 September 2026", or 2026年9月24日. Read
 * from the digits, so the viewer's time zone never moves the day; anything else is
 * returned as given.
 */
export function calendarDate(date: string | undefined, lang: UiLanguage = uiLanguage()): string | undefined {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return date;
  const day = Number(match[3]);
  return lang === 'zh-HK' ? `${match[1]}年${Number(match[2])}月${day}日` : `${day} ${month} ${match[1]}`;
}
