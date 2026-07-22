"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardSidebar } from "../../components/DashboardSidebar";
import { supabase } from "../../../lib/supabase";

type Conversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function HistoryConversationPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadConversation() {
      if (!supabase || !conversationId) {
        setError("Nie znaleziono rozmowy.");
        setIsLoading(false);
        return;
      }

      const [{ data: conversationData, error: conversationError }, { data: messagesData, error: messagesError }] =
        await Promise.all([
          supabase.from("conversations").select("id, title, created_at, updated_at").eq("id", conversationId).maybeSingle(),
          supabase.from("messages").select("id, role, content, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: true }),
        ]);

      if (conversationError || messagesError || !conversationData) {
        setError(conversationError?.message || messagesError?.message || "Nie znaleziono rozmowy.");
      } else {
        setConversation(conversationData);
        setMessages(
          (messagesData ?? []).filter(
            (message): message is StoredMessage =>
              (message.role === "user" || message.role === "assistant") &&
              typeof message.content === "string",
          ),
        );
      }

      setIsLoading(false);
    }

    void loadConversation();
  }, [conversationId]);

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />
      <section className="dashboard-main history-main" aria-label="Podgląd rozmowy">
        <div className="history-detail-actions">
          <a className="nav-link primary" href="/history">← Wróć do listy</a>
          <a className="dashboard-card-link" href={`/chat?conversation=${conversationId}`}>🔄 Kontynuuj rozmowę</a>
        </div>

        {isLoading ? <div className="history-empty">Wczytywanie rozmowy...</div> : null}
        {error ? <div className="dashboard-error">{error}</div> : null}
        {conversation ? (
          <>
            <header className="history-detail-header">
              <span className="dashboard-kicker">Podgląd read-only</span>
              <h1>{conversation.title || "Nowa rozmowa"}</h1>
              <p>Ostatnia aktywność: {formatDate(conversation.updated_at)}</p>
            </header>
            <div className="history-messages">
              {messages.length === 0 ? (
                <div className="history-empty">Ta rozmowa nie zawiera jeszcze wiadomości.</div>
              ) : (
                messages.map((message) => (
                  <article className={`history-message ${message.role}`} key={message.id}>
                    <div className="history-message-meta">
                      <strong>{message.role === "user" ? "Ty" : "Agent"}</strong>
                      <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
                    </div>
                    <p>{message.content}</p>
                  </article>
                ))
              )}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
