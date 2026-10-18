import { useState } from "react";
import api from "../../api/axios";
import useApi from "../../hooks/useApi";
import { PageHeader, SummaryRows } from "../../components/banking";
import { DataTable } from "../../components/admin/AdminUI";
import Button from "../../components/ui/Button";
import { Alert, PaymentStatusBadge, Skeleton } from "../../components/ui/Feedback";
import { Input } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { getErrorMessage } from "../../utils/errors";
import { formatCurrency, formatDate } from "../../utils/format";

const TABS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
  { value: "refunded", label: "Refunded" },
  { value: "attention", label: "Needs attention" },
];

const reconciliationStyles = {
  matched: "bg-green-50 text-success",
  pending: "bg-surface-secondary text-ink-secondary",
  mismatch: "bg-red-50 text-danger",
  needs_review: "bg-orange-50 text-warning",
};

function ReconciliationBadge({ status }) {
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize whitespace-nowrap ${reconciliationStyles[status]}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const minor = (value) => formatCurrency(Number(value || 0) / 100);

function PaymentDetail({ id, onClose }) {
  const detail = useApi(`/admin/payments/${id}`);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const p = detail.data;

  const checkStripe = async () => {
    setChecking(true);
    try {
      const { data } = await api.get(`/admin/payments/${id}?check_stripe=true`);
      setCheck(data.stripe_check || { error: "No Stripe reference" });
    } catch (err) {
      setCheck({ error: getErrorMessage(err, "Check failed") });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Stripe payment"
      size="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {p?.provider_payment_id && (
            <Button onClick={checkStripe} loading={checking} loadingText="Checking...">Compare with Stripe</Button>
          )}
        </>
      }
    >
      {detail.loading && !p && <Skeleton className="h-56" />}
      {detail.error && <Alert type="error" onRetry={detail.reload}>Failed to load payment</Alert>}
      {p && (
        <div className="space-y-4">
          <SummaryRows
            rows={[
              ["Customer", p.customer_email],
              ["Amount", minor(p.amount_minor)],
              ["Refunded", minor(p.amount_refunded_minor)],
              ["Status", <PaymentStatusBadge key="s" status={p.status} />],
              ["Reconciliation", <ReconciliationBadge key="r" status={p.reconciliation_status} />],
              ["Provider reference", <span key="p" className="font-mono text-sm break-all">{p.provider_payment_id || "—"}</span>],
              ["Wallet transaction", p.transaction_reference ? <span key="t" className="font-mono text-sm break-all">{p.transaction_reference}</span> : "Not credited"],
              ["Created", formatDate(p.created_at)],
              ["Succeeded", formatDate(p.succeeded_at)],
              ...(p.failure_reason ? [["Note", p.failure_reason]] : []),
            ]}
          />
          {check && (
            check.error ? (
              <Alert type="error">{check.error}</Alert>
            ) : (
              <Alert type={check.consistent ? "success" : "error"}>
                Stripe reports <strong>{check.stripe_status}</strong> ({minor(check.stripe_amount_received)} received).{" "}
                {check.consistent ? "Local records match." : "Local records do not match Stripe. Investigate before any action."}
              </Alert>
            )
          )}
          <p className="text-xs text-ink-secondary">This view is read-only. Refunds are issued from the Stripe Dashboard and recorded via webhook.</p>
        </div>
      )}
    </Modal>
  );
}

export default function AdminPayments() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const query = new URLSearchParams({ page, page_size: 20 });
  if (status) query.set("status", status);
  if (search) query.set("search", search);
  const list = useApi(`/admin/payments?${query}`);

  const columns = [
    { key: "created_at", header: "Created", render: (p) => <span className="whitespace-nowrap text-ink-secondary">{formatDate(p.created_at)}</span> },
    { key: "customer", header: "Customer", render: (p) => p.customer_email },
    { key: "ref", header: "Stripe reference", render: (p) => <span className="font-mono">{p.provider_payment_id || "—"}</span> },
    { key: "status", header: "Status", render: (p) => <PaymentStatusBadge status={p.status} /> },
    { key: "recon", header: "Reconciliation", render: (p) => <ReconciliationBadge status={p.reconciliation_status} /> },
    { key: "amount", header: "Amount", className: "text-right", render: (p) => <span className="font-semibold whitespace-nowrap">{minor(p.amount_minor)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Stripe payments" description="Test-mode wallet top-ups and their reconciliation status." />
      <div className="card p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
          <div className="flex gap-2 overflow-x-auto min-w-0 -mx-1 px-1 pb-1" role="group" aria-label="Filter by status">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={status === tab.value}
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                  status === tab.value ? "bg-primary text-milk-100" : "bg-surface-secondary text-ink hover:bg-accent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
            className="flex gap-2 lg:w-96 shrink-0"
          >
            <Input label="Search payments" hideLabel icon="search" placeholder="Reference or customer email" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="flex-1" />
            <Button type="submit" variant="secondary" className="min-h-12">Search</Button>
          </form>
        </div>
        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          onRowClick={(p) => setSelected(p.id)}
          rowLabel={(p) => `Open payment ${p.provider_payment_id || p.id}`}
          page={page}
          onPageChange={setPage}
          emptyTitle="No payments match"
        />
      </div>
      {selected && <PaymentDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
