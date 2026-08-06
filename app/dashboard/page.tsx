"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";
import { GoldIcon, type IconName } from "../components/GoldIcon";

type DashboardWeather = {
  city: string;
  country?: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  precipitation?: number;
  updatedAt: string;
  error?: string;
};

type DashboardHoliday = {
  date: string;
  localName: string;
  name: string;
  daysUntil: number;
};

type DashboardData = {
  generatedAt: string;
  dateTime: {
    iso: string;
    label: string;
    day: string;
  };
  weather: DashboardWeather;
  holidays: {
    countryCode: string;
    year: number;
    upcoming: DashboardHoliday[];
    updatedAt: string;
    error?: string;
  };
};

const quickActions: Array<{ href: string; icon: IconName; label: string }> = [
  { href: "/legal-briefing", icon: "legal", label: "Analiza pisma" },
  { href: "/extract", icon: "analyzer", label: "Analizator pism" },
  { href: "/upload", icon: "knowledge", label: "Baza dokumentów" },
  { href: "/history", icon: "history", label: "Historia spraw" },
  { href: "/report", icon: "report", label: "Raport prawny" },
  { href: "/competitor", icon: "competitor", label: "Helpfind vs Helphero vs Votum" },
  { href: "/briefings", icon: "briefings", label: "Briefingi" },
  { href: "/chat", icon: "chat", label: "Chat prawniczy" },
  { href: "/format", icon: "format", label: "Formater pism" },
];

function formatTime(value?: string) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(`${value}T00:00:00`));
}

