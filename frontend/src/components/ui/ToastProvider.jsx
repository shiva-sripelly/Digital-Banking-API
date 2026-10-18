import { useCallback, useMemo, useRef, useState } from "react";
import { ToastContext } from "../../context/ToastContext";
import Icon from "./Icon";

const toastStyles = {
  success: { icon: "checkCircle", className: "text-success" },
  error: { icon: "alert", className: "text-danger" },
  info: { icon: "info", className: "text-primary" },
};

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message, type = "success") => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, type }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed z-[60] bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 flex flex-col gap-2 sm:w-96"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const style = toastStyles[toast.type];
          return (
            <div
              key={toast.id}
              className="card shadow-xl px-4 py-3 flex items-start gap-3 animate-toast-in"
              role="status"
            >
              <Icon name={style.icon} className={`w-5 h-5 mt-0.5 ${style.className}`} />
              <p className="flex-1 text-sm font-medium text-ink break-words">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="p-1 -m-1 rounded text-ink-secondary hover:text-ink"
                aria-label="Dismiss notification"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
