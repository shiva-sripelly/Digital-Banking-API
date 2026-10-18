import { describe, expect, it } from "vitest";
import { getErrorMessage, getFieldErrors } from "../utils/errors";
import { formatCurrency, getDirection } from "../utils/format";
import { validateAmount } from "../utils/validation";

describe("getErrorMessage", () => {
  it("handles string and validation-array details", () => {
    expect(getErrorMessage({ response: { data: { detail: "Insufficient balance" } } })).toBe("Insufficient balance");
    expect(
      getErrorMessage({ response: { data: { detail: [{ msg: "a" }, { msg: "b" }] } } })
    ).toBe("a, b");
  });

  it("explains network failures", () => {
    expect(getErrorMessage(new Error("Network Error"))).toMatch(/cannot reach the server/i);
  });
});

describe("getFieldErrors", () => {
  it("maps FastAPI 422 errors to field names", () => {
    const err = {
      response: {
        data: {
          detail: [
            { loc: ["body", "email"], msg: "value is not a valid email address" },
            { loc: ["body", "password"], msg: "String should have at least 6 characters" },
          ],
        },
      },
    };
    expect(getFieldErrors(err)).toEqual({
      email: "value is not a valid email address",
      password: "String should have at least 6 characters",
    });
  });
});

describe("validateAmount", () => {
  it("accepts valid amounts", () => {
    expect(validateAmount("10")).toBe("");
    expect(validateAmount("10.5")).toBe("");
    expect(validateAmount("999.99", { max: "1000.00" })).toBe("");
  });

  it("rejects empty, malformed, too-small and too-large amounts", () => {
    expect(validateAmount("")).toMatch(/enter an amount/i);
    expect(validateAmount("abc")).toMatch(/valid amount/i);
    expect(validateAmount("1.234")).toMatch(/2 decimal/i);
    expect(validateAmount("0")).toMatch(/at least/i);
    expect(validateAmount("1000.01", { max: "1000.00" })).toMatch(/exceeds/i);
  });
});

describe("format helpers", () => {
  it("formats INR", () => {
    expect(formatCurrency("124500")).toBe("₹1,24,500.00");
  });

  it("derives money direction from the viewer's account", () => {
    expect(getDirection({ transaction_type: "deposit" }, "1")).toBe("in");
    expect(getDirection({ transaction_type: "withdraw" }, "1")).toBe("out");
    expect(getDirection({ transaction_type: "transfer", sender_account_number: "1" }, "1")).toBe("out");
    expect(getDirection({ transaction_type: "transfer", sender_account_number: "2" }, "1")).toBe("in");
  });
});

describe("structured API errors", () => {
  it("reads {code, message} details", async () => {
    const { getErrorCode } = await import("../utils/errors");
    const err = { response: { data: { detail: { code: "email_not_verified", message: "Verify first" } } } };
    expect(getErrorMessage(err)).toBe("Verify first");
    expect(getErrorCode(err)).toBe("email_not_verified");
  });

  it("uses a custom max message for payment limits", () => {
    expect(validateAmount("2000000", { max: 100000, maxMessage: "Too much" })).toBe("Too much");
  });
});
