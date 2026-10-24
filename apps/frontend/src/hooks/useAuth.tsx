import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { UserDto, RegisterDto, LoginDto } from '@widget-master/shared';
import * as authApi from '../api/auth';

interface AuthContextType {
  user: UserDto | null;
  loading: boolean;
  error: string | null;
  login: (dto: LoginDto) => Promise<void>;
  register: (dto: RegisterDto) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const loadUser = useCallback(async () => {
    if (!authApi.isAuthenticated()) {
      setLoading(false);
      return;
    }
    try {
      const userData = await authApi.getMe();
      setUser(userData);
    } catch {
      authApi.logout().catch(() => {});
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (dto: LoginDto) => {
    setError(null);
    setLoading(true);
    try {
      await authApi.login(dto);
      const userData = await authApi.getMe();
      setUser(userData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const register = async (dto: RegisterDto) => {
    setError(null);
    setLoading(true);
    try {
      await authApi.register(dto);
      const userData = await authApi.getMe();
      setUser(userData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    await loadUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, refreshUser, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}