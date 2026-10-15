import React, { createContext, useContext, useState, useEffect } from "react";
import { apiRequest } from "../api";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  consentAcknowledged: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isSetup: boolean;
  isLoading: boolean;
  consentAcknowledged: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  acknowledgeConsent: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isSetup, setIsSetup] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [consentAcknowledged, setConsentAcknowledged] = useState<boolean>(true);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setIsLoading(true);
    try {
      const statusRes = await apiRequest<{ isSetup: boolean; consentAcknowledged: boolean }>("/api/auth/status");
      setIsSetup(statusRes.isSetup);
      setConsentAcknowledged(statusRes.consentAcknowledged);

      if (statusRes.isSetup) {
        // Fetch current user details
        const meRes = await apiRequest<{ user: UserProfile }>("/api/auth/me");
        setUser(meRes.user);
        setConsentAcknowledged(meRes.user.consentAcknowledged);
      }
    } catch {
      // Not authenticated or server starting up
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const res = await apiRequest<{ user: UserProfile; tokens: { accessToken: string; refreshToken: string } }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }
    );

    localStorage.setItem("taskcatch_access_token", res.tokens.accessToken);
    localStorage.setItem("taskcatch_refresh_token", res.tokens.refreshToken);
    setUser(res.user);
    setConsentAcknowledged(res.user.consentAcknowledged);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await apiRequest<{ user: UserProfile; tokens: { accessToken: string; refreshToken: string } }>(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      }
    );

    localStorage.setItem("taskcatch_access_token", res.tokens.accessToken);
    localStorage.setItem("taskcatch_refresh_token", res.tokens.refreshToken);
    setUser(res.user);
    setIsSetup(true);
    setConsentAcknowledged(res.user.consentAcknowledged);
  };

  const logout = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    localStorage.removeItem("taskcatch_access_token");
    localStorage.removeItem("taskcatch_refresh_token");
    setUser(null);
  };

  const acknowledgeConsent = async () => {
    await apiRequest("/api/auth/consent", { method: "POST" });
    setConsentAcknowledged(true);
    if (user) {
      setUser({ ...user, consentAcknowledged: true });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isSetup,
        isLoading,
        consentAcknowledged,
        login,
        register,
        logout,
        acknowledgeConsent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
