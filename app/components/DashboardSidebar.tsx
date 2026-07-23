"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthStatus } from "./AuthStatus";

const navigation = [
  { href: "/upload", icon: "KB", label: "Baza wiedzy" },
  { href: "/", icon: "🏠", label: "Dashboard" },
  { href: "/email-triage", icon: "📧", label: "E-mail Triage" },
  { href: "/report", icon: "📊", label: "Raporty" },
  { href: "/competitor", icon: "🏢", label: "Konkurencja" },
  { href: "/legal-opposition", icon: "⚖️", label: "Legal Briefing" },
  { href: "/agent", icon: "🤖", label: "Agent" },
  { href: "/react", icon: "🔄", label: "ReAct" },
  { href: "/travel", icon: "🌍", label: "Podróże" },
  { href: "/translator", icon: "🌐", label: "Tłumacz" },
  { href: "/chat", icon: "💬", label: "Chat prawniczy" },
  { href: "/history", icon: "📜", label: "Historia" },
  { href: "/think", icon: "🧠", label: "Myślenie" },
  { href: "/search", icon: "🔎", label: "Szukaj" },
  { href: "/extract", icon: "📊", label: "Analizator" },
  { href: "/format", icon: "📐", label: "Formater" },
  { href: "/fewshot", icon: "📖", label: "Słownik AI" },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <button
        aria-expanded={menuOpen}
        className="dashboard-menu-button"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        ☰
      </button>

      <aside className={`dashboard-sidebar ${menuOpen ? "open" : ""}`} aria-label="Nawigacja dashboardu">
        <div className="dashboard-brand">
          <span>🤖</span>
          <strong>Agent AI</strong>
          <em>centrum dowodzenia</em>
        </div>
        <nav>
          {navigation.map((item) => (
            <a className={isActiveRoute(pathname, item.href) ? "active" : ""} href={item.href} key={item.href}>
              <span>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <AuthStatus />
      </aside>
    </>
  );
}
