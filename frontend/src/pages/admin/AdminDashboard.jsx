import { Link } from "react-router-dom";
import useApi from "../../hooks/useApi";
import { PageHeader } from "../../components/banking";
import { StatCard } from "../../components/admin/AdminUI";
import { Alert, Skeleton } from "../../components/ui/Feedback";
import Icon from "../../components/ui/Icon";
import { formatCurrency, formatDate } from "../../utils/format";

export default function AdminDashboard() {
  const metrics = useApi("/admin/metrics");
  const audit = useApi("/admin/audit-events?page_size=8");
  const m = metrics.data;

  return (
    <div>
      <PageHeader title="Operations overview" description="Live figures from the database. Financial data is read-only." />

      {metrics.error && (
        <Alert type="error" onRetry={metrics.reload} className="mb-6">
          Failed to load metrics
        </Alert>
      )}

      {metrics.loading && !m && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {m && (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-secondary mb-3">Customers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <StatCard label="Total customers" value={m.customers.total} icon="user" />
              <StatCard label="Verified" value={m.customers.verified} icon="checkCircle" tone="good" />
              <StatCard label="Unverified" value={m.customers.unverified} icon="mail" tone="warn" />
              <StatCard label="Active" value={m.customers.active} icon="shield" tone="good" />
              <StatCard label="Inactive" value={m.customers.inactive} icon="lock" tone={m.customers.inactive ? "bad" : "default"} />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-secondary mb-3">Money (simulated)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <StatCard
                label="Total wallet balances"
                value={formatCurrency(m.wallets.total_balance)}
                hint={`${m.wallets.accounts} accounts`}
                icon="wallet"
              />
              <StatCard
                label="Internal transfers"
                value={m.transfers.count}
                hint={`${formatCurrency(m.transfers.total_amount)} moved`}
                icon="transfer"
              />
              <StatCard
                label="Ledger reconciliation"
                value={m.ledger.status === "matched" ? "Matched" : "Mismatch"}
                hint={`${m.ledger.mismatched_accounts} mismatched accounts · ${m.ledger.unbalanced_transactions} unbalanced`}
                icon="chart"
                tone={m.ledger.status === "matched" ? "good" : "bad"}
              />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-secondary">Stripe test payments</h2>
              <Link to="/admin/payments" className="link text-sm">View payments</Link>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              <StatCard label="Succeeded" value={m.payments.succeeded} icon="checkCircle" tone="good" />
              <StatCard label="Pending" value={m.payments.pending} icon="history" tone="warn" />
              <StatCard label="Failed" value={m.payments.failed} hint={`${m.payments.canceled} canceled`} icon="alert" tone="bad" />
              <StatCard label="Refunded" value={m.payments.refunded} icon="arrowUpRight" />
              <StatCard
                label="Needs attention"
                value={m.payments.needs_attention}
                icon="info"
                tone={m.payments.needs_attention ? "bad" : "default"}
              />
            </div>
          </section>

          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-ink">Recent activity</h2>
              <Link to="/admin/audit" className="link text-sm inline-flex items-center gap-1">
                Audit log <Icon name="chevronRight" className="w-4 h-4" />
              </Link>
            </div>
            {audit.data?.items?.length ? (
              <ul className="divide-y divide-border">
                {audit.data.items.map((event) => (
                  <li key={event.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="font-mono text-sm text-ink">{event.action}</span>
                    <span className="text-sm text-ink-secondary">
                      {event.actor_email || event.actor_type} · {formatDate(event.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-secondary">No activity recorded yet.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
