"use client";

import { useAuth } from "./AuthGate";

export function AuthStatus({ compact = false }: { compact?: boolean }) {
  const { signOut, user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className={compact ? "auth-status compact" : "auth-status"}>
      <span title={user.email ?? undefined}>{user.email}</span>
      <button onClick={() => void signOut()} type="button">
        Wyloguj
      </button>
    </div>
  );
}
