import { useState } from "react";
import StatusPopup from "./StatusPopup";
import Button from "./ui/Button";

/** Logout confirmation used by every logout control (customer and admin). */
export default function ConfirmLogout({ open, onCancel, onConfirm, admin = false }) {
  const [loading, setLoading] = useState(false);

  const confirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <StatusPopup
      open={open}
      onClose={loading ? undefined : onCancel}
      tone="plum"
      icon="logout"
      title={admin ? "Sign out of Admin Portal?" : "Leaving VELQORIN?"}
      message={
        admin
          ? "Your administrative session will end securely. You'll need to sign in again to continue."
          : "Your session will end securely. You can sign in again whenever you're ready."
      }
      actions={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading} className="min-h-12 sm:flex-1">
            {admin ? "Cancel" : "Stay logged in"}
          </Button>
          <Button onClick={confirm} loading={loading} loadingText="Logging out..." className="sm:flex-1">
            Log out
          </Button>
        </>
      }
    />
  );
}
