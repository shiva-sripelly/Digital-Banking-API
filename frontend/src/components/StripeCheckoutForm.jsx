import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

export default function StripeCheckoutForm({ amount, clientSecret }) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setMessage("");

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + "/payments",
      },
      redirect: "if_required",
    });

    if (error) {
      setMessage(error.message || "Payment failed");
    } else if (paymentIntent) {
      if (paymentIntent.status === "succeeded") {
        setMessage(`Payment successful. PaymentIntent ID: ${paymentIntent.id}`);
      } else {
        setMessage(`Payment status: ${paymentIntent.status}`);
      }
    } else {
      setMessage("Payment processing started");
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border border-slate-300 rounded-xl p-4 bg-white">
        <PaymentElement />
      </div>

      <button
        type="submit"
        disabled={!stripe || !elements || loading || !clientSecret}
        className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 rounded-xl font-semibold shadow-md hover:scale-[1.02] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Processing..." : `Pay ₹ ${Number(amount || 0).toFixed(2)}`}
      </button>

      {message && (
        <div className="bg-slate-100 text-slate-700 rounded-xl p-3">
          {message}
        </div>
      )}
    </form>
  );
}