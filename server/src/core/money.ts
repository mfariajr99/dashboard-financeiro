/**
 * Aritmética monetária em CENTAVOS inteiros (number seguro até 9 × 10^13 reais).
 * O banco guarda NUMERIC(14,2); aqui convertemos string → centavos sem passar por float impreciso.
 */

export type Cents = number;

/** Converte "1234.56" | 1234.56 | "1234,56" em centavos inteiros. */
export function toCents(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Valor monetário inválido');
    return Math.round(value * 100 + (value >= 0 ? 1e-9 : -1e-9));
  }
  const s = value.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Valor monetário inválido: ${value}`);
  const negative = s.startsWith('-');
  const [intPart, decPart = ''] = s.replace('-', '').split('.');
  const dec = (decPart + '000').slice(0, 3); // 3 casas para arredondar a 3ª
  let cents = Number(intPart) * 100 + Number(dec.slice(0, 2));
  if (Number(dec[2]) >= 5) cents += 1; // arredondamento half-up
  return negative ? -cents : cents;
}

/** Centavos → string decimal com 2 casas ("1234.56"), formato aceito pelo NUMERIC. */
export function centsToDecimalString(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${s}` : s;
}

/** Centavos → reais (number) para respostas agregadas da API. */
export function centsToNumber(cents: Cents): number {
  return Math.round(cents) / 100;
}

/** Taxa "0.1900" | 0.19 → número (fração). */
export function toRate(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('Taxa inválida (esperado 0 a 1)');
  return n;
}

/**
 * Calcula taxa e líquido de uma venda.
 * taxa = arredondamento half-up(bruto × taxa); líquido = bruto − taxa.
 * Garante sempre: bruto = taxa + líquido (sem centavo perdido).
 */
export function computeFee(grossCents: Cents, feeRate: number): { feeCents: Cents; netCents: Cents } {
  if (grossCents < 0) throw new Error('Valor bruto não pode ser negativo');
  // Trabalha com a taxa em "pontos-base × 100" (4 casas) para evitar erro de float.
  const rateUnits = Math.round(feeRate * 10000); // 0.19 → 1900
  const feeCents = Math.floor((grossCents * rateUnits + 5000) / 10000);
  return { feeCents, netCents: grossCents - feeCents };
}

export type PaymentMethod = 'BOLETO' | 'PIX' | 'CARTAO';

/** Regra por meio de pagamento: Boleto e Pix = 0%; Cartão = taxa configurada (padrão 19%). */
export function feeRateFor(method: PaymentMethod, cardFeeRate: number): number {
  return method === 'CARTAO' ? cardFeeRate : 0;
}

export function sum(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Divide um total em N parcelas inteiras de centavos; a diferença de arredondamento vai na ÚLTIMA parcela.
 * Ex.: 100,00 em 3 → 33,33 + 33,33 + 33,34.
 */
export function splitCents(total: Cents, n: number): Cents[] {
  const count = Math.max(1, Math.floor(n));
  const base = Math.floor(total / count);
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] += total - base * count;
  return parts;
}
