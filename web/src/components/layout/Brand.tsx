import logo from '../../assets/logo-clubn.png';

/** Logo club'n (arquivo original, sem alterações) + nome do sistema. */
export function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className={size === 'lg' ? 'flex flex-col items-center gap-3' : 'flex flex-col items-start gap-1'}>
      <img src={logo} alt="club'n" className={size === 'lg' ? 'h-14 w-auto' : 'h-7 w-auto'} draggable={false} />
      <p className={size === 'lg' ? 'text-[15px] font-semibold tracking-soft text-ink-soft' : 'text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted'}>Dashboard Financeiro</p>
    </div>
  );
}

