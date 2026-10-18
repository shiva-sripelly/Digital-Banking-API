import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/ui/Button";
import { Input, PasswordInput } from "../components/ui/Field";
import { Alert } from "../components/ui/Feedback";
import { getErrorCode, getErrorMessage } from "../utils/errors";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Return to the protected page the user originally asked for, if any
  const redirectTo = location.state?.from?.pathname || "/dashboard";

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setErrorCode("");
    setLoading(true);

    try {
      await login(form.email, form.password);
      // The layout shows the "Welcome back" popup once on arrival
      navigate(redirectTo, { replace: true, state: { welcome: true } });
    } catch (err) {
      setError(getErrorMessage(err, "Login failed"));
      setErrorCode(getErrorCode(err) || "");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Login to your banking account"
      switchPrompt={{ text: "Don't have an account?", label: "Register", to: "/register" }}
    >
      {error && (
        <Alert type="error" className="mb-5">
          {error}
          {errorCode === "email_not_verified" && (
            <Link
              to="/verify-email"
              state={{ email: form.email.trim().toLowerCase() }}
              className="block mt-2 font-semibold underline underline-offset-2"
            >
              Verify my email
            </Link>
          )}
          {errorCode === "use_admin_portal" && (
            <Link to="/admin/login" className="block mt-2 font-semibold underline underline-offset-2">
              Go to the admin portal
            </Link>
          )}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email address"
          hideLabel
          type="email"
          name="email"
          icon="mail"
          placeholder="Enter your email address"
          value={form.email}
          onChange={handleChange}
          autoComplete="email"
          required
        />

        <PasswordInput
          label="Password"
          hideLabel
          name="password"
          placeholder="Enter your password"
          value={form.password}
          onChange={handleChange}
          autoComplete="current-password"
          required
        />

        <div className="flex justify-end">
          <Link to="/forgot-password" className="link text-sm">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={loading} loadingText="Logging in..." className="w-full">
          Login
        </Button>
      </form>
    </AuthLayout>
  );
}
