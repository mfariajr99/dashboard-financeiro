/** Formatação pt-BR: moeda BRL e datas DD/MM/AAAA. */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const clean = (s: string) => s.replace(/\u00a0|\u202f/g, ' ');

/** Valor em reais (string "1234.56" do banco ou number). */
export function brl$(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : (v ?? 0);
  return clean(brl.format(Number.isFinite(n) ? n : 0));
}

/** Valor em centavos (respostas agregadas da API usam centavos). */
export function brlC(cents: number | null | undefined): string {
  return clean(brl.format((cents ?? 0) / 100));
}

export function brlCompactC(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return Math.abs(v) < 10000 ? clean(brl.format(v)).replace(/,\d{2}$/, '') : clean(brlCompact.format(v));
}

export function pct(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

export function number(n: number): string {
  return num.format(n);
}

export function dateBR(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export function dayMonth(d: string | null | undefined): string {
  if (!d) return '—';
  const [, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}`;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  const name = (short ? MONTHS_SHORT : MONTHS)[m - 1];
  return short ? `${name}/${String(y).slice(2)}` : `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

export function weekdayLong(d: string): string {
  const w = new Date(`${d}T12:00:00Z`).getUTCDay();
  return ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][w];
}

/** Converte o texto digitado ("1.234,56", "1234.56") para número; null se inválido. */
export function parseMoneyInput(s: string): number | null {
  const t = s.replace(/[R$\s]/g, '');
  if (!t) return null;
  // pt-BR: "1.234,56" → vírgula decimal; "10.000" (grupos de 3) → milhar; "1234.56" → ponto decimal.
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function toMoneyInput(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'string' ? Number(v) : v;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function relativeDays(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days === -1) return 'ontem';
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}

const compactNum = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
/** Rótulo curto para eixos de gráficos (centavos → "22 mil", "1,2 mi"). */
export function axisMoney(cents: number): string {
  return clean(compactNum.format((cents ?? 0) / 100));
}

/** Percentual de atingimento: arredonda para baixo (99,6% aparece como 99%, nunca "100%" com saldo faltando). */
export function pctGoal(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  return `${Math.floor(fraction * 100).toLocaleString('pt-BR')}%`;
}
