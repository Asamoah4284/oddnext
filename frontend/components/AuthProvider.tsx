"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, AUTH_EXPIRED_EVENT, TOKEN_KEY, pingLiveServer } from "@/lib/api";

import type { AuthUser } from "@/lib/types";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  applySession: (nextToken: string, nextUser: AuthUser) => void;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const applySession = useCallback((nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setReady(true);
      return;
    }
    try {
      const data = await apiFetch<{ user: AuthUser }>("/api/auth/me", {
        token: stored,
      });
      setToken(stored);
      setUser(data.user);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    pingLiveServer();
    void refresh();
  }, [refresh]);


  useEffect(() => {
    const onExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<{ token: string; user: AuthUser }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) }
      );
      applySession(data.token, data.user);
      return data.user;
    },
    [applySession]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await apiFetch<{ token: string; user: AuthUser }>(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify({ name, email, password }) }
      );
      applySession(data.token, data.user);
      return data.user;
    },
    [applySession]
  );

  const value = useMemo(
    () => ({ user, token, ready, login, register, applySession, logout, refresh }),
    [user, token, ready, login, register, applySession, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
