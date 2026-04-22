import { useMemo, useState } from "react";
import api from "../api/axios";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import StripeCheckoutForm from "../components/StripeCheckoutForm";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function Payments() {
  const [amount, setAmount] = useState("");
  const [stripeClientSecret, setStripeClientSecret] = useState("");
  const [stripeMessage, setStripeMessage] = useState("");
  const [razorpayMessage, setRazorpayMessage] = useState("");
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [loadingRazorpay, setLoadingRazorpay] = useState(false);

  const parsedAmount = Number(amount || 0);

  const stripeOptions = useMemo(() => {
    if (!stripeClientSecret) return null;
    return {
      clientSecret: stripeClientSecret,
      appearance: {
        theme: "stripe",
      },
    };
  }, [stripeClientSecret]);

  const handleCreateStripeIntent = async () => {
    setStripeMessage("");
    setStripeClientSecret("");

    if (!parsedAmount || parsedAmount < 50) {
      setStripeMessage("Minimum amount should be ₹50");
      return;
    }

    try {
      setLoadingStripe(true);

      const res = await api.post("/payments/stripe/create-intent", {
        amount: Math.round(parsedAmount * 100),
        currency: "inr",
      });

      setStripeClientSecret(res.data.client_secret);
      setStripeMessage("Stripe payment form is ready");
    } catch (err) {
      setStripeMessage(
        err?.response?.data?.detail || "Stripe payment initialization failed"
      );
    } finally {
      setLoadingStripe(false);
    }
  };

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handleCreateRazorpayOrder = async () => {
    setRazorpayMessage("");

    if (!parsedAmount || parsedAmount <= 0) {
      setRazorpayMessage("Enter a valid amount");
      return;
    }

    const sdkLoaded = await loadRazorpayScript();

    if (!sdkLoaded) {
      setRazorpayMessage("Failed to load Razorpay SDK");
      return;
    }

    try {
      setLoadingRazorpay(true);

      const res = await api.post("/payments/razorpay/create-order", {
        amount: Math.round(parsedAmount * 100),
        currency: "inr",
      });

      const order = res.data;

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "Digital Banking App",
        description: "Test Payment",
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyRes = await api.post("/payments/razorpay/verify", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: Math.round(parsedAmount * 100),
            });

            setRazorpayMessage(
              verifyRes?.data?.message ||
                `Payment successful! Payment ID: ${response.razorpay_payment_id}`
            );
          } catch (err) {
            setRazorpayMessage(
              err?.response?.data?.detail || "Payment verification failed"
            );
          }
        },
        prefill: {
          name: "User",
          email: "user@example.com",
          contact: "9876543210",
        },
        config: {
          display: {
            blocks: {
              preferred: {
                name: "Preferred Methods",
                instruments: [{ method: "upi" }, { method: "card" }],
              },
            },
            sequence: ["block.preferred"],
            preferences: {
              show_default_blocks: true,
            },
          },
        },
        theme: {
          color: "#10b981",
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
    } catch (err) {
      setRazorpayMessage(
        err?.response?.data?.detail || "Razorpay payment failed"
      );
    } finally {
      setLoadingRazorpay(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-slate-800 mb-6">Payments</h2>

      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">
            Amount
          </label>
          <input
            type="number"
            placeholder="Enter amount"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-400"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            step="0.01"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <button
            onClick={handleCreateStripeIntent}
            disabled={loadingStripe}
            className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-5 py-3 rounded-xl font-semibold shadow-md hover:scale-[1.02] transition disabled:opacity-50"
          >
            {loadingStripe ? "Preparing Stripe..." : "Pay with Stripe"}
          </button>

          <button
            onClick={handleCreateRazorpayOrder}
            disabled={loadingRazorpay}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-3 rounded-xl font-semibold shadow-md hover:scale-[1.02] transition disabled:opacity-50"
          >
            {loadingRazorpay ? "Preparing Razorpay..." : "Pay with Razorpay"}
          </button>
        </div>

        {stripeMessage && (
          <div className="bg-indigo-50 text-indigo-700 rounded-xl p-3">
            {stripeMessage}
          </div>
        )}

        {razorpayMessage && (
          <div className="bg-emerald-50 text-emerald-700 rounded-xl p-3">
            {razorpayMessage}
          </div>
        )}

        {stripeClientSecret && stripeOptions && (
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xl font-semibold text-slate-800 mb-4">
              Complete Stripe Payment
            </h3>

            <Elements stripe={stripePromise} options={stripeOptions}>
              <StripeCheckoutForm
                amount={parsedAmount}
                clientSecret={stripeClientSecret}
              />
            </Elements>
          </div>
        )}
      </div>
    </div>
  );
}