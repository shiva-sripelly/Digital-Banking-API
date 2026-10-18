import { Link } from "react-router-dom";

const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost:
    "inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 rounded-xl font-semibold text-ink transition hover:bg-surface-secondary disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center gap-2 min-h-12 bg-danger text-white px-5 py-3 rounded-xl font-semibold shadow-md transition hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed",
  light:
    "inline-flex items-center justify-center gap-2 min-h-12 bg-milk-100 text-primary px-5 py-3 rounded-xl font-semibold shadow-md transition hover:bg-white",
};

function Spinner() {
  return (
    <span
      className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
      aria-hidden="true"
    />
  );
}

/**
 * Button with variants. Pass `to` to render a router Link styled as a button.
 * `loading` disables the button and shows a spinner so forms can't double-submit.
 */
export default function Button({
  variant = "primary",
  loading = false,
  loadingText,
  to,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}) {
  const classes = `${variants[variant]} ${className}`;

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
