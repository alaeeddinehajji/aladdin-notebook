import { useState } from "react";
import { verifyAdminPin } from "../../data/adminAuth";
import "./admin.scss";

export const AdminPinGate = ({
  onVerified,
}: {
  onVerified: () => void;
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyAdminPin(pin)) {
      onVerified();
    } else {
      setError("Invalid PIN. Please try again.");
      setPin("");
    }
  };

  return (
    <div className="admin-pin-gate">
      <form className="admin-pin-card" onSubmit={handleSubmit}>
        <div className="admin-pin-card__title">Admin Verification</div>
        <div className="admin-pin-card__subtitle">
          Enter your admin PIN to continue
        </div>
        {error && <div className="admin-pin-card__error">{error}</div>}
        <input
          className="admin-pin-card__input"
          type="password"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setError("");
          }}
          placeholder="••••••"
          autoFocus
        />
        <button className="admin-pin-card__btn" type="submit">
          Verify
        </button>
      </form>
    </div>
  );
};
