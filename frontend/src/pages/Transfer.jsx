import { useRef, useState } from "react";
import api from "../api/axios";
import { newIdempotencyKey } from "../api/session";
import useApi from "../hooks/useApi";
import { useToast } from "../context/ToastContext";
import {
  AmountInput,
  BalanceSummary,
  PageHeader,
  ReceiptCard,
  SummaryRows
} from "../components/banking";
import Button from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Input } from "../components/ui/Field";
import { ConfirmDialog } from "../components/ui/Modal";
import { getErrorMessage } from "../utils/errors";
import { validateAmount } from "../utils/validation";
import { formatCurrency } from "../utils/format";

const ACCOUNT_PATTERN = /^\d{6,20}$/;

export default function Transfer() {
  const { notify } = useToast();
  const account = useApi("/accounts/me");

  const [form, setForm] = useState({
    receiver_account_number: "",
    amount: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  // Synchronous guard: blocks a second submit before React re-renders
  const inFlight = useRef(false);
  // Reused if this exact submission is retried, so money can't move twice
  const requestKey = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({
      ...form,
      [name]: name === "receiver_account_number" ? value.replace(/\D/g, "").slice(0, 20) : value,
    });
    if (fieldErrors[name]) setFieldErrors({ ...fieldErrors, [name]: undefined });
  };

  const handleReview = (e) => {
    e.preventDefault();
    setError("");

    const errors = {};
    if (!ACCOUNT_PATTERN.test(form.receiver_account_number)) {
      errors.receiver_account_number = "Enter a valid account number (6–20 digits)";
    } else if (form.receiver_account_number === account.data?.account_number) {
      errors.receiver_account_number = "You cannot transfer funds to your own account";
    }
    const amountError = validateAmount(form.amount, { max: account.data?.balance });
    if (amountError) errors.amount = amountError;

    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setConfirming(true);
  };

  const handleConfirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    requestKey.current = requestKey.current || newIdempotencyKey();
    setSubmitting(true);

    try {
      const response = await api.post(
        "/transactions/transfer",
        { receiver_account_number: form.receiver_account_number, amount: Number(form.amount) },
        { headers: { "Idempotency-Key": requestKey.current } }
      );
      requestKey.current = null;
      setReceipt(response.data);
      setForm({ receiver_account_number: "", amount: "" });
      notify("Transfer successful");
      account.reload();
    } catch (err) {
      setError(getErrorMessage(err, "Transfer failed"));
      // Keep the key only when the outcome is unknown (no response), so a retry
      // can't duplicate a transfer that actually went through
      if (err?.response) requestKey.current = null;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
      setConfirming(false);
    }
  };

  if (receipt) {
    return (
      <div className="max-w-xl mx-auto">
        <ReceiptCard
          title="Transfer successful"
          rows={[
            ["Amount", formatCurrency(receipt.amount)],
            ["To account", receipt.receiver_account_number],
            ["From account", receipt.sender_account_number],
            ["Reference", <span key="r" className="font-mono text-sm">{receipt.reference}</span>],
            ["Status", <span key="s" className="capitalize text-success">{receipt.status}</span>],
          ]}
          actions={
            <>
              <Button variant="secondary" to="/history">
                View transactions
              </Button>
              <Button onClick={() => setReceipt(null)}>Make another transfer</Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="Fund Transfer" description="Send money to another VELQORIN account." />

      <div className="card p-6 sm:p-8 space-y-6">
        <BalanceSummary account={account.data} loading={account.loading} />

        {account.error && (
          <Alert type="error" onRetry={account.reload}>
            Failed to load your balance
          </Alert>
        )}
        {error && <Alert type="error">{error}</Alert>}

        <form onSubmit={handleReview} className="space-y-5" noValidate>
          <Input
            label="Receiver account number"
            name="receiver_account_number"
            icon="bank"
            inputMode="numeric"
            placeholder="e.g. 1234567890"
            value={form.receiver_account_number}
            onChange={handleChange}
            error={fieldErrors.receiver_account_number}
            autoComplete="off"
            required
          />

          <AmountInput value={form.amount} onChange={handleChange} error={fieldErrors.amount} required />

          <Button type="submit" className="w-full" disabled={account.loading || !account.data}>
            Review transfer
          </Button>
        </form>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Confirm transfer"
        confirmText={`Send ${formatCurrency(form.amount)}`}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
        loading={submitting}
      >
        <p className="text-ink-secondary mb-4">Please check the details. Transfers can&apos;t be reversed.</p>
        <SummaryRows
          rows={[
            ["To account", form.receiver_account_number],
            ["From account", account.data?.account_number],
            ["Amount", formatCurrency(form.amount)],
            [
              "Balance after",
              formatCurrency(Number(account.data?.balance || 0) - Number(form.amount || 0)),
            ],
          ]}
        />
      </ConfirmDialog>
    </div>
  );
}
