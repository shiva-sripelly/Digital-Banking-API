import { useState } from "react";
import useApi from "../../hooks/useApi";
import { PageHeader, SummaryRows } from "../../components/banking";
import { DataTable, Select } from "../../components/admin/AdminUI";
import Button from "../../components/ui/Button";
import { Alert, Skeleton, StatusBadge, TypeBadge } from "../../components/ui/Feedback";
import { Input } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { formatCurrency, formatDate } from "../../utils/format";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "transfer", label: "Transfers" },
  { value: "stripe_topup", label: "Stripe top-ups" },
  { value: "stripe_refund", label: "Stripe refunds" },
  { value: "withdraw", label: "Withdrawals" },
  { value: "deposit", label: "Deposits (historical)" },
  { value: "demo_funding", label: "Demo funding" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "success", label: "Success" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];

function TransactionDetail({ id, onClose }) {
  const detail = useApi(`/admin/transactions/${id}`);
  const t = detail.data;
  return (
    <Modal open onClose={onClose} title="Transaction details" size="max-w-lg" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {detail.loading && !t && <Skeleton className="h-56" />}
      {detail.error && <Alert type="error" onRetry={detail.reload}>Failed to load transaction</Alert>}
      {t && (
        <div className="space-y-5">
          <SummaryRows
            rows={[
              ["Reference", <span key="r" className="font-mono text-sm break-all">{t.reference}</span>],
              ["Type", <TypeBadge key="t" type={t.transaction_type} />],
              ["Status", <StatusBadge key="s" status={t.status} />],
              ["Amount", formatCurrency(t.amount)],
              ["From", t.sender_account_masked || "—"],
              ["To", t.receiver_account_masked || "—"],
              ["Stripe payment", t.stripe_payment_id ? <span key="p" className="font-mono text-sm break-all">{t.stripe_payment_id}</span> : "—"],
              ["Timestamp", formatDate(t.created_at)],
            ]}
          />
          <div>
            <p className="font-semibold text-ink mb-2">Ledger entries</p>
            {t.ledger_entries.length ? (
              <ul className="divide-y divide-border rounded-2xl border border-border text-sm">
                {t.ledger_entries.map((leg) => (
                  <li key={leg.leg} className="flex justify-between px-4 py-2.5">
                    <span>{leg.account || leg.system_account.replace(/_/g, " ")}</span>
                    <span className={`font-mono font-semibold ${leg.amount.startsWith("-") ? "text-ink" : "text-success"}`}>{leg.amount}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Alert type="info">{t.ledger_note}</Alert>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminTransactions() {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const query = new URLSearchParams({ page, page_size: 20 });
  if (type) query.set("type", type);
  if (status) query.set("status", status);
  if (search) query.set("search", search);
  const list = useApi(`/admin/transactions?${query}`);

  const columns = [
    { key: "created_at", header: "Date", render: (t) => <span className="whitespace-nowrap text-ink-secondary">{formatDate(t.created_at)}</span> },
    { key: "reference", header: "Reference", render: (t) => <span className="font-mono">{t.reference}</span> },
    { key: "type", header: "Type", render: (t) => <TypeBadge type={t.transaction_type} /> },
    { key: "from", header: "From", render: (t) => t.sender_account_masked || "—" },
    { key: "to", header: "To", render: (t) => t.receiver_account_masked || "—" },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    { key: "amount", header: "Amount", className: "text-right", render: (t) => <span className="font-semibold whitespace-nowrap">{formatCurrency(t.amount)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Transactions" description="Monitor every money movement. Read-only." />
      <div className="card p-4 sm:p-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem] mb-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
            className="flex gap-2"
          >
            <Input label="Search by reference" hideLabel icon="search" placeholder="Search by reference" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="flex-1" />
            <Button type="submit" variant="secondary" className="min-h-12">Search</Button>
          </form>
          <Select label="Type" value={type} onChange={(v) => { setType(v); setPage(1); }} options={TYPE_OPTIONS} />
          <Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} />
        </div>
        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          onRowClick={(t) => setSelected(t.id)}
          rowLabel={(t) => `Open transaction ${t.reference}`}
          page={page}
          onPageChange={setPage}
          emptyTitle="No transactions match"
        />
      </div>
      {selected && <TransactionDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
