import clsx from 'clsx';
import { AlertCircle } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const base =
  'w-full rounded-field border bg-field text-[14px] text-ink-body placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60';

export function Field({ label, error, hint, children, htmlFor, className }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="label not-italic text-ink-soft">
        <span className="italic">{label}</span>
      </label>
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-[12px] text-[#F87171]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; icon?: ReactNode; suffix?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, icon, suffix, className, ...rest }, ref) {
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
      <input
        ref={ref}
        className={clsx(base, 'h-11', icon ? 'pl-10' : 'pl-3', suffix ? 'pr-12' : 'pr-3', invalid ? 'border-danger' : 'border-line', className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-muted">{suffix}</span>}
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; icon?: ReactNode }>(function Select(
  { invalid, icon, className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
      <select
        ref={ref}
        className={clsx(base, 'h-11 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', icon ? 'pl-10' : 'pl-3', invalid ? 'border-danger' : 'border-line', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} rows={3} className={clsx(base, 'border-line px-3 py-2.5', className)} {...rest} />;
});

export function Checkbox({ label, description, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-field border border-line bg-field px-3 py-2.5">
      <input id={id} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#2563EB]" {...rest} />
      <span>
        <span className="block text-[13.5px] text-ink-body">{label}</span>
        {description && <span className="label block">{description}</span>}
      </span>
    </label>
  );
}
