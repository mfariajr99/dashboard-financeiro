import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api, ApiError, onApiError } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ user: null, loading: true, setUser: () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/api/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // Sessão expirada em qualquer chamada → volta ao login. Senha pendente → força a troca.
  useEffect(() => {
    const off = onApiError((err) => {
      if (err.status === 401 && err.code === 'UNAUTHENTICATED') qc.setQueryData(['me'], null);
      if (err.code === 'PASSWORD_CHANGE_REQUIRED') qc.invalidateQueries({ queryKey: ['me'] });
    });
    return () => {
      off();
    };
  }, [qc]);

  const value: AuthState = {
    user: me.data ?? null,
    loading: me.isLoading,
    setUser: (u) => qc.setQueryData(['me'], u),
    logout: async () => {
      await api.post('/api/auth/logout').catch(() => undefined);
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
