import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import ToastProvider from "../components/ui/ToastProvider";
import { AppRoutes } from "../App";

export const testUser = {
  id: 7,
  full_name: "Asha Verma",
  email: "asha@example.com",
  is_active: true,
  email_verified: true,
  role: "customer",
  created_at: "2026-01-10T10:00:00Z",
};

export const testAccount = {
  id: 3,
  user_id: 7,
  account_number: "1234567890",
  balance: "1000.00",
  currency: "INR",
  created_at: "2026-01-10T10:00:00Z",
};

export const customerSession = { user: testUser, csrf_token: "csrf-customer", expires_at: "2099-01-01T00:00:00Z" };

const SIGNED_OUT = { "/auth/session": { user: null }, "/admin/auth/session": { user: null } };

/** Routes GET requests on the mocked axios instance to canned responses. */
export function mockGetRoutes(api, routes) {
  const all = { ...SIGNED_OUT, ...routes };
  api.get.mockImplementation((url) => {
    const path = url.split("?")[0];
    if (url in all) return Promise.resolve({ data: all[url] });
    if (path in all) return Promise.resolve({ data: all[path] });
    return Promise.reject({ response: { status: 404, data: { detail: "Not found" } } });
  });
}

export function signedOut(api, extraRoutes = {}) {
  mockGetRoutes(api, extraRoutes);
}

export function signedIn(api, extraRoutes = {}) {
  mockGetRoutes(api, {
    "/auth/session": customerSession,
    "/accounts/me": testAccount,
    "/transactions/history": [],
    ...extraRoutes,
  });
}

export function renderApp(path = "/", state) {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[state ? { pathname: path, state } : path]}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
