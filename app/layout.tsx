import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGENT AI",
  description: "Centrum pracy agenta AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