function SkeletonCard({ title }: { title: string }) {
  return (
    <section className="dashboard-card dashboard-skeleton" aria-label={title}>
      <div className="skeleton-line short" />
      <div className="skeleton-line large" />
      <div className="skeleton-line" />
      <div className="skeleton-line medium" />
    </section>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function loadDashboard({ quiet = false } = {}) {
    if (quiet) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const nextData = (await response.json()) as DashboardData;

      if (!response.ok) {
        throw new Error("Dashboard nie pobrał danych.");
      }

      setData(nextData);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udało się pobrać danych dashboardu.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboard();

    const weatherInterval = window.setInterval(() => {
      void loadDashboard({ quiet: true });
    }, 15 * 60 * 1000);

    return () => {
      window.clearInterval(weatherInterval);
    };
  }, []);

  const nextHoliday = data?.holidays.upcoming[0];
  const statusText = useMemo(() => {
    if (isLoading) {
      return "Ładuję dane...";
    }

    if (error) {
      return "Wymaga odświeżenia";
    }

    return "Dane aktualne";
  }, [error, isLoading]);

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />

      <section className="dashboard-main" aria-label="Dashboard agenta">
        <header className="dashboard-hero">
          <div>
            <span className="agent-header-badge">LEXAI • CENTRUM DOWODZENIA</span>
            <h1>Dzień dobry! Dziś: {data?.dateTime.label ?? "ładowanie daty..."}</h1>
            <p>Data, najważniejsze terminy i szybkie wejścia do pracy nad pismami procesowymi.</p>
          </div>
          <div className="dashboard-status">
            <span>{statusText}</span>
            <button
              aria-label="Odśwież dane dashboardu"
              className="dashboard-refresh"
              disabled={isRefreshing || isLoading}
              onClick={() => void loadDashboard({ quiet: true })}
              type="button"
            >
              {"\u21bb"}
            </button>
          </div>
        </header>

        {error ? <div className="dashboard-error">{error}</div> : null}

        {isLoading && !data ? (
          <div className="dashboard-grid">
            <SkeletonCard title="Pogoda" />
            <SkeletonCard title="Centrum spraw" />
            <SkeletonCard title="Święta" />
            <SkeletonCard title="Tłumacz Google" />
            <SkeletonCard title="Szybkie akcje" />
          </div>
        ) : data ? (
          <div className="dashboard-grid">
            <section className="dashboard-card weather-card">
              <div className="dashboard-card-top">
                <span><GoldIcon name="weather" size={18} /> Pogoda</span>
                <em>Aktualizacja: {formatTime(data.weather.updatedAt)}</em>
              </div>
              <h2>{data.weather.city}</h2>
              {data.weather.error ? (
                <p className="dashboard-card-error">{data.weather.error}</p>
              ) : (
                <>
                  <strong className="dashboard-main-value">
                    {data.weather.temperature ?? "--"}°C
                  </strong>
                  <div className="dashboard-metrics">
                    <span>Wiatr: {data.weather.windSpeed ?? "--"} km/h</span>
                    <span>Wilgotność: {data.weather.humidity ?? "--"}%</span>
                    <span>Opad: {data.weather.precipitation ?? 0} mm</span>
                  </div>
                </>
              )}
            </section>

            <section className="dashboard-card legal-overview-card">
              <div className="dashboard-card-top">
                <span><GoldIcon name="legal" size={18} /> Centrum spraw</span>
                <em>LexAI</em>
              </div>
              <div className="legal-overview-list">
                <a href="/legal-briefing">
                  <span><GoldIcon name="legal" size={16} /></span>
                  <div><strong>Analiza pisma</strong><small>Uruchom Legal Briefing</small></div>
                  <b>↗</b>
                </a>
                <a href="/history">
                  <span><GoldIcon name="history" size={16} /></span>
                  <div><strong>Historia spraw</strong><small>Wróć do zapisanych analiz</small></div>
                  <b>↗</b>
                </a>
                <a href="/upload">
                  <span><GoldIcon name="knowledge" size={16} /></span>
                  <div><strong>Baza dokumentów</strong><small>Dodaj pismo lub notatki</small></div>
                  <b>↗</b>
                </a>
              </div>
              <p>Wszystkie materiały do sprawy w jednym miejscu.</p>
            </section>

            <section className="dashboard-card holidays-card">
              <div className="dashboard-card-top">
                <span><GoldIcon name="holiday" size={18} /> Nadchodzące święta</span>
                <em>Aktualizacja: {formatTime(data.holidays.updatedAt)}</em>
              </div>
              {data.holidays.error ? (
                <p className="dashboard-card-error">{data.holidays.error}</p>
              ) : (
                <>
                  <div className="holiday-list">
                    {data.holidays.upcoming.map((holiday) => (
                      <div className="holiday-row" key={holiday.date}>
                        <span>{formatShortDate(holiday.date)}</span>
                        <strong>{holiday.localName}</strong>
                        <em>za {holiday.daysUntil} dni</em>
                      </div>
                    ))}
                  </div>
                  <p>
                    Następne za: <strong>{nextHoliday?.daysUntil ?? "--"} dni</strong>
                  </p>
                </>
              )}
            </section>

            <section className="dashboard-card translator-dashboard-card">
              <div className="dashboard-card-top">
                <span><GoldIcon name="translate" size={18} /> Tłumacz Google</span>
                <em>Narzędzie pomocnicze</em>
              </div>
              <h2>Tłumacz dokumenty i pisma</h2>
              <p>
                Przekładaj fragmenty pism i materiały ze sprawy bez wychodzenia z centrum pracy LexAI.
              </p>
              <div className="translator-dashboard-preview">
                <span>Polski → Angielski</span>
                <span>Polski → Niemiecki</span>
                <span>Polski → Francuski</span>
              </div>
              <a className="dashboard-card-link" href="/translator">
                Otwórz tłumacza
              </a>
            </section>

            <section className="dashboard-card actions-card">
              <div className="dashboard-card-top">
                <span><GoldIcon name="agent" size={18} /> Szybkie akcje</span>
                <em>Start pracy</em>
              </div>
              <div className="quick-actions">
                {quickActions.map((action) => (
                  <a href={action.href} key={action.href}>
                    <span><GoldIcon name={action.icon} size={17} /></span>
                    {action.label}
                  </a>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
