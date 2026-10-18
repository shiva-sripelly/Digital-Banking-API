import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";
import { setCsrfToken } from "../api/session";

const AdminAuthContext = createContext();

/** Admin portal session (separate cookie and CSRF token from customers). */
export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = (data) => {
    setCsrfToken("admin", data?.csrf_token);
    setAdmin(data?.user || null);
  };

  // Step 1: password. Returns { mfa_token, enrollment_required, enrollment? }
  const startLogin = async (email, password) => {
    const response = await api.post("/admin/auth/login", { email, password });
    // MFA turned off on the server (development): already signed in
    if (response.data.mfa_required === false) applySession(response.data);
    return response.data;
  };

  // Step 2: authenticator code. Creates the admin session.
  const completeMfa = async (mfaToken, code) => {
    const response = await api.post("/admin/auth/mfa", { mfa_token: mfaToken, code });
    applySession(response.data);
    return response.data;
  };

  const logout = async () => {
    try {
      await api.post("/admin/auth/logout");
    } catch {
      // already signed out
    }
    applySession(null);
  };

  // Initial check; state is only set in the async callbacks
  useEffect(() => {
    let cancelled = false;
    api
      .get("/admin/auth/session")
      .then((response) => {
        if (cancelled) return;
        setCsrfToken("admin", response.data?.csrf_token);
        setAdmin(response.data?.user || null);
      })
      .catch(() => {
        if (!cancelled) setAdmin(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, loading, startLogin, completeMfa, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
