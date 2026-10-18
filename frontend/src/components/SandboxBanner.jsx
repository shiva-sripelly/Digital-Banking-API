import Icon from "./ui/Icon";

export default function SandboxBanner({ tone = "light" }) {
  const styles = tone === "dark" ? "bg-plum-950 text-plum-100" : "bg-accent text-primary";
  return (
    <div className={`${styles} text-xs sm:text-sm font-semibold px-4 py-2 flex items-center justify-center gap-2 text-center`} role="note">
      <Icon name="info" className="w-4 h-4" />
      Sandbox: balances are simulated and payments run in Stripe test mode.
    </div>
  );
}
