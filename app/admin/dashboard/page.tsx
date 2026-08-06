"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "../../components/AuthGate";
import { GoldIcon, type IconName } from "../../components/GoldIcon";
import { supabase } from "../../../lib/supabase";

type DashboardData = {
  generatedAt: string;
  stats: { users: number; conversations: number; tokensToday: number; estimatedCostToday: number };
  tokenTrend: Array<{ date: string; label: string; tokens: number }>;
  conversationTrend: Array<{ date: string; label: string; conversations: number }>;
  endpointData: Array<{ endpoint: string; tokens: number }>;
  recentConversations: Array<{ id: string; email: string; title: string; createdAt: string; updatedAt: string; messages: number }>;
};

const numberFormat = new Intl.NumberFormat("pl-PL");
const currencyFormat = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dateFormat = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" });
const pieColors = ["#0f172a", "#334155", "#475569", "#64748b", "#94a3b8", "#cbd5e1"];

function formatNumber(value: number) {
  return numberFormat.format(value);
}

function DashboardTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; name?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="usage-chart-tooltip"><strong>{label}</strong><span>{formatNumber(Number(payload[0].value) || 0)} {payload[0].name === "tokens" ? "tokenów" : "rozmów"}</span></div>;
}

export default function AdminDashboardPage() {
  const { isLoading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      const response = await fetch("/api/admin/dashboard", { headers: token ? { Authorization: `Bearer ${token}` } : undefined, cache: "no-store" });
      const payload = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Nie udało się wczytać dashboardu.");
      setData(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udało się wczytać dashboardu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) void loadDashboard();
  }, [authLoading, loadDashboard]);

  return (
    <main className="usage-dashboard-page">
      <header className="usage-dashboard-header">
        <div>
          <span className="agent-header-badge">LEXAI · ADMIN ANALYTICS</span>
          <h1><GoldIcon name="dashboard" size={34} /> Dashboard użycia</h1>
          <p>Statystyki rozmów, użytkowników, tokenów i szacowanego kosztu działania agenta.</p>
        </div>
        <button className="usage-refresh-button" disabled={loading} onClick={() => void loadDashboard()} type="button"><GoldIcon name="react" size={16} /> {loading ? "Odświeżanie..." : "Odśwież dane"}</button>
      </header>

      {error ? <div className="usage-dashboard-error">{error}</div> : null}
      {loading && !data ? <div className="usage-dashboard-loading">Wczytuję statystyki agenta...</div> : null}

      {data ? (
        <>
          <section className="usage-stat-grid" aria-label="Najważniejsze statystyki">
            {([
              ["Użytkownicy", data.stats.users, "agent", "unikalni użytkownicy z rozmów"],
              ["Rozmowy", data.stats.conversations, "chat", "wszystkie rozmowy"],
              ["Tokeny dziś", data.stats.tokensToday, "report", "input + output"],
              ["Koszt dziś", currencyFormat.format(data.stats.estimatedCostToday), "calculator", "szacunek dla tokenów input"],
            ] as Array<[string, number | string, IconName, string]>).map(([label, value, icon, note]) => (
              <article className="usage-stat-card" key={label}><div><span className="usage-stat-icon"><GoldIcon name={icon} size={19} /></span><span className="usage-stat-label">{label}</span></div><strong>{typeof value === "number" ? formatNumber(value) : value}</strong><small>{note}</small></article>
            ))}
          </section>

          <div className="usage-chart-grid">
            <section className="usage-panel"><div className="usage-panel-heading"><div><span className="security-section-kicker">Ostatnie 7 dni</span><h2><GoldIcon name="report" size={21} /> Tokeny per dzień</h2></div></div><ResponsiveContainer height={270} width="100%"><LineChart data={data.tokenTrend} margin={{ top: 16, right: 8, left: 0, bottom: 4 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis axisLine={false} dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} /><YAxis axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} width={48} /><Tooltip content={<DashboardTooltip />} /><Line activeDot={{ r: 5, fill: "var(--accent)" }} dataKey="tokens" name="tokens" stroke="var(--accent)" strokeWidth={3} type="monotone" /></LineChart></ResponsiveContainer></section>
            <section className="usage-panel"><div className="usage-panel-heading"><div><span className="security-section-kicker">Ostatnie 7 dni</span><h2><GoldIcon name="chat" size={21} /> Rozmowy per dzień</h2></div></div><ResponsiveContainer height={270} width="100%"><BarChart data={data.conversationTrend} margin={{ top: 16, right: 8, left: 0, bottom: 4 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis axisLine={false} dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} width={32} /><Tooltip content={<DashboardTooltip />} /><Bar dataKey="conversations" fill="var(--accent)" name="rozmowy" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section>
          </div>

          <div className="usage-lower-grid">
            <section className="usage-panel usage-endpoint-panel"><div className="usage-panel-heading"><div><span className="security-section-kicker">Wykorzystanie</span><h2><GoldIcon name="search" size={21} /> Tokeny per endpoint</h2></div></div>{data.endpointData.length ? <div className="usage-pie-layout"><ResponsiveContainer height={230} width="52%"><PieChart><Pie data={data.endpointData} dataKey="tokens" innerRadius={55} outerRadius={86} paddingAngle={3}>{data.endpointData.map((entry, index) => <Cell fill={pieColors[index % pieColors.length]} key={entry.endpoint} />)}</Pie><Tooltip content={<DashboardTooltip />} /><Legend formatter={(value) => <span className="usage-legend-label">{value}</span>} /></PieChart></ResponsiveContainer><div className="usage-endpoint-list">{data.endpointData.map((entry, index) => <div key={entry.endpoint}><span><i style={{ background: pieColors[index % pieColors.length] }} />{entry.endpoint}</span><strong>{formatNumber(entry.tokens)}</strong></div>)}</div></div> : <p className="usage-empty">Brak danych o wywołaniach API.</p>}</section>
            <section className="usage-panel"><div className="usage-panel-heading"><div><span className="security-section-kicker">Historia</span><h2><GoldIcon name="history" size={21} /> Ostatnie rozmowy</h2></div><span className="security-count">10</span></div><div className="usage-conversation-list">{data.recentConversations.map((conversation) => <article className="usage-conversation-row" key={conversation.id}><div><strong>{conversation.title}</strong><span>{conversation.email}</span></div><div><small>{conversation.messages} wiad.</small><time>{dateFormat.format(new Date(conversation.updatedAt))}</time></div></article>)}{!data.recentConversations.length ? <p className="usage-empty">Brak zapisanych rozmów.</p> : null}</div></section>
          </div>
        </>
      ) : null}
    </main>
  );
}
