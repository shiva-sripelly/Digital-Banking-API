import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Logo from "../ui/Logo";

const sections = [
  { href: "#top", label: "Home" },
  { href: "#features", label: "Features" },
  { href: "#security", label: "Security" },
  { href: "#about", label: "About" },
];

export default function PublicHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
        <Logo />

        <nav className="hidden md:flex items-center gap-8" aria-label="Main">
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="font-medium text-ink-secondary hover:text-ink transition"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <Button to="/dashboard">Go to Dashboard</Button>
          ) : (
            <>
              <Button to="/login" variant="secondary" className="px-6">
                Login
              </Button>
              <Button to="/register" className="min-h-11 py-2">Get Started</Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="md:hidden p-2 -mr-2 rounded-xl text-ink hover:bg-surface-secondary"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          <Icon name={open ? "x" : "menu"} className="w-6 h-6" />
        </button>
      </div>

      {open && (
        <nav id="mobile-menu" className="md:hidden border-t border-border bg-background px-4 pb-5 pt-2" aria-label="Mobile">
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              onClick={() => setOpen(false)}
              className="block py-3 font-semibold text-ink border-b border-border/60"
            >
              {section.label}
            </a>
          ))}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {user ? (
              <Button to="/dashboard" className="col-span-2">
                Go to Dashboard
              </Button>
            ) : (
              <>
                <Button to="/login" variant="secondary">
                  Login
                </Button>
                <Button to="/register">Get Started</Button>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
