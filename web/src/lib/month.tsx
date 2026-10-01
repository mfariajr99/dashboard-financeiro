import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { IconButton } from '../components/ui/primitives';
import { addMonths, monthOf, todayLocal } from './dates';
import { monthLabel } from './format';

/** Mês selecionado (compartilhado entre as telas). */
interface Ctx {
  month: string;
  setMonth: (m: string) => void;
  shift: (n: number) => void;
  current: string;
}
const MonthCtx = createContext<Ctx | null>(null);
const KEY = 'df.month';

export function MonthProvider({ children }: { children: ReactNode }) {
  const current = monthOf(todayLocal());
  const [month, setMonthState] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) ?? current;
    } catch {
      return current;
    }
  });
  const value = useMemo<Ctx>(() => {
    const setMonth = (m: string) => {
      setMonthState(m);
      try {
        sessionStorage.setItem(KEY, m);
      } catch {
        /* ignora */
      }
    };
    return { month, setMonth, shift: (n) => setMonth(addMonths(month, n)), current };
  }, [month, current]);
  return <MonthCtx.Provider value={value}>{children}</MonthCtx.Provider>;
}

export function useMonth() {
  const c = useContext(MonthCtx);
  if (!c) throw new Error('useMonth fora do MonthProvider');
  return c;
}

export function MonthPicker() {
  const { month, setMonth, shift, current } = useMonth();
  return (
    <div className="flex items-center gap-1 rounded-field border border-line bg-surface p-1">
      <IconButton label="Mês anterior" onClick={() => shift(-1)} className="h-9 min-h-0 w-9 min-w-0">
        <ChevronLeft className="h-4 w-4" />
      </IconButton>
      <label className="relative flex h-9 min-w-[150px] cursor-pointer items-center justify-center rounded-lg px-2 text-[13.5px] font-semibold text-ink-title hover:bg-elevated">
        <span>{monthLabel(month)}</span>
        <input
          type="month"
          aria-label="Escolher mês"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <IconButton label="Próximo mês" onClick={() => shift(1)} className="h-9 min-h-0 w-9 min-w-0">
        <ChevronRight className="h-4 w-4" />
      </IconButton>
      {month !== current && (
        <button type="button" onClick={() => setMonth(current)} className="focus-ring h-9 rounded-lg px-2 text-[12px] font-medium text-accent hover:bg-elevated">
          Hoje
        </button>
      )}
    </div>
  );
}
