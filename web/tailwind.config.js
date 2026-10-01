/** Design system "Deep Blue Night" — tokens extraídos da referência visual (Lovable). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#070D1E', // fundo geral
        surface: '#111C38', // cards nível 1
        elevated: '#17254B', // modais, tooltips, popovers (nível 2)
        line: '#1F2E54', // bordas e divisores
        field: '#0A1124', // fundo de inputs
        primary: { DEFAULT: '#2563EB', hover: '#1D4ED8', soft: 'rgba(37,99,235,0.16)' },
        accent: { DEFAULT: '#38BDF8', soft: 'rgba(56,189,248,0.14)' },
        ink: { DEFAULT: '#FFFFFF', body: '#F1F5F9', title: '#F8FAFC', soft: '#CBD5E1', muted: '#94A3B8', faint: '#64748B' },
        success: { DEFAULT: '#10B981', bg: '#064E3B', soft: 'rgba(16,185,129,0.14)' },
        warning: { DEFAULT: '#F59E0B', bg: '#78350F', soft: 'rgba(245,158,11,0.14)' },
        danger: { DEFAULT: '#EF4444', bg: '#7F1D1D', soft: 'rgba(239,68,68,0.14)' },
        violet: { DEFAULT: '#A78BFA', soft: 'rgba(167,139,250,0.14)' },
        rose: { DEFAULT: '#F43F5E' },
      },
      fontFamily: {
        sans: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        kpi: ['1.75rem', { lineHeight: '2.1rem', fontWeight: '700' }],
        'kpi-lg': ['2.25rem', { lineHeight: '2.6rem', fontWeight: '700' }],
      },
      letterSpacing: { soft: '0.02em' },
      borderRadius: { card: '16px', field: '10px' },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.55)',
        pop: '0 20px 48px -12px rgba(0,0,0,0.7)',
        glow: '0 0 0 3px rgba(56,189,248,0.35)',
      },
      keyframes: {
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
        slideUp: { from: { transform: 'translateY(24px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        skeleton: 'pulseSoft 1.6s ease-in-out infinite',
        'slide-up': 'slideUp .22s ease-out',
        'fade-in': 'fadeIn .18s ease-out',
      },
      screens: { xs: '400px' },
    },
  },
  plugins: [],
};
