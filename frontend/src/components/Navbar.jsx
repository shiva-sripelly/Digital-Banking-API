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
    <header className="bg-blue-700 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Digital Banking</h1>
          <p className="text-sm text-blue-100">FastAPI + React</p>
        </div>

        {user && (
          <nav className="flex gap-4 items-center flex-wrap justify-end">
            <Link to="/" className="hover:text-yellow-300">
              Dashboard
            </Link>
            <Link to="/transfer" className="hover:text-yellow-300">
              Transfer
            </Link>
            <Link to="/deposit" className="hover:text-yellow-300">
              Deposit
            </Link>
            <Link to="/withdraw" className="hover:text-yellow-300">
              Withdraw
            </Link>
            <Link to="/history" className="hover:text-yellow-300">
              History
            </Link>
            <button
              onClick={handleLogout}
              className="bg-white text-blue-700 px-4 py-2 rounded-lg font-semibold"
            >
              Logout
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}