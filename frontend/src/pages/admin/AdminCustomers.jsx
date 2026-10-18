import { useState } from "react";
import api from "../../api/axios";
import useApi from "../../hooks/useApi";
import { useToast } from "../../context/ToastContext";
import { PageHeader, SummaryRows } from "../../components/banking";
import { BoolBadge, DataTable, Select } from "../../components/admin/AdminUI";
import Button from "../../components/ui/Button";
import { Alert, PaymentStatusBadge, Skeleton } from "../../components/ui/Feedback";
import { Input } from "../../components/ui/Field";
import { ConfirmDialog, Modal } from "../../components/ui/Modal";
import { getErrorMessage } from "../../utils/errors";
import { formatCurrency, formatDate } from "../../utils/format";

function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== undefined && value !== null) query.set(key, value);
  });
  return query.toString();
}

function CustomerDetail({ customerId, onClose, onChanged }) {
  const { notify } = useToast();
  const detail = useApi(`/admin/customers/${customerId}`);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const customer = detail.data;

  const changeStatus = async () => {
    if (reason.trim().length < 5) {
      setError("Give a reason of at least 5 characters (it is recorded in the audit log).");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/admin/customers/${customerId}/status`, { is_active: !customer.is_active, reason: reason.trim() });
      notify(customer.is_active ? "Customer deactivated" : "Customer reactivated");
      setConfirming(false);
      setReason("");
      detail.reload();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Could not update the account"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Customer profile"
      size="max-w-lg"
      footer={
        customer && (
          <>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button variant={customer.is_active ? "danger" : "primary"} onClick={() => setConfirming(true)}>
              {customer.is_active ? "Deactivate account" : "Reactivate account"}
            </Button>
          </>
        )
      }
    >
      {detail.loading && !customer && <Skeleton className="h-56" />}
      {detail.error && <Alert type="error" onRetry={detail.reload}>Failed to load customer</Alert>}
      {customer && (
        <div className="space-y-5">
          <div>
            <p className="text-xl font-bold text-ink break-words">{customer.full_name}</p>
            <p className="text-ink-secondary break-all">{customer.email}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <BoolBadge value={customer.email_verified} yes="Email verified" no="Email unverified" />
              <BoolBadge value={customer.is_active} yes="Active" no="Inactive" />
            </div>
          </div>
          <SummaryRows
            rows={[
              ["Customer ID", customer.id],
              ["Account", customer.account_number_masked || "—"],
              ["Balance (read-only)", customer.balance ? formatCurrency(customer.balance) : "—"],
              ["Transactions", customer.transaction_count],
              ["Open sessions", customer.open_sessions],
              ["Joined", formatDate(customer.created_at)],
              ["Last login", formatDate(customer.last_login_at)],
            ]}
          />
          {customer.recent_payments.length > 0 && (
            <div>
              <p className="font-semibold text-ink mb-2">Recent Stripe payments</p>
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {customer.recent_payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{formatCurrency(p.amount_minor / 100)} · {formatDate(p.created_at, false)}</span>
                    <PaymentStatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={customer?.is_active ? "Deactivate this customer?" : "Reactivate this customer?"}
        confirmText={customer?.is_active ? "Deactivate" : "Reactivate"}
        variant={customer?.is_active ? "danger" : "primary"}
        onConfirm={changeStatus}
        onCancel={() => {
          setConfirming(false);
          setError("");
        }}
        loading={saving}
      >
        <p className="text-ink-secondary mb-4">
          {customer?.is_active
            ? "They will be signed out everywhere and won't be able to log in. Balances and history are not changed."
            : "They will be able to log in again."}
        </p>
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        <Input
          label="Reason (recorded in the audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer requested account freeze"
          maxLength={300}
        />
      </ConfirmDialog>
    </Modal>
  );
}

export default function AdminCustomers() {
  const [filters, setFilters] = useState({ search: "", verified: "", active: "" });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState(null);

  const list = useApi(`/admin/customers?${buildQuery({ ...filters, page, page_size: 15, v: version })}`);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const columns = [
    {
      key: "name",
      header: "Customer",
      render: (c) => (
        <div className="min-w-48">
          <p className="font-semibold">{c.full_name}</p>
          <p className="text-ink-secondary">{c.email}</p>
        </div>
      ),
    },
    { key: "account", header: "Account", render: (c) => <span className="font-mono">{c.account_number_masked || "—"}</span> },
    { key: "verified", header: "Email", render: (c) => <BoolBadge value={c.email_verified} yes="Verified" no="Unverified" /> },
    { key: "status", header: "Status", render: (c) => <BoolBadge value={c.is_active} yes="Active" no="Inactive" /> },
    { key: "joined", header: "Joined", render: (c) => <span className="whitespace-nowrap">{formatDate(c.created_at, false)}</span> },
    { key: "login", header: "Last login", render: (c) => <span className="whitespace-nowrap">{formatDate(c.last_login_at)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Customers" description="Search customers and manage account access." />

      <div className="card p-4 sm:p-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem] mb-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFilter("search", searchInput.trim());
            }}
            className="flex gap-2"
          >
            <Input
              label="Search customers"
              hideLabel
              icon="search"
              placeholder="Name or email"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" variant="secondary" className="min-h-12">Search</Button>
          </form>
          <Select
            label="Verification"
            value={filters.verified}
            onChange={(v) => setFilter("verified", v)}
            options={[
              { value: "", label: "Any verification" },
              { value: "true", label: "Verified" },
              { value: "false", label: "Unverified" },
            ]}
          />
          <Select
            label="Status"
            value={filters.active}
            onChange={(v) => setFilter("active", v)}
            options={[
              { value: "", label: "Any status" },
              { value: "true", label: "Active" },
              { value: "false", label: "Inactive" },
            ]}
          />
        </div>

        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          onRowClick={(c) => setSelected(c.id)}
          rowLabel={(c) => `Open ${c.full_name}`}
          page={page}
          onPageChange={setPage}
          emptyTitle="No customers match"
        />
      </div>

      {selected && (
        <CustomerDetail customerId={selected} onClose={() => setSelected(null)} onChanged={() => setVersion((v) => v + 1)} />
      )}
    </div>
  );
}
