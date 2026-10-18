import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./ui/Logo";

export function FullPageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background" role="status">
      <Logo />
      <span className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageLoader />;
  }

  return user ? children : <Navigate to="/login" replace state={{ from: location }} />;
}

/** For /login and /register: signed-in users go straight to the dashboard. */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullPageLoader />;
  }

  return user ? <Navigate to="/dashboard" replace /> : children;
}
