// In-memory CSRF tokens for the customer and admin sessions. The session
// itself lives in an HttpOnly cookie that JavaScript can never read.
const tokens = { customer: null, admin: null };

export function setCsrfToken(portal, token) {
  tokens[portal] = token || null;
}

export function getCsrfToken(portal) {
  return tokens[portal];
}

export function portalForUrl(url = "") {
  return url.startsWith("/admin") ? "admin" : "customer";
}

export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Fired by the API client when a signed-in session is rejected (expired/revoked)
export const SESSION_EXPIRED_EVENT = "velqorin:session-expired";
