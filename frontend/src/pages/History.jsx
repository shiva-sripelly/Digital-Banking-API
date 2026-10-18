import { useMemo, useState } from "react";
import useApi from "../hooks/useApi";
import { PageHeader, TransactionDetailModal, TransactionItem } from "../components/banking";
import { Alert, EmptyState, Skeleton, StatusBadge, TypeBadge } from "../components/ui/Feedback";
import { Input } from "../components/ui/Field";
import Pagination from "../components/ui/Pagination";
import { describeTransaction, formatCurrency, formatDate, getDirection } from "../utils/format";

const PAGE_SIZE = 10;

const filters = [
  { value: "all", label: "All" },
  { value: "money_in", label: "Money added", types: ["deposit", "stripe_topup", "demo_funding"] },
  { value: "withdraw", label: "Withdrawals" },
  { value: "transfer", label: "Transfers" },
  { value: "stripe_refund", label: "Refunds" },
];

export default function History() {
  const history = useApi("/transactions/history");
  const account = useApi("/accounts/me");
  const myAccountNumber = account.data?.account_number;

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (history.data || []).filter((txn) => {
      const active = filters.find((f) => f.value === filter);
      if (filter !== "all" && !(active.types || [active.value]).includes(txn.transaction_type)) return false;
      if (!query) return true;
      return [txn.reference, txn.sender_account_number, txn.receiver_account_number]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [history.data, filter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Transactions" description="Every top-up, withdrawal, transfer and refund on your account." />

      <div className="card p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
          <div className="flex gap-2 overflow-x-auto min-w-0 -mx-1 px-1 pb-1" role="group" aria-label="Filter by type">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setFilter(item.value);
                  setPage(1);
                }}
                aria-pressed={filter === item.value}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                  filter === item.value
                    ? "bg-primary text-milk-100"
                    : "bg-surface-secondary text-ink hover:bg-accent"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Input
            label="Search transactions"
            hideLabel
            icon="search"
            placeholder="Search reference or account"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="lg:w-72 shrink-0"
          />
        </div>

        {history.error && (
          <Alert type="error" onRetry={history.reload}>
            Failed to load transaction history
          </Alert>
        )}

        {history.loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {!history.loading && !history.error && filtered.length === 0 && (
          <EmptyState
            title={history.data?.length ? "No matching transactions" : "No transactions yet"}
            description={
              history.data?.length
                ? "Try a different filter or search term."
                : "Your top-ups, withdrawals and transfers will appear here."
            }
            action={history.data?.length ? undefined : { to: "/payments", label: "Add money" }}
          />
        )}

        {visible.length > 0 && (
          <>
            {/* Mobile: stacked list */}
            <ul className="md:hidden divide-y divide-border">
              {visible.map((txn) => (
                <li key={txn.id}>
                  <TransactionItem txn={txn} myAccountNumber={myAccountNumber} onClick={() => setSelectedId(txn.id)} />
                </li>
              ))}
            </ul>

            {/* Tablet/desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <caption className="sr-only">Transaction history</caption>
                <thead>
                  <tr className="text-sm text-ink-secondary border-b border-border">
                    <th scope="col" className="py-3 pr-4 font-semibold">Date</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Description</th>
                    <th scope="col" className="hidden xl:table-cell py-3 pr-4 font-semibold">Reference</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Type</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Status</th>
                    <th scope="col" className="py-3 pr-4 font-semibold text-right">Amount</th>
                    <th scope="col" className="py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((txn) => {
                    const incoming = getDirection(txn, myAccountNumber) === "in";
                    return (
                      <tr
                        key={txn.id}
                        className="hover:bg-surface-secondary/60 cursor-pointer"
                        onClick={() => setSelectedId(txn.id)}
                      >
                        <td className="py-3.5 pr-4 text-sm text-ink-secondary whitespace-nowrap">
                          {formatDate(txn.created_at)}
                        </td>
                        <td className="py-3.5 pr-4 font-semibold text-ink">
                          {describeTransaction(txn, myAccountNumber)}
                        </td>
                        <td className="hidden xl:table-cell py-3.5 pr-4 font-mono text-sm text-ink-secondary">{txn.reference}</td>
                        <td className="py-3.5 pr-4"><TypeBadge type={txn.transaction_type} /></td>
                        <td className="py-3.5 pr-4"><StatusBadge status={txn.status} /></td>
                        <td
                          className={`py-3.5 pr-4 text-right font-bold whitespace-nowrap ${
                            incoming ? "text-success" : "text-ink"
                          }`}
                        >
                          {incoming ? "+" : "−"}
                          {formatCurrency(txn.amount)}
                        </td>
                        <td className="py-3.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(txn.id);
                            }}
                            className="link text-sm"
                          >
                            View<span className="sr-only"> transaction {txn.reference}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-ink-secondary">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{(currentPage - 1) * PAGE_SIZE + visible.length} of{" "}
                {filtered.length}
              </p>
              <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>

      <TransactionDetailModal
        transactionId={selectedId}
        myAccountNumber={myAccountNumber}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
