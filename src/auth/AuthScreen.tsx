import { useState, FormEvent } from "react";
import {
  ArrowRight,
  EnvelopeSimple,
  LockKey,
  UserCircle,
  Eye,
  EyeSlash,
  ArrowLeft,
} from "@phosphor-icons/react";
import { requireSupabase, configurationError } from "../utils/supabase";
import { useAuth } from "./AuthProvider";
import { Card } from "../components";
type Mode = "login" | "signup" | "forgot" | "reset";
export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(
    auth.recovery
      ? "reset"
      : window.location.hash === "#ForgotPassword"
        ? "forgot"
        : "login",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [visible, setVisible] = useState(false);
  const current = auth.recovery ? "reset" : mode;
  const change = (next: Mode) => {
    setMode(next);
    setError("");
    setMessage("");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    const fields = new FormData(event.currentTarget),
      email = String(fields.get("email") || "").trim(),
      password = String(fields.get("password") || ""),
      name = String(fields.get("name") || "").trim();
    if (
      (current === "signup" || current === "reset") &&
      password !== fields.get("confirm")
    ) {
      setError("Your passwords do not match.");
      return;
    }
    if (current === "signup" && !name) {
      setError("Enter your name to create an account.");
      return;
    }
    setBusy(true);
    try {
      const client = requireSupabase();
      if (current === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.hash = "Today";
      } else if (current === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
          },
        });
        if (error) throw error;
        if (data.session) window.location.hash = "Today";
        else
          setMessage(
            "Check your email to confirm your account, then sign in. If you already have an account, use Sign In or reset your password.",
          );
      } else if (current === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${window.location.pathname}?flow=recovery`,
        });
        if (error) throw error;
        setMessage(
          "If an account exists for that email, a password reset link is on its way. Check your inbox.",
        );
      } else {
        if (!auth.user)
          throw new Error(
            "This reset link is invalid or expired. Request a new password reset email.",
          );
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        auth.finishRecovery();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Authentication failed. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const titles = {
    login: "Welcome back",
    signup: "Start your learning journey",
    forgot: "Reset your password",
    reset: "Choose a new password",
  };
  return (
    <div className="auth-shell">
      <a className="brand auth-brand" href={window.location.pathname}>
        <img src="/assets/ashvi.png" alt="" />
        <div>
          <strong>Ashvi</strong>
          <span>Your learning universe.</span>
        </div>
      </a>
      <Card className="auth-card">
        <span className="eyebrow">A LITTLE EVERY DAY ADDS UP</span>
        <h1>{titles[current]}</h1>
        <p>
          {current === "login"
            ? "Your skills, your momentum, your next step."
            : current === "signup"
              ? "A calm space for steady progress. Make it yours."
              : current === "forgot"
                ? "We’ll send a secure link to your email."
                : "Use a strong password that you haven’t used before."}
        </p>
        <form key={current} onSubmit={submit}>
          <fieldset disabled={busy || !!configurationError}>
            {current === "signup" && (
              <>
                <label className="field-label" htmlFor="auth-name">
                  NAME
                </label>
                <div className="auth-input">
                  <UserCircle size={20} />
                  <input
                    id="auth-name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    placeholder="Your name"
                  />
                </div>
              </>
            )}
            {current !== "reset" && (
              <>
                <label className="field-label" htmlFor="auth-email">
                  EMAIL
                </label>
                <div className="auth-input">
                  <EnvelopeSimple size={20} />
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    placeholder="you@example.com"
                  />
                </div>
              </>
            )}
            {current !== "forgot" && (
              <>
                <label className="field-label" htmlFor="auth-password">
                  PASSWORD
                </label>
                <div className="auth-input">
                  <LockKey size={20} />
                  <input
                    id="auth-password"
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete={
                      current === "login" ? "current-password" : "new-password"
                    }
                    minLength={current === "login" ? 1 : 8}
                    maxLength={128}
                    required
                    placeholder={
                      current === "login"
                        ? "Your password"
                        : "At least 8 characters"
                    }
                  />
                  <button
                    type="button"
                    className="icon-button subtle"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible((v) => !v)}
                  >
                    {visible ? <EyeSlash size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </>
            )}
            {(current === "signup" || current === "reset") && (
              <>
                <label className="field-label" htmlFor="auth-confirm">
                  CONFIRM PASSWORD
                </label>
                <input
                  id="auth-confirm"
                  name="confirm"
                  type={visible ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  placeholder="Enter your password again"
                />
              </>
            )}
            {current === "login" && (
              <div className="auth-forgot">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => change("forgot")}
                >
                  Forgot password?
                </button>
              </div>
            )}
            {(error || auth.error || configurationError) && (
              <div role="alert" className="error-banner auth-message">
                {error || auth.error || configurationError}
              </div>
            )}
            {message && (
              <div role="status" className="success-banner">
                {message}
              </div>
            )}
            {!(current === "reset" && !auth.user) && (
              <button className="primary full auth-submit" type="submit">
                {busy
                  ? "Please wait…"
                  : current === "login"
                    ? "Sign In"
                    : current === "signup"
                      ? "Create account"
                      : current === "forgot"
                        ? "Send reset link"
                        : "Update password"}
                {!busy && <ArrowRight size={18} />}
              </button>
            )}
          </fieldset>
        </form>
        {current === "login" ? (
          <p className="auth-switch">
            Don’t have an account?{" "}
            <button
              className="text-button"
              onClick={() => change("signup")}
              disabled={busy}
            >
              Create account
            </button>
          </p>
        ) : current === "reset" && !auth.user ? (
          <>
            <p role="alert" className="form-error">
              This reset link is invalid or expired.
            </p>
            <button
              className="text-button"
              onClick={() => {
                auth.finishRecovery();
                window.location.hash = "ForgotPassword";
                change("forgot");
              }}
            >
              Request a new reset link
            </button>
          </>
        ) : (
          current !== "reset" && (
            <button
              className="text-button auth-back"
              onClick={() => change("login")}
              disabled={busy}
            >
              <ArrowLeft size={16} />
              Back to Sign In
            </button>
          )
        )}
      </Card>
      <p className="auth-footer">
        Find your focus. Build your skills. Keep your cadence.
      </p>
    </div>
  );
}
