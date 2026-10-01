import { describe, expect, it } from 'vitest';
import { centsToDecimalString, computeFee, feeRateFor, toCents } from '../../src/core/money';
import {
  addMonthsClamped,
  countDays,
  daysInMonth,
  endOfWeek,
  isISODate,
  monthEnd,
  startOfWeek,
  todayInTimeZone,
} from '../../src/core/dates';

describe('money', () => {
  it('converte strings e números para centavos sem erro de float', () => {
    expect(toCents('10000.00')).toBe(1_000_000);
    expect(toCents('0.1')).toBe(10);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents('1234,56')).toBe(123456);
    expect(toCents('1.005')).toBe(101); // half-up
    expect(toCents(null)).toBe(0);
    expect(() => toCents('abc')).toThrow();
  });

  it('formata centavos como decimal', () => {
    expect(centsToDecimalString(810000)).toBe('8100.00');
    expect(centsToDecimalString(-5)).toBe('-0.05');
  });

  it('cartão: R$ 10.000 bruto → taxa R$ 1.900 e líquido R$ 8.100 (19%)', () => {
    const { feeCents, netCents } = computeFee(toCents('10000'), feeRateFor('CARTAO', 0.19));
    expect(feeCents).toBe(190_000);
    expect(netCents).toBe(810_000);
  });

  it('boleto e pix mantêm 100% no caixa', () => {
    for (const m of ['BOLETO', 'PIX'] as const) {
      const r = computeFee(toCents('5432.10'), feeRateFor(m, 0.19));
      expect(r.feeCents).toBe(0);
      expect(r.netCents).toBe(543210);
    }
  });

  it('bruto = taxa + líquido sempre (arredondamento sem perda de centavos)', () => {
    for (const g of [1, 3, 99, 12345, 999_999, 100_003]) {
      const r = computeFee(g, 0.19);
      expect(r.feeCents + r.netCents).toBe(g);
    }
    expect(computeFee(333, 0.19).feeCents).toBe(63); // 63.27 → 63
    expect(computeFee(350, 0.19).feeCents).toBe(67); // 66.5 → 67 (half-up)
  });

  it('taxa configurável', () => {
    expect(computeFee(100_000, 0.035).feeCents).toBe(3500);
  });
});

describe('dates', () => {
  it('valida datas ISO', () => {
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-13-01')).toBe(false);
  });

  it('mudança de mês e meses curtos', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(monthEnd('2026-09')).toBe('2026-09-30');
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2, 31)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('semana começa na segunda', () => {
    expect(startOfWeek('2026-09-30')).toBe('2026-09-28'); // quarta → segunda
    expect(endOfWeek('2026-09-30')).toBe('2026-10-04');
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28'); // domingo
  });

  it('conta dias corridos e úteis', () => {
    expect(countDays('2026-09-01', '2026-09-30')).toBe(30);
    expect(countDays('2026-09-28', '2026-10-04', 'BUSINESS')).toBe(5);
    expect(countDays('2026-09-30', '2026-09-29')).toBe(0);
  });

  it('hoje no fuso de São Paulo (UTC−3)', () => {
    // 01/10/2026 01:30 UTC ainda é 30/09 em São Paulo
    expect(todayInTimeZone('America/Sao_Paulo', new Date('2026-10-01T01:30:00Z'))).toBe('2026-09-30');
    expect(todayInTimeZone('America/Sao_Paulo', new Date('2026-10-01T03:30:00Z'))).toBe('2026-10-01');
  });
});
