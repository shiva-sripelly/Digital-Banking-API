import { useRef, useState } from "react";
import api from "../api/axios";
import { newIdempotencyKey } from "../api/session";
import useApi from "../hooks/useApi";
import {
  AmountInput,
  BalanceSummary,
  PageHeader,
  SummaryRows
} from "../components/banking";
import Button from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Input } from "../components/ui/Field";
import { ConfirmDialog } from "../components/ui/Modal";
import { getErrorMessage } from "../utils/errors";
import { validateAmount } from "../utils/validation";
import { formatCurrency, formatDate } from "../utils/format";
import {
  InsufficientBalancePopup,
  TransactionFailedPopup,
  TransactionSuccessPopup,
} from "../components/TransactionPopups";

const ACCOUNT_PATTERN = /^\d{6,20}$/;

export default function Transfer() {
  const account = useApi("/accounts/me");

  const [form, setForm] = useState({
    receiver_account_number: "",
    amount: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // success popup
  const [failure, setFailure] = useState(null); // failed popup
  const [shortfall, setShortfall] = useState(null); // insufficient balance popup
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
    const amountError = validateAmount(form.amount);
    if (amountError) errors.amount = amountError;

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (Number(form.amount) > Number(account.data?.balance || 0)) {
      setShortfall({ available: Number(account.data?.balance || 0), required: Number(form.amount) });
      return;
    }
    setConfirming(true);
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
      const sent = response.data;
      setResult({
        message: `${formatCurrency(sent.amount)} has been transferred to account ••••${sent.receiver_account_number.slice(-4)}.`,
        rows: [
          ["Transaction ID", sent.reference],
          ["Date & Time", formatDate(new Date())],
          ["Remaining Balance", formatCurrency(Number(account.data?.balance || 0) - Number(sent.amount))],
        ],
      });
      setForm({ receiver_account_number: "", amount: "" });
      account.reload();
    } catch (err) {
      const reason = getErrorMessage(err, "Transfer failed");
      if (reason === "Insufficient balance") {
        setShortfall({ available: Number(account.data?.balance || 0), required: Number(form.amount) });
      } else {
        setFailure({ reason, at: new Date() });
      }
      // Keep the key only when the outcome is unknown (no response), so a retry
      // can't duplicate a transfer that actually went through
      if (err?.response) requestKey.current = null;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
      setConfirming(false);
    }
  };

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

      <TransactionSuccessPopup result={result} onDone={() => setResult(null)} />
      <TransactionFailedPopup
        failure={failure}
        onClose={() => setFailure(null)}
        onRetry={() => {
          setFailure(null);
          setConfirming(true);
        }}
      />
      <InsufficientBalancePopup shortfall={shortfall} onClose={() => setShortfall(null)} />
    </div>
  );
}
