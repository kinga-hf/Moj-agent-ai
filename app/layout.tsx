import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "./components/AuthGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "LexAI — osobisty asystent prawny AI",
  description: "LexAI pomaga analizować dokumenty, notatki i pisma procesowe.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>
        <Suspense
          fallback={
            <main className="auth-shell">
              <section className="auth-card">
                <h1>Wczytuje aplikacje...</h1>
              </section>
            </main>
          }
        >
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </body>
    </html>
  );
}
