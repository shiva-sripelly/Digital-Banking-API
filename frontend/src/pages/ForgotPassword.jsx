import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/ui/Button";
import { Input, PasswordInput } from "../components/ui/Field";
import { Alert } from "../components/ui/Feedback";
import { useToast } from "../context/ToastContext";
import { getErrorMessage } from "../utils/errors";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(location.state?.email || "");
  const [form, setForm] = useState({
    code: "",
    new_password: "",
    confirm_password: "",
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({
      ...form,
      [name]: name === "code" ? value.replace(/\D/g, "").slice(0, 6) : value,
    });
  };

  const requestCode = async (e) => {
    e?.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await api.post("/auth/forgot-password", { email });
      setMessage(response.data.message);
      setStep("reset");
    } catch (err) {
      setError(getErrorMessage(err, "Could not send reset code"));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (form.code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    if (form.new_password.length < 8 || !/[A-Za-z]/.test(form.new_password) || !/[0-9]/.test(form.new_password)) {
      setError("Password must be at least 8 characters and contain a letter and a number.");
      return;
    }

    if (form.new_password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/reset-password", {
        email,
        code: form.code,
        new_password: form.new_password,
      });
      notify(response.data.message);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Password reset failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={step === "email" ? "Forgot Password" : "Reset Password"}
      subtitle={
        step === "email"
          ? "Enter your email and we'll send you a 6-digit reset code"
          : `Enter the code sent to ${email} and choose a new password`
      }
      switchPrompt={{ text: "Remembered it?", label: "Back to Login", to: "/login" }}
    >
      {error && <Alert type="error" className="mb-5">{error}</Alert>}
      {message && <Alert type="success" className="mb-5">{message}</Alert>}

      {step === "email" && (
        <form onSubmit={requestCode} className="space-y-4">
          <Input
            label="Email address"
            hideLabel
            type="email"
            name="email"
            icon="mail"
            placeholder="Enter your registered email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <Button type="submit" loading={loading} loadingText="Sending..." className="w-full">
            Send Reset Code
          </Button>
        </form>
      )}

      {step === "reset" && (
        <form onSubmit={resetPassword} className="space-y-4">
          <Input
            label="Reset code"
            name="code"
            icon="key"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={form.code}
            onChange={handleChange}
            className="[&_input]:tracking-[0.4em] [&_input]:font-semibold"
            required
          />

          <PasswordInput
            label="New password"
            name="new_password"
            placeholder="New password (8+ characters, letter and number)"
            value={form.new_password}
            onChange={handleChange}
            autoComplete="new-password"
            maxLength={72}
            required
          />

          <PasswordInput
            label="Confirm new password"
            name="confirm_password"
            placeholder="Confirm new password"
            value={form.confirm_password}
            onChange={handleChange}
            autoComplete="new-password"
            maxLength={72}
            required
          />

          <Button type="submit" loading={loading} loadingText="Resetting..." className="w-full">
            Reset Password
          </Button>

          <div className="flex justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setMessage("");
                setError("");
              }}
              className="link"
            >
              Change email
            </button>
            <button type="button" onClick={requestCode} disabled={loading} className="link">
              Resend code
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
