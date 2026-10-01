import { KeyRound, Percent, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field, Input } from '../../components/ui/form';
import { PageHeader } from '../../components/ui/ListToolbar';
import { Button, Card, CardHeader, Skeleton } from '../../components/ui/primitives';
import { api } from '../../lib/api';
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
      <PageHeader title="Configurações" subtitle="Taxa do cartão e senha de acesso" />
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
