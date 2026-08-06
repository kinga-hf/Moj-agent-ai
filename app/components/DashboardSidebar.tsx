"use client";

import { usePathname } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { AuthStatus } from "./AuthStatus";
import { GoldIcon } from "./GoldIcon";
import { GlobalSidebarContext } from "./SidebarContext";

const navigationGroups = [
  {
    label: "Start",
    items: [
      { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
      { href: "/agent", icon: "agent", label: "LexAI" },
    ],
  },
  {
    label: "Wiedza i komunikacja",
    items: [
      { href: "/upload", icon: "knowledge", label: "Baza dokumentów" },
      { href: "/briefings", icon: "briefings", label: "Briefingi" },
      { href: "/chat", icon: "chat", label: "Chat prawniczy" },
      { href: "/history", icon: "history", label: "Historia" },
    ],
  },
  {
    label: "Analiza i praca",
    items: [
      { href: "/report", icon: "report", label: "Raporty" },
      { href: "/competitor", icon: "competitor", label: "Konkurencja" },
      { href: "/legal-opposition", icon: "legal", label: "Legal Briefing" },
      { href: "/think", icon: "think", label: "Myślenie" },
    ],
  },
  {
    label: "Narzędzia",
    items: [
      { href: "/react", icon: "react", label: "ReAct" },
      { href: "/search", icon: "search", label: "Szukaj" },
      { href: "/translator", icon: "translate", label: "Tłumacz" },
      { href: "/format", icon: "format", label: "Formater" },
      { href: "/fewshot", icon: "dictionary", label: "Słownik AI" },
      { href: "/generate", icon: "graphics", label: "Grafiki" },
      { href: "/vision", icon: "vision", label: "Vision" },
    ],
  },
  {
    label: "Administracja",
    items: [{ href: "/admin/security", icon: "security", label: "Bezpieczeństwo" }],
  },
] as const;

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({ global = false }: { global?: boolean }) {
  const insideGlobalShell = useContext(GlobalSidebarContext);
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Start: true });

  useEffect(() => {
    setMenuOpen(false);
    const activeGroup = navigationGroups.find((group) =>
      group.items.some((item) => isActiveRoute(pathname, item.href)),
    );

    if (activeGroup) {
      setOpenGroups((current) => ({ ...current, [activeGroup.label]: true }));
    }
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
          <span><GoldIcon name="agent" size={28} /></span>
          <strong>LexAI</strong>
          <em>centrum spraw prawnych</em>
        </div>

        <nav>
          {navigationGroups.map((group) => (
            <section className="sidebar-group" key={group.label}>
              <button
                aria-expanded={Boolean(openGroups[group.label])}
                className="sidebar-group-toggle"
                onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
                type="button"
              >
                <span>{group.label}</span>
                <span aria-hidden="true">{openGroups[group.label] ? "⌃" : "⌄"}</span>
              </button>
              {openGroups[group.label] ? (
                <div className="sidebar-group-items">
                  {group.items.map((item) => (
                    <a className={isActiveRoute(pathname, item.href) ? "active" : ""} href={item.href} key={item.href}>
                      <span><GoldIcon name={item.icon} /></span>
                      {item.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </nav>
        <AuthStatus />
      </aside>
    </>
  );
}
