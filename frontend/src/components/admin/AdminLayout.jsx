import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext";
import SandboxBanner from "../SandboxBanner";
import Dropdown, { menuItemClass } from "../ui/Dropdown";
import Icon from "../ui/Icon";
import Logo from "../ui/Logo";
import { adminNavItems } from "./adminNav";
import ConfirmLogout from "../ConfirmLogout";
import WelcomeModal from "../WelcomeModal";

function AdminSidebar({ open, onClose }) {
  const { logout } = useAdminAuth();
  const navigate = useNavigate();

  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-plum-950/60 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-72 lg:w-64 bg-plum-950 text-milk-100 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Admin sidebar"
      >
        <div className="h-18 px-6 flex items-center justify-between border-b border-white/10">
          <div>
            <Logo light to="/admin/dashboard" />
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-plum-300 mt-0.5">Operations</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-2 -mr-2 rounded-lg text-plum-200 hover:text-milk-100 hover:bg-white/10"
            aria-label="Close menu"
          >
            <Icon name="x" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Admin">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition ${
                  isActive
                    ? "bg-white/12 text-milk-100 before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-1 before:rounded-r-full before:bg-accent"
                    : "text-plum-200 hover:text-milk-100 hover:bg-white/6"
                }`
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-plum-200 hover:text-milk-100 hover:bg-white/6 transition"
          >
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>
      <ConfirmLogout open={confirmLogout} onCancel={() => setConfirmLogout(false)} onConfirm={handleLogout} admin />
    </>
  );
}

export default function AdminLayout({ children }) {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const title = adminNavItems.find((item) => location.pathname.startsWith(item.to))?.label || "Admin";
  const closeWelcome = () => navigate(location.pathname + location.search, { replace: true, state: null });

  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen bg-surface-secondary">
      <AdminSidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-64 min-w-0">
        <SandboxBanner tone="dark" />
        <header className="sticky top-0 z-30 h-18 bg-surface/90 backdrop-blur-md border-b border-border">
          <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="lg:hidden p-2 -ml-2 rounded-xl text-ink hover:bg-surface-secondary"
                aria-label="Open menu"
                aria-controls="admin-sidebar"
                aria-expanded={open}
              >
                <Icon name="menu" className="w-6 h-6" />
              </button>
              <p className="text-lg font-bold text-ink truncate">{title}</p>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md bg-primary text-milk-100 text-[11px] font-bold tracking-wider uppercase">
                Admin
              </span>
            </div>

            {admin && (
              <Dropdown
                label="Admin account menu"
                trigger={
                  <>
                    <span className="w-10 h-10 rounded-full bg-plum-950 text-milk-100 flex items-center justify-center">
                      <Icon name="shield" className="w-5 h-5" />
                    </span>
                    <span className="hidden sm:block text-left">
                      <span className="block text-sm font-semibold text-ink leading-tight">{admin.full_name}</span>
                      <span className="block text-xs text-ink-secondary leading-tight">{admin.email}</span>
                    </span>
                    <Icon name="chevronDown" className="w-4 h-4 text-ink-secondary" />
                  </>
                }
              >
                <div className="px-3 py-2 mb-1 border-b border-border">
                  <p className="font-semibold text-ink truncate">{admin.full_name}</p>
                  <p className="text-xs text-ink-secondary truncate">{admin.email}</p>
                  <p className="text-xs text-success mt-1 flex items-center gap-1">
                    <Icon name="checkCircle" className="w-3.5 h-3.5" /> MFA protected
                  </p>
                </div>
                <button type="button" role="menuitem" className={`${menuItemClass} text-danger`} onClick={() => setConfirmLogout(true)}>
                  <Icon name="logout" className="w-4 h-4" /> Sign out
                </button>
              </Dropdown>
            )}
          </div>
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto">{children}</main>
      </div>
      <ConfirmLogout open={confirmLogout} onCancel={() => setConfirmLogout(false)} onConfirm={handleLogout} admin />
      <WelcomeModal open={Boolean(location.state?.welcome)} onClose={closeWelcome} admin />
    </div>
  );
}
