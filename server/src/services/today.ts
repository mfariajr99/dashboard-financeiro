import { config } from '../config';
import { todayInTimeZone } from '../core/dates';
import type { Settings } from '../core/types';

/** "Hoje" no fuso configurado. Em testes pode ser fixado via FINPLAN_FAKE_TODAY. */
export function today(s: Pick<Settings, 'timezone'>): string {
  const fake = process.env.FINPLAN_FAKE_TODAY;
  if (fake && config.NODE_ENV !== 'production') return fake;
  try {
    return todayInTimeZone(s.timezone);
  } catch {
    return todayInTimeZone('America/Sao_Paulo');
  }
}
