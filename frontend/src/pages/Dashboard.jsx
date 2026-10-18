import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import useApi from "../hooks/useApi";
import { PageHeader, TransactionDetailModal, TransactionItem } from "../components/banking";
import Button from "../components/ui/Button";
import { Alert, EmptyState, Skeleton } from "../components/ui/Feedback";
import Icon from "../components/ui/Icon";
import { formatCurrency, formatDate, getDirection, greeting } from "../utils/format";

const quickActions = [
  { to: "/transfer", label: "Send", icon: "send" },
  { to: "/payments", label: "Add money", icon: "arrowDownLeft" },
  { to: "/withdraw", label: "Withdraw", icon: "arrowUpRight" },
  { to: "/history", label: "History", icon: "history" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Totals computed from the user's real transaction history
function useActivitySummary(transactions, accountNumber) {
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    const since = now - 30 * DAY_MS;
    const recent = (transactions || []).filter((t) => new Date(t.created_at).getTime() >= since);
    return recent.reduce(
      (summary, txn) => {
        const amount = Number(txn.amount);
        if (getDirection(txn, accountNumber) === "in") summary.moneyIn += amount;
        else summary.moneyOut += amount;
        summary.count += 1;
        return summary;
      },
      { moneyIn: 0, moneyOut: 0, count: 0 }
    );
  }, [transactions, accountNumber, now]);
}

export default function Dashboard() {
  const { user } = useAuth();
  const { notify } = useToast();
  const account = useApi("/accounts/me");
  const history = useApi("/transactions/history");
  const [selectedId, setSelectedId] = useState(null);

  const accountNumber = account.data?.account_number;
  const summary = useActivitySummary(history.data, accountNumber);
  const recent = (history.data || []).slice(0, 5);

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      notify("Account number copied");
    } catch {
      notify("Could not copy account number", "error");
    }
  };

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${user?.full_name?.split(" ")[0] || "there"}`}
        description="Here's an overview of your account."
      />

      {account.error && (
        <Alert type="error" onRetry={account.reload} className="mb-6">
          Failed to load account details
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Balance */}
        <section className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-primary text-milk-100 p-6 sm:p-8 shadow-xl shadow-primary/20">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-primary-light/50 blur-2xl" aria-hidden="true" />
          <div className="absolute right-10 -bottom-24 w-72 h-72 rounded-full bg-primary-hover/80" aria-hidden="true" />

          <div className="relative">
            <p className="text-plum-200 font-medium">Available Balance</p>
            {account.loading ? (
              <Skeleton className="h-12 w-56 mt-2 bg-white/15" />
            ) : (
              <p className="mt-1 text-4xl sm:text-5xl font-extrabold tracking-tight break-all">
                {account.data ? formatCurrency(account.data.balance, account.data.currency) : "—"}
              </p>
            )}
            <p className="mt-2 text-sm text-plum-200 min-h-5">
              {accountNumber && `Account •••• ${accountNumber.slice(-4)}`}
            </p>

            <div className="mt-8 grid grid-cols-4 gap-2 sm:gap-4 max-w-md">
              {quickActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="group flex flex-col items-center gap-2 rounded-2xl py-2 hover:bg-white/5"
                >
                  <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition">
                    <Icon name={action.icon} />
                  </span>
                  <span className="text-sm font-medium">{action.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Account details */}
        <section className="card p-6">
          <h2 className="text-lg font-bold text-ink">Account details</h2>
          {account.loading ? (
            <div className="mt-5 space-y-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            account.data && (
              <dl className="mt-5 space-y-4">
                <div>
                  <dt className="text-sm text-ink-secondary">Account number</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-lg font-semibold text-ink tracking-wider">{accountNumber}</span>
                    <button
                      type="button"
                      onClick={copyAccountNumber}
                      className="p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-secondary"
                      aria-label="Copy account number"
                    >
                      <Icon name="copy" className="w-4 h-4" />
                    </button>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-secondary">Account holder</dt>
                  <dd className="font-semibold text-ink">{user?.full_name}</dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-ink-secondary">Currency</dt>
                    <dd className="font-semibold text-ink">{account.data.currency}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-secondary">Opened</dt>
                    <dd className="font-semibold text-ink">{formatDate(account.data.created_at, false)}</dd>
                  </div>
                </div>
              </dl>
            )
          )}
        </section>

        {/* Recent transactions */}
        <section className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-4 mb-2">
            <h2 className="text-lg font-bold text-ink">Recent transactions</h2>
            <Link to="/history" className="link text-sm inline-flex items-center gap-1">
              View all <Icon name="chevronRight" className="w-4 h-4" />
            </Link>
          </div>

          {history.loading && (
            <div className="space-y-4 mt-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-11 h-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          )}

          {history.error && (
            <Alert type="error" onRetry={history.reload} className="mt-4">
              Failed to load transactions
            </Alert>
          )}

          {!history.loading && !history.error && recent.length === 0 && (
            <EmptyState
              title="No transactions yet"
              description="Add money with a Stripe test payment and it will show up here."
              action={{ to: "/payments", label: "Add money" }}
            />
          )}

          {recent.length > 0 && (
            <ul className="divide-y divide-border">
              {recent.map((txn) => (
                <li key={txn.id}>
                  <TransactionItem txn={txn} myAccountNumber={accountNumber} onClick={() => setSelectedId(txn.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Activity + assistant */}
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-bold text-ink">Last 30 days</h2>
            {history.loading ? (
              <div className="mt-5 space-y-3">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4">
                  <Icon name="arrowDownLeft" className="w-5 h-5 text-success" />
                  <span className="flex-1 text-ink-secondary">Money in</span>
                  <span className="font-bold text-success">{formatCurrency(summary.moneyIn)}</span>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-surface-secondary p-4">
                  <Icon name="arrowUpRight" className="w-5 h-5 text-primary" />
                  <span className="flex-1 text-ink-secondary">Money out</span>
                  <span className="font-bold text-ink">{formatCurrency(summary.moneyOut)}</span>
                </div>
                <p className="text-sm text-ink-secondary">
                  {summary.count} transaction{summary.count === 1 ? "" : "s"} in the last 30 days
                </p>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-accent p-6">
            <span className="w-11 h-11 rounded-xl bg-primary text-milk-100 flex items-center justify-center">
              <Icon name="sparkles" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-ink">Ask the AI assistant</h2>
            <p className="mt-1 text-ink-secondary">Get quick answers about your balance and recent activity.</p>
            <Button to="/ai-chat" variant="secondary" className="mt-4">
              Open assistant
            </Button>
          </section>
        </div>
      </div>

      <TransactionDetailModal
        transactionId={selectedId}
        myAccountNumber={accountNumber}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
