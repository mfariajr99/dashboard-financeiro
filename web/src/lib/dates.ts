/** Aritmética de datas ISO (YYYY-MM-DD) em UTC — mesma convenção do backend. */
export type ISODate = string;

const toUTC = (d: ISODate) => new Date(`${d}T00:00:00Z`);
const fromUTC = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86_400_000);
}
export function monthOf(d: ISODate) {
  return d.slice(0, 7);
}
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function monthStart(month: string) {
  return `${month}-01`;
}
export function monthEnd(month: string) {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}
/** 1 = segunda … 7 = domingo */
export function isoWeekday(d: ISODate) {
  const w = toUTC(d).getUTCDay();
  return w === 0 ? 7 : w;
}
export function startOfWeek(d: ISODate) {
  return addDays(d, -(isoWeekday(d) - 1));
}
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
/** Hoje no fuso de São Paulo (usado apenas como valor padrão de formulários). */
export function todayLocal(timeZone = 'America/Sao_Paulo'): ISODate {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
