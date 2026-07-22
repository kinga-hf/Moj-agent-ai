"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AttachedImagePreview,
  DropOverlay,
  HiddenImageInput,
  ImageUploadButton,
  useImageAttachment,
} from "../components/ImageAttachment";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";
import { BackNavLink } from "../components/BackNavLink";
import { AuthStatus } from "../components/AuthStatus";
import { useAuth } from "../components/AuthGate";
import { supabase } from "../../lib/supabase";
import { ensureUserProfile } from "../../lib/user-profile";

type ToolTimelineItem = {
  id: string;
  index: number;
  name: string;
  emoji: string;
  input: string;
  output: string;
  hasError?: boolean;
  error?: string;
  image?: string;
  providerExecuted?: boolean;
};

type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: ToolTimelineItem[];
  images?: Array<{ image: string; prompt: string }>;
  metrics?: {
    toolCount: number;
    durationMs: number;
    model: string;
    maxSteps?: number;
  };
};

const tools = [
  ["🧮", "Kalkulator"],
  ["🕐", "Data i czas"],
  ["🌐", "Google Search"],
  ["📄", "Czytanie stron"],
  ["🎨", "Generowanie obrazów"],
  ["👁️", "Analiza obrazów"],
];

const agentModes = [
  { href: "/travel", icon: "✈️", label: "Podróże", description: "planowanie wyjazdów" },
  { href: "/react", icon: "🔄", label: "ReAct", description: "autonomiczne zadania" },
  { href: "/chat", icon: "💬", label: "Chat", description: "rozmowa z FOTOBOTEM" },
  { href: "/think", icon: "🧠", label: "Myślenie", description: "głębsza analiza" },
  { href: "/search", icon: "🌐", label: "Szukaj", description: "internet i źródła" },
  { href: "/translator", icon: "🌐", label: "Tłumacz", description: "tłumaczenie tekstu" },
  { href: "/generate", icon: "🎨", label: "Grafiki", description: "generator obrazów" },
  { href: "/vision", icon: "👁️", label: "Vision", description: "analiza obrazów" },
  { href: "/extract", icon: "📊", label: "Analizator", description: "ekstrakcja danych" },
  { href: "/format", icon: "📐", label: "Formater", description: "formatowanie treści" },
];

const scenarios = [
  "Znajdź w Google co robi firma Syntelligence i wygeneruj dla nich logo",
  "Przeczytaj stronę apple.com i opisz ich aktualną ofertę iPhone",
  "Ile to 23% VAT z 8500 PLN? Podaj kwotę brutto i netto",
  "Jakie są najnowsze wiadomości o AI? Wygeneruj grafikę do posta o tym",
  "Wyszukaj w Google 'best coffee shops Kraków' i streszcz wyniki",
];

