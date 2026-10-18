import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useApi from "../hooks/useApi";
import { PageHeader, SummaryRows } from "../components/banking";
import Button from "../components/ui/Button";
import { Alert, Skeleton } from "../components/ui/Feedback";
import Icon from "../components/ui/Icon";
import { formatDate } from "../utils/format";

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const account = useApi("/accounts/me");

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const initials = user.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  return (
    <div className="max-w-3xl">
      <PageHeader title="Profile" description="Your personal and account information." />

      <div className="space-y-6">
        <section className="card p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <span className="w-20 h-20 rounded-full bg-primary text-milk-100 flex items-center justify-center text-2xl font-extrabold">
            {initials}
          </span>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-ink break-words">{user.full_name}</h2>
            <p className="text-ink-secondary break-all">{user.email}</p>
            <span
              className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                user.is_active ? "bg-green-50 text-success" : "bg-orange-50 text-warning"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? "bg-success" : "bg-warning"}`} />
              {user.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </section>

        <section className="card p-6 sm:p-8">
          <h2 className="text-lg font-bold text-ink mb-4">Personal details</h2>
          <SummaryRows
            rows={[
              ["Full name", user.full_name],
              ["Email", user.email],
              ["Customer ID", user.id],
              ["Member since", formatDate(user.created_at, false)],
            ]}
          />
        </section>

        <section className="card p-6 sm:p-8">
          <h2 className="text-lg font-bold text-ink mb-4">Bank account</h2>
          {account.error && (
            <Alert type="error" onRetry={account.reload}>
              Failed to load account details
            </Alert>
          )}
          {account.loading && <Skeleton className="h-36 w-full" />}
          {account.data && (
            <SummaryRows
              rows={[
                ["Account number", <span key="n" className="font-mono">{account.data.account_number}</span>],
                ["Currency", account.data.currency],
                ["Opened", formatDate(account.data.created_at, false)],
              ]}
            />
          )}
        </section>

        <section className="card p-6 sm:p-8">
          <h2 className="text-lg font-bold text-ink mb-4">Security</h2>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border p-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-accent text-primary flex items-center justify-center">
                <Icon name="key" />
              </span>
              <div>
                <p className="font-semibold text-ink">Password</p>
                <p className="text-sm text-ink-secondary">We&apos;ll email you a one-time code to set a new password.</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => navigate("/forgot-password", { state: { email: user.email } })}
            >
              Reset password
            </Button>
          </div>

          <Button variant="ghost" onClick={handleLogout} className="mt-4 text-danger">
            <Icon name="logout" className="w-4 h-4" /> Logout
          </Button>
        </section>
      </div>
    </div>
  );
}
