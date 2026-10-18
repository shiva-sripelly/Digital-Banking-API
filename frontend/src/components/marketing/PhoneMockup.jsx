import Icon from "../ui/Icon";

// Promotional illustration only. Every figure here is sample data and is
// labelled as such; authenticated screens always use real API data.
const demoTransactions = [
  { label: "Salary Credit", date: "15 Oct", amount: "+₹45,000.00", icon: "arrowDownLeft", tone: "bg-green-100 text-success", positive: true },
  { label: "Electricity Bill", date: "14 Oct", amount: "-₹1,850.00", icon: "zap", tone: "bg-orange-100 text-warning" },
  { label: "Transfer to Riya", date: "12 Oct", amount: "-₹2,500.00", icon: "send", tone: "bg-accent text-primary" },
  { label: "Deposit", date: "10 Oct", amount: "+₹5,000.00", icon: "plus", tone: "bg-green-100 text-success", positive: true },
];

const demoActions = [
  { label: "Send", icon: "send" },
  { label: "Deposit", icon: "arrowDownLeft" },
  { label: "Pay", icon: "card" },
  { label: "More", icon: "more" },
];

export default function PhoneMockup({ compact = false, className = "" }) {
  return (
    <div className={`relative ${className}`} role="img" aria-label="Illustration of the VELQORIN app with sample data">
      <div
        className={`relative mx-auto ${
          compact ? "w-60" : "w-64 sm:w-72"
        } rounded-[2.75rem] bg-plum-950 p-2.5 shadow-2xl shadow-plum-950/40 ring-1 ring-white/10`}
      >
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-5 bg-plum-950 rounded-b-2xl z-10" />
        <div className="rounded-[2.25rem] overflow-hidden bg-primary" aria-hidden="true">
          <div className="flex justify-between items-center px-6 pt-3 text-[10px] font-semibold text-milk-100/80">
            <span>9:41</span>
            <span className="flex gap-1">
              <span className="w-3 h-1.5 rounded-sm bg-milk-100/70" />
              <span className="w-4 h-1.5 rounded-sm bg-milk-100/70" />
            </span>
          </div>

          <div className="px-4 pt-4 pb-4">
            <div className="flex items-center gap-2 text-milk-100">
              <span className="w-7 h-7 rounded-full bg-milk-100/15 flex items-center justify-center">
                <Icon name="user" className="w-4 h-4" />
              </span>
              <span className="text-xs font-semibold">Good Morning</span>
            </div>

            <div className="mt-4 rounded-2xl bg-linear-to-br from-primary-light to-primary-hover p-4 text-milk-100 ring-1 ring-white/10">
              <p className="text-[11px] text-plum-200">Your Balance</p>
              <p className={`${compact ? "text-xl" : "text-2xl"} font-extrabold mt-0.5`}>₹1,24,500.00</p>
              <p className="text-[10px] text-green-300 mt-1 flex items-center gap-1">
                <Icon name="trendingUp" className="w-3 h-3" /> +2.5% this month
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-4">
              {demoActions.map((action) => (
                <div key={action.label} className="flex flex-col items-center gap-1">
                  <span className="w-10 h-10 rounded-xl bg-milk-100/10 text-milk-100 flex items-center justify-center">
                    <Icon name={action.icon} className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] text-milk-100/80">{action.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface rounded-t-3xl px-4 pt-4 pb-6">
            <p className="text-xs font-bold text-ink mb-3">Recent Transactions</p>
            <ul className="space-y-3">
              {demoTransactions.slice(0, compact ? 2 : 4).map((txn) => (
                <li key={txn.label} className="flex items-center gap-2.5">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center ${txn.tone}`}>
                    <Icon name={txn.icon} className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-semibold text-ink truncate">{txn.label}</span>
                    <span className="block text-[10px] text-ink-secondary">{txn.date}</span>
                  </span>
                  <span className={`text-[11px] font-bold ${txn.positive ? "text-success" : "text-ink"}`}>
                    {txn.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface/90 border border-border px-3 py-1 text-[11px] font-semibold text-ink-secondary shadow-sm">
        Illustrative demo · sample data
      </span>
    </div>
  );
}

/** Soft abstract plum shapes used behind hero illustrations. */
export function PlumBlobs({ className = "" }) {
  return (
    <svg viewBox="0 0 600 600" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="blob-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6A3A5C" />
          <stop offset="100%" stopColor="#381932" />
        </linearGradient>
        <linearGradient id="blob-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#EBD6DE" />
          <stop offset="100%" stopColor="#C793B2" />
        </linearGradient>
      </defs>
      <path
        d="M420 40c90 30 160 120 150 230s-80 170-130 250-150 90-230 50S70 450 60 360s30-170 90-240S330 10 420 40Z"
        fill="url(#blob-b)"
        opacity="0.55"
      />
      <path
        d="M470 150c60 50 90 140 60 230s-110 150-200 160-160-40-170-120 50-140 110-190 140-130 200-80Z"
        fill="url(#blob-a)"
        opacity="0.9"
      />
    </svg>
  );
}
