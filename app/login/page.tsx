"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

type AuthMode = "signin" | "signup";

function getAuthErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login")) {
    return "Nieprawidlowy email albo haslo.";
  }

  if (normalized.includes("password")) {
    return "Haslo musi miec co najmniej 6 znakow.";
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
        setNotice("Konto utworzone. Sprawdz email, jesli Supabase wymaga potwierdzenia.");
        return;
      }

      router.replace(nextUrl);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? getAuthErrorMessage(caughtError.message)
          : "Nie udalo sie zalogowac.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="dashboard-kicker">Prywatny dostep</span>
        <h1>{mode === "signin" ? "Zaloguj sie" : "Zarejestruj sie"}</h1>
        <p>Kazde konto widzi tylko swoje rozmowy, dokumenty i profil.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>Haslo</span>
            <input
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? <div className="dashboard-error">{error}</div> : null}
          {notice ? <div className="auth-notice">{notice}</div> : null}

          <button className="send-button" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Chwileczke..."
              : mode === "signin"
                ? "Zaloguj sie"
                : "Zarejestruj sie"}
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
            ? "Nie masz konta? Zarejestruj sie"
            : "Masz juz konto? Zaloguj sie"}
        </button>
      </section>
    </main>
  );
}
