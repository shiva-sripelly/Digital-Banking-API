import { useEffect, useRef, useState } from "react";

/** Click-to-open menu that closes on outside click, Escape or item selection. */
export default function Dropdown({ trigger, label, children, align = "right" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex items-center gap-2 rounded-xl p-1 pr-2 transition hover:bg-surface-secondary"
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={`absolute ${
            align === "right" ? "right-0" : "left-0"
          } mt-2 w-64 card p-2 shadow-xl z-40 animate-fade-in`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export const menuItemClass =
  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left font-medium text-ink hover:bg-surface-secondary";
