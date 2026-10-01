import { FilePlus2, FileSearch, Headset, History, LayoutDashboard, type LucideIcon } from 'lucide-react';

/** Telas do Funil de Vendas (app do diagnóstico) acessíveis pelo menu do Dashboard. */
export const FUNIL_VIEWS: { slug: string; view: string; label: string; icon: LucideIcon }[] = [
  { slug: 'painel', view: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { slug: 'criar-call', view: 'callForm', label: 'Criar Call', icon: Headset },
  { slug: 'historico', view: 'callsHistory', label: 'Histórico de Calls', icon: History },
  { slug: 'criar-proposta', view: 'propostaForm', label: 'Criar Proposta', icon: FilePlus2 },
  { slug: 'propostas', view: 'propostasList', label: 'Consultar Propostas', icon: FileSearch },
];

export const FUNIL_BASE = '/vendas';
export const viewForSlug = (slug?: string) => FUNIL_VIEWS.find((v) => v.slug === slug) ?? FUNIL_VIEWS[0];
export const slugForView = (view: string) => FUNIL_VIEWS.find((v) => v.view === view)?.slug ?? null;
