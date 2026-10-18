import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PublicHeader from "../components/marketing/PublicHeader";
import PhoneMockup, { PlumBlobs } from "../components/marketing/PhoneMockup";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Logo from "../components/ui/Logo";

const highlights = [
  { icon: "shield", title: "Secure", text: "Your data, always protected" },
  { icon: "zap", title: "Fast", text: "Banking that keeps up with you" },
  { icon: "chart", title: "Smart", text: "Tools to help you grow" },
];

// Only features the application actually provides.
const features = [
  {
    icon: "transfer",
    title: "Instant transfers",
    text: "Send money to any VELQORIN account number and see it reflected in both balances immediately.",
  },
  {
    icon: "wallet",
    title: "Add money & withdraw",
    text: "Top up with a Stripe test card and withdraw any time, with a reference number for every transaction.",
  },
  {
    icon: "card",
    title: "Online payments",
    text: "Secure card checkout powered by Stripe, running in test mode with simulated money.",
  },
  {
    icon: "sparkles",
    title: "AI banking assistant",
    text: "Ask about your balance or recent activity in plain language and get instant answers.",
  },
  {
    icon: "history",
    title: "Complete history",
    text: "Search, filter and drill into every deposit, withdrawal and transfer on your account.",
  },
  {
    icon: "mail",
    title: "Email alerts",
    text: "Get notified by email when your account is created and when money moves.",
  },
];

const securityPoints = [
  "Passwords are hashed with bcrypt and never stored in plain text",
  "Signed session tokens that expire automatically",
  "One-time password reset codes that expire and lock after repeated wrong attempts",
  "Every balance is validated and locked on the server before money moves",
  "Card payments are credited only after Stripe confirms them, and never twice",
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div id="top" className="min-h-screen bg-background overflow-x-hidden">
      <PublicHeader />

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 pb-16 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <div className="relative z-10">
              <p className="text-xs sm:text-sm font-bold tracking-[0.18em] uppercase text-primary-light">
                Smarter banking for a brighter tomorrow
              </p>
              <h1 className="mt-4 text-4xl sm:text-5xl xl:text-6xl font-extrabold leading-[1.08] tracking-tight text-ink">
                Banking made simple, secure and smart
              </h1>
              <p className="mt-5 text-lg text-ink-secondary max-w-xl">
                Manage your money, make payments, track expenses and achieve your financial goals — all
                in one place.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                {user ? (
                  <Button to="/dashboard" className="px-7">
                    Go to Dashboard <Icon name="arrowRight" className="w-4 h-4" />
                  </Button>
                ) : (
                  <>
                    <Button to="/register" className="px-7">
                      Open an Account <Icon name="arrowRight" className="w-4 h-4" />
                    </Button>
                    <Button to="/login" variant="secondary" className="min-h-12 px-10">
                      Login
                    </Button>
                  </>
                )}
              </div>

              <ul className="mt-12 grid grid-cols-3 gap-4 sm:gap-8 max-w-lg">
                {highlights.map((item) => (
                  <li key={item.title}>
                    <span className="w-12 h-12 rounded-full bg-accent text-primary flex items-center justify-center">
                      <Icon name={item.icon} className="w-6 h-6" />
                    </span>
                    <p className="mt-3 font-bold text-ink">{item.title}</p>
                    <p className="text-sm text-ink-secondary hidden sm:block">{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative flex justify-center lg:justify-end py-6">
              <PlumBlobs className="absolute -right-24 sm:-right-10 top-1/2 -translate-y-1/2 w-[520px] sm:w-[620px] max-w-none" />
              <PhoneMockup className="relative lg:mr-16 rotate-[6deg]" />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-surface border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-bold tracking-[0.18em] uppercase text-primary-light">Features</p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
                Everything you need to manage your money
              </h2>
            </div>

            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-2xl border border-border bg-background/60 p-6 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
                >
                  <span className="w-12 h-12 rounded-xl bg-primary text-milk-100 flex items-center justify-center">
                    <Icon name={feature.icon} className="w-6 h-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-ink">{feature.title}</h3>
                  <p className="mt-2 text-ink-secondary">{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <div className="rounded-[2rem] bg-primary text-milk-100 p-8 sm:p-12 lg:p-16 grid lg:grid-cols-2 gap-10 relative overflow-hidden">
              <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-primary-light/40 blur-2xl" aria-hidden="true" />
              <div className="relative">
                <p className="text-sm font-bold tracking-[0.18em] uppercase text-plum-200">Security</p>
                <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">
                  Built to keep your money safe
                </h2>
                <p className="mt-4 text-plum-100 max-w-md">
                  Security isn&apos;t a feature we bolted on. These protections run on every request.
                </p>
              </div>
              <ul className="relative space-y-4">
                {securityPoints.map((point) => (
                  <li key={point} className="flex gap-3">
                    <span className="mt-0.5 w-6 h-6 rounded-full bg-milk-100/15 flex items-center justify-center shrink-0">
                      <Icon name="check" className="w-4 h-4" />
                    </span>
                    <span className="text-milk-100">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 text-center">
            <p className="text-sm font-bold tracking-[0.18em] uppercase text-primary-light">About VELQORIN</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
              Digital banking without the complexity
            </h2>
            <p className="mt-5 text-lg text-ink-secondary">
              VELQORIN is a digital banking platform that brings your account, transfers, payments and
              an AI assistant together in one clean experience — on desktop and mobile.
            </p>
            {!user && (
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button to="/register" className="px-7">
                  Open an Account <Icon name="arrowRight" className="w-4 h-4" />
                </Button>
                <Button to="/login" variant="secondary" className="min-h-12 px-10">
                  Login
                </Button>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="bg-plum-950 text-plum-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-8 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-sm text-sm">Banking made simple, secure and smart.</p>
          </div>
          <nav aria-label="Footer">
            <p className="font-semibold text-milk-100 mb-3">Explore</p>
            <ul className="space-y-2 text-sm">
              <li><a href="#about" className="hover:text-milk-100">About</a></li>
              <li><a href="#features" className="hover:text-milk-100">Features</a></li>
              <li><a href="#security" className="hover:text-milk-100">Security</a></li>
            </ul>
          </nav>
          <div>
            <p className="font-semibold text-milk-100 mb-3">Account</p>
            <ul className="space-y-2 text-sm">
              {user ? (
                <li><Link to="/dashboard" className="hover:text-milk-100">Dashboard</Link></li>
              ) : (
                <>
                  <li><Link to="/login" className="hover:text-milk-100">Login</Link></li>
                  <li><Link to="/register" className="hover:text-milk-100">Open an Account</Link></li>
                  <li><Link to="/forgot-password" className="hover:text-milk-100">Forgot password</Link></li>
                </>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 text-xs text-plum-300">
            © {new Date().getFullYear()} VELQORIN. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
