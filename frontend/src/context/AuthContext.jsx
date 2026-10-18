import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../api/axios";
import { setCsrfToken } from "../api/session";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = (data) => {
    setCsrfToken("customer", data?.csrf_token);
    setUser(data?.user || null);
  };

  // The session is an HttpOnly cookie; ask the server whether it's valid
  const fetchSession = useCallback(async () => {
    try {
      const response = await api.get("/auth/session");
      applySession(response.data);
    } catch {
      applySession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    const response = await api.post("/auth/login", formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    applySession(response.data);
    return response.data;
  };

  const register = async (full_name, email, password) => {
    const response = await api.post("/auth/register", {
      full_name,
      email,
      password,
    });
    return response.data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // The session may already be gone; clear local state regardless
    }
    applySession(null);
  };

  // Initial check; state is only set in the async callbacks
  useEffect(() => {
    let cancelled = false;
    api
      .get("/auth/session")
      .then((response) => {
        if (cancelled) return;
        setCsrfToken("customer", response.data?.csrf_token);
        setUser(response.data?.user || null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        fetchSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
