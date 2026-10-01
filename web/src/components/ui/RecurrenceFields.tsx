import { Repeat } from 'lucide-react';
import { monthsInclusive } from '../../../../server/src/core/calc';
import { addMonths, monthOf } from '../../lib/dates';
import { brlC, monthLabel } from '../../lib/format';
import { Field, Select } from './form';

export interface Recurrence {
  day: number;
  startMonth: string;
  endMonth: string;
}

/** Sugestão inicial: mesmo dia da data informada, começando no mês dela, por 12 meses. */
export function defaultRecurrence(fromDate: string): Recurrence {
  const m = monthOf(fromDate);
  return { day: Number(fromDate.slice(8, 10)) || 10, startMonth: m, endMonth: addMonths(m, 11) };
}

/** Meses para escolher início/fim: 12 meses atrás até 5 anos à frente (inclui o valor atual). */
function monthOptions(today: string, current: string): string[] {
  const base = addMonths(monthOf(today), -12);
  const list = Array.from({ length: 12 + 61 }, (_, i) => addMonths(base, i));
  if (!list.includes(current)) list.push(current);
  return list.sort();
}

/**
 * Campos da cobrança recorrente (mensal): dia do vencimento, mês de início e mês de fim.
 * Usado na venda (boleto recorrente) e no cadastro de receitas.
 */
export function RecurrenceFields({
  idPrefix,
  value,
  onChange,
  today,
  unitCents,
  unitLabel,
  lockStart = false,
}: {
  idPrefix: string;
  value: Recurrence;
  onChange: (r: Recurrence) => void;
  today: string;
  unitCents: number;
  unitLabel: string;
  /** Mês de início fixo (ex.: "esta e as próximas" começa no mês desta). */
  lockStart?: boolean;
}) {
  const count = monthsInclusive(value.startMonth, value.endMonth);
  return (
    <>
      <Field label="Dia do vencimento" htmlFor={`${idPrefix}-rday`} hint="Em meses mais curtos, vence no último dia">
        <Select id={`${idPrefix}-rday`} value={value.day} onChange={(e) => onChange({ ...value, day: Number(e.target.value) })}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              Todo dia {d}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mês de início" htmlFor={`${idPrefix}-rstart`}>
          <Select
            id={`${idPrefix}-rstart`}
            value={value.startMonth}
            disabled={lockStart}
            onChange={(e) => onChange({ ...value, startMonth: e.target.value, endMonth: e.target.value > value.endMonth ? e.target.value : value.endMonth })}
          >
            {monthOptions(today, value.startMonth).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, true)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mês de fim" htmlFor={`${idPrefix}-rend`}>
          <Select id={`${idPrefix}-rend`} value={value.endMonth} onChange={(e) => onChange({ ...value, endMonth: e.target.value })}>
            {monthOptions(today, value.endMonth)
              .filter((m) => m >= value.startMonth)
              .map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m, true)}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      <p className="label -mt-2 flex items-center gap-1.5 sm:col-span-2">
        <Repeat className="h-3.5 w-3.5 shrink-0" />
        {count} {unitLabel}(s) mensal(is) de {brlC(unitCents)} · total {brlC(unitCents * count)} · {monthLabel(value.startMonth, true)} a {monthLabel(value.endMonth, true)}
      </p>
    </>
  );
}
