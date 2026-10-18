export function formatCurrency(amount, currency = "INR") {
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);
  } catch {
    return `₹ ${value.toFixed(2)}`;
  }
}

export function formatDate(value, withTime = true) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

// Whether a transaction added money to (in) or took money from (out) this account.
const MONEY_IN = new Set(["deposit", "stripe_topup", "demo_funding"]);
const MONEY_OUT = new Set(["withdraw", "stripe_refund"]);

export function getDirection(txn, myAccountNumber) {
  if (MONEY_IN.has(txn.transaction_type)) return "in";
  if (MONEY_OUT.has(txn.transaction_type)) return "out";
  return txn.sender_account_number === myAccountNumber ? "out" : "in";
}

const DESCRIPTIONS = {
  deposit: "Deposit",
  stripe_topup: "Added money (Stripe test)",
  stripe_refund: "Stripe refund",
  demo_funding: "Demo funds (development)",
  withdraw: "Withdrawal",
};

export function describeTransaction(txn, myAccountNumber) {
  if (DESCRIPTIONS[txn.transaction_type]) return DESCRIPTIONS[txn.transaction_type];
  return getDirection(txn, myAccountNumber) === "out"
    ? `Transfer to ${txn.receiver_account_number || "account"}`
    : `Transfer from ${txn.sender_account_number || "account"}`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
