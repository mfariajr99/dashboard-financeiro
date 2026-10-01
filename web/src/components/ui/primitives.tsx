import clsx from 'clsx';
import { AlertCircle, Inbox, Loader2, RotateCw } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Tone } from '../../lib/labels';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-[0_6px_18px_-8px_rgba(37,99,235,0.8)]',
  secondary: 'bg-elevated text-ink-body border border-line hover:border-accent/50 hover:text-white',
  ghost: 'text-ink-soft hover:bg-elevated hover:text-white',
  danger: 'bg-danger/90 text-white hover:bg-danger',
  success: 'bg-success/90 text-white hover:bg-success',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-field font-medium tracking-soft transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-9 px-3 text-[12.5px]',
        size === 'md' && 'h-11 px-4 text-[13.5px]',
        size === 'lg' && 'h-12 px-5 text-[14px]',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx('focus-ring tap inline-flex items-center justify-center rounded-field text-ink-soft transition-colors hover:bg-elevated hover:text-white', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Card
export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <As className={clsx('card', className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, icon, actions }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink-title sm:text-[16px]">{title}</h2>
          {subtitle && <p className="label mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1 self-start sm:self-auto">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Pill / Badge
const tones: Record<Tone, string> = {
  success: 'bg-success-soft text-[#34D399] ring-success/30',
  warning: 'bg-warning-soft text-[#FBBF24] ring-warning/30',
  danger: 'bg-danger-soft text-[#F87171] ring-danger/30',
  info: 'bg-accent-soft text-accent ring-accent/30',
  primary: 'bg-primary-soft text-[#93C5FD] ring-primary/40',
  violet: 'bg-violet-soft text-violet ring-violet/30',
  neutral: 'bg-white/5 text-ink-soft ring-white/10',
};

export function Pill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium tracking-soft ring-1 ring-inset', tones[tone], className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Estados
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-elevated text-accent">{icon ?? <Inbox className="h-6 w-6" />}</span>
      <div>
        <p className="font-semibold text-ink-title">{title}</p>
        {description && <p className="label mt-1 max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/40 bg-danger-soft p-4 sm:flex-row sm:items-center">
      <AlertCircle className="h-5 w-5 shrink-0 text-danger" />
      <p className="flex-1 text-[13.5px] text-ink-body">{message ?? 'Não foi possível carregar os dados.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RotateCw className="h-4 w-4" />} onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Progresso
export function ProgressBar({ value, forecast, tone = 'info', label }: { value: number; forecast?: number; tone?: Tone; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const f = Math.max(v, Math.min(1, forecast ?? 0));
  const bar = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-accent', primary: 'bg-primary', violet: 'bg-violet', neutral: 'bg-ink-muted' }[tone];
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-field" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {forecast !== undefined && <div className={clsx('absolute inset-y-0 left-0 rounded-full opacity-30', bar)} style={{ width: `${f * 100}%` }} />}
      <div className={clsx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500', bar)} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- Segmented
export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div role="tablist" className={clsx('inline-flex rounded-field border border-line bg-field p-1', className)}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'focus-ring rounded-lg px-3 font-medium tracking-soft transition-colors',
            size === 'sm' ? 'h-8 text-[12px]' : 'h-9 text-[12.5px]',
            value === o.value ? 'bg-primary text-white shadow' : 'text-ink-muted hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, tone, size = 'md' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'success' | 'warning'; size?: 'sm' | 'md' }) {
  return (
    <div className="min-w-0">
      <p className="label truncate">{label}</p>
      <p className={clsx('kpi-value truncate', size === 'sm' ? 'text-[13.5px] sm:text-[15px]' : 'text-[17px]', tone === 'danger' && 'text-[#F87171]', tone === 'success' && 'text-[#34D399]', tone === 'warning' && 'text-[#FBBF24]')}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">{hint}</p>}
    </div>
  );
}
