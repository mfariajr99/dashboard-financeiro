import { KeyRound, Percent, Save, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field, Input } from '../../components/ui/form';
import { PageHeader } from '../../components/ui/ListToolbar';
import { Button, Card, CardHeader, Skeleton } from '../../components/ui/primitives';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { User } from '../../lib/types';
import { useFinMutation, useSettings } from '../../lib/queries';
import { ChangePasswordForm } from '../auth/LoginPage';

export default function SettingsPage() {
  const q = useSettings();
  const [rate, setRate] = useState('19');
  useEffect(() => {
    if (q.data) setRate(String(Math.round(q.data.cardFeeRate * 10000) / 100).replace('.', ','));
  }, [q.data]);
  const n = Number(rate.replace(',', '.'));
  const valid = Number.isFinite(n) && n >= 0 && n <= 100;
  const save = useFinMutation(() => api.put('/api/settings', { cardFeeRate: n }), { success: 'Taxa do cartão atualizada' });
  return (
    <div className="space-y-5">
      <PageHeader title="Configurações" subtitle="Seu nome, taxa do cartão e senha de acesso" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Desconto do cartão" subtitle="Aplicado nas novas vendas e receitas no cartão" icon={<Percent className="h-5 w-5" />} />
          <div className="space-y-4 p-4 sm:p-5">
            {!q.data ? (
              <Skeleton className="h-20" />
            ) : (
              <Field label="Taxa/desconto do cartão (%)" htmlFor="st-rate" error={valid ? undefined : 'Informe um percentual entre 0 e 100'} hint="Vendas já lançadas mantêm a taxa com que foram registradas. Pix e Boleto: sem desconto.">
                <Input id="st-rate" inputMode="decimal" suffix="%" value={rate} onChange={(e) => setRate(e.target.value)} />
              </Field>
            )}
            <Button icon={<Save className="h-4 w-4" />} disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Salvar
            </Button>
          </div>
        </Card>
        <ProfileCard />
        <Card>
          <CardHeader title="Alterar senha" subtitle="Mínimo de 8 caracteres, com letras e números" icon={<KeyRound className="h-5 w-5" />} />
          <div className="p-4 sm:p-5">
            <ChangePasswordForm onDone={() => toast.success('Senha alterada com sucesso')} />
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Nome exibido no menu e usado pelo Funil de Vendas ("Qual o diagnóstico de hoje, <nome>?"). */
function ProfileCard() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  useEffect(() => setName(user?.name ?? ''), [user?.name]);
  const valid = name.trim().length > 0 && name.trim().length <= 80;
  const save = useFinMutation(() => api.patch<{ user: User }>('/api/auth/profile', { name: name.trim() }), {
    success: 'Nome atualizado',
    onSuccess: (r) => setUser((r as { user: User }).user),
  });
  return (
    <Card>
      <CardHeader title="Seu nome" subtitle="Aparece no menu e no Funil de Vendas" icon={<UserRound className="h-5 w-5" />} />
      <div className="space-y-4 p-4 sm:p-5">
        <Field label="Nome" htmlFor="st-name" error={valid ? undefined : 'Informe seu nome'}>
          <Input id="st-name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button icon={<Save className="h-4 w-4" />} disabled={!valid || name.trim() === user?.name} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Salvar
        </Button>
      </div>
    </Card>
  );
}
