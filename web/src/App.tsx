import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { QuickActionsProvider } from './components/layout/QuickActions';
import { ConfirmProvider } from './components/ui/modal';
import { Skeleton } from './components/ui/primitives';
import { ForcePasswordChangePage, LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { AuthProvider, useAuth } from './lib/auth';
import { MonthProvider } from './lib/month';

const FunnelPage = lazy(() => import('./features/funnel/FunnelPage'));
const BillingPage = lazy(() => import('./features/billing/BillingPage'));
const ExpensesPage = lazy(() => import('./features/expenses/ExpensesPage'));
const GoalsPage = lazy(() => import('./features/goals/GoalsPage'));
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage'));
const FunilVendasPage = lazy(() => import('./features/funil-vendas/FunilVendasPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28" />
      <Skeleton className="h-72" />
    </div>
  );
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Skeleton className="h-12 w-12 rounded-2xl" />
      </div>
    );
  if (!user) return <LoginPage />;
  if (user.mustChangePassword) return <ForcePasswordChangePage />;
  return (
    <MonthProvider>
      <QuickActionsProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="funil" element={<Suspense fallback={<PageFallback />}><FunnelPage /></Suspense>} />
            <Route path="faturamento" element={<Suspense fallback={<PageFallback />}><BillingPage /></Suspense>} />
            <Route path="despesas" element={<Suspense fallback={<PageFallback />}><ExpensesPage /></Suspense>} />
            <Route path="metas" element={<Suspense fallback={<PageFallback />}><GoalsPage /></Suspense>} />
            <Route path="calendario" element={<Suspense fallback={<PageFallback />}><CalendarPage /></Suspense>} />
            <Route path="vendas" element={<Navigate to="/vendas/painel" replace />} />
            <Route path="vendas/:slug" element={<Suspense fallback={<PageFallback />}><FunilVendasPage /></Suspense>} />
            <Route path="configuracoes" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </QuickActionsProvider>
    </MonthProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <Protected />
      </ConfirmProvider>
    </AuthProvider>
  );
}
