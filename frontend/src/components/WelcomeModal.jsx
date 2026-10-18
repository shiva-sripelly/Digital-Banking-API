import StatusPopup from "./StatusPopup";
import Button from "./ui/Button";
import Icon from "./ui/Icon";

/** Shown over the dashboard right after a successful sign-in. */
export default function WelcomeModal({ open, onClose, admin = false }) {
  return admin ? (
    <StatusPopup
      open={open}
      onClose={onClose}
      tone="success"
      icon="check"
      title="Admin authentication successful"
      message="You've successfully signed in to the admin portal."
      actions={
        <Button onClick={onClose} className="px-8">
          Continue <Icon name="arrowRight" className="w-4 h-4" />
        </Button>
      }
    />
  ) : (
    <StatusPopup
      open={open}
      onClose={onClose}
      tone="success"
      icon="check"
      ariaTitle="Welcome back to VELQORIN!"
      title={
        <>
          Welcome back to
          <span className="block text-3xl font-extrabold text-primary">VELQORIN!</span>
        </>
      }
      message="You've successfully signed in to your account. Your dashboard is ready."
      actions={
        <Button onClick={onClose} className="px-8">
          Let&apos;s go <Icon name="arrowRight" className="w-4 h-4" />
        </Button>
      }
    />
  );
}
