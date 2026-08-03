"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardSidebar } from "../../components/DashboardSidebar";
import { BriefingMarkdown } from "../../components/BriefingMarkdown";
import { supabase } from "../../../lib/supabase";

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

export default function BriefingDetailPage() {
  const params = useParams<{ id: string }>();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadBriefing() {
      if (!supabase || !params.id) {
        setError("Nie udało się znaleźć briefingu.");
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

      const response = await fetch(`/api/briefings/${params.id}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { briefing?: Briefing; error?: string };

      if (!response.ok) setError(payload.error ?? "Nie udało się pobrać briefingu.");
      else if (!payload.briefing) setError("Nie znaleziono tego briefingu.");
      else setBriefing(payload.briefing);
      setIsLoading(false);
    }

    void loadBriefing();
  }, [params.id]);

  async function copyBriefing() {
    if (!briefing) return;
    await navigator.clipboard.writeText(briefing.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />
      <section className="dashboard-main briefings-main" aria-label="Pełny briefing">
        <div className="briefing-detail-actions">
          <button className="briefing-copy-button" disabled={!briefing} onClick={() => void copyBriefing()} type="button">
            {copied ? "✅ Skopiowano" : "📋 Kopiuj"}
          </button>
        </div>

        {isLoading ? <div className="briefings-empty">Wczytywanie briefingu...</div> : null}
        {error ? <div className="dashboard-error">{error}</div> : null}
        {briefing ? (
          <article className="briefing-detail-card">
            <header className="briefing-detail-header">
              <span className="dashboard-kicker">Automatyczny briefing</span>
              <h1>{formatBriefingDate(briefing.date)}</h1>
              <p>Wygenerowany przez crona o {new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).format(new Date(briefing.created_at))}</p>
            </header>
            <BriefingMarkdown content={briefing.content} />
          </article>
        ) : null}
      </section>
    </main>
  );
}
