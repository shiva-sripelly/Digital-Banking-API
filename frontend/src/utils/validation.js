import { formatCurrency } from "./format";

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Returns an error message for an amount string, or "" if valid. */
export function validateAmount(value, { max, min = 0.01, maxMessage = "Amount exceeds your available balance" } = {}) {
  const trimmed = String(value).trim();
  if (!trimmed) return "Enter an amount";
  if (!AMOUNT_PATTERN.test(trimmed)) return "Enter a valid amount with up to 2 decimal places";
  const amount = Number(trimmed);
  if (amount < min) return `Amount must be at least ${formatCurrency(min)}`;
  if (max !== undefined && amount > Number(max)) return maxMessage;
  return "";
}
