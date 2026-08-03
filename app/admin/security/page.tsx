"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../components/AuthGate";
import { supabase } from "../../../lib/supabase";

type SecurityData = {
  blockedMessages: Array<{
    id: string;
    email: string;
    message: string | null;
    block_reason: string | null;
    created_at: string;
  }>;
  topUsers: Array<{
    userId: string;
    email: string;
    tokensToday: number;
    tokensWeek: number;
    percentOfDailyLimit: number;
  }>;
  alerts: Array<{ level: string; type: string; message: string }>;
  stats: {
    tokensToday: number;
    tokensWeek: number;
    blockedMessages: number;
    averageTokensPerUser: number;
  };
};

const numberFormat = new Intl.NumberFormat("pl-PL");
const dateFormat = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" });

function formatNumber(value: number) {
  return numberFormat.format(value);
}

export default function SecurityPage() {
  const { isLoading: authLoading } = useAuth();
  const [data, setData] = useState<SecurityData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSecurity = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      const response = await fetch("/api/admin/security", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });
      const payload = (await response.json()) as SecurityData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Nie udało się wczytać panelu.");
      setData(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udało się wczytać panelu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) void loadSecurity();
  }, [authLoading, loadSecurity]);

  return (
    <main className="security-page">
      <header className="security-header">
        <div>
          <span className="dashboard-kicker">Monitoring produkcyjny</span>
          <h1>🛡️ Panel bezpieczeństwa</h1>
          <p>Kontrola blokad, kosztów i podejrzanych zachowań użytkowników.</p>
        </div>
        <button className="security-refresh" onClick={() => void loadSecurity()} type="button">↻ Odśwież</button>
      </header>

      {error ? <div className="security-error">{error}</div> : null}
      {loading && !data ? <div className="security-loading">Wczytuję dane bezpieczeństwa...</div> : null}

      {data ? (
        <>
          <section className="security-stats-grid" aria-label="Statystyki bezpieczeństwa">
            {[
              ["📈 Tokeny dziś", data.stats.tokensToday],
              ["📊 Tokeny w tym tygodniu", data.stats.tokensWeek],
              ["🚫 Zablokowane wiadomości", data.stats.blockedMessages],
              ["👤 Średnio na użytkownika", data.stats.averageTokensPerUser],
            ].map(([label, value]) => (
              <article className="security-stat-card" key={String(label)}><span>{label}</span><strong>{formatNumber(Number(value))}</strong></article>
            ))}
          </section>

          <section className="security-panel">
            <div className="security-panel-heading"><div><span className="security-section-kicker">Alerty</span><h2>🔴 Podejrzane zachowania</h2></div><span className="security-count">{data.alerts.length}</span></div>
            {data.alerts.length ? <div className="security-alert-list">{data.alerts.map((alert, index) => <div className={`security-alert ${alert.level}`} key={`${alert.type}-${index}`}><strong>{alert.level === "critical" ? "Krytyczne" : "Ostrzeżenie"}</strong><span>{alert.message}</span></div>)}</div> : <p className="security-empty">Brak aktywnych alertów.</p>}
          </section>

          <div className="security-columns">
            <section className="security-panel">
              <div className="security-panel-heading"><div><span className="security-section-kicker">Zużycie</span><h2>📊 Top 5 użytkowników</h2></div></div>
              <div className="security-table-wrap"><table className="security-table"><thead><tr><th>Użytkownik</th><th>Dziś</th><th>Tydzień</th><th>Limit</th></tr></thead><tbody>{data.topUsers.map((user) => <tr key={user.userId}><td>{user.email}</td><td>{formatNumber(user.tokensToday)}</td><td>{formatNumber(user.tokensWeek)}</td><td><div className="security-progress"><span style={{ width: `${Math.min(100, user.percentOfDailyLimit)}%` }} /></div><small>{user.percentOfDailyLimit}%</small></td></tr>)}</tbody></table>{!data.topUsers.length ? <p className="security-empty">Brak danych o zużyciu.</p> : null}</div>
            </section>

            <section className="security-panel">
              <div className="security-panel-heading"><div><span className="security-section-kicker">Red teaming</span><h2>⚠️ Zablokowane wiadomości</h2></div><span className="security-count">{data.blockedMessages.length}</span></div>
              <div className="security-blocked-list">{data.blockedMessages.map((item) => <article className="security-blocked-item" key={item.id}><div><strong>{item.email}</strong><time>{dateFormat.format(new Date(item.created_at))}</time></div><p>{item.message || "Treść niedostępna"}</p><small>Powód: {item.block_reason || "filtr bezpieczeństwa"}</small></article>)}{!data.blockedMessages.length ? <p className="security-empty">Brak zablokowanych wiadomości.</p> : null}</div>
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}

