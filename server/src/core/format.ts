import type { Cents } from './money';
import type { ISODate } from './dates';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100).replace(/\u00a0|\u202f/g, ' ');
}

export function formatDateBR(d: ISODate): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export function formatDayMonth(d: ISODate): string {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

/** CSV com separador ";" e BOM (abre corretamente no Excel pt-BR). */
export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v);
    // Neutraliza injeção de fórmulas em planilhas.
    const safe = /^[=+\-@]/.test(s) && typeof v !== 'number' ? `'${s}` : s;
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}
