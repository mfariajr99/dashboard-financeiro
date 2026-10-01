import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from './form';
import { IconButton } from './primitives';

export function SearchInput({ value, onChange, placeholder = 'Buscar...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input type="search" icon={<Search />} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />;
}

export function ChipGroup<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div className="scroll-x" role="group" aria-label={label}>
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <button type="button"
            key={o.value}
            aria-pressed={active}
            onClick={() => onChange(active ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={clsx(
              'focus-ring h-9 shrink-0 snap-start rounded-full border px-3.5 text-[12.5px] font-medium tracking-soft transition-colors',
              active ? 'border-accent bg-accent-soft text-white' : 'border-line bg-surface text-ink-muted hover:text-white',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ExportButton({ href, label = 'Exportar CSV' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      download
      aria-label={label}
      className="no-print focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-field border border-line bg-elevated px-4 text-[13.5px] font-medium tracking-soft text-ink-body transition-colors hover:border-accent/50 hover:text-white"
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </a>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="px-1 text-[12px] italic text-ink-muted">{total} registro(s)</p>;
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-[12px] italic text-ink-muted">
        {total} registros · página {page} de {pages}
      </p>
      <div className="flex gap-1">
        <IconButton label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)} className="disabled:opacity-40">
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <IconButton label="Próxima página" disabled={page >= pages} onClick={() => onPage(page + 1)} className="disabled:opacity-40">
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[22px] font-semibold sm:text-[26px]">{title}</h1>
        {subtitle && <p className="label">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function TotalsBar({ items }: { items: { label: string; value: string; tone?: 'success' | 'danger' }[] }) {
  return (
    <div className="card grid grid-cols-2 gap-3 p-3 sm:grid-cols-4 sm:p-4">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <p className="label truncate">{i.label}</p>
          <p className={clsx('kpi-value truncate text-[16px] sm:text-[18px]', i.tone === 'success' && 'text-[#34D399]', i.tone === 'danger' && 'text-[#F87171]')}>{i.value}</p>
        </div>
      ))}
    </div>
  );
}
