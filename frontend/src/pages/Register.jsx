import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/ui/Button";
import { Input, PasswordInput } from "../components/ui/Field";
import { Alert } from "../components/ui/Feedback";
import { useToast } from "../context/ToastContext";
import { getErrorMessage, getFieldErrors } from "../utils/errors";

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
// Letters only (any language), single spaces between words
const NAME_PATTERN = /^\p{L}+( \p{L}+)*$/u;

// Mirrors the backend UserRegister schema
function validate(form) {
  const errors = {};
  if (form.full_name.trim().length < 2) errors.full_name = "Full name must be at least 2 characters";
  else if (!NAME_PATTERN.test(form.full_name.trim())) errors.full_name = "Full name can contain only letters and spaces";
  if (form.full_name.trim().length > 100) errors.full_name = "Full name must be at most 100 characters";
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter a valid email address (e.g. name@example.com)";
  if (form.password.length < 8) errors.password = "Password must be at least 8 characters";
  else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))
    errors.password = "Password must contain at least one letter and one number";
  if (form.password.length > 72) errors.password = "Password must be at most 72 characters";
  return errors;
}

export default function Register() {
  const { register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (fieldErrors[e.target.name]) {
      setFieldErrors({ ...fieldErrors, [e.target.name]: undefined });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);

    try {
      const result = await register(form.full_name.trim(), form.email.trim(), form.password);
      notify("Check your email for a 6-digit verification code.", "info");
      navigate("/verify-email", {
        replace: true,
        state: {
          email: result.email,
          expiresIn: result.code_expires_in,
          resendIn: result.resend_available_in,
        },
      });
    } catch (err) {
      const serverFieldErrors = getFieldErrors(err);
      if (Object.keys(serverFieldErrors).length > 0) {
        setFieldErrors(serverFieldErrors);
      } else {
        setError(getErrorMessage(err, "Registration failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create Account"
      subtitle="Open your digital banking account in minutes"
      switchPrompt={{ text: "Already have an account?", label: "Login", to: "/login" }}
    >
      {error && <Alert type="error" className="mb-5">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Full name"
          name="full_name"
          icon="user"
          placeholder="Enter your full name"
          value={form.full_name}
          onChange={handleChange}
          autoComplete="name"
          error={fieldErrors.full_name}
          required
        />

        <Input
          label="Email address"
          type="email"
          name="email"
          icon="mail"
          placeholder="Enter your email address"
          value={form.email}
          onChange={handleChange}
          autoComplete="email"
          error={fieldErrors.email}
          required
        />

        <PasswordInput
          label="Password"
          name="password"
          placeholder="Create a password"
          value={form.password}
          onChange={handleChange}
          autoComplete="new-password"
          hint="8–72 characters, with a letter and a number"
          error={fieldErrors.password}
          required
        />

        <Button type="submit" loading={loading} loadingText="Creating account..." className="w-full">
          Create Account
        </Button>
      </form>
    </AuthLayout>
  );
}
