import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setUnauthorizedHandler } from '../api/client';
import { authApi } from '../api/endpoints';
import type { Admin } from '../api/types';

interface AuthState {
  /** undefined — tekshirilmoqda, null — kirilmagan */
  admin: Admin | null | undefined;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  isSuper: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);

  useEffect(() => {
    // Sessiya tugasa (refresh ham o'tmasa) — login sahifasiga
    setUnauthorizedHandler(() => setAdmin(null));
    // Sahifa ochilganda cookie orqali sessiyani tiklash
    authApi
      .me()
      .then(setAdmin)
      .catch(() => setAdmin(null));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setAdmin(res.admin);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAdmin(null);
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } finally {
      setAdmin(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ admin, login, logout, logoutAll, isSuper: admin?.role === 'SUPER_ADMIN' }),
    [admin, login, logout, logoutAll],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
}
