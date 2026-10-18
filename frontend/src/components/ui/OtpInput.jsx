import { useEffect, useRef } from "react";

/**
 * One box per digit. `value` is the code typed so far (digits only).
 * Typing moves forward, Backspace moves back, arrow keys navigate, and
 * pasting or autofilling a full code fills every box.
 */
export default function OtpInput({ value, onChange, length = 6, label = "Verification code", hint, error, disabled }) {
  const refs = useRef([]);
  // Latest value, so focus handling right after a change isn't stale
  const current = useRef(value);
  useEffect(() => {
    current.current = value;
  }, [value]);

  const update = (next) => {
    current.current = next;
    onChange(next);
  };

  const focusBox = (index) => {
    const box = refs.current[Math.max(0, Math.min(index, length - 1))];
    box?.focus();
    box?.select();
  };

  const fill = (start, digits) => {
    const next = (value.slice(0, start) + digits).slice(0, length);
    update(next);
    focusBox(next.length);
  };

  const write = (index, digit) => {
    const at = Math.min(index, value.length);
    const next = (value.slice(0, at) + digit + value.slice(at + 1)).slice(0, length);
    update(next);
    focusBox(at + 1);
  };

  const handleChange = (index, raw) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length > 2) return fill(Math.min(index, value.length), digits); // autofill
    const digit = digits.slice(-1);
    if (digit) write(index, digit);
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[index]) {
        update(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        update(value.slice(0, index - 1) + value.slice(index));
        focusBox(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(Math.min(index + 1, value.length));
    }
  };

  const handlePaste = (index, e) => {
    const digits = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
    if (!digits) return;
    e.preventDefault();
    fill(Math.min(index, value.length), digits);
  };

  return (
    <fieldset>
      <legend className="block text-sm font-semibold text-ink mb-1.5">{label}</legend>
      <div className="flex gap-2 sm:gap-3" role="group" aria-label={label}>
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(el) => (refs.current[index] = el)}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${index + 1} of ${length}`}
            value={value[index] || ""}
            disabled={disabled}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(index, e)}
            // Always type into the next empty box
            onFocus={(e) => (index > current.current.length ? focusBox(current.current.length) : e.target.select())}
            className={`flex-1 min-w-0 max-w-14 h-12 sm:h-14 rounded-xl border bg-surface text-center text-xl sm:text-2xl font-bold text-ink outline-none transition focus:border-primary-light focus:ring-4 focus:ring-accent disabled:bg-surface-secondary ${
              error ? "border-danger" : value[index] ? "border-primary-light" : "border-border"
            }`}
          />
        ))}
      </div>
      {hint && <p className="mt-1.5 text-sm text-ink-secondary">{hint}</p>}
    </fieldset>
  );
}
