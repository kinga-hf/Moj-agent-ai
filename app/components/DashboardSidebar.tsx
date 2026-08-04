"use client";

import { usePathname } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { AuthStatus } from "./AuthStatus";
import { GlobalSidebarContext } from "./SidebarContext";

const navigationGroups = [
  {
    label: "Start",
    items: [
      { href: "/", icon: "🏠", label: "Dashboard" },
      { href: "/agent", icon: "🤖", label: "Agent AI" },
    ],
  },
  {
    label: "Wiedza i komunikacja",
    items: [
      { href: "/upload", icon: "📚", label: "Baza wiedzy" },
      { href: "/briefings", icon: "📰", label: "Briefingi" },
      { href: "/email-triage", icon: "📧", label: "E-mail Triage" },
      { href: "/chat", icon: "💬", label: "Chat prawniczy" },
      { href: "/history", icon: "📜", label: "Historia" },
    ],
  },
  {
    label: "Analiza i praca",
    items: [
      { href: "/report", icon: "📊", label: "Raporty" },
      { href: "/extract", icon: "🔎", label: "Analizator" },
      { href: "/competitor", icon: "🏢", label: "Konkurencja" },
      { href: "/legal-opposition", icon: "⚖️", label: "Legal Briefing" },
      { href: "/think", icon: "🧠", label: "Myślenie" },
    ],
  },
  {
    label: "Narzędzia",
    items: [
      { href: "/react", icon: "🔄", label: "ReAct" },
      { href: "/search", icon: "🌐", label: "Szukaj" },
      { href: "/translator", icon: "🌍", label: "Tłumacz" },
      { href: "/format", icon: "📐", label: "Formater" },
      { href: "/fewshot", icon: "📖", label: "Słownik AI" },
      { href: "/travel", icon: "✈️", label: "Podróże" },
      { href: "/generate", icon: "🎨", label: "Grafiki" },
      { href: "/vision", icon: "👁️", label: "Vision" },
    ],
  },
  {
    label: "Administracja",
    items: [{ href: "/admin/security", icon: "🛡️", label: "Bezpieczeństwo" }],
  },
] as const;

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({ global = false }: { global?: boolean }) {
  const insideGlobalShell = useContext(GlobalSidebarContext);
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (insideGlobalShell && !global) {
    return null;
  }

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
          {navigationGroups.map((group) => (
            <section className="sidebar-group" key={group.label}>
              <span className="sidebar-group-label">{group.label}</span>
              <div className="sidebar-group-items">
                {group.items.map((item) => (
                  <a className={isActiveRoute(pathname, item.href) ? "active" : ""} href={item.href} key={item.href}>
                    <span>{item.icon}</span>
                    {item.label}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </nav>
        <AuthStatus />
      </aside>
    </>
  );
}
