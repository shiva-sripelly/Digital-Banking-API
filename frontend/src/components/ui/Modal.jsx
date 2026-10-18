import { useEffect, useId, useRef } from "react";
import Button from "./Button";
import Icon from "./Icon";

export function Modal({ open, onClose, title, children, footer, size = "max-w-md" }) {
  const titleId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-plum-950/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${size} bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl animate-toast-in max-h-[90vh] overflow-y-auto outline-none`}
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <h2 id={titleId} className="text-xl font-bold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg text-ink-secondary hover:bg-surface-secondary"
            aria-label="Close dialog"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmText = "Confirm",
  onConfirm,
  onCancel,
  loading = false,
  variant = "primary",
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading} loadingText="Processing...">
            {confirmText}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
