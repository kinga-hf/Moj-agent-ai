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

export default function ThinkPage() {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AiModel>("flash");
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>(
    {},
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pendingModelRef = useRef<AiModel>("flash");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/think",
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || isLoading) {
      return;
    }

    setInput("");
    pendingModelRef.current = model;
    await sendMessage({ text }, { body: { model } });
  }

  return (
    <main className="chat-shell">
      <section className="chat-app" aria-label="Tryb głębokiego myślenia">
        <nav className="top-nav" aria-label="Nawigacja">
          <BackNavLink />
          <a className="nav-link" href="/chat">
            💬 Chat
          </a>
          <a className="nav-link active" href="/think">
            🧠 Myślenie
          </a>
          <a className="nav-link" href="/fewshot">
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
            <h1 className="chat-title">🧠 Tryb głębokiego myślenia</h1>
            <p className="agent-description">
              Agent pokazuje tok rozumowania krok po kroku.
            </p>
          </div>
          <div className="chat-status" aria-live="polite">
            {isLoading ? "Analizuję..." : "Gotowy"}
          </div>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <p className="empty-state">
              Zadaj trudne pytanie, a agent rozpisze zrozumienie, fakty,
              analizę, ocenę i finalną odpowiedź.
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
                </div>
                Analizuję...
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
              aria-label="Trudne pytanie"
              className="composer-input"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Zadaj trudne pytanie..."
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

