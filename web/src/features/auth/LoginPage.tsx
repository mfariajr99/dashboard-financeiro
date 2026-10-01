import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, KeyRound, Lock, User } from 'lucide-react';
import { Brand } from '../../components/layout/Brand';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input } from '../../components/ui/form';
import { Button } from '../../components/ui/primitives';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { User as UserT } from '../../lib/types';

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Brand size="lg" />
          <h1 className="mt-6 text-[20px] font-semibold text-white">{title}</h1>
          <p className="label mt-1">{subtitle}</p>
        </div>
        <div className="card p-5 sm:p-6">{children}</div>
        <p className="mt-6 text-center text-[11.5px] italic text-ink-faint">Acesso restrito</p>
      </div>
    </div>
  );
}

const loginSchema = z.object({ username: z.string().trim().min(1, 'Informe o usuário'), password: z.string().min(1, 'Informe a senha') });

export function LoginPage() {
  const { setUser } = useAuth();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await api.post<{ user: UserT }>('/api/auth/login', v);
      setUser(r.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha no login');
    }
  });
  return (
    <AuthLayout title="Acesse sua conta" subtitle="Funil, faturamento, despesas e metas">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Usuário" htmlFor="l-user" error={formState.errors.username?.message}>
          <Input id="l-user" autoComplete="username" autoCapitalize="none" icon={<User />} invalid={!!formState.errors.username} {...register('username')} />
        </Field>
        <Field label="Senha" htmlFor="l-pass" error={formState.errors.password?.message}>
          <div className="relative">
            <Input id="l-pass" type={show ? 'text' : 'password'} autoComplete="current-password" icon={<Lock />} invalid={!!formState.errors.password} className="pr-12" {...register('password')} />
            <button type="button" onClick={() => setShow((v) => !v)} className="focus-ring absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:text-white" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
              {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </Field>
        {error && (
          <p role="alert" className="rounded-field border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-[#FCA5A5]">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} icon={<KeyRound className="h-4 w-4" />}>
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}

const changeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: z
      .string()
      .min(8, 'Mínimo de 8 caracteres')
      .regex(/[A-Za-z]/, 'Use ao menos uma letra')
      .regex(/\d/, 'Use ao menos um número'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' });

export function ChangePasswordForm({ onDone, forced }: { onDone?: () => void; forced?: boolean }) {
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof changeSchema>>({ resolver: zodResolver(changeSchema) });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await api.post<{ user: UserT }>('/api/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      reset();
      setUser(r.user);
      onDone?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível trocar a senha');
    }
  });
  const e = formState.errors;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {forced && <p className="rounded-field border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-[#FDE68A]">Por segurança, defina uma nova senha antes de continuar.</p>}
      <Field label="Senha atual" htmlFor="c-cur" error={e.currentPassword?.message}>
        <Input id="c-cur" type="password" autoComplete="current-password" icon={<Lock />} invalid={!!e.currentPassword} {...register('currentPassword')} />
      </Field>
      <Field label="Nova senha" htmlFor="c-new" error={e.newPassword?.message} hint="Mínimo de 8 caracteres, com letras e números">
        <Input id="c-new" type="password" autoComplete="new-password" icon={<KeyRound />} invalid={!!e.newPassword} {...register('newPassword')} />
      </Field>
      <Field label="Confirme a nova senha" htmlFor="c-conf" error={e.confirm?.message}>
        <Input id="c-conf" type="password" autoComplete="new-password" icon={<KeyRound />} invalid={!!e.confirm} {...register('confirm')} />
      </Field>
      {error && (
        <p role="alert" className="rounded-field border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-[#FCA5A5]">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
        Salvar nova senha
      </Button>
    </form>
  );
}

export function ForcePasswordChangePage() {
  const { logout } = useAuth();
  return (
    <AuthLayout title="Troque sua senha" subtitle="Primeiro acesso detectado">
      <ChangePasswordForm forced />
      <button type="button" onClick={logout} className="focus-ring mt-4 w-full rounded-field py-2 text-[13px] text-ink-muted hover:text-white">
        Sair
      </button>
    </AuthLayout>
  );
}