function createId() {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function downloadImage(image: string) {
  const link = document.createElement("a");
  link.href = image;
  link.download = "agent-generated.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function AgentPage() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const userId = user?.id ?? null;
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const {
    attachedImage,
    fileInputRef,
    imageError,
    isDraggingImage,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileChange,
    handlePaste,
    openFilePicker,
    removeImage,
  } = useImageAttachment();

  useEffect(() => {
    if (userId) {
      void ensureUserProfile(userId).catch((caughtError) => {
        console.error("Supabase profile load error:", caughtError);
      });
    }
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function sendText(text: string) {
    const trimmedText = text.trim();
    if ((!trimmedText && !attachedImage) || isLoading) {
      return;
    }

    const userText = trimmedText || "Przeanalizuj załączony obraz.";
    const userMessage: AgentMessage = {
      id: createId(),
      role: "user",
      text: attachedImage ? `${userText}\n\n📎 Załączono obraz.` : userText,
    };
    const nextMessages = [...messages, userMessage];
    const imageToSend = attachedImage?.dataUrl;

    setMessages(nextMessages);
    setInput("");
    setError("");
    setIsLoading(true);
    removeImage();

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55000);

    try {
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          purpose: "agent",
          image: imageToSend,
          userId,
          authToken: sessionData.session?.access_token,
          messages: nextMessages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: [{ type: "text", text: message.text }],
          })),
        }),
      });
      const data = (await response.json()) as {
        text?: string;
        tools?: ToolTimelineItem[];
        images?: Array<{ image: string; prompt: string }>;
        metrics?: AgentMessage["metrics"];
        error?: string;
      };

      if (!response.ok || !data.text) {
        throw new Error(data.error || "Agent nie zwrócił odpowiedzi.");
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createId(),
          role: "assistant",
          text: data.text ?? "",
          tools: data.tools ?? [],
          images: data.images ?? [],
          metrics: data.metrics,
        },
      ]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.name === "AbortError"
          ? "Agent odpowiadał zbyt długo, więc przerwałam zadanie i odblokowałam czat. Spróbuj ponownie albo podziel polecenie na krótsze kroki."
          : caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się wykonać zadania.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendText(input);
  }

  return (
    <main className="chat-shell">
      <section
        aria-label="Agent AI - Pełna moc"
        className="chat-app agent-app"
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(event) => void handleDrop(event)}
      >
        <DropOverlay visible={isDraggingImage} />
        <nav className="top-nav" aria-label="Nawigacja">
          <BackNavLink />
          <a className="nav-link" href="/react">
            🔄 ReAct
          </a>
          <a className="nav-link" href="/chat">
            💬 Chat
          </a>
          <a className="nav-link" href="/think">
            🧠 Myślenie
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
          <a className="nav-link" href="/format">
            📐 Formater
          </a>
          <AuthStatus compact />
        </nav>

        <header className="chat-header pro-header">
          <div>
            <h1 className="chat-title">🤖 Agent AI - Pełna moc</h1>
            <p className="agent-description">
              {tools.length} narzędzi • autonomiczne decyzje
            </p>
            <div className="agent-mode-panel" aria-label="Tryby w zakładce Agent">
              {agentModes.map((mode) => (
                <a className="agent-mode-card" href={mode.href} key={mode.href}>
                  <span>{mode.icon}</span>
                  <strong>{mode.label}</strong>
                  <em>{mode.description}</em>
                </a>
              ))}
            </div>
            <div className="example-questions" aria-label="Scenariusze">
              {scenarios.map((scenario) => (
                <button
                  className="example-button"
                  disabled={isLoading}
                  key={scenario}
                  onClick={() => void sendText(scenario)}
                  type="button"
                >
                  {scenario}
                </button>
              ))}
            </div>
          </div>
          <div className="chat-status" aria-live="polite">
            {isLoading ? "Działam..." : "Gotowy"}
          </div>
        </header>

        <div className="messages agent-messages">
          {messages.length === 0 ? (
            <p className="empty-state">
              Wybierz scenariusz, zadaj złożone zadanie albo wklej screenshot
              przez Ctrl+V.
            </p>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <div className="badge-row">
                      <span className="model-badge flash">🤖 agent</span>
                    </div>
                  ) : null}

                  {message.tools && message.tools.length > 0 ? (
                    <div className="tool-timeline">
                      <strong>🤖 Agent wykonuje zadanie...</strong>
                      {message.tools.map((item) => (
                        <div className="tool-step" key={item.id}>
                          <div>
                            <span>{item.index}</span>
                            <strong>
                              {item.emoji} {item.name}
                            </strong>
                          </div>
                          {item.input ? <p>→ {item.input}</p> : null}
                          {item.output ? <p>→ {item.output}</p> : null}
                          {item.image ? (
                            <img alt="Wygenerowany obraz" src={item.image} />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {message.role === "assistant" ? (
                    <DiagnosticsPanel metrics={message.metrics} tools={message.tools ?? []} />
                  ) : null}

                  {message.text}

                  {message.images && message.images.length > 0 ? (
                    <div className="agent-image-results">
                      {message.images.map((image, index) => (
                        <div key={`${image.image.slice(0, 32)}-${index}`}>
                          <img alt="Wygenerowana grafika" src={image.image} />
                          <button
                            className="secondary-button"
                            onClick={() => downloadImage(image.image)}
                            type="button"
                          >
                            💾 Pobierz
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {message.metrics ? (
                    <div className="agent-metrics">
                      Użyto {message.metrics.toolCount} narzędzi |{" "}
                      {(message.metrics.durationMs / 1000).toFixed(1)}s | Model:{" "}
                      {message.metrics.model}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}

          {isLoading ? (
            <div className="message-row assistant">
              <div className="message-bubble">
                <div className="badge-row">
                  <span className="model-badge flash">🤖 agent</span>
                </div>
                <div className="tool-timeline loading">
                  <strong>🤖 Agent wykonuje zadanie...</strong>
                  <div className="tool-step">
                    <div>
                      <span>①</span>
                      <strong>Dobieram narzędzia</strong>
                    </div>
                    <p>→ analiza zadania w toku</p>
                  </div>
                </div>
                <DiagnosticsPanel isLoading />
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="message-row assistant">
              <div className="message-bubble error-bubble">{error}</div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="composer-panel">
          <AttachedImagePreview image={attachedImage} onRemove={removeImage} />
          {imageError ? <div className="attachment-error">{imageError}</div> : null}
          <form className="composer" onSubmit={handleSubmit}>
            <HiddenImageInput
              fileInputRef={fileInputRef}
              onChange={(event) => void handleFileChange(event)}
            />
            <ImageUploadButton disabled={isLoading} onClick={openFilePicker} />
            <input
              aria-label="Zadanie dla agenta"
              className="composer-input"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => void handlePaste(event)}
              placeholder="Zleć agentowi zadanie albo wklej screenshot..."
              value={input}
            />
            <button
              className="send-button"
              disabled={isLoading || (!input.trim() && !attachedImage)}
            >
              Wyślij
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

