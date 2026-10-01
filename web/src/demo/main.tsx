/**
 * Entrada do AMBIENTE DE TESTE (arquivo HTML único).
 * Intercepta as chamadas /api do app real e as responde no próprio navegador (ver ./api.ts).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-400-italic.css';
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-500-italic.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
import '../index.css';
import { App } from '../App';
import { ConfirmProvider } from '../components/ui/modal';
import { ApiError } from '../lib/api';
import { handle } from './api';
import { DemoBar } from './DemoBar';

const realFetch = window.fetch.bind(window);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  if (!path.startsWith('/api/')) return realFetch(input, init);
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
  await delay(method === 'GET' ? 90 : 160); // latência realista para ver estados de carregamento
  const r = await handle(method, path, body);
  if (r.status === 204) return new Response(null, { status: 204 });
  return new Response(JSON.stringify(r.body ?? null), { status: r.status, headers: { 'Content-Type': 'application/json' } });
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
        <ConfirmProvider>
          <DemoBar />
        </ConfirmProvider>
      </HashRouter>
      <Toaster
        theme="dark"
        position="top-center"
        richColors
        closeButton
        toastOptions={{ style: { background: '#17254B', border: '1px solid #1F2E54', color: '#F1F5F9', fontFamily: 'Montserrat, sans-serif' } }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
