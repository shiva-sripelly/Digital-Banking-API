import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import OtpInput from "../components/ui/OtpInput";
import { Alert } from "../components/ui/Feedback";
import Icon from "../components/ui/Icon";
import { useToast } from "../context/ToastContext";
import { getErrorMessage } from "../utils/errors";

const DEFAULT_EXPIRY = 600;
const DEFAULT_COOLDOWN = 60;

function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Counts down from `seconds`; restart by changing `resetKey`. */
function useCountdown(seconds, resetKey) {
  const [remaining, setRemaining] = useState(seconds);
  const deadline = useRef(0);

  useEffect(() => {
    deadline.current = Date.now() + seconds * 1000;
    const tick = () => setRemaining(Math.max(0, Math.round((deadline.current - Date.now()) / 1000)));
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [seconds, resetKey]);

  return remaining;
}

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const initial = location.state || {};
  const loginPath = initial.portal === "admin" ? "/admin/login" : "/login";

  // Registration has just sent a code (it passes expiresIn). Arriving from a
  // login "Verify my email" link, no code was sent yet, so send one now.
  const justRegistered = Boolean(initial.email && initial.expiresIn);
  const autoSend = Boolean(initial.email) && !justRegistered;

  const [email, setEmail] = useState(initial.email || "");
  const [code, setCode] = useState("");
  const [expiresIn, setExpiresIn] = useState(initial.expiresIn || DEFAULT_EXPIRY);
  const [resendIn, setResendIn] = useState(justRegistered ? initial.resendIn ?? DEFAULT_COOLDOWN : 0);
  const [sentCount, setSentCount] = useState(justRegistered ? 1 : 0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    justRegistered
      ? `We sent a 6-digit code to ${initial.email}.`
      : autoSend
        ? `Sending a verification code to ${initial.email}…`
        : ""
  );
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(autoSend);
  const [verified, setVerified] = useState(false);
  const autoSent = useRef(false);

  const expiryLeft = useCountdown(expiresIn, sentCount);
  const cooldownLeft = useCountdown(resendIn, sentCount);

  useEffect(() => {
    if (!autoSend || autoSent.current) return;
    autoSent.current = true;
    api
      .post("/auth/resend-verification", { email: initial.email })
      .then(({ data }) => {
        setExpiresIn(data.code_expires_in);
        setResendIn(data.resend_available_in);
        setSentCount((n) => n + 1);
        setMessage(`We sent a 6-digit code to ${initial.email}. Check your inbox and spam folder.`);
      })
      .catch((err) => {
        setMessage("");
        setError(getErrorMessage(err, "Could not send a code. Use Resend code to try again."));
      })
      .finally(() => setResending(false));
  }, [autoSend, initial.email]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setVerifying(true);
    try {
      await api.post("/auth/verify-email", { email, code });
      setVerified(true);
      notify("Email verified. You can now log in.");
    } catch (err) {
      setError(getErrorMessage(err, "Verification failed"));
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setError("");
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setResending(true);
    try {
      const { data } = await api.post("/auth/resend-verification", { email });
      setExpiresIn(data.code_expires_in);
      setResendIn(data.resend_available_in);
      setSentCount((n) => n + 1);
      setCode("");
      setMessage(data.message);
    } catch (err) {
      setError(getErrorMessage(err, "Could not send a new code"));
    } finally {
      setResending(false);
    }
  };

  if (verified) {
    return (
      <AuthLayout title="Email verified" subtitle="Your account is ready to use.">
        <div className="text-center">
          <span className="mx-auto w-16 h-16 rounded-full bg-green-50 text-success flex items-center justify-center">
            <Icon name="checkCircle" className="w-9 h-9" />
          </span>
          <p className="mt-4 text-ink-secondary">{email} is verified.</p>
          <Button className="w-full mt-6" onClick={() => navigate(loginPath, { replace: true })}>
            Continue to Login
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Enter the 6-digit code we emailed you to activate your account."
      switchPrompt={{ text: "Already verified?", label: "Back to Login", to: loginPath }}
    >
      {error && <Alert type="error" className="mb-5">{error}</Alert>}
      {message && !error && <Alert type="info" className="mb-5">{message}</Alert>}

      <form onSubmit={handleVerify} className="space-y-4">
        <Input
          label="Email address"
          type="email"
          name="email"
          icon="mail"
          placeholder="Enter your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <OtpInput
          label="Verification code"
          value={code}
          onChange={(next) => {
            setCode(next);
            if (error) setError("");
          }}
          error={Boolean(error)}
          hint={
            sentCount > 0
              ? expiryLeft > 0
                ? `Code expires in ${formatClock(expiryLeft)}`
                : "This code has expired. Request a new one."
              : "Didn't get a code? Request one below."
          }
        />

        <Button type="submit" loading={verifying} loadingText="Verifying..." className="w-full">
          Verify Email
        </Button>

        <div className="flex items-center justify-between gap-3 text-sm">
          <Link to={loginPath} className="link">
            Return to Login
          </Link>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldownLeft > 0}
            className="link disabled:text-ink-secondary disabled:no-underline disabled:cursor-not-allowed"
          >
            {cooldownLeft > 0 ? `Resend code in ${cooldownLeft}s` : resending ? "Sending..." : "Resend code"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
