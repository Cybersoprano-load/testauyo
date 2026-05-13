import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authApi, type AuthCredentials, type UserPublic } from "../api/auth";
import { configureApi } from "../api/client";

interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  login: (creds: AuthCredentials) => Promise<void>;
  register: (creds: AuthCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const handleAuthFailure = useCallback(() => {
    tokenRef.current = null;
    setUser(null);
  }, []);

  useEffect(() => {
    configureApi({
      getToken: () => tokenRef.current,
      setToken: (t) => {
        tokenRef.current = t;
      },
      onAuthFailure: handleAuthFailure,
    });
  }, [handleAuthFailure]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authApi.refresh();
        if (cancelled) return;
        tokenRef.current = data.access_token;
        setUser(data.user);
      } catch {
        if (!cancelled) {
          tokenRef.current = null;
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (creds: AuthCredentials) => {
    const data = await authApi.login(creds);
    tokenRef.current = data.access_token;
    setUser(data.user);
  }, []);

  const register = useCallback(async (creds: AuthCredentials) => {
    const data = await authApi.register(creds);
    tokenRef.current = data.access_token;
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      tokenRef.current = null;
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
