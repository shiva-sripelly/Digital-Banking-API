import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            Nova Bank
          </h1>
          <p className="text-sm text-slate-500">Smart Digital Banking</p>
        </div>

        {user && (
          <nav className="flex gap-5 items-center flex-wrap">
            <Link to="/" className="text-slate-600 hover:text-indigo-600 font-medium">
              Dashboard
            </Link>
            <Link to="/transfer" className="text-slate-600 hover:text-indigo-600 font-medium">
              Transfer
            </Link>
            <Link to="/deposit" className="text-slate-600 hover:text-indigo-600 font-medium">
              Deposit
            </Link>
            <Link to="/withdraw" className="text-slate-600 hover:text-indigo-600 font-medium">
              Withdraw
            </Link>
            <Link to="/history" className="text-slate-600 hover:text-indigo-600 font-medium">
              History
            </Link>

            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-5 py-2 rounded-xl font-semibold shadow-md hover:scale-105 transition"
            >
              Logout
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}