import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import Logo from "../components/ui/Logo";

export default function NotFound() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-10 text-7xl font-extrabold text-primary">404</p>
      <h1 className="mt-4 text-2xl font-bold text-ink">Page not found</h1>
      <p className="mt-2 text-ink-secondary max-w-sm">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Button to="/" variant="secondary">
          Back to home
        </Button>
        {user && <Button to="/dashboard">Go to Dashboard</Button>}
      </div>
    </div>
  );
}
