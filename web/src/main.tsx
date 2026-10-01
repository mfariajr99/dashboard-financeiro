import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { App } from './App';
import { ApiError } from './lib/api';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/400-italic.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/500-italic.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
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
