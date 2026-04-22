import { useState } from "react";
import api from "../api/axios";

function getErrorMessage(err) {
  const detail = err?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ");
  }

  if (typeof detail === "string") {
    return detail;
  }

  return "Deposit failed";
}

export default function Deposit() {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    const numericAmount = Number(amount);

    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    try {
      const response = await api.post("/transactions/deposit", {
        amount: numericAmount,
      });

      setMessage(
        `Deposit successful. Ref: ${response.data.reference}. New Balance: ₹ ${Number(
          response.data.balance
        ).toFixed(2)}`
      );
      setAmount("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-blue-700 mb-6">Deposit Funds</h2>

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
            placeholder="Enter deposit amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border rounded-lg px-4 py-3"
            min="1"
            step="0.01"
            required
          />

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 rounded-xl font-semibold shadow-md hover:scale-[1.02] transition"
          >
            Deposit
          </button>
        </form>
      </div>
    </div>
  );
}