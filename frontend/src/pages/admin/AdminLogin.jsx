import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { FullPageLoader } from "../../components/ProtectedRoute";
import SandboxBanner from "../../components/SandboxBanner";
import Button from "../../components/ui/Button";
import { Input, PasswordInput } from "../../components/ui/Field";
import OtpInput from "../../components/ui/OtpInput";
import { Alert } from "../../components/ui/Feedback";
import Icon from "../../components/ui/Icon";
import Logo from "../../components/ui/Logo";
import { getErrorCode, getErrorMessage } from "../../utils/errors";

function groupKey(secret) {
  return secret.match(/.{1,4}/g).join(" ");
}

export default function AdminLogin() {
  const { admin, loading: sessionLoading, startLogin, completeMfa } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || "/admin/dashboard";

  const [step, setStep] = useState("password");
  const [form, setForm] = useState({ email: "", password: "" });
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (sessionLoading) return <FullPageLoader />;
  if (admin) return <Navigate to="/admin/dashboard" replace />;

  const fail = (err, fallback) => {
    setError(getErrorMessage(err, fallback));
    setErrorCode(getErrorCode(err) || "");
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setError("");
    setErrorCode("");
    setLoading(true);
    try {
      const result = await startLogin(form.email, form.password);
      if (result.mfa_required !== true || !result.mfa_token) {
        setError("Admin MFA challenge was not provided. Access remains locked.");
        return;
      }
      setChallenge(result);
      setStep("mfa");
      setForm((f) => ({ ...f, password: "" }));
    } catch (err) {
      fail(err, "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setLoading(true);
    try {
      await completeMfa(challenge.mfa_token, code);
      navigate(redirectTo, { replace: true, state: { welcome: true } });
    } catch (err) {
      fail(err, "Verification failed");
      setCode("");
      if (getErrorCode(err) === "mfa_expired") {
        setStep("password");
        setChallenge(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(challenge.enrollment.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-plum-950">
      <SandboxBanner tone="dark" />
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-5">
        <div className="mb-4 text-center">
          <Logo light to="/" />
          <p className="mt-2 text-xs font-bold tracking-[0.25em] uppercase text-plum-300">Admin portal</p>
        </div>

        <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-11 h-11 rounded-xl bg-primary text-milk-100 flex items-center justify-center">
              <Icon name={step === "password" ? "lock" : "shield"} />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold text-ink">
                {step === "password" ? "Administrator sign in" : challenge?.enrollment_required ? "Set up MFA" : "Two-factor verification"}
              </h1>
              <p className="text-sm text-ink-secondary">
                {step === "password" ? "Step 1 of 2 · Password" : "Step 2 of 2 · Authenticator code"}
              </p>
            </div>
          </div>

          {error && (
            <Alert type="error" className="mb-5">
              {error}
              {errorCode === "email_not_verified" && (
                <Link
                  to="/verify-email"
                  state={{ email: form.email.trim().toLowerCase(), portal: "admin" }}
                  className="block mt-2 font-semibold underline underline-offset-2"
                >
                  Verify this email
                </Link>
              )}
            </Alert>
          )}

          {step === "password" && (
            <form onSubmit={submitPassword} className="space-y-4">
              <Input
                label="Admin email"
                type="email"
                icon="mail"
                placeholder="admin@yourcompany.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="username"
                required
              />
              <PasswordInput
                label="Password"
                placeholder="Enter your password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
                required
              />
              <Button type="submit" loading={loading} loadingText="Checking..." className="w-full">
                Continue
              </Button>
            </form>
          )}

          {step === "mfa" && challenge && (
            <form onSubmit={submitCode} className="space-y-5">
              {challenge.enrollment_required && challenge.enrollment && (
                <div className="rounded-2xl border border-border bg-surface-secondary p-4 space-y-3">
                  <p className="text-sm text-ink">
                    MFA is required for administrators. Add this account to an authenticator app (Google Authenticator,
                    Microsoft Authenticator, 1Password…) using the setup key, then enter the 6-digit code it shows.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 break-all rounded-xl bg-surface border border-border px-3 py-2 font-mono text-sm text-ink">
                      {groupKey(challenge.enrollment.secret)}
                    </code>
                    <Button variant="secondary" onClick={copySecret} aria-label="Copy setup key">
                      <Icon name={copied ? "check" : "copy"} className="w-4 h-4" />
                    </Button>
                  </div>
                  <a href={challenge.enrollment.otpauth_uri} className="link text-sm inline-flex items-center gap-1">
                    Open in authenticator app <Icon name="arrowUpRight" className="w-4 h-4" />
                  </a>
                  <p className="text-xs text-ink-secondary">This key is shown only now. Don&apos;t share it.</p>
                </div>
              )}

              <OtpInput
                label="Authentication code"
                value={code}
                onChange={(next) => {
                  setCode(next);
                  if (error) setError("");
                }}
                error={Boolean(error)}
              />
              <Button type="submit" loading={loading} loadingText="Verifying..." className="w-full">
                {challenge.enrollment_required ? "Confirm & sign in" : "Verify & sign in"}
              </Button>
              <button
                type="button"
                className="link text-sm"
                onClick={() => {
                  setStep("password");
                  setChallenge(null);
                  setError("");
                }}
              >
                Start over
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-sm text-plum-300">
          Not an administrator?{" "}
          <Link to="/login" className="font-semibold text-milk-100 underline-offset-4 hover:underline">
            Customer login
          </Link>
        </p>
      </div>
    </div>
  );
}
