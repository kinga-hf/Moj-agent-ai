"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase";
import { AppShell } from "./AppShell";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const publicRoutes = new Set(["/", "/login"]);

function isPublicRoute(pathname: string) {
  return publicRoutes.has(pathname);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      setUser(null);
      setIsLoading(false);
    }, 8000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        window.clearTimeout(timeoutId);
        setUser(data.session?.user ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        window.clearTimeout(timeoutId);
        setUser(null);
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isLoading || !supabase) {
      return;
    }

    const publicRoute = isPublicRoute(pathname);

    if (!user && !publicRoute) {
      const next = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (user && publicRoute) {
      router.replace(searchParams.get("next") || "/");
    }
  }, [isLoading, pathname, router, searchParams, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        router.replace("/login");
      },
    }),
    [isLoading, router, user],
  );

  if (!supabase) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>Brak konfiguracji Supabase</h1>
          <p>Dodaj zmienne Supabase w konfiguracji projektu.</p>
        </section>
      </main>
    );
  }

  if (isLoading || (!user && !isPublicRoute(pathname))) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>Sprawdzam logowanie...</h1>
          <p>Za moment przejdziesz dalej.</p>
        </section>
      </main>
    );
  }

  const shouldUseAppShell = Boolean(user) && pathname !== "/login";

  return (
    <AuthContext.Provider value={value}>
      {shouldUseAppShell ? <AppShell>{children}</AppShell> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthGate.");
  }

  return context;
}
