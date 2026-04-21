import { useEffect, useState } from "react";
import api from "../api/axios";

export default function History() {
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await api.get("/transactions/history");
      setTransactions(response.data);
    } catch (err) {
      setError("Failed to load transaction history");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-blue-700 mb-6">Transaction History</h2>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">{error}</div>
      )}

      <div className="bg-white shadow-lg rounded-2xl p-6 border overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="p-3">Reference</th>
              <th className="p-3">Type</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Sender</th>
              <th className="p-3">Receiver</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length > 0 ? (
              transactions.map((txn) => (
                <tr key={txn.id} className="border-t">
                  <td className="p-3">{txn.reference}</td>
                  <td className="p-3 capitalize">{txn.transaction_type}</td>
                  <td className="p-3">₹ {Number(txn.amount).toFixed(2)}</td>
                  <td className="p-3">{txn.sender_account_number || "-"}</td>
                  <td className="p-3">{txn.receiver_account_number || "-"}</td>
                  <td className="p-3 text-green-700 font-semibold">{txn.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-3 text-center" colSpan="6">
                  No transactions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}