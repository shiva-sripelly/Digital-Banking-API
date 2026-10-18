import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Dropdown, { menuItemClass } from "./ui/Dropdown";
import Icon from "./ui/Icon";
import Logo from "./ui/Logo";
import { navItems } from "./navItems";
import ConfirmLogout from "./ConfirmLogout";

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

/** Deep plum sidebar. Static on desktop, slide-in drawer below lg. */
export function Sidebar({ open, onClose }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-plum-950/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-72 lg:w-64 bg-primary text-milk-100 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Sidebar"
      >
        <div className="h-18 px-6 flex items-center justify-between">
          <Logo light to="/dashboard" />
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-2 -mr-2 rounded-lg text-plum-200 hover:text-milk-100 hover:bg-white/10"
            aria-label="Close menu"
          >
            <Icon name="x" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Main">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition ${
                  isActive
                    ? "bg-white/12 text-milk-100 before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-1 before:rounded-r-full before:bg-milk-300"
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
            Logout
          </button>
        </div>
      </aside>
      <ConfirmLogout open={confirmLogout} onCancel={() => setConfirmLogout(false)} onConfirm={handleLogout} />
    </>
  );
}

/** Top bar: mobile menu toggle, page title and the user menu. */
export default function Navbar({ onMenuClick, sidebarOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const title = navItems.find((item) => location.pathname.startsWith(item.to))?.label || "VELQORIN";

  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-30 h-18 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 rounded-xl text-ink hover:bg-surface-secondary"
            aria-label="Open menu"
            aria-controls="app-sidebar"
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" className="w-6 h-6" />
          </button>
          <p className="text-lg font-bold text-ink truncate">{title}</p>
        </div>

        {user && (
          <Dropdown
            label="Account menu"
            trigger={
              <>
                <span className="w-10 h-10 rounded-full bg-primary text-milk-100 flex items-center justify-center text-sm font-bold">
                  {initials(user.full_name) || <Icon name="user" />}
                </span>
                <span className="hidden sm:block text-left">
                  <span className="block text-sm font-semibold text-ink leading-tight">{user.full_name}</span>
                  <span className="block text-xs text-ink-secondary leading-tight">{user.email}</span>
                </span>
                <Icon name="chevronDown" className="w-4 h-4 text-ink-secondary" />
              </>
            }
          >
            <div className="px-3 py-2 mb-1 border-b border-border sm:hidden">
              <p className="font-semibold text-ink truncate">{user.full_name}</p>
              <p className="text-xs text-ink-secondary truncate">{user.email}</p>
            </div>
            <button type="button" role="menuitem" className={menuItemClass} onClick={() => navigate("/profile")}>
              <Icon name="user" className="w-4 h-4" /> Profile
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${menuItemClass} text-danger`}
              onClick={() => setConfirmLogout(true)}
            >
              <Icon name="logout" className="w-4 h-4" /> Logout
            </button>
          </Dropdown>
        )}
      </div>
      <ConfirmLogout open={confirmLogout} onCancel={() => setConfirmLogout(false)} onConfirm={handleLogout} />
    </header>
  );
}
