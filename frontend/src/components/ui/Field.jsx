import { useId, useState } from "react";
import Icon from "./Icon";

/**
 * Labelled input with optional leading icon, hint and field-level error.
 * Errors are linked via aria-describedby so screen readers announce them.
 */
export function Input({ label, icon, error, hint, className = "", trailing, id, hideLabel = false, ...props }) {
  const autoId = useId();
  const inputId = id || autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className={hideLabel ? "sr-only" : "block text-sm font-semibold text-ink mb-1.5"}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <Icon
            name={icon}
            className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
          />
        )}
        <input
          id={inputId}
          className={`input-field ${icon ? "pl-12" : ""} ${trailing ? "pr-12" : ""} ${
            error ? "border-danger focus:border-danger focus:ring-red-100" : ""
          }`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm text-danger flex items-center gap-1">
          <Icon name="alert" className="w-4 h-4" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-ink-secondary">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      type={visible ? "text" : "password"}
      icon="lock"
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-secondary"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          <Icon name={visible ? "eyeOff" : "eye"} />
        </button>
      }
      {...props}
    />
  );
}
