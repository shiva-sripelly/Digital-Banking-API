import Icon from "./ui/Icon";
import { Modal } from "./ui/Modal";

// Colour theme per popup type
const TONES = {
  plum: {
    badge: "bg-primary text-milk-100 shadow-primary/30",
    halo: "bg-accent",
    wave: ["fill-accent", "fill-surface-secondary"],
    sparks: ["bg-primary-light", "bg-milk-300", "bg-primary"],
  },
  success: {
    badge: "bg-success text-white shadow-green-900/20",
    halo: "bg-green-100",
    wave: ["fill-green-100", "fill-green-50"],
    sparks: ["bg-success", "bg-milk-300", "bg-primary-light"],
  },
  danger: {
    badge: "bg-danger text-white shadow-red-900/20",
    halo: "bg-red-100",
    wave: ["fill-red-100", "fill-red-50"],
    sparks: ["bg-danger", "bg-milk-300", "bg-primary-light"],
  },
  warning: {
    badge: "bg-amber-500 text-white shadow-amber-900/20",
    halo: "bg-amber-100",
    wave: ["fill-amber-100", "fill-amber-50"],
    sparks: ["bg-amber-500", "bg-milk-300", "bg-primary-light"],
  },
  info: {
    badge: "bg-indigo-600 text-white shadow-indigo-900/20",
    halo: "bg-indigo-100",
    wave: ["fill-indigo-100", "fill-indigo-50"],
    sparks: ["bg-indigo-500", "bg-milk-300", "bg-primary-light"],
  },
};

const SPARK_ANGLES = [-150, -115, -65, -30, 30, 150];

/**
 * Shared design for every status/confirmation popup: tinted wave, confetti
 * strokes around an icon badge, title, message, optional detail rows, actions.
 * `title` may be a node; `ariaTitle` is the plain-text name for screen readers.
 */
export default function StatusPopup({
  open,
  onClose,
  tone = "plum",
  icon,
  title,
  ariaTitle,
  message,
  details,
  actions,
  showClose = true,
}) {
  const t = TONES[tone];

  return (
    <Modal open={open} onClose={onClose} title={ariaTitle || title} size="max-w-md" bare showClose={showClose}>
      <div className="relative overflow-hidden rounded-t-3xl">
        <svg className="absolute inset-x-0 top-0 w-full h-32" viewBox="0 0 400 128" preserveAspectRatio="none" aria-hidden="true">
          <path className={t.wave[0]} d="M0 0h400v84c-60 26-120 30-200 10S60 70 0 96Z" opacity="0.7" />
          <path className={t.wave[1]} d="M0 0h400v62c-70 22-130 22-200 4S50 52 0 70Z" />
        </svg>
        <div className="relative flex justify-center pt-9">
          <span className="relative w-24 h-24 flex items-center justify-center">
            {SPARK_ANGLES.map((angle, i) => (
              <span
                key={angle}
                className={`absolute left-1/2 top-1/2 w-1 h-3.5 -ml-0.5 -mt-[7px] rounded-full ${t.sparks[i % t.sparks.length]}`}
                style={{ transform: `rotate(${angle}deg) translateY(-50px)` }}
                aria-hidden="true"
              />
            ))}
            <span className={`w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center ${t.halo}`}>
              <span className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${t.badge}`}>
                <Icon name={icon} className="w-7 h-7" strokeWidth={icon === "check" || icon === "x" ? 3 : 2} />
              </span>
            </span>
          </span>
        </div>
      </div>

      <div className="px-6 sm:px-8 pt-3 pb-7 text-center">
        <div className="text-2xl font-bold text-ink leading-tight" aria-hidden="true">
          {title}
        </div>
        {message && <p className="mt-2.5 text-ink-secondary">{message}</p>}

        {details?.length > 0 && (
          <dl className="mt-5 rounded-2xl bg-surface-secondary text-sm text-left divide-y divide-border/70">
            {details.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-secondary">{label}</dt>
                <dd className="font-semibold text-ink text-right break-all">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {actions && <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">{actions}</div>}
      </div>
    </Modal>
  );
}
