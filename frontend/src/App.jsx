import { useState } from "react";
import { BrowserRouter, Navigate, Outlet, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import ProtectedRoute, { PublicOnlyRoute } from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import Navbar, { Sidebar } from "./components/Navbar";
import SandboxBanner from "./components/SandboxBanner";
import WelcomeModal from "./components/WelcomeModal";
import SessionExpiredPopup from "./components/SessionExpiredPopup";
import AdminLayout from "./components/admin/AdminLayout";
import ToastProvider from "./components/ui/ToastProvider";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Transfer from "./pages/Transfer";
import Withdraw from "./pages/Withdraw";
import History from "./pages/History";
import Payments from "./pages/Payments";
import AIChat from "./pages/AIChat";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminTransactions from "./pages/admin/AdminTransactions";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminAudit from "./pages/admin/AdminAudit";
import AccessDenied from "./pages/admin/AccessDenied";

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  // Clear the one-time flag so the popup doesn't return on refresh/back
  const closeWelcome = () => navigate(location.pathname + location.search, { replace: true, state: null });

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64 min-w-0">
        <SandboxBanner />
        <Navbar onMenuClick={() => setSidebarOpen(true)} sidebarOpen={sidebarOpen} />
        <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto">{children}</main>
      </div>
      <WelcomeModal open={Boolean(location.state?.welcome)} onClose={closeWelcome} />
    </div>
  );
}

function ProtectedPage({ children }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

// The admin session is only checked inside /admin/*
function AdminArea() {
  return (
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  );
}

function AdminPage({ children }) {
  return (
    <AdminProtectedRoute>
      <AdminLayout>{children}</AdminLayout>
    </AdminProtectedRoute>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
      <Route path="/transfer" element={<ProtectedPage><Transfer /></ProtectedPage>} />
      {/* Adding money now goes through Stripe test payments */}
      <Route path="/deposit" element={<Navigate to="/payments" replace />} />
      <Route path="/withdraw" element={<ProtectedPage><Withdraw /></ProtectedPage>} />
      <Route path="/history" element={<ProtectedPage><History /></ProtectedPage>} />
      <Route path="/payments" element={<ProtectedPage><Payments /></ProtectedPage>} />
      <Route path="/ai-chat" element={<ProtectedPage><AIChat /></ProtectedPage>} />
      <Route path="/profile" element={<ProtectedPage><Profile /></ProtectedPage>} />

      <Route path="/admin" element={<AdminArea />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="login" element={<AdminLogin />} />
        <Route path="access-denied" element={<AccessDenied />} />
        <Route path="dashboard" element={<AdminPage><AdminDashboard /></AdminPage>} />
        <Route path="customers" element={<AdminPage><AdminCustomers /></AdminPage>} />
        <Route path="transactions" element={<AdminPage><AdminTransactions /></AdminPage>} />
        <Route path="payments" element={<AdminPage><AdminPayments /></AdminPage>} />
        <Route path="audit" element={<AdminPage><AdminAudit /></AdminPage>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
          <SessionExpiredPopup />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
