import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import api from "../api/axios";
import { renderApp, signedIn } from "./renderApp";

vi.mock("../api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
  signedIn(api, {
    "/payments/config": { provider: "stripe", test_mode: true, currency: "inr", min_amount_minor: 5000, max_amount_minor: 10000000 },
    "/payments": {
      items: [{ id: 9, amount_minor: 250000, status: "succeeded", created_at: "2026-10-01T10:00:00Z", provider_payment_id: "pi_old" }],
      page: 1,
      pages: 1,
      total: 1,
    },
  });
});

describe("Stripe payments", () => {
  it("is Stripe-only and clearly in test mode", async () => {
    renderApp("/payments");
    expect(await screen.findByText(/Test mode\./)).toBeTruthy();
    expect(screen.queryByText(/razorpay/i)).toBeNull();
    expect(await screen.findByText("₹2,500.00")).toBeTruthy(); // payment history
  });

  it("validates the amount against the Stripe limits", async () => {
    renderApp("/payments");
    fireEvent.change(await screen.findByLabelText("Amount (₹)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to card payment/ }));
    expect(await screen.findByText(/Amount must be at least ₹50.00/)).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates the payment with an idempotency key and never credits from the browser", async () => {
    api.post.mockResolvedValue({
      data: { id: 10, amount_minor: 100000, status: "pending", client_secret: "pi_new_secret_x", provider_payment_id: "pi_new" },
    });
    renderApp("/payments");
    fireEvent.change(await screen.findByLabelText("Amount (₹)"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to card payment/ }));

    expect(await screen.findByText("Pay ₹1,000.00 by card")).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith("/payments", { amount_minor: 100000, idempotency_key: expect.any(String) });
    // The only payment write from the browser is creating the payment
    expect(api.post.mock.calls.map(([url]) => url)).toEqual(["/payments"]);
  });
});
