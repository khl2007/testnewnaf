import { useEffect, useState } from "react";
import "./nafath.css";

export const NAFATH_TEAL = "#499184";

function IconUser() {
  return (
    <svg className="nf-icon nf-icon--left" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg className="nf-icon nf-icon--left" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="6" y="10" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10V8a4 4 0 118 0v2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function SdaiaFooter() {
  return <p className="nf-footer">SDAIA · Saudi Data & AI Authority</p>;
}

/**
 * In-tab account switcher. Chips for each logged-in (or signing-in) account,
 * plus an "add account" button. Sits above the phone on every screen.
 */
export function AccountSwitcherBar({ accounts, activeId, onSwitch, onAdd, onClose }) {
  return (
    <div className="nf-accounts" role="tablist" aria-label="Logged-in accounts">
      <div className="nf-accounts-row">
        {accounts.map((a) => (
          <div
            key={a.accountId}
            className={`nf-account-chip${a.accountId === activeId ? " is-active" : ""}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={a.accountId === activeId}
              className="nf-account-chip-main"
              onClick={() => onSwitch(a.accountId)}
              title={a.label}
            >
              <span className={`nf-account-dot${a.loggedIn ? " is-on" : ""}`} aria-hidden />
              <span className="nf-account-name">{a.label}</span>
            </button>
            {onClose ? (
              <button
                type="button"
                className="nf-account-close"
                aria-label={`Close ${a.label}`}
                title="Close this account"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(a.accountId);
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        <button type="button" className="nf-account-add" onClick={onAdd} title="Add account">
          + Account
        </button>
      </div>
    </div>
  );
}

export function PhoneFrame({ children, onLogout }) {
  return (
    <div className="nf-page">
      <div className="nf-phone">
        {onLogout ? (
          <button type="button" className="nf-top-logout" onClick={onLogout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 8l-4 4 4 4M6 12h11"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Logout
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function TealHeader({ title, onBack }) {
  return (
    <header className="nf-header">
      {onBack ? (
        <button type="button" className="nf-back" onClick={onBack} aria-label="Back">
          ←
        </button>
      ) : null}
      <h1 className="nf-title">{title}</h1>
    </header>
  );
}

export function TealButton({ children, disabled, onClick }) {
  return (
    <button type="button" className="nf-btn" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function WelcomeScreen({ onActivate }) {
  return (
    <PhoneFrame>
      <div className="nf-body">
        <p className="nf-logo" lang="ar">
          نفاذ
        </p>
        <p className="nf-logo-en">NAFATH</p>
        <p className="nf-hint" style={{ marginTop: 48 }}>
          Secure and Trusted National Digital Identity
        </p>
        <div style={{ marginTop: "auto" }}>
          <button type="button" className="nf-btn" onClick={onActivate}>
            Activate
          </button>
        </div>
        <SdaiaFooter />
      </div>
    </PhoneFrame>
  );
}

export function LoginScreen({
  username,
  password,
  showPassword,
  onTogglePassword,
  onUsername,
  onPassword,
  onNext,
  onBack,
  busy,
  error,
  modeHint,
}) {
  return (
    <PhoneFrame>
      <div className="nf-body">
        <TealHeader title="Login" onBack={onBack} />
        <p className="nf-hint">Please enter your national ID and your NAFATH password</p>

        <label className="nf-field">
          <span className="nf-label">National ID</span>
          <span className="nf-input-wrap">
            <IconUser />
            <input
              className="nf-input"
              value={username}
              onChange={(e) => onUsername(e.target.value)}
              inputMode="numeric"
              disabled={busy}
              autoComplete="username"
            />
          </span>
        </label>

        <label className="nf-field">
          <span className="nf-label">Password</span>
          <span className="nf-input-wrap">
            <IconLock />
            <input
              className="nf-input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              disabled={busy}
              autoComplete="current-password"
            />
            <button type="button" className="nf-icon nf-icon--right" onClick={onTogglePassword} aria-label="Show password">
              <IconEye />
            </button>
          </span>
        </label>

        <TealButton disabled={busy || !username || !password} onClick={onNext}>
          {busy ? "…" : "Next"}
        </TealButton>

        {error ? <p className="nf-error">{error}</p> : <p className="nf-muted">{modeHint}</p>}
        <SdaiaFooter />
      </div>
    </PhoneFrame>
  );
}

const OTP_LEN = 4;

export function OtpScreen({
  otp,
  onOtpChange,
  mobileHint,
  timer,
  onCancel,
  onNext,
  busy,
  sessionReady,
  hint,
  error,
}) {
  const clean = otp.replace(/\D/g, "").slice(0, OTP_LEN);
  const complete = clean.length >= OTP_LEN;

  const appendDigit = (d) => {
    if (clean.length < OTP_LEN) onOtpChange(clean + d);
  };
  const backspace = () => onOtpChange(clean.slice(0, -1));

  return (
    <PhoneFrame>
      <div className="nf-body" style={{ paddingBottom: 0 }}>
        <h1 className="nf-title">Verification code</h1>
        <p className="nf-hint">
          Please enter the verification code sent to the mobile number {mobileHint || "**"}
        </p>
        <p className="nf-muted">{timer}</p>
        <button type="button" className="nf-link" onClick={onCancel}>
          Cancel
        </button>

        <div className="nf-otp-row">
          {Array.from({ length: OTP_LEN }).map((_, i) => (
            <div key={i} className="nf-otp-slot">
              <span className="nf-otp-digit">{clean[i] || ""}</span>
              <span className={`nf-otp-line${i <= clean.length ? " is-on" : ""}`} />
            </div>
          ))}
        </div>

        <TealButton disabled={busy || !sessionReady || !complete} onClick={onNext}>
          {busy ? "…" : "Next"}
        </TealButton>

        {hint && !error && <p className="nf-hint">{hint}</p>}
        {error && <p className="nf-error">{error}</p>}

        <div className="nf-keys">
          <div className="nf-keys-grid">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
              k === "" ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  className="nf-key"
                  onClick={() => (k === "⌫" ? backspace() : appendDigit(k))}
                >
                  {k}
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function formatSpRemainingSeconds(secs) {
  const s = Math.max(0, Math.floor(Number(secs) || 0));
  const mm = String(Math.floor(s / 60));
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Countdown from GetSpRequests `remainingSecs` — shown at top of SP screens. */
export function SpRemainingTop({ remainingSecs }) {
  if (remainingSecs == null) return null;
  return (
    <div className="nf-sp-remaining" role="timer" aria-live="polite">
      <span className="nf-sp-remaining-label">Time remaining</span>
      <span className="nf-sp-remaining-value">{formatSpRemainingSeconds(remainingSecs)}</span>
    </div>
  );
}

export function StepScreen({ title, onBack, children, footer }) {
  return (
    <PhoneFrame>
      <div className="nf-body">
        <TealHeader title={title} onBack={onBack} />
        {children}
        {footer}
        <SdaiaFooter />
      </div>
    </PhoneFrame>
  );
}

export function SpAcceptSuccessScreen() {
  return (
    <PhoneFrame>
      <div className="nf-body nf-sp-success-body">
        <div className="nf-sp-success-card">
          <div className="nf-sp-success-ring" aria-hidden>
            <svg className="nf-sp-success-check" viewBox="0 0 52 52" width="52" height="52">
              <circle className="nf-sp-success-circle" cx="26" cy="26" r="24" fill="none" strokeWidth="2.5" />
              <path className="nf-sp-success-tick" fill="none" strokeWidth="3" d="M14 27l8 8 16-18" />
            </svg>
          </div>
          <h2 className="nf-sp-success-title">Request approved</h2>
          <p className="nf-sp-success-sub">Returning to requests…</p>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function SpWaitingScreen({ remainingSecs, totalSecs, onLogout, error, pulseKey }) {
  const total = Math.max(1, Number(totalSecs) || 120);
  const remaining = remainingSecs != null ? Math.max(0, Number(remainingSecs)) : null;
  const ticks = 60;
  const ratio = remaining != null ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const waiting = remaining == null;
  return (
    <PhoneFrame onLogout={onLogout}>
      <div className="nf-body nf-body--with-top-logout">
        <SpRemainingTop remainingSecs={remaining} />
        <div
          key={pulseKey}
          className={`nf-spinner nf-spinner--pulse${waiting ? " nf-spinner--spin" : ""}`}
        >
          {waiting ? <span className="nf-spinner-arc" aria-hidden /> : null}
          {Array.from({ length: ticks }).map((_, i) => (
            <span
              key={i}
              className={`nf-tick${!waiting && i / ticks > ratio ? " is-off" : ""}`}
              style={{ transform: `rotate(${(i / ticks) * 360}deg)` }}
            />
          ))}
          <p className="nf-spinner-text">Waiting for a service provider request</p>
        </div>
        <p className="nf-muted">Polling GetSpRequests every 5s</p>
        {error ? <p className="nf-error">{error}</p> : null}
      </div>
    </PhoneFrame>
  );
}

export function SpNoticeScreen({
  entity,
  message,
  description,
  onAccept,
  onLogout,
  busy,
  error,
  remainingSecs,
}) {
  return (
    <PhoneFrame onLogout={onLogout}>
      <div className="nf-body nf-body--with-top-logout">
        <SpRemainingTop remainingSecs={remainingSecs} />
        <div className="nf-sp-pin-card">
          <p className="nf-sp-pin-kicker">Service request</p>
          {entity ? (
            <p className="nf-sp-pin-entity" lang="ar" dir="auto">
              {entity}
            </p>
          ) : null}
          {message ? (
            <p className="nf-sp-pin-message" lang="ar" dir="auto">
              {message}
            </p>
          ) : null}
          {description ? (
            <p className="nf-hint" lang="ar" dir="auto">
              {description}
            </p>
          ) : (
            <p className="nf-hint">Review this request and confirm to continue in Nafath.</p>
          )}
          {error ? <p className="nf-error">{error}</p> : null}
          <TealButton disabled={busy} onClick={onAccept}>
            {busy ? "…" : "Accept"}
          </TealButton>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function SpFaceChallengeScreen({
  entity,
  message,
  description,
  remainingRetries,
  onFile,
  children,
  onCancel,
  onLogout,
  busy,
  hint,
  error,
  remainingSecs,
}) {
  return (
    <PhoneFrame onLogout={onLogout}>
      <div className="nf-body nf-body--with-top-logout">
        <SpRemainingTop remainingSecs={remainingSecs} />
        <div className="nf-sp-pin-card">
          <p className="nf-sp-pin-kicker">Face verification</p>
          {entity ? (
            <p className="nf-sp-pin-entity" lang="ar" dir="auto">
              {entity}
            </p>
          ) : null}
          {message ? (
            <p className="nf-sp-pin-message" lang="ar" dir="auto">
              {message}
            </p>
          ) : null}
          {description ? (
            <p className="nf-hint" lang="ar" dir="auto">
              {description}
            </p>
          ) : (
            <p className="nf-hint">Upload a photo to complete this request (lab — your own image only).</p>
          )}
          {remainingRetries != null ? (
            <p className="nf-muted">{remainingRetries} attempt(s) left</p>
          ) : null}
          {onFile ? (
            <label className="nf-field" style={{ border: "2px dashed #d1d5db", borderRadius: 16, padding: 24 }}>
              <span className="nf-title">Choose image</span>
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={onFile}
                style={{ marginTop: 12 }}
              />
            </label>
          ) : null}
          {children}
          {hint && !error ? <p className="nf-hint">{hint}</p> : null}
          {error ? <p className="nf-error">{error}</p> : null}
          <button type="button" className="nf-link" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function SpPinChallengeScreen({
  entity,
  message,
  remainingRetries,
  pin,
  onPinChange,
  onConfirm,
  onCancel,
  onLogout,
  busy,
  hint,
  error,
  remainingSecs,
}) {
  return (
    <PhoneFrame onLogout={onLogout}>
      <div className="nf-body nf-body--with-top-logout">
        <SpRemainingTop remainingSecs={remainingSecs} />
        <div className="nf-sp-pin-card">
          <p className="nf-sp-pin-kicker">Confirm login request</p>
          {entity ? (
            <p className="nf-sp-pin-entity" lang="ar" dir="auto">
              {entity}
            </p>
          ) : null}
          {message ? (
            <p className="nf-sp-pin-message" lang="ar" dir="auto">
              {message}
            </p>
          ) : (
            <p className="nf-hint">Enter your Nafath PIN to approve this request.</p>
          )}
          {remainingRetries != null ? (
            <p className="nf-muted">{remainingRetries} PIN attempt(s) left</p>
          ) : null}
          <label className="nf-field">
            <span className="nf-label">Nafath PIN</span>
            <input
              className="nf-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => onPinChange(e.target.value)}
              disabled={busy}
              maxLength={8}
            />
          </label>
          {hint && !error ? <p className="nf-hint">{hint}</p> : null}
          {error ? <p className="nf-error">{error}</p> : null}
          <TealButton disabled={busy || pin.replace(/\D/g, "").length < 4} onClick={onConfirm}>
            {busy ? "…" : "Confirm"}
          </TealButton>
          <button type="button" className="nf-link" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function SpNumberScreen({ values, remainingSecs, onPick, onLogout, busy, error }) {
  return (
    <PhoneFrame onLogout={onLogout}>
      <div className="nf-body nf-body--with-top-logout">
        <SpRemainingTop remainingSecs={remainingSecs} />
        <h1 className="nf-title" style={{ color: "#dc2626", textTransform: "uppercase", fontSize: "0.95rem" }}>
          Select number according to service provider
        </h1>
        <p className="nf-hint" style={{ marginBottom: 8, color: NAFATH_TEAL }}>
          Request Number
        </p>
        <p className="nf-hint">Please select the number shown on the service provider site / app</p>
        <div className="nf-circles">
          {values.map((v) => (
            <button key={v} type="button" className="nf-circle" disabled={busy} onClick={() => onPick(v)}>
              {v}
            </button>
          ))}
        </div>
        {error ? <p className="nf-error">{error}</p> : null}
        {busy ? <p className="nf-muted">Sending AcceptSpRequest…</p> : null}
      </div>
    </PhoneFrame>
  );
}

export function useCountdown(initialSeconds, active) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    if (!active) return;
    setSeconds(initialSeconds);
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [active, initialSeconds]);
  const mm = String(Math.floor(seconds / 60));
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
