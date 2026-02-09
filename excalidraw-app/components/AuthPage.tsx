import { useState } from "react";

import { login, register } from "../data/authService";

import type { User } from "../data/authService";

import "../global.scss";
import "./AuthPage.scss";

type AuthPageProps = {
  onSuccess: (user: User) => void;
  onGoHome: () => void;
  initialMode?: "login" | "register";
};

export const AuthPage = ({
  onSuccess,
  onGoHome,
  initialMode = "login",
}: AuthPageProps) => {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let user: User;
      if (mode === "register") {
        if (!name.trim()) {
          setError("Name is required");
          setLoading(false);
          return;
        }
        user = await register(email.trim(), password, name.trim());
      } else {
        user = await login(email.trim(), password);
      }
      onSuccess(user);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="an-page auth-page">
      <div className="auth-page__container">
        <div className="auth-page__card">
          {/* Logo */}
          <div className="auth-page__logo" onClick={onGoHome}>
            <div className="auth-page__logo-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
            </div>
            <span>Aladdin Notes</span>
          </div>

          <h1 className="auth-page__title">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="auth-page__subtitle">
            {mode === "login"
              ? "Sign in to access your drawings"
              : "Start organizing your ideas visually"}
          </p>

          {error && <div className="auth-page__error">{error}</div>}

          <form className="auth-page__form" onSubmit={handleSubmit}>
            {mode === "register" && (
              <div className="auth-page__field">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
            )}
            <div className="auth-page__field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="auth-page__field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              className="an-btn an-btn--primary auth-page__submit"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <div className="auth-page__switch">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button onClick={() => { setMode("register"); setError(""); }}>
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => { setMode("login"); setError(""); }}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
