import { Navigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import { FullPageLoader } from "./ProtectedRoute";

/** UI guard only; every admin API also enforces role + MFA on the server. */
export default function AdminProtectedRoute({ children }) {
  const { admin, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  return admin ? children : <Navigate to="/admin/login" replace state={{ from: location }} />;
}
