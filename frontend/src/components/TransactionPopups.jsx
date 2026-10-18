import { useNavigate } from "react-router-dom";
import StatusPopup from "./StatusPopup";
import Button from "./ui/Button";
import { formatCurrency, formatDate } from "../utils/format";

/** `result`: { message, rows: [[label, value]] } */
export function TransactionSuccessPopup({ result, onDone }) {
  return (
    <StatusPopup
      open={Boolean(result)}
      onClose={onDone}
      tone="success"
      icon="check"
      title="Transaction Successful!"
      message={result?.message}
      details={result?.rows}
      actions={
        <Button onClick={onDone} className="px-12">
          Done
        </Button>
      }
    />
  );
}

/** `failure`: { reason, reference? } */
export function TransactionFailedPopup({ failure, onClose, onRetry }) {
  return (
    <StatusPopup
      open={Boolean(failure)}
      onClose={onClose}
      tone="danger"
      icon="x"
      title="Transaction Failed"
      message="We couldn't complete your transaction. Please try again or contact support if the issue persists."
      details={
        failure && [
          ["Reason", failure.reason],
          ["Transaction ID", failure.reference || "-"],
          ["Date & Time", formatDate(failure.at || new Date())],
        ]
      }
      actions={
        <Button onClick={onRetry || onClose} className="px-10">
          Try Again
        </Button>
      }
    />
  );
}

/** `shortfall`: { available, required } */
export function InsufficientBalancePopup({ shortfall, onClose }) {
  const navigate = useNavigate();
  return (
    <StatusPopup
      open={Boolean(shortfall)}
      onClose={onClose}
      tone="warning"
      icon="warning"
      title="Insufficient Balance"
      message={
        shortfall &&
        `Your available balance is ${formatCurrency(shortfall.available)}, but this transaction requires ${formatCurrency(shortfall.required)}.`
      }
      actions={
        <div className="flex flex-col gap-3 w-full sm:max-w-64">
          <Button onClick={() => navigate("/payments")}>Add Money</Button>
          <Button variant="secondary" onClick={onClose} className="min-h-12">
            Cancel
          </Button>
        </div>
      }
    />
  );
}
