import { useState } from "react";
import useApi from "../../hooks/useApi";
import { PageHeader } from "../../components/banking";
import { DataTable, Select } from "../../components/admin/AdminUI";
import { formatDate } from "../../utils/format";

const ACTION_OPTIONS = [
  { value: "", label: "All events" },
  { value: "admin.", label: "Admin actions & sign-ins" },
  { value: "user.", label: "Customer account events" },
  { value: "stripe.", label: "Stripe payment events" },
  { value: "demo_funding.", label: "Demo funding" },
];

export default function AdminAudit() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page, page_size: 25 });
  if (action) query.set("action", action);
  const list = useApi(`/admin/audit-events?${query}`);

  const columns = [
    { key: "created_at", header: "Time", render: (e) => <span className="whitespace-nowrap text-ink-secondary">{formatDate(e.created_at)}</span> },
    { key: "action", header: "Action", render: (e) => <span className="font-mono font-semibold">{e.action}</span> },
    { key: "actor", header: "Actor", render: (e) => e.actor_email || e.actor_type },
    { key: "target", header: "Target", render: (e) => (e.target_type ? `${e.target_type} ${e.target_id ?? ""}` : "—") },
    { key: "ip", header: "IP", render: (e) => <span className="font-mono">{e.ip_address || "—"}</span> },
    {
      key: "details",
      header: "Details",
      render: (e) => (
        <span className="block max-w-xs truncate text-ink-secondary" title={e.details ? JSON.stringify(e.details) : ""}>
          {e.details ? Object.entries(e.details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") : "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Audit log" description="Append-only record of security and operations events." />
      <div className="card p-4 sm:p-6">
        <div className="mb-5 md:w-80">
          <Select label="Event type" value={action} onChange={(v) => { setAction(v); setPage(1); }} options={ACTION_OPTIONS} />
        </div>
        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          page={page}
          onPageChange={setPage}
          emptyTitle="No events recorded"
        />
      </div>
    </div>
  );
}
