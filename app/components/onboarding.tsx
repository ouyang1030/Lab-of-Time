"use client";
import { useState } from "react";
import type { MemberColor, Mutate, Snapshot } from "@/lib/model";
import ColorPicker from "./color-picker";
import Turnstile from "./turnstile";

export default function Onboarding({
  account,
  turnstileSiteKey,
  busy,
  error,
  onSubmit,
  onSkip,
}: {
  account: Snapshot["user"];
  turnstileSiteKey: string;
  busy: boolean;
  error: string;
  onSubmit: Mutate;
  onSkip: () => void;
}) {
  const [register, setRegister] = useState(true);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [labName, setLabName] = useState("");
  const [color, setColor] = useState<MemberColor>("blue");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [verification, setVerification] = useState(0);
  // Each token is accepted once, so every attempt gets a fresh widget.
  const submitVerified = async (
    value: Record<string, unknown>,
    message: string,
  ) => {
    const ok = await onSubmit({ ...value, turnstileToken }, message);
    setTurnstileToken("");
    setVerification((count) => count + 1);
    return ok;
  };
  const verificationWidget = (
    <Turnstile
      key={verification}
      siteKey={turnstileSiteKey}
      onToken={setTurnstileToken}
    />
  );

  if (!account && forgot) {
    return (
      <div className="onboarding-overlay">
        <section className="onboarding-card">
          <h2 className="onboarding-brand">
            <img src="/logo.png?v=2" alt="" />
            Lab of Time
          </h2>
          <p>Reset password using the code issued by your lab owner.</p>
          <form
            style={{ marginTop: 20 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await submitVerified(
                { action: "resetPassword", email, code: resetCode, password },
                "Password reset successful",
              );
              if (ok) {
                setForgot(false);
                setPassword("");
                setResetCode("");
              }
            }}
          >
            <label className="field">
              Account email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              Reset code (from owner)
              <input
                autoComplete="off"
                placeholder="XXXX-XXXX-XXXX"
                required
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
              />
            </label>
            <label className="field">
              New password (min 12 chars)
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {verificationWidget}
            <button
              className="button primary"
              disabled={busy || !turnstileToken}
            >
              {busy ? "Saving…" : "Reset password"}
            </button>
          </form>
          <button
            className="text-button"
            style={{ marginTop: 12 }}
            onClick={() => {
              setForgot(false);
              setPassword("");
            }}
          >
            Back to sign in
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="onboarding-overlay">
      <section className="onboarding-card">
        <h2 className="onboarding-brand">
          <img src="/logo.png?v=2" alt="" />
          Lab of Time
        </h2>
        <p>
          {account
            ? "Create your own lab, or join one with an invite code."
            : "Your account. Your lab. Your research."}
        </p>
        <form
          style={{ marginTop: 20 }}
          onSubmit={async (event) => {
            event.preventDefault();
            if (!account) {
              await submitVerified(
                register
                  ? { action: "register", email, password, displayName }
                  : { action: "login", email, password },
                "Signed in",
              );
              return;
            }
            await onSubmit(
              code.trim()
                ? {
                    action: "joinGroup",
                    code: code.trim(),
                    displayName: account.displayName,
                    color,
                  }
                : {
                    action: "createGroup",
                    name: labName.trim(),
                    displayName: account.displayName,
                    color,
                  },
              code.trim() ? "Joined lab" : "Lab ready",
            );
          }}
        >
          {!account && (
            <>
              <label className="field">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={register ? 12 : 1}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {register && (
                <label className="field">
                  Your name
                  <input
                    required
                    maxLength={100}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
              )}
              {register && <ColorPicker value={color} onChange={setColor} />}
            </>
          )}
          {account && (
            <>
              <label className="field">
                Lab name
                <input
                  required={!code.trim()}
                  disabled={!!code.trim()}
                  maxLength={100}
                  value={labName}
                  onChange={(e) => setLabName(e.target.value)}
                />
              </label>
              <label className="field">
                Invite code (optional)
                <input
                  autoComplete="off"
                  placeholder="Join an existing lab instead"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            </>
          )}
          {!account && verificationWidget}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            className="button primary"
            disabled={busy || (!account && !turnstileToken)}
          >
            {busy
              ? "Saving…"
              : account
                ? code.trim()
                  ? "Join lab"
                  : "Create lab"
                : register
                  ? "Create account"
                  : "Sign in"}
          </button>
        </form>
        {!account && (
          <div
            style={{
              display: "flex",
              justifyContent: register ? "center" : "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <button
              className="text-button"
              onClick={() => setRegister(!register)}
            >
              {register
                ? "Already have an account? Sign in"
                : "Create an account"}
            </button>
            {!register && (
              <button
                className="text-button"
                onClick={() => {
                  setForgot(true);
                  setPassword("");
                }}
              >
                Forgot password?
              </button>
            )}
          </div>
        )}
        {account && (
          <button type="button" className="text-button" onClick={onSkip}>
            Skip
          </button>
        )}
      </section>
    </div>
  );
}
