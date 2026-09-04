"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (res.ok) {
      // replace(), not push(): the form must not sit in history behind the app.
      router.replace("/");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(
      res.status === 429
        ? `Too many attempts. Try again in ${body.retry_after_minutes ?? 15} minutes.`
        : "Wrong passcode.",
    );
    setBusy(false);
  }

  return (
    <main className="wrap login-page">
      <div className="topbar">
        <div>
          <div className="kicker">Strength · Actuals</div>
          <h1 className="wordmark">
            The Muscle-Up <span>Project</span>
          </h1>
        </div>
      </div>
      <div className="card">
        <form className="login-form" onSubmit={submit}>
          <label className="login-label" htmlFor="passcode">
            Passcode
          </label>
          <input
            id="passcode"
            className="login-input"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
          {error && <div className="login-error">{error}</div>}
          <button className="log-submit" type="submit" disabled={busy || !passcode}>
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}
