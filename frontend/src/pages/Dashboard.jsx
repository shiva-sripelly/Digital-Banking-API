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
      <h2 className="text-3xl font-bold text-blue-700 mb-6">Dashboard</h2>

      {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">{error}</div>}

      {account && (
        <div className="bg-white shadow-lg rounded-2xl p-6 border">
          <h3 className="text-xl font-semibold mb-4">My Account</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl">
              <p className="text-gray-500">Account Number</p>
              <p className="text-lg font-bold">{account.account_number}</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl">
              <p className="text-gray-500">Balance</p>
              <p className="text-lg font-bold text-green-700">
                ₹ {Number(account.balance).toFixed(2)}
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl">
              <p className="text-gray-500">Currency</p>
              <p className="text-lg font-bold">{account.currency}</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl">
              <p className="text-gray-500">User ID</p>
              <p className="text-lg font-bold">{account.user_id}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}