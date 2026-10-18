import axios from "axios";
import { SESSION_EXPIRED_EVENT, getCsrfToken, portalForUrl, setCsrfToken } from "./session";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  // Send the HttpOnly session cookies. The API host must be the same site as
  // the app (e.g. both "localhost"), or browsers won't attach them.
  withCredentials: true,
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

api.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  const token = getCsrfToken(portalForUrl(config.url));
  if (token && !SAFE_METHODS.has(method)) {
    config.headers["X-CSRF-Token"] = token;
  }
  return config;
});

// An expired or revoked session makes every page fail with 401; send the user
// to the right sign-in page. Auth endpoints handle their own errors.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || "";
    const portal = portalForUrl(url);
    const status = error?.response?.status;
    const isAuthCall = portal === "admin" ? url.startsWith("/admin/auth/") : url.startsWith("/auth/");

    if (status === 401 && !isAuthCall && getCsrfToken(portal)) {
      // Show the "Session Expired" popup; it sends the user to sign in
      setCsrfToken(portal, null);
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { portal } }));
    } else if (status === 403 && portal === "admin" && !isAuthCall) {
      window.location.assign("/admin/access-denied");
    }

    return Promise.reject(error);
  }
);

export default api;
