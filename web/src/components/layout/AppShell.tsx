import clsx from 'clsx';
import { CalendarDays, Flame, Goal, LayoutDashboard, LogOut, Menu, Plus, Receipt, Settings, ShoppingCart, Target, Wallet, X } from 'lucide-react';
import { Brand } from './Brand';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { IconButton } from '../ui/primitives';
import { useQuickActions } from './QuickActions';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/funil', label: 'Funil quente', icon: Flame },
  { to: '/faturamento', label: 'Faturamento', icon: Wallet },
  { to: '/despesas', label: 'Despesas', icon: Receipt },
  { to: '/metas', label: 'Metas', icon: Goal },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];
const BOTTOM = [NAV[0], NAV[1], NAV[2], NAV[3]];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Menu principal">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'focus-ring flex h-11 items-center gap-3 rounded-field px-3 text-[13.5px] font-medium transition-colors',
              isActive ? 'bg-primary-soft text-white ring-1 ring-inset ring-primary/40' : 'text-ink-muted hover:bg-elevated hover:text-white',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={clsx('h-[19px] w-[19px]', isActive ? 'text-accent' : '')} strokeWidth={1.9} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function QuickMenu({ onClose, className }: { onClose: () => void; className?: string }) {
  const qa = useQuickActions();
  const items = [
    { label: 'Nova oportunidade', icon: Target, action: qa.newOpportunity, color: 'text-violet' },
    { label: 'Nova venda efetuada', icon: ShoppingCart, action: qa.newSale, color: 'text-accent' },
    { label: 'Nova receita', icon: Wallet, action: qa.newReceivable, color: 'text-success' },
    { label: 'Nova despesa', icon: Receipt, action: qa.newExpense, color: 'text-warning' },
  ];
  return (
    <div className={clsx('w-56 animate-slide-up rounded-card border border-line bg-elevated p-2 shadow-pop', className ?? 'absolute bottom-[calc(100%+12px)] right-0')} role="menu">
      {items.map(({ label, icon: Icon, action, color }) => (
        <button type="button"
          key={label}
          role="menuitem"
          className="focus-ring flex h-12 w-full items-center gap-3 rounded-field px-3 text-left text-[14px] font-medium text-ink-body hover:bg-surface"
          onClick={() => {
            onClose();
            action();
          }}
        >
          <Icon className={clsx('h-5 w-5', color)} /> {label}
        </button>
      ))}
    </div>
  );
}

export function AppShell({ headerRight }: { headerRight?: ReactNode }) {
  const { user, logout } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [fab, setFab] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setDrawer(false);
    setFab(false);
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-[#0A1328] p-4 lg:flex">
        <Brand />
        <div className="mt-8 flex-1 overflow-y-auto">
          <NavItems />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-field border border-line bg-surface p-2 pl-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-white">{user?.name ?? user?.username}</p>
            <p className="label truncate">@{user?.username}</p>
          </div>
          <IconButton label="Sair" onClick={logout}>
            <LogOut className="h-[18px] w-[18px]" />
          </IconButton>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-2 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          {headerRight}
          <IconButton label="Abrir menu" onClick={() => setDrawer(true)}>
            <Menu className="h-6 w-6" />
          </IconButton>
        </div>
      </header>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[82%] max-w-xs animate-fade-in flex-col border-l border-line bg-[#0A1328] p-4">
            <div className="mb-6 flex items-center justify-between">
              <Brand />
              <IconButton label="Fechar menu" onClick={() => setDrawer(false)}>
                <X className="h-6 w-6" />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavItems onNavigate={() => setDrawer(false)} />
            </div>
            <button type="button" onClick={logout} className="focus-ring mt-4 flex h-11 items-center gap-3 rounded-field px-3 text-[13.5px] text-ink-muted hover:bg-elevated hover:text-white">
              <LogOut className="h-5 w-5" /> Sair ({user?.username})
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
        <Outlet />
      </main>

      {/* Botão de ação rápida (desktop) */}
      <div className="no-print fixed bottom-6 right-6 z-30 hidden lg:block">
        <div className="relative">
          {fab && <QuickMenu onClose={() => setFab(false)} />}
          <button type="button"
            aria-label="Ação rápida"
            aria-expanded={fab}
            onClick={() => setFab((v) => !v)}
            className="focus-ring flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_30px_-8px_rgba(37,99,235,0.9)] transition-transform hover:scale-105"
          >
            <Plus className={clsx('h-7 w-7 transition-transform', fab && 'rotate-45')} />
          </button>
        </div>
      </div>

      {/* Navegação inferior (mobile) com botão central de ação rápida */}
      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[#0A1328]/95 backdrop-blur lg:hidden" aria-label="Navegação rápida">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
          {BOTTOM.slice(0, 2).map((n) => (
            <BottomLink key={n.to} {...n} />
          ))}
          <div className="relative flex justify-center">
            {fab && (
              <div className="fixed inset-x-0 bottom-[92px] z-40 flex justify-center">
                <QuickMenu onClose={() => setFab(false)} className="relative" />
              </div>
            )}
            <button type="button"
              aria-label="Novo lançamento"
              aria-expanded={fab}
              onClick={() => setFab((v) => !v)}
              className="focus-ring -mt-6 flex h-14 w-14 items-center justify-center rounded-full border-4 border-bg bg-primary text-white shadow-[0_10px_30px_-8px_rgba(37,99,235,0.9)]"
            >
              <Plus className={clsx('h-7 w-7 transition-transform', fab && 'rotate-45')} />
            </button>
          </div>
          {BOTTOM.slice(2).map((n) => (
            <BottomLink key={n.to} {...n} />
          ))}
        </div>
      </nav>
      {fab && <div className="fixed inset-0 z-20" onClick={() => setFab(false)} aria-hidden />}
    </div>
  );
}

function BottomLink({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => clsx('focus-ring flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-field text-[10.5px] font-medium', isActive ? 'text-accent' : 'text-ink-muted')}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
      <span className="truncate">{label.split(' ')[0]}</span>
    </NavLink>
  );
}
