import { useEffect, useState } from "react";
import api from "../api/axios";

export default function Dashboard() {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAccount();
  }, []);

  const fetchAccount = async () => {
    try {
      const response = await api.get("/accounts/me");
      setAccount(response.data);
    } catch (err) {
      setError("Failed to load account details");
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-slate-800 mb-6">Dashboard</h2>

      {error && <div className="bg-red-100 text-red-700 p-3 rounded-xl mb-4">{error}</div>}

      {account && (
        <div className="bg-white shadow-2xl rounded-3xl p-8 border border-slate-200">
          <h3 className="text-2xl font-semibold mb-6 text-slate-800">My Account</h3>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white p-5 rounded-2xl shadow-lg">
              <p className="text-indigo-100">Account Number</p>
              <p className="text-xl font-bold">{account.account_number}</p>
            </div>

            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-5 rounded-2xl shadow-lg">
              <p className="text-emerald-100">Balance</p>
              <p className="text-xl font-bold">₹ {Number(account.balance).toFixed(2)}</p>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <p className="text-slate-500">Currency</p>
              <p className="text-lg font-bold text-slate-800">{account.currency}</p>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <p className="text-slate-500">User ID</p>
              <p className="text-lg font-bold text-slate-800">{account.user_id}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}