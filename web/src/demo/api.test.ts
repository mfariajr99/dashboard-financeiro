import { describe, expect, it } from 'vitest';
import { brlC, pctGoal } from '../lib/format';
import { handle, resetData, resetPassword } from './api';

const call = (m: string, url: string, body?: unknown) => handle(m, url, body);

describe('formatação', () => {
  it('pctGoal nunca arredonda para 100% antes de bater a meta', () => {
    expect(pctGoal(0.996)).toBe('99%');
    expect(pctGoal(1)).toBe('100%');
    expect(pctGoal(null)).toBe('—');
  });
  it('brlC formata centavos em reais', () => {
    expect(brlC(1234567)).toMatch(/12\.345,67/);
  });
});

describe('ambiente de teste (mesmas rotas da produção)', () => {
  it('exige login e troca da senha inicial', async () => {
    resetPassword();
    expect((await call('GET', '/api/dashboard')).status).toBe(401);
    expect((await call('POST', '/api/auth/login', { username: 'mlf', password: 'errada' })).status).toBe(401);
    expect((await call('POST', '/api/auth/login', { username: 'mlf', password: '0080' })).status).toBe(200);
    expect((await call('GET', '/api/dashboard')).status).toBe(403);
    expect((await call('POST', '/api/auth/change-password', { currentPassword: '0080', newPassword: 'NovaSenha2026' })).status).toBe(200);
    expect((await call('GET', '/api/dashboard')).status).toBe(200);
  });

  it('venda no cartão sai do funil e entra no faturamento com 19% de taxa', async () => {
    await resetData('empty');
    const opp = await call('POST', '/api/opportunities', { client: 'Cliente Teste', grossAmount: 10000, month: '2026-09' });
    expect(opp.status).toBe(201);
    const id = (opp.body as { id: string }).id;
    const conv = await call('POST', `/api/opportunities/${id}/convert`, { paymentMethod: 'CARTAO', installments: 1, saleDate: '2026-09-10', firstDate: '2026-10-10' });
    expect(conv.status).toBe(201);
    const { sale } = conv.body as { sale: { feeAmount: string; netAmount: string } };
    expect(sale.feeAmount).toBe('1900.00');
    expect(sale.netAmount).toBe('8100.00');
    const rec = (await call('GET', '/api/receivables?month=2026-10')).body as { netAmount: string }[];
    expect(rec).toHaveLength(1);
    expect(rec[0].netAmount).toBe('8100.00');
    const open = (await call('GET', '/api/opportunities?month=2026-09&status=ABERTA')).body as unknown[];
    expect(open).toHaveLength(0);
  });
});
