import { useEffect, useState } from "react";
import api from "../api/axios";
import Button from "./ui/Button";
import { Alert, Skeleton, StatusBadge, TypeBadge } from "./ui/Feedback";
import { Input } from "./ui/Field";
import Icon from "./ui/Icon";
import { Modal } from "./ui/Modal";
import { describeTransaction, formatCurrency, formatDate, getDirection } from "../utils/format";
import { getErrorMessage } from "../utils/errors";

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 sm:mb-8">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-1 text-ink-secondary">{description}</p>}
      </div>
      {actions && <div className="flex gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}

export function BalanceSummary({ account, loading }) {
  return (
    <div className="rounded-2xl bg-primary text-milk-100 px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-plum-200">Available balance</p>
        {loading ? (
          <Skeleton className="h-7 w-36 mt-1 bg-white/15" />
        ) : (
          <p className="text-2xl font-extrabold truncate">
            {account ? formatCurrency(account.balance, account.currency) : "—"}
          </p>
        )}
      </div>
      <span className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
        <Icon name="wallet" />
      </span>
    </div>
  );
}

export function AmountInput({ quickAmounts, onQuickAmount, ...props }) {
  return (
    <div>
      <Input
        label="Amount (₹)"
        type="text"
        inputMode="decimal"
        name="amount"
        icon="wallet"
        placeholder="0.00"
        autoComplete="off"
        {...props}
      />
      {quickAmounts && (
        <div className="flex flex-wrap gap-2 mt-3">
          {quickAmounts.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => onQuickAmount(String(amount))}
              className="px-4 py-2 rounded-full border border-border bg-surface text-sm font-semibold text-ink hover:border-primary-light hover:bg-surface-secondary transition"
            >
              {formatCurrency(amount).replace(/\.00$/, "")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SummaryRows({ rows }) {
  return (
    <dl className="divide-y divide-border rounded-2xl border border-border bg-surface-secondary/60">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="text-ink-secondary">{label}</dt>
          <dd className="font-semibold text-ink text-right break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReceiptCard({ title, rows, actions }) {
  return (
    <div className="card p-6 sm:p-8 text-center">
      <span className="mx-auto w-16 h-16 rounded-full bg-green-50 text-success flex items-center justify-center">
        <Icon name="checkCircle" className="w-9 h-9" />
      </span>
      <h2 className="mt-4 text-2xl font-bold text-ink">{title}</h2>
      <div className="mt-6 text-left">
        <SummaryRows rows={rows} />
      </div>
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">{actions}</div>
    </div>
  );
}

export function TransactionItem({ txn, myAccountNumber, onClick }) {
  const direction = getDirection(txn, myAccountNumber);
  const incoming = direction === "in";

  return (
    <button
      type="button"
      onClick={() => onClick?.(txn)}
      className="w-full flex items-center gap-3 sm:gap-4 py-3 px-2 -mx-2 rounded-xl text-left transition hover:bg-surface-secondary"
    >
      <span
        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
          incoming ? "bg-green-50 text-success" : "bg-accent text-primary"
        }`}
      >
        <Icon name={incoming ? "arrowDownLeft" : "arrowUpRight"} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-ink truncate">{describeTransaction(txn, myAccountNumber)}</span>
        <span className="block text-sm text-ink-secondary truncate">{formatDate(txn.created_at)}</span>
      </span>
      <span className={`font-bold whitespace-nowrap ${incoming ? "text-success" : "text-ink"}`}>
        {incoming ? "+" : "−"}
        {formatCurrency(txn.amount)}
      </span>
    </button>
  );
}

function TransactionDetail({ transactionId, myAccountNumber }) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/transactions/${transactionId}`)
      .then((res) => !cancelled && setState({ loading: false, data: res.data, error: "" }))
      .catch(
        (err) =>
          !cancelled &&
          setState({ loading: false, data: null, error: getErrorMessage(err, "Failed to load transaction") })
      );
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  if (state.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40 mx-auto" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (state.error) return <Alert type="error">{state.error}</Alert>;

  const txn = state.data;
  const incoming = getDirection(txn, myAccountNumber) === "in";

  return (
    <div>
      <div className="text-center mb-6">
        <p className={`text-3xl font-extrabold ${incoming ? "text-success" : "text-ink"}`}>
          {incoming ? "+" : "−"}
          {formatCurrency(txn.amount)}
        </p>
        <p className="mt-1 text-ink-secondary">{describeTransaction(txn, myAccountNumber)}</p>
      </div>
      <SummaryRows
        rows={[
          ["Status", <StatusBadge key="s" status={txn.status} />],
          ["Type", <TypeBadge key="t" type={txn.transaction_type} />],
          ["Reference", <span key="r" className="font-mono text-sm">{txn.reference}</span>],
          ["From account", txn.sender_account_number || "—"],
          ["To account", txn.receiver_account_number || "—"],
          ["Date", formatDate(txn.created_at)],
        ]}
      />
    </div>
  );
}

export function TransactionDetailModal({ transactionId, myAccountNumber, onClose }) {
  return (
    <Modal
      open={Boolean(transactionId)}
      onClose={onClose}
      title="Transaction details"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {transactionId && <TransactionDetail transactionId={transactionId} myAccountNumber={myAccountNumber} />}
    </Modal>
  );
}
