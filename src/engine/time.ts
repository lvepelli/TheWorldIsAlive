import { DAYS_PER_YEAR } from './types';
import { getLang } from './i18n/lang';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Month name in the current language. */
export function monthName(m: number): string { return (getLang() === 'es' ? MONTHS_ES : MONTHS)[m]; }
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface CalendarDate { year: number; month: number; day: number; dayOfYear: number; }

/** Convert a day index (days since simulation start) to a calendar date. 365-day years for determinism. */
export function toDate(dayIndex: number, startYear: number): CalendarDate {
  const year = startYear + Math.floor(dayIndex / DAYS_PER_YEAR);
  let d = ((dayIndex % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  const dayOfYear = d;
  let month = 0;
  while (month < 11 && d >= MONTH_DAYS[month]) { d -= MONTH_DAYS[month]; month++; }
  return { year, month, day: d + 1, dayOfYear };
}

export function formatDate(dayIndex: number, startYear: number, style: 'long' | 'short' | 'iso' = 'long'): string {
  const dt = toDate(dayIndex, startYear);
  if (style === 'iso') return `${dt.year}-${String(dt.month + 1).padStart(2, '0')}-${String(dt.day).padStart(2, '0')}`;
  const es = getLang() === 'es';
  if (style === 'short') return es ? `${dt.day} ${MONTHS_ES[dt.month].slice(0, 3)} ${dt.year}` : `${MONTHS[dt.month].slice(0, 3)} ${dt.day}, ${dt.year}`;
  return es ? `${dt.day} de ${MONTHS_ES[dt.month]} de ${dt.year}` : `${dt.day} ${MONTHS[dt.month]} ${dt.year}`;
}

export function yearOf(dayIndex: number, startYear: number): number { return startYear + Math.floor(dayIndex / DAYS_PER_YEAR); }
export function ageOf(birthDay: number, today: number): number { return Math.floor((today - birthDay) / DAYS_PER_YEAR); }
export function daysAgo(day: number, today: number): string {
  const d = today - day;
  const es = getLang() === 'es';
  if (d <= 0) return es ? 'hoy' : 'today';
  if (d === 1) return es ? 'ayer' : 'yesterday';
  if (d < 30) return es ? `hace ${d} d` : `${d}d ago`;
  if (d < 365) return es ? `hace ${Math.floor(d / 30)} m` : `${Math.floor(d / 30)}mo ago`;
  return es ? `hace ${Math.floor(d / 365)} a` : `${Math.floor(d / 365)}y ago`;
}
