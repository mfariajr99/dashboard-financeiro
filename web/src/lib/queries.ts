import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, qs, type ApiError } from './api';
import type { CalendarResponse, Dashboard, ExpenseRow, GoalRow, Opportunity, ReceivableRow, SaleRow, Settings, Annual } from './types';

/** Todas as consultas de dados começam com 'fin' — qualquer gravação invalida o conjunto. */
export const FIN = 'fin';

export function useSettings() {
  return useQuery({ queryKey: [FIN, 'settings'], queryFn: () => api.get<Settings>('/api/settings'), staleTime: 60_000 });
}
export function useDashboard(month: string) {
  return useQuery({ queryKey: [FIN, 'dashboard', month], queryFn: () => api.get<Dashboard>(`/api/dashboard${qs({ month })}`), placeholderData: keepPreviousData });
}
export function useAnnual(year: number) {
  return useQuery({ queryKey: [FIN, 'annual', year], queryFn: () => api.get<Annual>(`/api/annual${qs({ year })}`), placeholderData: keepPreviousData });
}
export function useOpportunities(p: { month?: string; status?: string; q?: string }) {
  return useQuery({ queryKey: [FIN, 'opportunities', p], queryFn: () => api.get<Opportunity[]>(`/api/opportunities${qs(p)}`), placeholderData: keepPreviousData });
}
export function useSales(p: { month?: string; q?: string }) {
  return useQuery({ queryKey: [FIN, 'sales', p], queryFn: () => api.get<SaleRow[]>(`/api/sales${qs(p)}`), placeholderData: keepPreviousData });
}
export function useReceivables(p: { month?: string; situation?: string; q?: string }) {
  return useQuery({ queryKey: [FIN, 'receivables', p], queryFn: () => api.get<ReceivableRow[]>(`/api/receivables${qs(p)}`), placeholderData: keepPreviousData });
}
export function useExpenses(p: { month?: string; situation?: string; q?: string }) {
  return useQuery({ queryKey: [FIN, 'expenses', p], queryFn: () => api.get<ExpenseRow[]>(`/api/expenses${qs(p)}`), placeholderData: keepPreviousData });
}
export function useGoals(year: number) {
  return useQuery({ queryKey: [FIN, 'goals', year], queryFn: () => api.get<GoalRow[]>(`/api/goals${qs({ year })}`) });
}
export function useCalendar(from: string, to: string) {
  return useQuery({ queryKey: [FIN, 'calendar', from, to], queryFn: () => api.get<CalendarResponse>(`/api/calendar${qs({ from, to })}`), placeholderData: keepPreviousData });
}

/** Mutação padrão: toast de sucesso/erro e atualização de todas as telas. */
export function useFinMutation<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string | ((r: TRes) => string); onSuccess?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  return useMutation<TRes, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [FIN] });
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e) => {
      if (e.code !== 'POSSIBLE_DUPLICATE') toast.error(e.message);
    },
  });
}
