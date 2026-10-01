/**
 * Datas financeiras como strings ISO "YYYY-MM-DD" (sem hora, sem fuso).
 * Toda aritmética é feita em UTC para ser determinística; o "hoje" é obtido no fuso configurado.
 */

export type ISODate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isMonthKey(v: unknown): v is MonthKey {
  return typeof v === 'string' && MONTH_RE.test(v);
}

function toUTC(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}
function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Data de hoje no fuso informado (ex.: America/Sao_Paulo). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86_400_000);
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthOf(d: ISODate): MonthKey {
  return d.slice(0, 7);
}

export function monthStart(month: MonthKey): ISODate {
  return `${month}-01`;
}

export function monthEnd(month: MonthKey): ISODate {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

export function addMonthsToKey(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Soma meses preservando o dia de referência; se o mês de destino for mais curto,
 * usa o último dia (31/01 + 1 mês = 28/02 ou 29/02).
 */
export function addMonthsClamped(d: ISODate, n: number, referenceDay?: number): ISODate {
  const day = referenceDay ?? Number(d.slice(8, 10));
  const target = addMonthsToKey(monthOf(d), n);
  const dd = Math.min(day, daysInMonth(target));
  return `${target}-${String(dd).padStart(2, '0')}`;
}

export function isBetween(d: ISODate | null | undefined, from: ISODate, to: ISODate): boolean {
  return !!d && d >= from && d <= to;
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Dia da semana ISO: 1 = segunda … 7 = domingo. */
export function isoWeekday(d: ISODate): number {
  const w = toUTC(d).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Semana começa na segunda-feira (padrão brasileiro de gestão). */
export function startOfWeek(d: ISODate): ISODate {
  return addDays(d, -(isoWeekday(d) - 1));
}

export function endOfWeek(d: ISODate): ISODate {
  return addDays(startOfWeek(d), 6);
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}
export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

/**
 * Contagem de dias para metas. Padrão: dias corridos.
 * "BUSINESS" (segunda a sexta, sem feriados) já está disponível na arquitetura.
 */
export type DayCountMode = 'CALENDAR' | 'BUSINESS';

export function countDays(from: ISODate, to: ISODate, mode: DayCountMode = 'CALENDAR'): number {
  if (to < from) return 0;
  if (mode === 'CALENDAR') return diffDays(to, from) + 1;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isoWeekday(d) <= 5) n++;
  return n;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Feriados nacionais do Brasil (Lei 662/1949, 6.802/1980, 14.759/2023 e Sexta-feira Santa).
 * Pontos facultativos (Carnaval, Corpus Christi) e feriados estaduais/municipais não entram.
 */
export function nationalHolidays(year: number): Map<ISODate, string> {
  const y = String(year);
  const list: [string, string][] = [
    [`${y}-01-01`, 'Confraternização Universal'],
    [addDays(easterSunday(year), -2), 'Sexta-feira Santa'],
    [`${y}-04-21`, 'Tiradentes'],
    [`${y}-05-01`, 'Dia do Trabalho'],
    [`${y}-09-07`, 'Independência do Brasil'],
    [`${y}-10-12`, 'Nossa Senhora Aparecida'],
    [`${y}-11-02`, 'Finados'],
    [`${y}-11-15`, 'Proclamação da República'],
    [`${y}-11-20`, 'Dia Nacional de Zumbi e da Consciência Negra'],
    [`${y}-12-25`, 'Natal'],
  ];
  return new Map(list);
}

export function holidayName(d: ISODate): string | null {
  return nationalHolidays(Number(d.slice(0, 4))).get(d) ?? null;
}

export function isBusinessDay(d: ISODate): boolean {
  return isoWeekday(d) <= 5 && !holidayName(d);
}

/** Dias úteis (seg–sex, sem feriados nacionais) entre duas datas, inclusive. */
export function businessDaysBetween(from: ISODate, to: ISODate): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isBusinessDay(d)) n++;
  return n;
}
