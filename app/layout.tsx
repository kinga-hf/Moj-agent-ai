import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "./components/AuthGate";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://moj-agent-silk.vercel.app"),
  title: "LexAI — osobisty asystent prawny AI",
  description: "LexAI pomaga analizować dokumenty, notatki i pisma procesowe.",
  applicationName: "LexAI",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon.png",
  },
  openGraph: {
    type: "website",
    locale: "pl_PL",
    siteName: "LexAI",
    title: "LexAI — osobisty asystent prawny AI",
    description: "Analizuj pisma, porządkuj dokumenty i przygotowuj kolejne kroki.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "LexAI — osobisty asystent prawny AI" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LexAI — osobisty asystent prawny AI",
    description: "Analizuj pisma, porządkuj dokumenty i przygotowuj kolejne kroki.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
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
