"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";

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

type DashboardCurrency = {
  code: string;
  rate?: number;
  previousRate?: number;
  change?: number;
  effectiveDate?: string;
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
  currencies: DashboardCurrency[];
  holidays: {
    countryCode: string;
    year: number;
    upcoming: DashboardHoliday[];
    updatedAt: string;
    error?: string;
  };
};

const quickActions = [
  { href: "/upload", icon: "KB", label: "Baza wiedzy" },
  { href: "/email-triage", icon: "📧", label: "E-mail Triage" },
  { href: "/report", icon: "📊", label: "Raporty" },
  { href: "/competitor", icon: "🏢", label: "Konkurencja" },
  { href: "/legal-opposition", icon: "⚖️", label: "Legal Briefing" },
  { href: "/travel", icon: "✈️", label: "Podróż" },
  { href: "/react?prompt=Por%C3%B3wnaj%20kursy%20EUR%2C%20USD%2C%20GBP%2C%20CHF", icon: "💶", label: "Waluty" },
  { href: "/react", icon: "🔄", label: "ReAct" },
  { href: "/chat", icon: "💬", label: "Chat" },
  { href: "/think", icon: "🧠", label: "Myślenie" },
  { href: "/fewshot", icon: "📖", label: "Słownik AI" },
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
    const currencyInterval = window.setInterval(() => {
      void loadDashboard({ quiet: true });
    }, 60 * 60 * 1000);

    return () => {
      window.clearInterval(weatherInterval);
      window.clearInterval(currencyInterval);
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
            <span className="dashboard-kicker">Dashboard live</span>
            <h1>Dzień dobry! Dziś: {data?.dateTime.label ?? "ładowanie daty..."}</h1>
            <p>Pogoda, waluty, święta i szybkie wejścia do najważniejszych trybów agenta.</p>
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
            <SkeletonCard title="Kursy walut" />
            <SkeletonCard title="Święta" />
            <SkeletonCard title="Tłumacz podróżny" />
            <SkeletonCard title="Szybkie akcje" />
          </div>
        ) : data ? (
          <div className="dashboard-grid">
            <section className="dashboard-card weather-card">
              <div className="dashboard-card-top">
                <span>🌤️ Pogoda</span>
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

            <section className="dashboard-card currency-card">
              <div className="dashboard-card-top">
                <span>💶 Kursy walut</span>
                <em>Aktualizacja: {formatTime(data.currencies[0]?.updatedAt)}</em>
              </div>
              <div className="currency-list">
                {data.currencies.map((currency) => (
                  <div className="currency-row" key={currency.code}>
                    <span>{currency.code}</span>
                    {currency.error ? (
                      <strong>{currency.error}</strong>
                    ) : (
                      <>
                        <strong>{currency.rate?.toFixed(4)} PLN</strong>
                        <em className={(currency.change ?? 0) >= 0 ? "up" : "down"}>
                          {(currency.change ?? 0) >= 0 ? "^" : "↓"} {Math.abs(currency.change ?? 0).toFixed(4)}
                        </em>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p>Kurs z: {data.currencies[0]?.effectiveDate ?? "NBP"}</p>
            </section>

            <section className="dashboard-card holidays-card">
              <div className="dashboard-card-top">
                <span>📅 Nadchodzące święta</span>
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

            <section className="dashboard-card travel-translator-card">
              <div className="dashboard-card-top">
                <span>🌍 Tłumacz podróżny</span>
                <em>Nowa funkcja</em>
              </div>
              <h2>Rozmówki w planie wyjazdu</h2>
              <p>
                Asystent podróży potrafi teraz dodać praktyczne zwroty w języku kraju
                docelowego: powitanie, pytanie o drogę, zamówienie jedzenia i prośbę o pomoc.
              </p>
              <div className="travel-translator-preview">
                <span>Dzień dobry</span>
                <span>Gdzie jest dworzec?</span>
                <span>Poproszę rachunek</span>
              </div>
              <a className="dashboard-card-link" href="/travel">
                Otwórz asystenta podróży
              </a>
            </section>

            <section className="dashboard-card actions-card">
              <div className="dashboard-card-top">
                <span>🤖 Szybkie akcje</span>
                <em>Start pracy</em>
              </div>
              <div className="quick-actions">
                {quickActions.map((action) => (
                  <a href={action.href} key={action.href}>
                    <span>{action.icon}</span>
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
