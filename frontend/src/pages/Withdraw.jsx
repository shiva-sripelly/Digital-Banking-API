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
import { ConfirmDialog } from "../components/ui/Modal";
import { getErrorMessage } from "../utils/errors";
import { validateAmount } from "../utils/validation";
import { formatCurrency, formatDate } from "../utils/format";
import {
  InsufficientBalancePopup,
  TransactionFailedPopup,
  TransactionSuccessPopup,
} from "../components/TransactionPopups";

export default function Withdraw() {
  const account = useApi("/accounts/me");

  const [amount, setAmount] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // success popup
  const [failure, setFailure] = useState(null); // failed popup
  const [shortfall, setShortfall] = useState(null); // insufficient balance popup
  const inFlight = useRef(false);
  // Reused if this exact submission is retried, so money can't move twice
  const requestKey = useRef(null);

  const handleReview = (e) => {
    e.preventDefault();
    setError("");
    const amountError = validateAmount(amount);
    setFieldError(amountError);
    if (amountError) return;
    if (Number(amount) > Number(account.data?.balance || 0)) {
      setShortfall({ available: Number(account.data?.balance || 0), required: Number(amount) });
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
        "/transactions/withdraw",
        { amount: Number(amount) },
        { headers: { "Idempotency-Key": requestKey.current } }
      );
      requestKey.current = null;
      const done = response.data;
      setResult({
        message: `${formatCurrency(done.amount)} has been withdrawn from your account.`,
        rows: [
          ["Transaction ID", done.reference],
          ["Date & Time", formatDate(new Date())],
          ["Remaining Balance", formatCurrency(done.balance)],
        ],
      });
      setAmount("");
      account.reload();
    } catch (err) {
      const reason = getErrorMessage(err, "Withdraw failed");
      if (reason === "Insufficient balance") {
        setShortfall({ available: Number(account.data?.balance || 0), required: Number(amount) });
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
      <PageHeader title="Withdraw Funds" description="Withdraw money from your account." />

      <div className="card p-6 sm:p-8 space-y-6">
        <BalanceSummary account={account.data} loading={account.loading} />

        {account.error && (
          <Alert type="error" onRetry={account.reload}>
            Failed to load your balance
          </Alert>
        )}
        {error && <Alert type="error">{error}</Alert>}

        <form onSubmit={handleReview} className="space-y-5" noValidate>
          <AmountInput
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setFieldError("");
            }}
            error={fieldError}
            quickAmounts={[500, 1000, 2000, 5000]}
            onQuickAmount={(value) => {
              setAmount(value);
              setFieldError("");
            }}
            required
          />

          <Button type="submit" className="w-full" disabled={account.loading || !account.data}>
            Review withdrawal
          </Button>
        </form>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Confirm withdrawal"
        confirmText={`Withdraw ${formatCurrency(amount)}`}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
        loading={submitting}
      >
        <SummaryRows
          rows={[
            ["Account", account.data?.account_number],
            ["Amount", formatCurrency(amount)],
            ["Balance after", formatCurrency(Number(account.data?.balance || 0) - Number(amount || 0))],
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
