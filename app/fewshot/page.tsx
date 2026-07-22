"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BackNavLink } from "../components/BackNavLink";

type AiModel = "flash" | "pro";

const models: Array<{
  id: AiModel;
  label: string;
  badge: string;
}> = [
  { id: "flash", label: "⚡ Flash", badge: "⚡ flash" },
  { id: "pro", label: "🧠 Pro", badge: "🧠 pro" },
];

const terms = [
  "Sztuczna inteligencja",
  "Agent AI",
  "Prompt",
  "Halucynacja AI",
  "RAG",
  "API",
];

const modelBadges = models.reduce<Record<AiModel, string>>((acc, item) => {
  acc[item.id] = item.badge;
  return acc;
}, {} as Record<AiModel, string>);

function getMessageText(parts: { type: string; text?: string }[]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

export default function FewShotPage() {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AiModel>("flash");
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>(
    {},
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pendingModelRef = useRef<AiModel>("flash");
  const { error, messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/fewshot",
    }),
  });
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    setAssistantModels((currentModels) => {
      let changed = false;
      const nextModels = { ...currentModels };

      for (const message of messages) {
        if (message.role === "assistant" && !nextModels[message.id]) {
          nextModels[message.id] = pendingModelRef.current;
          changed = true;
        }
      }

      return changed ? nextModels : currentModels;
    });
  }, [messages]);

  async function sendText(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText || isLoading) {
      return;
    }

    setInput("");
    pendingModelRef.current = model;
    await sendMessage({ text: trimmedText }, { body: { model } });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendText(input);
  }

  return (
    <main className="chat-shell">
      <section className="chat-app" aria-label="Słownik AI">
        <nav className="top-nav" aria-label="Nawigacja">
          <BackNavLink />
          <a className="nav-link" href="/chat">
            💬 Chat
          </a>
          <a className="nav-link" href="/think">
            🧠 Myślenie
          </a>
          <a className="nav-link active" href="/fewshot">
            📚 Słownik
          </a>
          <a className="nav-link" href="/format">
            📐 Formater
          </a>
          <a className="nav-link" href="/search">
            🌐 Szukaj
          </a>
          <a className="nav-link" href="/generate">
            🎨 Grafiki
          </a>
          <a className="nav-link" href="/vision">
            👁️ Vision
          </a>
          <a className="nav-link" href="/extract">
            📊 Analizator
          </a>
        </nav>

        <header className="chat-header pro-header">
          <div>
            <h1 className="chat-title">📚 Słownik AI</h1>
            <p className="agent-description">
              Wyjaśniam trudne pojęcia prostym językiem, zawsze w tym samym
              formacie: definicja, analogia, przykład i powiązane terminy.
            </p>
            <div className="example-questions" aria-label="Przykładowe pojęcia">
              {terms.map((term) => (
                <button
                  className="example-button"
                  disabled={isLoading}
                  key={term}
                  onClick={() => setInput(term)}
                  type="button"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
          <div className="chat-status" aria-live="polite">
            {isLoading ? "Wyjaśniam..." : "Gotowy"}
          </div>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <p className="empty-state">
              Wybierz pojęcie albo wpisz własne. Słownik AI odpowie w spójnym
              formacie nauczonym z przykładów.
            </p>
          ) : (
            messages.map((message) => (
              <div
                className={`message-row ${message.role}`}
                key={message.id}
              >
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <div className="badge-row">
                      <span
                        className={`model-badge ${
                          assistantModels[message.id] ?? "flash"
                        }`}
                      >
                        {modelBadges[assistantModels[message.id] ?? "flash"]}
                      </span>
                      <span className="command-badge">📚 few-shot</span>
                    </div>
                  ) : null}
                  {getMessageText(message.parts)}
                </div>
              </div>
            ))
          )}

          {status === "submitted" ? (
            <div className="message-row assistant">
              <div className="message-bubble">
                <div className="badge-row">
                  <span className={`model-badge ${pendingModelRef.current}`}>
                    {modelBadges[pendingModelRef.current]}
                  </span>
                  <span className="command-badge">📚 few-shot</span>
                </div>
                Wyjaśniam...
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="message-row assistant">
              <div className="message-bubble error-bubble">
                Nie udało się wygenerować odpowiedzi w Słowniku AI. Spróbuj
                ponownie za chwilę albo sprawdź limit klucza Gemini.
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="composer-panel">
          <div className="model-switcher" aria-label="Model AI">
            {models.map((item) => (
              <button
                className={`model-button ${model === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setModel(item.id)}
                type="button"
              >
                {item.label}
                <span>
                  {item.id === "flash" ? "szybki" : "zaawansowany"}
                </span>
              </button>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <input
              aria-label="Pojęcie do wyjaśnienia"
              className="composer-input"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Wpisz pojęcie do wyjaśnienia..."
              value={input}
            />
            <button
              className="send-button"
              disabled={isLoading || !input.trim()}
            >
              Wyślij
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

