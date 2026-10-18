import Icon from "./Icon";

export default function Pagination({ page, pageCount, onPageChange }) {
  if (pageCount <= 1) return null;

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1
  );

  const buttonClass =
    "min-w-10 h-10 px-3 rounded-xl font-semibold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <nav className="flex items-center justify-center gap-1.5 flex-wrap" aria-label="Pagination">
      <button
        type="button"
        className={`${buttonClass} text-ink hover:bg-surface-secondary`}
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
      >
        <Icon name="chevronLeft" className="w-4 h-4" />
      </button>

      {pages.map((p, index) => (
        <span key={p} className="flex items-center gap-1.5">
          {index > 0 && p - pages[index - 1] > 1 && <span className="px-1 text-ink-secondary">…</span>}
          <button
            type="button"
            className={`${buttonClass} ${
              p === page ? "bg-primary text-milk-100" : "text-ink hover:bg-surface-secondary"
            }`}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        </span>
      ))}

      <button
        type="button"
        className={`${buttonClass} text-ink hover:bg-surface-secondary`}
        onClick={() => onPageChange(page + 1)}
        disabled={page === pageCount}
        aria-label="Next page"
      >
        <Icon name="chevronRight" className="w-4 h-4" />
      </button>
    </nav>
  );
}
