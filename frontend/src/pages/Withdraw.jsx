import { useState } from "react";
import api from "../api/axios";

export default function Withdraw() {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    try {
      const response = await api.post("/transactions/withdraw", {
        amount: Number(amount),
      });

      setMessage(
        `Withdraw successful. Ref: ${response.data.reference}. New Balance: ₹ ${Number(
          response.data.balance
        ).toFixed(2)}`
      );
      setAmount("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Withdraw failed");
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-blue-700 mb-6">Withdraw Funds</h2>

      <div className="bg-white shadow-lg rounded-2xl p-6 border">
        {message && (
          <div className="bg-green-100 text-green-700 p-3 rounded-lg mb-4">
            {message}
          </div>
        )}

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="number"
            name="amount"
            placeholder="Enter withdraw amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border rounded-lg px-4 py-3"
            required
          />

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-rose-500 to-pink-500 text-white py-3 rounded-xl font-semibold shadow-md hover:scale-[1.02] transition"
          >
            Withdraw
          </button>
        </form>
      </div>
    </div>
  );
}