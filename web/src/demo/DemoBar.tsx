import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, KeyRound, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '../components/ui/modal';
import { resetData, resetPassword as resetPwd } from './api';

/** Selo flutuante do ambiente de teste: explica o modo e permite restaurar os dados. */
export function DemoBar() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const reset = async (kind: 'demo' | 'empty') => {
    const ok = await confirm({
      title: kind === 'demo' ? 'Restaurar dados de demonstração?' : 'Começar com o sistema vazio?',
      message:
        kind === 'demo'
          ? 'Todos os lançamentos feitos neste teste serão substituídos pelos dados de exemplo. Seu usuário e senha são mantidos.'
          : 'Todos os lançamentos serão apagados (categorias padrão são mantidas). Seu usuário e senha são mantidos.',
      confirmLabel: kind === 'demo' ? 'Restaurar' : 'Apagar tudo',
    });
    if (!ok) return;
    await resetData(kind);
    await qc.invalidateQueries();
    setOpen(false);
    toast.success(kind === 'demo' ? 'Dados de demonstração restaurados' : 'Sistema zerado para testes');
  };
  const resetPassword = async () => {
    const ok = await confirm({ title: 'Voltar à senha inicial?', message: 'O usuário mlf volta para a senha 0080 e a troca será exigida de novo no próximo login.', confirmLabel: 'Redefinir' });
    if (!ok) return;
    resetPwd();
    qc.setQueryData(['me'], null);
    setOpen(false);
  };

  return (
    <div className="no-print fixed bottom-[92px] left-3 z-40 lg:bottom-6 lg:left-[272px]">
      {open ? (
        <div className="w-[min(92vw,340px)] animate-slide-up rounded-card border border-warning/40 bg-elevated p-4 shadow-pop">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-white">
              <FlaskConical className="h-4 w-4 text-warning" /> Ambiente de teste
            </p>
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="focus-ring -mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            Telas, cliques e cálculos são os mesmos da versão de produção. A diferença é onde os dados ficam: <b className="text-white">apenas neste navegador</b>, sem servidor nem PostgreSQL.
          </p>
          <p className="mt-2 rounded-lg bg-field px-3 py-2 text-[12.5px] text-ink-soft">
            Acesso: <b className="text-white">mlf</b> / senha inicial <b className="text-white">0080</b>
          </p>
          <div className="mt-3 grid gap-2">
            <button type="button" onClick={() => reset('demo')} className="focus-ring flex h-11 items-center gap-2 rounded-field border border-line bg-surface px-3 text-[13px] text-ink-body hover:border-accent/50">
              <RotateCcw className="h-4 w-4 text-accent" /> Restaurar dados de demonstração
            </button>
            <button type="button" onClick={() => reset('empty')} className="focus-ring flex h-11 items-center gap-2 rounded-field border border-line bg-surface px-3 text-[13px] text-ink-body hover:border-accent/50">
              <Trash2 className="h-4 w-4 text-warning" /> Começar vazio (sem lançamentos)
            </button>
            <button type="button" onClick={resetPassword} className="focus-ring flex h-11 items-center gap-2 rounded-field border border-line bg-surface px-3 text-[13px] text-ink-body hover:border-accent/50">
              <KeyRound className="h-4 w-4 text-violet" /> Voltar à senha inicial (0080)
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ambiente de teste: opções"
          className="focus-ring flex h-10 w-10 items-center justify-center gap-1.5 rounded-full border border-warning/50 bg-[#2A1F08]/90 text-[12px] font-medium text-[#FBBF24] shadow-pop backdrop-blur lg:h-9 lg:w-auto lg:px-3"
        >
          <FlaskConical className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
          <span className="hidden lg:inline">Modo teste</span>
        </button>
      )}
    </div>
  );
}
