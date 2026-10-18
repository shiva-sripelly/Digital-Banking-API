import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import api from "../api/axios";
import { newIdempotencyKey } from "../api/session";
import useApi from "../hooks/useApi";
import { useToast } from "../context/ToastContext";
import StripeCheckoutForm from "../components/StripeCheckoutForm";
import { AmountInput, BalanceSummary, PageHeader, ReceiptCard, SummaryRows } from "../components/banking";
import Button from "../components/ui/Button";
import { Alert, EmptyState, PaymentStatusBadge, Skeleton } from "../components/ui/Feedback";
import Icon from "../components/ui/Icon";
import { Modal } from "../components/ui/Modal";
import Pagination from "../components/ui/Pagination";
import { getErrorMessage } from "../utils/errors";
import { formatCurrency, formatDate } from "../utils/format";
import { validateAmount } from "../utils/validation";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 15;
const FINAL_STATUSES = new Set(["succeeded", "failed", "canceled", "refunded", "partially_refunded"]);

const fromMinor = (minor) => Number(minor || 0) / 100;

export default function Payments() {
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const account = useApi("/accounts/me");
  const config = useApi("/payments/config");

  const [amount, setAmount] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [checkout, setCheckout] = useState(null); // { payment, clientSecret }
  const [waiting, setWaiting] = useState(false); // server is confirming with Stripe
  const [receipt, setReceipt] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [selected, setSelected] = useState(null);
  const attemptKey = useRef(null);
  const handledReturn = useRef(false);
  const reloadAccount = account.reload;

  const history = useApi(`/payments?page=${historyPage}&page_size=8&v=${historyVersion}`);
  const minAmount = fromMinor(config.data?.min_amount_minor ?? 5000);
  const maxAmount = fromMinor(config.data?.max_amount_minor ?? 10_000_000);

  const stripeOptions = useMemo(
    () =>
      checkout && {
        clientSecret: checkout.clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#381932",
            colorText: "#381932",
            borderRadius: "12px",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          },
        },
      },
    [checkout]
  );

  // Wait for the server to confirm. It credits only on Stripe's word
  // (webhook, or a server-to-server check that we request if it's slow).
  const waitForServer = useCallback(
    async (paymentId) => {
      setWaiting(true);
      setCheckout(null);
      for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        try {
          const { data } =
            attempt % 3 === 0 ? await api.post(`/payments/${paymentId}/refresh`) : await api.get(`/payments/${paymentId}`);
          if (FINAL_STATUSES.has(data.status)) {
            setWaiting(false);
            setHistoryVersion((v) => v + 1);
            attemptKey.current = null;
            if (data.status === "succeeded") {
              reloadAccount();
              setReceipt(data);
              notify("Money added to your wallet");
            } else {
              setError(data.failure_reason || `Payment ${data.status}`);
            }
            return;
          }
        } catch (err) {
          if (err?.response?.status === 429) break;
        }
      }
      setWaiting(false);
      setHistoryVersion((v) => v + 1);
      setError("We're still waiting for Stripe to confirm this payment. Check Payment history in a moment.");
    },
    [reloadAccount, notify]
  );

  // Returning from a bank authentication redirect (3-D Secure): find the
  // payment and wait for the server to confirm it
  useEffect(() => {
    const intentId = searchParams.get("payment_intent");
    if (!intentId || handledReturn.current) return;
    handledReturn.current = true;
    setSearchParams({}, { replace: true });
    api
      .get("/payments?page=1&page_size=50")
      .then(({ data }) => {
        const match = data.items.find((p) => p.provider_payment_id === intentId);
        if (match && !FINAL_STATUSES.has(match.status)) waitForServer(match.id);
      })
      .catch(() => {});
  }, [searchParams, setSearchParams, waitForServer]);

  const startPayment = async (e) => {
    e.preventDefault();
    setError("");
    const amountError = validateAmount(amount, {
      min: minAmount,
      max: maxAmount,
      maxMessage: `The maximum top-up is ${formatCurrency(maxAmount)}`,
    });
    setFieldError(amountError);
    if (amountError) return;

    // One key per top-up attempt: double clicks and retries reuse it
    attemptKey.current = attemptKey.current || newIdempotencyKey();
    setStarting(true);
    try {
      const { data } = await api.post("/payments", {
        amount_minor: Math.round(Number(amount) * 100),
        idempotency_key: attemptKey.current,
      });
      if (!data.client_secret) {
        setError("This payment can't be continued. Please start a new one.");
        attemptKey.current = null;
        return;
      }
      setCheckout({ payment: data, clientSecret: data.client_secret });
    } catch (err) {
      setError(getErrorMessage(err, "Could not start the payment"));
      // A failed start is still recorded server-side; show it in the history
      setHistoryVersion((v) => v + 1);
      if (err?.response?.status === 409 || err?.response?.status === 502) attemptKey.current = null;
    } finally {
      setStarting(false);
    }
  };

  const changeAmount = (value) => {
    setAmount(value);
    setFieldError("");
    attemptKey.current = null;
  };

  if (receipt) {
    return (
      <div className="max-w-xl mx-auto">
        <ReceiptCard
          title="Money added"
          rows={[
            ["Amount", formatCurrency(fromMinor(receipt.amount_minor))],
            ["New balance", account.data ? formatCurrency(account.data.balance) : "—"],
            ["Stripe reference", <span key="r" className="font-mono text-sm break-all">{receipt.transaction_reference}</span>],
            ["Date", formatDate(receipt.succeeded_at || receipt.created_at)],
            ["Mode", "Stripe test mode (simulated money)"],
          ]}
          actions={
            <Button
              onClick={() => {
                setReceipt(null);
                setAmount("");
              }}
            >
              Add more money
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Add Money" description="Top up your wallet with a Stripe test payment." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6 sm:p-8 space-y-6 min-w-0">
          <BalanceSummary account={account.data} loading={account.loading} />

          <Alert type="info">
            <strong className="font-semibold">Test mode.</strong> No real money moves. Use card{" "}
            <span className="font-mono whitespace-nowrap">4242 4242 4242 4242</span>, any future expiry date and any CVC.
          </Alert>

          {error && <Alert type="error">{error}</Alert>}

          {waiting ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border p-5" role="status">
              <span className="w-6 h-6 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <div>
                <p className="font-semibold text-ink">Confirming your payment with Stripe…</p>
                <p className="text-sm text-ink-secondary">Your balance updates as soon as Stripe confirms it.</p>
              </div>
            </div>
          ) : checkout ? (
            <div>
              <p className="font-semibold text-ink mb-4">Pay {formatCurrency(fromMinor(checkout.payment.amount_minor))} by card</p>
              <Elements stripe={stripePromise} options={stripeOptions}>
                <StripeCheckoutForm
                  amount={fromMinor(checkout.payment.amount_minor)}
                  onSubmitted={() => waitForServer(checkout.payment.id)}
                  onCancel={() => setCheckout(null)}
                />
              </Elements>
            </div>
          ) : (
            <form onSubmit={startPayment} className="space-y-5" noValidate>
              <AmountInput
                value={amount}
                onChange={(e) => changeAmount(e.target.value)}
                error={fieldError}
                hint={`Between ${formatCurrency(minAmount)} and ${formatCurrency(maxAmount)}`}
                quickAmounts={[500, 1000, 2000, 5000]}
                onQuickAmount={changeAmount}
              />
              <Button type="submit" loading={starting} loadingText="Starting payment..." className="w-full">
                <Icon name="card" className="w-4 h-4" /> Continue to card payment
              </Button>
            </form>
          )}
        </section>

        <section className="card p-6 min-w-0">
          <h2 className="text-lg font-bold text-ink mb-4">Payment history</h2>
          {history.loading && !history.data && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          )}
          {history.error && (
            <Alert type="error" onRetry={history.reload}>
              Failed to load payment history
            </Alert>
          )}
          {history.data && history.data.items.length === 0 && (
            <EmptyState icon="card" title="No payments yet" description="Your Stripe test payments will appear here." />
          )}
          {history.data && history.data.items.length > 0 && (
            <>
              <ul className="divide-y divide-border">
                {history.data.items.map((payment) => (
                  <li key={payment.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(payment)}
                      className="w-full flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-xl text-left hover:bg-surface-secondary"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{formatCurrency(fromMinor(payment.amount_minor))}</span>
                        <span className="block text-sm text-ink-secondary">{formatDate(payment.created_at)}</span>
                      </span>
                      <PaymentStatusBadge status={payment.status} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Pagination page={historyPage} pageCount={history.data.pages} onPageChange={setHistoryPage} />
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Payment receipt"
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected && (
          <SummaryRows
            rows={[
              ["Amount", formatCurrency(fromMinor(selected.amount_minor))],
              ["Status", <PaymentStatusBadge key="s" status={selected.status} />],
              ...(selected.amount_refunded_minor
                ? [["Refunded", formatCurrency(fromMinor(selected.amount_refunded_minor))]]
                : []),
              ["Stripe reference", <span key="r" className="font-mono text-sm break-all">{selected.provider_payment_id || "—"}</span>],
              ["Created", formatDate(selected.created_at)],
              ...(selected.succeeded_at ? [["Completed", formatDate(selected.succeeded_at)]] : []),
              ...(selected.failure_reason ? [["Reason", selected.failure_reason]] : []),
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
