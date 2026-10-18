import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import api from "../api/axios";
import { renderApp, signedOut } from "./renderApp";

// The code is entered into 6 boxes; a full code typed/pasted into the first box fills them all
async function enterCode(code) {
  fireEvent.change(await screen.findByLabelText("Digit 1 of 6"), { target: { value: code } });
}
const codeValue = () =>
  Array.from({ length: 6 }, (_, i) => screen.getByLabelText(`Digit ${i + 1} of 6`).value).join("");

vi.mock("../api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const codeSent = {
  message: "If the details are valid, we've emailed a 6-digit code.",
  email: "new@example.com",
  code_expires_in: 600,
  resend_available_in: 60,
};

beforeEach(() => {
  vi.resetAllMocks();
  signedOut(api);
});

describe("registration and email verification", () => {
  it("validates password strength before calling the API", async () => {
    renderApp("/register");
    await screen.findByRole("heading", { name: "Create Account" });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New User" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "lettersonly" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByText("Password must contain at least one letter and one number")).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("sends new customers to the verification page instead of logging in", async () => {
    api.post.mockResolvedValue({ data: codeSent });
    renderApp("/register");
    await screen.findByRole("heading", { name: "Create Account" });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New User" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeTruthy();
    expect(screen.getByLabelText("Email address").value).toBe("new@example.com");
    expect(screen.getByText(/Code expires in 10:00|Code expires in 9:5\d/)).toBeTruthy();
  });

  it("verifies the code and offers login", async () => {
    api.post.mockResolvedValue({ data: { message: "Email verified. You can now log in." } });
    renderApp("/verify-email", { email: "new@example.com", expiresIn: 600, resendIn: 60 });

    await enterCode("12a3456");
    expect(codeValue()).toBe("123456"); // digits only, one per box
    fireEvent.click(screen.getByRole("button", { name: "Verify Email" }));

    expect(await screen.findByRole("heading", { name: "Email verified" })).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith("/auth/verify-email", { email: "new@example.com", code: "123456" });
  });

  it("shows the server error for a wrong or expired code", async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { detail: { code: "invalid_code", message: "Invalid or expired code" } } } });
    renderApp("/verify-email", { email: "new@example.com" });
    await enterCode("000000");
    fireEvent.click(screen.getByRole("button", { name: "Verify Email" }));
    expect(await screen.findByText("Invalid or expired code")).toBeTruthy();
  });

  it("enforces the resend cooldown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.post.mockResolvedValue({ data: codeSent });
      renderApp("/verify-email", { email: "new@example.com", expiresIn: 600, resendIn: 60 });

      const resend = await screen.findByRole("button", { name: /Resend code in/ });
      expect(resend.disabled).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(61_000);
      });
      const enabled = screen.getByRole("button", { name: "Resend code" });
      expect(enabled.disabled).toBe(false);
      fireEvent.click(enabled);
      await act(async () => {});
      expect(api.post).toHaveBeenCalledWith("/auth/resend-verification", { email: "new@example.com" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("arriving from the login page", () => {
  it("sends a verification code automatically", async () => {
    api.post.mockResolvedValue({ data: codeSent });
    renderApp("/verify-email", { email: "new@example.com" });
    expect(await screen.findByText(/We sent a 6-digit code to new@example.com/)).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/auth/resend-verification", { email: "new@example.com" });
  });

  it("does not send a second code right after registration", async () => {
    renderApp("/verify-email", { email: "new@example.com", expiresIn: 600, resendIn: 60 });
    await screen.findByText(/We sent a 6-digit code to new@example.com/);
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("code boxes", () => {
  it("moves forward while typing and back on Backspace", async () => {
    renderApp("/verify-email", { email: "new@example.com", expiresIn: 600, resendIn: 60 });
    const first = await screen.findByLabelText("Digit 1 of 6");
    fireEvent.change(first, { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Digit 2 of 6"), { target: { value: "2" } });
    expect(codeValue()).toBe("42");
    expect(document.activeElement).toBe(screen.getByLabelText("Digit 3 of 6"));

    fireEvent.keyDown(screen.getByLabelText("Digit 3 of 6"), { key: "Backspace" });
    expect(codeValue()).toBe("4");
    expect(document.activeElement).toBe(screen.getByLabelText("Digit 2 of 6"));
  });

  it("fills all boxes when a code is pasted", async () => {
    renderApp("/verify-email", { email: "new@example.com", expiresIn: 600, resendIn: 60 });
    const first = await screen.findByLabelText("Digit 1 of 6");
    fireEvent.paste(first, { clipboardData: { getData: () => " 987 654 " } });
    expect(codeValue()).toBe("987654");
  });
});
