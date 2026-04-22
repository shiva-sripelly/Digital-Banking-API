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

  return "Transfer failed";
}

export default function Transfer() {
  const [form, setForm] = useState({
    receiver_account_number: "",
    amount: "",
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    const numericAmount = Number(form.amount);

    if (!form.receiver_account_number.trim()) {
      setError("Please enter receiver account number.");
      return;
    }

    if (!form.amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    try {
      const response = await api.post("/transactions/transfer", {
        receiver_account_number: form.receiver_account_number,
        amount: numericAmount,
      });

      setMessage(`Transfer successful. Reference: ${response.data.reference}`);
      setForm({
        receiver_account_number: "",
        amount: "",
      });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-blue-700 mb-6">Fund Transfer</h2>

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
            type="text"
            name="receiver_account_number"
            placeholder="Receiver account number"
            value={form.receiver_account_number}
            onChange={handleChange}
            className="w-full border rounded-lg px-4 py-3"
            required
          />

          <input
            type="number"
            name="amount"
            placeholder="Amount"
            value={form.amount}
            onChange={handleChange}
            className="w-full border rounded-lg px-4 py-3"
            min="1"
            step="0.01"
            required
          />

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 rounded-xl font-semibold shadow-md hover:scale-[1.02] transition"
          >
            Transfer Funds
          </button>
        </form>
      </div>
    </div>
  );
}