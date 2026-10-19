import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import api from "../api/axios";
import { getCsrfToken, setCsrfToken } from "../api/session";
import { mockGetRoutes, renderApp, signedIn } from "./renderApp";

vi.mock("../api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const adminUser = { id: 1, full_name: "Ops Admin", email: "ops@example.com", role: "admin", mfa_enabled: true };

const metrics = {
  customers: { total: 11, verified: 4, unverified: 7, active: 10, inactive: 1 },
  wallets: { total_balance: "106837.00", accounts: 11 },
  transfers: { count: 27, total_amount: "5400.00" },
  payments: { succeeded: 3, pending: 1, failed: 2, canceled: 0, refunded: 1, needs_attention: 0 },
  ledger: { status: "matched", mismatched_accounts: 0, unbalanced_transactions: 0 },
};

beforeEach(() => {
  vi.resetAllMocks();
  setCsrfToken("admin", null);
});

describe("admin portal", () => {
  it("sends unauthenticated visitors to the admin login", async () => {
    mockGetRoutes(api, {});
    renderApp("/admin/dashboard");
    expect(await screen.findByRole("heading", { name: "Administrator sign in" })).toBeTruthy();
  });

  it("a customer session does not open the admin area", async () => {
    signedIn(api); // customer signed in, but no admin session
    renderApp("/admin/customers");
    expect(await screen.findByRole("heading", { name: "Administrator sign in" })).toBeTruthy();
  });

  it("requires MFA enrollment before granting access", async () => {
    mockGetRoutes(api, { "/admin/metrics": metrics, "/admin/audit-events": { items: [], page: 1, pages: 1, total: 0 } });
    api.post.mockImplementation((url) => {
      if (url === "/admin/auth/login") {
        return Promise.resolve({
          data: {
            mfa_required: true,
            enrollment_required: true,
            mfa_token: "mfa-token-123",
            enrollment: { secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", otpauth_uri: "otpauth://totp/Nova:ops@example.com?secret=X" },
          },
        });
      }
      if (url === "/admin/auth/mfa") {
        return Promise.resolve({ data: { user: adminUser, csrf_token: "csrf-admin", expires_at: "2099-01-01T00:00:00Z" } });
      }
      return Promise.reject(new Error("unexpected " + url));
    });

    renderApp("/admin/login");
    fireEvent.change(await screen.findByLabelText("Admin email"), { target: { value: "ops@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ng!Admin#Pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Set up MFA" })).toBeTruthy();
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP")).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1); // no session yet

    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & sign in" }));

    expect(await screen.findByRole("heading", { name: "Operations overview" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Admin authentication successful" })).toBeTruthy();
    expect(screen.getByText("You've successfully signed in to the admin portal.")).toBeTruthy();
    expect(api.post).toHaveBeenLastCalledWith("/admin/auth/mfa", { mfa_token: "mfa-token-123", code: "123456" });
    expect(getCsrfToken("admin")).toBe("csrf-admin");
  });

  it("fails closed if password login does not return an MFA challenge", async () => {
    mockGetRoutes(api, {});
    api.post.mockResolvedValue({ data: { mfa_required: false, user: adminUser, csrf_token: "unsafe" } });

    renderApp("/admin/login");
    fireEvent.change(await screen.findByLabelText("Admin email"), { target: { value: "ops@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ng!Admin#Pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Admin MFA challenge was not provided. Access remains locked.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Administrator sign in" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Operations overview" })).toBeNull();
    expect(getCsrfToken("admin")).toBeNull();
  });

  it("dashboard shows figures from the metrics API", async () => {
    mockGetRoutes(api, {
      "/admin/auth/session": { user: adminUser, csrf_token: "csrf-admin" },
      "/admin/metrics": metrics,
      "/admin/audit-events": { items: [{ id: 1, action: "admin.login_succeeded", actor_email: "ops@example.com", created_at: "2026-10-18T10:00:00Z" }], page: 1, pages: 1, total: 1 },
    });
    renderApp("/admin/dashboard");

    expect(await screen.findByText("₹1,06,837.00")).toBeTruthy();
    expect(screen.getByText("Total customers").nextSibling.textContent).toBe("11");
    expect(screen.getByText("Unverified").nextSibling.textContent).toBe("7");
    expect(screen.getByText("admin.login_succeeded")).toBeTruthy();
    expect(screen.getByText("Matched")).toBeTruthy();
  });
});
