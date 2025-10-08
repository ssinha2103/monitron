import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  ApiUser,
  authStore,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister
} from '../api';

type AuthContextValue = {
  user: ApiUser | null;
  loading: boolean;
  login: (args: { email: string; password: string }) => Promise<void>;
  register: (args: { email: string; password: string; full_name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      if (!authStore.token) {
        setLoading(false);
        return;
      }
      try {
        const profile = await fetchMe();
        setUser(profile);
      } catch (error) {
        authStore.token = null;
      } finally {
        setLoading(false);
      }
    };
    void bootstrap();
  }, []);

  const login = async ({ email, password }: { email: string; password: string }) => {
    await apiLogin({ email, password });
    const profile = await fetchMe();
    setUser(profile);
  };

  const register = async ({ email, password, full_name }: { email: string; password: string; full_name?: string }) => {
    await apiRegister({ email, password, full_name });
    const profile = await fetchMe();
    setUser(profile);
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  const refreshUser = async () => {
    if (!authStore.token) return;
    const profile = await fetchMe();
    setUser(profile);
  };

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthContext not available');
  return ctx;
}
