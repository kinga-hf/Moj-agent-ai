"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";
import { supabase } from "../../lib/supabase";

type Conversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  messageCount: number;
  preview: string;
};

function formatActivity(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "przed chwilą";
  if (minutes < 60) return `${minutes} min temu`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} godz. temu`;
  if (minutes < 2880) return "wczoraj";

  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadConversations() {
    if (!supabase) {
      setError("Brak konfiguracji Supabase.");
      setIsLoading(false);
      return;
    }

    const client = supabase;

    setIsLoading(true);
    const { data, error: queryError } = await client
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setIsLoading(false);
      return;
    }

    const summaries = await Promise.all(
      (data ?? []).map(async (conversation) => {
        const { data: messages } = await client
          .from("messages")
          .select("content, created_at")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false });
        const latest = messages?.[0]?.content ?? "Brak wiadomości";

        return {
          ...conversation,
          messageCount: messages?.length ?? 0,
          preview:
            latest.length > 100 ? `${latest.slice(0, 97).trimEnd()}...` : latest,
        } satisfies Conversation;
      }),
    );

    setConversations(summaries);
    setError("");
    setIsLoading(false);
  }

  useEffect(() => {
    void loadConversations();
  }, []);

  const filteredConversations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return conversations;

    return conversations.filter(
      (conversation) =>
        (conversation.title ?? "Nowa rozmowa").toLowerCase().includes(normalizedSearch) ||
        conversation.preview.toLowerCase().includes(normalizedSearch),
    );
  }, [conversations, search]);

  async function deleteConversation(id: string) {
    if (!supabase || !window.confirm("Czy na pewno chcesz usunąć tę rozmowę? Tej operacji nie można cofnąć.")) {
      return;
    }

    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", id);
    if (messagesError) {
      setError(messagesError.message);
      return;
    }

    const { error: conversationError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id);
    if (conversationError) {
      setError(conversationError.message);
      return;
    }

    setConversations((current) => current.filter((item) => item.id !== id));
    setNotice("Rozmowa usunięta");
    window.setTimeout(() => setNotice(""), 2200);
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />
      <section className="dashboard-main history-main" aria-label="Historia rozmów">
        <header className="dashboard-hero">
          <div>
            <span className="dashboard-kicker">Pamięć agenta</span>
            <h1>📜 Historia rozmów</h1>
            <p>Wszystkie Twoje rozmowy z agentem</p>
          </div>
          <a className="dashboard-card-link history-new-link" href="/chat">
            + Nowa rozmowa
          </a>
        </header>

        <div className="history-toolbar">
          <input
            aria-label="Szukaj w rozmowach"
            className="history-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj w rozmowach..."
            value={search}
          />
          <span>{filteredConversations.length} rozmów</span>
        </div>

        {notice ? <div className="history-notice" role="status">{notice}</div> : null}
        {error ? <div className="dashboard-error">{error}</div> : null}

        {isLoading ? (
          <div className="history-empty">Wczytywanie historii...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="history-empty">
            <strong>Nie masz jeszcze żadnych rozmów.</strong>
            <span>Zacznij nową rozmowę z agentem.</span>
            <a className="send-button history-start-link" href="/chat">Rozpocznij rozmowę</a>
          </div>
        ) : (
          <div className="history-list">
            {filteredConversations.map((conversation) => (
              <article className="history-card" key={conversation.id}>
                <a className="history-card-main" href={`/history/${conversation.id}`}>
                  <div className="history-card-heading">
                    <h2>{conversation.title || "Nowa rozmowa"}</h2>
                    <time dateTime={conversation.updated_at}>{formatActivity(conversation.updated_at)}</time>
                  </div>
                  <p>{conversation.preview}</p>
                  <span className="history-card-meta">💬 {conversation.messageCount} wiadomości</span>
                </a>
                <button
                  aria-label={`Usuń rozmowę ${conversation.title || "Nowa rozmowa"}`}
                  className="history-delete"
                  onClick={() => void deleteConversation(conversation.id)}
                  type="button"
                >
                  🗑️
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
