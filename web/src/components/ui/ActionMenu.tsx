import clsx from 'clsx';
import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './primitives';

export interface Action {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Menu suspenso de ações contextuais (MoreVertical). Fecha ao clicar fora ou com Esc. */
export function ActionMenu({ actions, label = 'Mais ações' }: { actions: Action[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const visible = actions.filter((a) => !a.hidden);
  return (
    <div className="relative" ref={ref}>
      <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MoreVertical className="h-[18px] w-[18px]" />
      </IconButton>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-52 animate-fade-in rounded-xl border border-line bg-elevated p-1.5 shadow-pop">
          {visible.map((a) => (
            <button type="button"
              key={a.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              className={clsx(
                'focus-ring flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] [&>svg]:h-4 [&>svg]:w-4',
                a.danger ? 'text-[#F87171] hover:bg-danger-soft' : 'text-ink-body hover:bg-surface',
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
