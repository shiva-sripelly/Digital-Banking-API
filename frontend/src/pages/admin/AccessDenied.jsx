import Button from "../../components/ui/Button";
import Icon from "../../components/ui/Icon";
import Logo from "../../components/ui/Logo";

export default function AccessDenied() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <Logo />
      <span className="mt-10 w-16 h-16 rounded-2xl bg-red-50 text-danger flex items-center justify-center">
        <Icon name="lock" className="w-8 h-8" />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-ink">Access denied</h1>
      <p className="mt-2 text-ink-secondary max-w-sm">
        This area is for administrators with a verified, MFA-protected session.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Button to="/admin/login">Admin sign in</Button>
        <Button to="/" variant="secondary">Back to home</Button>
      </div>
    </div>
  );
}
