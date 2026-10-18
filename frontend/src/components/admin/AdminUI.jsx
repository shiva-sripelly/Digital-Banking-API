import Icon from "../ui/Icon";
import { Alert, EmptyState, Skeleton } from "../ui/Feedback";
import Pagination from "../ui/Pagination";

export function StatCard({ label, value, hint, icon, tone = "default" }) {
  const tones = {
    default: "bg-accent text-primary",
    good: "bg-green-50 text-success",
    warn: "bg-orange-50 text-warning",
    bad: "bg-red-50 text-danger",
  };
  return (
    <div className="card p-5 flex items-start gap-4 min-w-0">
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-ink-secondary">{label}</p>
        <p className="text-2xl font-extrabold text-ink break-all">{value}</p>
        {hint && <p className="text-xs text-ink-secondary mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

export function Select({ label, value, onChange, options, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field pr-10" aria-label={label}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BoolBadge({ value, yes, no }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
        value ? "bg-green-50 text-success" : "bg-orange-50 text-warning"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${value ? "bg-success" : "bg-warning"}`} />
      {value ? yes : no}
    </span>
  );
}

/**
 * Paginated table for admin lists. `columns`: [{ key, header, render, className }].
 * Rows are clickable (and keyboard-accessible) when `onRowClick` is given.
 */
export function DataTable({ columns, data, loading, error, onRetry, onRowClick, page, onPageChange, emptyTitle, rowLabel }) {
  if (error) return <Alert type="error" onRetry={onRetry}>Failed to load data</Alert>;

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return <EmptyState icon="search" title={emptyTitle || "Nothing found"} description="Try a different search or filter." />;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-ink-secondary border-b border-border">
              {columns.map((col) => (
                <th key={col.key} scope="col" className={`py-3 pr-4 font-semibold whitespace-nowrap ${col.className || ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.items.map((row) => (
              <tr
                key={row.id}
                className={onRowClick ? "cursor-pointer hover:bg-surface-secondary/70 focus-visible:bg-surface-secondary" : ""}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRowClick(row)) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`py-3 pr-4 text-ink ${col.className || ""}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-ink-secondary">
          Page {data.page} of {data.pages} · {data.total} total
        </p>
        <Pagination page={page} pageCount={data.pages} onPageChange={onPageChange} />
      </div>
    </div>
  );
}
