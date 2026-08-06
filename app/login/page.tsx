"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { GoldIcon } from "../components/GoldIcon";

type AuthMode = "signin" | "signup";

function getAuthErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login")) {
    return "Nieprawidłowy email albo hasło.";
  }

  if (normalized.includes("password")) {
    return "Hasło musi mieć co najmniej 6 znaków.";
  }

  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const nextUrl = useMemo(() => searchParams.get("next") || "/", [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || isSubmitting) {
      return;
    }

    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const credentials = {
        email: email.trim(),
        password,
      };
      const { data, error: authError } =
        mode === "signup"
          ? await supabase.auth.signUp(credentials)
          : await supabase.auth.signInWithPassword(credentials);

      if (authError) {
        throw authError;
      }

      if (mode === "signup" && !data.session) {
        setNotice("Konto utworzone. Sprawdź email, jeśli Supabase wymaga potwierdzenia.");
        return;
      }

      router.replace(nextUrl);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? getAuthErrorMessage(caughtError.message)
          : "Nie udało się zalogować.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand" aria-label="LexAI">
          <span className="auth-brand-mark"><GoldIcon name="agent" size={22} /></span>
          <span className="auth-brand-name">LexAI</span>
        </div>

        <span className="auth-private-badge"><GoldIcon name="security" size={15} /> Prywatny dostęp</span>
        <div className="auth-heading">
          <h1>{mode === "signin" ? "Zaloguj się" : "Zarejestruj się"}</h1>
          <p>Bezpieczny dostęp do Twoich rozmów, dokumentów i spraw.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jan.kowalski@kancelaria.pl"
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>Hasło</span>
            <span className="auth-password-field">
              <input
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Wpisz swoje hasło"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
                className="auth-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                title={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
                type="button"
              >
                <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
                  {showPassword ? <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a16.4 16.4 0 0 1-3.1 3.9M6.2 6.2C3.7 8 3 12 3 12s3.5 7 9 7a9.8 9.8 0 0 0 3.3-.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /> : <><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" /></>}
                </svg>
              </button>
            </span>
          </label>

          {mode === "signin" ? (
            <div className="auth-form-meta">
              <button
                className="auth-forgot-password"
                onClick={() => setNotice("Skontaktuj się z administratorem, aby zresetować hasło.")}
                type="button"
              >
                Zapomniałeś hasła?
              </button>
            </div>
          ) : null}

          {error ? <div className="dashboard-error">{error}</div> : null}
          {notice ? <div className="auth-notice">{notice}</div> : null}

          <button className="send-button auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Chwileczkę..."
              : mode === "signin"
                ? "Zaloguj się"
                : "Zarejestruj się"}
          </button>
        </form>

        <button
          className="auth-toggle"
          onClick={() => {
            setMode((currentMode) => (currentMode === "signin" ? "signup" : "signin"));
            setError("");
            setNotice("");
          }}
          type="button"
        >
          {mode === "signin"
            ? "Nie masz konta? Zarejestruj się"
            : "Masz już konto? Zaloguj się"}
        </button>
      </section>
    </main>
  );
}
