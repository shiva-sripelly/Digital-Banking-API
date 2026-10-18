import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import api from "../api/axios";
import { renderApp, signedIn, testAccount } from "./renderApp";

vi.mock("../api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
  signedIn(api);
});

async function fillTransfer(accountNumber, amount) {
  renderApp("/transfer");
  await screen.findByText("₹1,000.00");
  fireEvent.change(screen.getByLabelText("Receiver account number"), { target: { value: accountNumber } });
  fireEvent.change(screen.getByLabelText("Amount (₹)"), { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
}

describe("transfer flow", () => {
  it("validates before showing the confirmation", async () => {
    await fillTransfer(testAccount.account_number, "10");
    expect(screen.getByText("You cannot transfer funds to your own account")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Receiver account number"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText("Amount (₹)"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    expect(screen.getByText("Amount exceeds your available balance")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("requires confirmation and submits exactly once", async () => {
    let resolveTransfer;
    api.post.mockImplementation(
      () => new Promise((resolve) => {
        resolveTransfer = resolve;
      })
    );

    await fillTransfer("9876543210", "250");

    expect(screen.getByRole("dialog", { name: "Confirm transfer" })).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();

    const confirm = screen.getByRole("button", { name: "Send ₹250.00" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      "/transactions/transfer",
      { receiver_account_number: "9876543210", amount: 250 },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );

    resolveTransfer({
      data: {
        message: "Fund transfer successful",
        reference: "TXNABC123",
        amount: "250.00",
        sender_account_number: testAccount.account_number,
        receiver_account_number: "9876543210",
        status: "success",
      },
    });

    expect(await screen.findByRole("heading", { name: "Transfer successful" })).toBeTruthy();
    expect(screen.getByText("TXNABC123")).toBeTruthy();
  });

  it("shows the backend error if the transfer is rejected", async () => {
    api.post.mockRejectedValue({ response: { status: 404, data: { detail: "Receiver account not found" } } });
    await fillTransfer("9876543210", "100");
    fireEvent.click(screen.getByRole("button", { name: "Send ₹100.00" }));
    expect(await screen.findByText("Receiver account not found")).toBeTruthy();
  });
});
