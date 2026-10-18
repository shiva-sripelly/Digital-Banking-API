import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import Button from "./ui/Button";
import { Alert } from "./ui/Feedback";
import { formatCurrency } from "../utils/format";

/**
 * Collects card details and confirms the PaymentIntent with Stripe. It never
 * credits the wallet: the parent waits for the server, which only credits
 * after Stripe itself reports success (webhook or server-side check).
 */
export default function StripeCheckoutForm({ amount, onSubmitted, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || loading) return;

    setLoading(true);
    setError("");

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + "/payments",
      },
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message || "Payment failed");
      setLoading(false);
      return;
    }

    onSubmitted(paymentIntent);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border border-border rounded-xl p-4 bg-surface">
        <PaymentElement />
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={loading} className="sm:w-40">
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || !elements} loading={loading} loadingText="Processing..." className="flex-1">
          Pay {formatCurrency(amount)}
        </Button>
      </div>
    </form>
  );
}
