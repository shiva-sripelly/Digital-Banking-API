import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import api from "../api/axios";
import { getCsrfToken, setCsrfToken } from "../api/session";
import { customerSession, renderApp, signedIn, signedOut, testUser } from "./renderApp";

vi.mock("../api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
  setCsrfToken("customer", null);
  signedOut(api);
});

describe("public routes", () => {
  it("shows the landing page at /", () => {
    renderApp("/");
    expect(screen.getByRole("heading", { level: 1, name: "Banking made simple, secure and smart" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /open an account/i })[0].getAttribute("href")).toBe("/register");
    expect(screen.getAllByRole("link", { name: "Login" })[0].getAttribute("href")).toBe("/login");
  });

  it("labels the promotional phone illustration as sample data", () => {
    renderApp("/");
    expect(screen.getByRole("img", { name: /sample data/i })).toBeTruthy();
  });

  it("redirects anonymous users from protected routes to login", async () => {
    renderApp("/dashboard");
    expect(await screen.findByRole("heading", { name: "Welcome Back" })).toBeTruthy();
  });

  it("shows a 404 page for unknown routes", () => {
    renderApp("/does-not-exist");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
  });

  it("does not render a Google sign-in button (OAuth is not implemented)", async () => {
    renderApp("/login");
    await screen.findByRole("heading", { name: "Welcome Back" });
    expect(screen.queryByText(/google/i)).toBeNull();
  });

  it("redirects the old deposit page to Stripe Add Money", async () => {
    signedIn(api, { "/payments/config": { min_amount_minor: 5000, max_amount_minor: 10000000 }, "/payments": { items: [], page: 1, pages: 1, total: 0 } });
    renderApp("/deposit");
    expect(await screen.findByRole("heading", { name: "Add Money" })).toBeTruthy();
  });
});

describe("login", () => {
  const fillAndSubmit = async () => {
    await screen.findByRole("heading", { name: "Welcome Back" });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: testUser.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
  };

  it("shows the server error for invalid credentials", async () => {
    api.post.mockRejectedValue({
      response: { status: 401, data: { detail: { code: "invalid_credentials", message: "Invalid email or password" } } },
    });
    renderApp("/login");
    await fillAndSubmit();
    expect(await screen.findByText("Invalid email or password")).toBeTruthy();
  });

  it("guides unverified customers to email verification", async () => {
    api.post.mockRejectedValue({
      response: { status: 403, data: { detail: { code: "email_not_verified", message: "Please verify your email address before logging in." } } },
    });
    renderApp("/login");
    await fillAndSubmit();
    const link = await screen.findByRole("link", { name: "Verify my email" });
    expect(link.getAttribute("href")).toBe("/verify-email");
  });

  it("logs in with a cookie session and lands on the dashboard with real data", async () => {
    signedIn(api);
    api.get.mockImplementationOnce(() => Promise.resolve({ data: { user: null } })); // signed out at first
    api.post.mockResolvedValue({ data: customerSession });
    renderApp("/login");
    await fillAndSubmit();

    expect(await screen.findByText(/Good (morning|afternoon|evening), Asha/)).toBeTruthy();
    expect(await screen.findByRole("dialog", { name: "Welcome back to VELQORIN!" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Let's go/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("₹1,000.00")).toBeTruthy();
    expect(localStorage.length).toBe(0); // nothing stored in localStorage
    expect(getCsrfToken("customer")).toBe("csrf-customer");
  });

  it("toggles password visibility", async () => {
    renderApp("/login");
    const password = await screen.findByLabelText("Password");
    expect(password.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.getAttribute("type")).toBe("text");
  });
});

describe("authenticated shell", () => {
  it("redirects signed-in users away from /login", async () => {
    signedIn(api);
    renderApp("/login");
    expect(await screen.findByText(/Good (morning|afternoon|evening), Asha/)).toBeTruthy();
  });

  it("shows the sandbox indicator", async () => {
    signedIn(api);
    renderApp("/dashboard");
    expect(await screen.findByText(/balances are simulated and payments run in Stripe test mode/i)).toBeTruthy();
  });

  it("logout revokes the server session and returns to the landing page", async () => {
    signedIn(api);
    api.post.mockResolvedValue({ data: { message: "Logged out" } });
    renderApp("/dashboard");
    await screen.findByText(/Good (morning|afternoon|evening), Asha/);

    fireEvent.click(screen.getAllByRole("button", { name: "Logout" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Banking made simple, secure and smart" })).toBeTruthy()
    );
    expect(api.post).toHaveBeenCalledWith("/auth/logout");
    expect(getCsrfToken("customer")).toBeNull();
  });

  it("sidebar links navigate to existing modules", async () => {
    signedIn(api);
    renderApp("/dashboard");
    await screen.findByText(/Good (morning|afternoon|evening), Asha/);

    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    expect(await screen.findByRole("heading", { name: "Personal details" })).toBeTruthy();
  });
});

describe("logout confirmation", () => {
  it("asks before logging out and can be cancelled", async () => {
    signedIn(api);
    api.post.mockResolvedValue({ data: { message: "Logged out" } });
    renderApp("/dashboard");
    await screen.findByText(/Good (morning|afternoon|evening), Asha/);

    fireEvent.click(screen.getAllByRole("button", { name: "Logout" })[0]);
    expect(await screen.findByRole("dialog", { name: "Leaving VELQORIN?" })).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stay logged in" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText(/Good (morning|afternoon|evening), Asha/)).toBeTruthy();
  });
});

describe("session expiry", () => {
  it("shows the Session Expired popup when the API reports it", async () => {
    signedIn(api);
    renderApp("/dashboard");
    await screen.findByText(/Good (morning|afternoon|evening), Asha/);

    window.dispatchEvent(new CustomEvent("velqorin:session-expired", { detail: { portal: "customer" } }));
    expect(await screen.findByRole("dialog", { name: "Session Expired" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
  });
});
