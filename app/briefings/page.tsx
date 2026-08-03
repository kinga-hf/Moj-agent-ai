"use client";

import { useEffect, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";
import { supabase } from "../../lib/supabase";

type Briefing = { id: string; created_at: string; content: string; date: string };

function formatBriefingDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(new Date(`${value}T00:00:00`));
}

function getPreview(content: string) {
  const preview = content.replace(/\s+/g, " ").trim();
  return preview.length > 150 ? `${preview.slice(0, 147).trimEnd()}...` : preview;
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadBriefings() {
    if (!supabase) {
      setError("Brak konfiguracji Supabase.");
      setIsLoading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sesja wygasła. Zaloguj się ponownie.");
      setIsLoading(false);
      return;
    }

    const response = await fetch("/api/briefings", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { briefings?: Briefing[]; error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Nie udało się pobrać briefingów.");
      setIsLoading(false);
      return;
    }

    setBriefings(payload.briefings ?? []);
    setError("");
    setIsLoading(false);
  }

  useEffect(() => {
    void loadBriefings();
  }, []);

  async function generateNow() {
    setIsGenerating(true);
    setNotice("");
    try {
      const response = await fetch("/api/cron/morning", { cache: "no-store" });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "Nie udało się wygenerować briefingu.");
      await loadBriefings();
      setNotice("Nowy briefing został wygenerowany.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udało się wygenerować briefingu.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />
      <section className="dashboard-main briefings-main" aria-label="Briefingi">
        <header className="dashboard-hero">
          <div>
            <span className="dashboard-kicker">Automatyczne raporty</span>
            <h1>📰 Briefingi</h1>
            <p>Automatyczne podsumowania dnia od Twojego agenta</p>
          </div>
          <button className="briefings-generate-button" disabled={isGenerating} onClick={() => void generateNow()} type="button">
            {isGenerating ? "Generuję..." : "🔄 Wygeneruj teraz"}
          </button>
        </header>

        {notice ? <div className="briefings-notice" role="status">{notice}</div> : null}
        {error ? <div className="dashboard-error">{error}</div> : null}

        {isLoading ? (
          <div className="briefings-empty">Wczytywanie briefingów...</div>
        ) : briefings.length === 0 ? (
          <div className="briefings-empty">
            <strong>Brak briefingów.</strong>
            <span>Cron job wygeneruje pierwszy briefing jutro rano.</span>
            <button className="briefings-generate-button" disabled={isGenerating} onClick={() => void generateNow()} type="button">
              🔄 Wygeneruj teraz
            </button>
          </div>
        ) : (
          <div className="briefings-list">
            {briefings.map((briefing) => (
              <article className="briefing-card" key={briefing.id}>
                <a className="briefing-card-link" href={`/briefings/${briefing.id}`}>
                  <div className="briefing-card-heading">
                    <div>
                      <h2>{formatBriefingDate(briefing.date)}</h2>
                      <span className="briefing-status">✅ wygenerowany automatycznie (z cron)</span>
                    </div>
                    <time dateTime={briefing.created_at}>
                      {new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).format(new Date(briefing.created_at))}
                    </time>
                  </div>
                  <p>{getPreview(briefing.content)}</p>
                  <span className="briefing-read-more">Czytaj pełny briefing →</span>
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
