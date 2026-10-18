import { Link } from "react-router-dom";
import PhoneMockup from "./marketing/PhoneMockup";
import Icon from "./ui/Icon";
import Logo from "./ui/Logo";

const highlights = [
  { icon: "shield", title: "Secure", text: "Your data, always protected" },
  { icon: "zap", title: "Fast", text: "Banking that keeps up with you" },
  { icon: "chart", title: "Smart", text: "Tools to help you grow" },
];

/**
 * Split-screen layout for Login / Register / Forgot Password.
 * `switchPrompt` renders e.g. "Don't have an account? Register" in the header
 * on desktop and below the form on mobile.
 */
export default function AuthLayout({ title, subtitle, children, switchPrompt }) {
  const prompt = switchPrompt && (
    <p className="text-sm text-ink-secondary">
      {switchPrompt.text}{" "}
      <Link to={switchPrompt.to} className="link">
        {switchPrompt.label}
      </Link>
    </p>
  );

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] overflow-x-hidden">
      {/* Form column */}
      <div className="flex flex-col min-h-screen lg:min-h-0 lg:h-screen lg:overflow-y-auto px-4 sm:px-8 lg:px-14 py-6 lg:py-5">
        <header className="flex items-center justify-between gap-4">
          <Logo />
          <div className="hidden sm:block">{prompt}</div>
        </header>

        <main className="flex-1 flex items-center justify-center py-8 lg:py-4">
          <div className="w-full max-w-md bg-surface sm:bg-transparent rounded-3xl p-6 sm:p-0 shadow-sm sm:shadow-none border border-border sm:border-0">
            <h1 className="text-3xl sm:text-4xl lg:text-[2.25rem] font-extrabold tracking-tight text-ink leading-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-ink-secondary">{subtitle}</p>}
            <div className="mt-6 [&_form]:space-y-3.5">{children}</div>
            {prompt && <div className="sm:hidden mt-6 text-center">{prompt}</div>}
          </div>
        </main>

        <p className="text-xs text-ink-secondary text-center lg:text-left">
          © {new Date().getFullYear()} VELQORIN ·{" "}
          <Link to="/" className="hover:text-ink underline-offset-2 hover:underline">
            Back to home
          </Link>
        </p>
      </div>

      {/* Brand column (desktop only) */}
      <aside className="hidden lg:flex flex-col p-4 pl-0 h-screen">
        <div className="relative flex-1 rounded-[2rem] bg-primary overflow-hidden px-12 pt-14 text-milk-100 flex flex-col">
          <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-primary-light/40 blur-3xl" aria-hidden="true" />
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 600 140" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 80c120-60 260 40 380 10s170-70 220-60v110H0Z" fill="#512345" opacity="0.7" />
            <path d="M0 110c150-30 280 30 400 0s150-40 200-30v60H0Z" fill="#6A3A5C" opacity="0.6" />
          </svg>

          <p className="relative flex items-center gap-2 text-sm font-semibold text-plum-200">
            Secure <span aria-hidden="true">•</span> Simple <span aria-hidden="true">•</span> Smart Banking
          </p>

          <div className="relative mt-6 grid xl:grid-cols-[1fr_auto] gap-8 items-start flex-1">
            <div>
              <h2 className="text-5xl font-extrabold leading-[1.05] tracking-tight">
                Banking
                <br />
                for a brighter
                <br />
                <span className="text-milk-300">tomorrow</span>
              </h2>
              <p className="mt-6 max-w-sm text-plum-100">
                Manage your money, track your goals and achieve more with digital banking.
              </p>
            </div>
            <PhoneMockup compact className="hidden xl:block mr-8 rotate-[6deg] translate-y-6" />
          </div>

          <ul className="relative grid grid-cols-3 gap-6 pb-12 pt-10">
            {highlights.map((item) => (
              <li key={item.title}>
                <span className="w-11 h-11 rounded-full bg-milk-100/15 flex items-center justify-center">
                  <Icon name={item.icon} className="w-5 h-5" />
                </span>
                <p className="mt-3 font-bold">{item.title}</p>
                <p className="text-sm text-plum-200">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
