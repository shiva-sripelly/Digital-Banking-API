import { Link } from "react-router-dom";

export default function Logo({ light = false, to = "/", className = "" }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2.5 ${className}`} aria-label="VELQORIN home">
      <svg viewBox="0 0 28 28" className="w-8 h-8" aria-hidden="true">
        <rect x="2" y="13" width="6" height="13" rx="2" fill={light ? "#EBD6DE" : "#6A3A5C"} />
        <rect x="11" y="7" width="6" height="19" rx="2" fill={light ? "#FFF3E6" : "#512345"} />
        <rect x="20" y="1" width="6" height="25" rx="2" fill={light ? "#FFFFFF" : "#381932"} />
      </svg>
      <span className={`text-xl font-extrabold tracking-tight ${light ? "text-milk-100" : "text-ink"}`}>
        VELQORIN
      </span>
    </Link>
  );
}
