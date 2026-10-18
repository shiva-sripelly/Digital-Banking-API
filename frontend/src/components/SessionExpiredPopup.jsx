import { useEffect, useState } from "react";
import { SESSION_EXPIRED_EVENT } from "../api/session";
import StatusPopup from "./StatusPopup";
import Button from "./ui/Button";

/** Listens for expired/revoked sessions reported by the API client. */
export default function SessionExpiredPopup() {
  const [portal, setPortal] = useState(null);

  useEffect(() => {
    const onExpired = (e) => setPortal((current) => current || e.detail?.portal || "customer");
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // A full reload clears every bit of signed-in state before signing in again
  const signIn = () => window.location.assign(portal === "admin" ? "/admin/login" : "/login");

  return (
    <StatusPopup
      open={Boolean(portal)}
      onClose={signIn}
      tone="info"
      icon="clock"
      title="Session Expired"
      message="For your security, your session has expired. Please sign in again to continue."
      showClose={false}
      actions={
        <Button onClick={signIn} className="px-12">
          Sign In
        </Button>
      }
    />
  );
}
