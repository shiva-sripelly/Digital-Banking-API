import Button from "./Button";
import Icon from "./Icon";

const alertStyles = {
  error: { className: "alert-error", icon: "alert", role: "alert" },
  success: { className: "alert-success", icon: "checkCircle", role: "status" },
  info: { className: "alert-info", icon: "info", role: "status" },
};

export function Alert({ type = "info", children, onRetry, className = "" }) {
  const style = alertStyles[type];

  return (
    <div className={`${style.className} ${className}`} role={style.role}>
      <Icon name={style.icon} className="w-5 h-5 mt-0.5" />
      <div className="flex-1 min-w-0 break-words">{children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2 shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = "history", title, description, action }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4">
      <div className="w-14 h-14 rounded-2xl bg-accent text-primary flex items-center justify-center mb-4">
        <Icon name={icon} className="w-7 h-7" />
      </div>
      <p className="text-lg font-bold text-ink">{title}</p>
      {description && <p className="text-ink-secondary mt-1 max-w-sm">{description}</p>}
      {action && (
        <Button to={action.to} variant="secondary" className="mt-5">
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }) {
  return <div className={`animate-pulse rounded-lg bg-accent/70 ${className}`} aria-hidden="true" />;
}

const typeStyles = {
  deposit: "bg-green-50 text-success",
  stripe_topup: "bg-green-50 text-success",
  demo_funding: "bg-green-50 text-success",
  withdraw: "bg-red-50 text-danger",
  stripe_refund: "bg-red-50 text-danger",
  transfer: "bg-accent text-primary",
};

const TYPE_LABELS = {
  deposit: "Deposit",
  stripe_topup: "Stripe top-up",
  stripe_refund: "Refund",
  demo_funding: "Demo funds",
  withdraw: "Withdrawal",
  transfer: "Transfer",
};

export function TypeBadge({ type }) {
  const key = type?.toLowerCase();
  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
        typeStyles[key] || typeStyles.transfer
      }`}
    >
      {TYPE_LABELS[key] || type}
    </span>
  );
}

export function StatusBadge({ status }) {
  const ok = status?.toLowerCase() === "success";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
        ok ? "bg-green-50 text-success" : "bg-orange-50 text-warning"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-success" : "bg-warning"}`} />
      {status}
    </span>
  );
}

const paymentStatusStyles = {
  succeeded: "bg-green-50 text-success",
  pending: "bg-orange-50 text-warning",
  processing: "bg-orange-50 text-warning",
  requires_action: "bg-orange-50 text-warning",
  failed: "bg-red-50 text-danger",
  canceled: "bg-surface-secondary text-ink-secondary",
  refunded: "bg-accent text-primary",
  partially_refunded: "bg-accent text-primary",
};

export function PaymentStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize whitespace-nowrap ${
        paymentStatusStyles[status] || paymentStatusStyles.pending
      }`}
    >
      {String(status).replace(/_/g, " ")}
    </span>
  );
}
