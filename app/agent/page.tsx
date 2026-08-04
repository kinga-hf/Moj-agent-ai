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
import { AuthStatus } from "../components/AuthStatus";
import { GoldIcon, type IconName } from "../components/GoldIcon";
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
  "Kalkulator",
  "Data i czas",
  "Google Search",
  "Czytanie stron",
  "Generowanie obrazów",
  "Analiza obrazów",
];

const agentModes = [
  { href: "/travel", icon: "travel", label: "Podróże", description: "planowanie wyjazdów" },
  { href: "/react", icon: "react", label: "ReAct", description: "autonomiczne zadania" },
  { href: "/chat", icon: "chat", label: "Chat prawniczy", description: "rozmowa z Legal AI" },
  { href: "/think", icon: "think", label: "Myślenie", description: "głębsza analiza" },
  { href: "/search", icon: "search", label: "Szukaj", description: "internet i źródła" },
  { href: "/translator", icon: "translate", label: "Tłumacz", description: "tłumaczenie tekstu" },
  { href: "/generate", icon: "graphics", label: "Grafiki", description: "generator obrazów" },
  { href: "/vision", icon: "vision", label: "Vision", description: "analiza obrazów" },
  { href: "/extract", icon: "analyzer", label: "Analizator", description: "ekstrakcja danych" },
  { href: "/format", icon: "format", label: "Formater", description: "formatowanie treści" },
  { href: "/legal-opposition", icon: "legal", label: "Legal Briefing", description: "tezy i zarzuty" },
];

const scenarios = [
  "Znajdź w Google co robi firma Syntelligence i wygeneruj dla nich logo",
  "Przeczytaj stronę apple.com i opisz ich aktualną ofertę iPhone",
  "Ile to 23% VAT z 8500 PLN? Podaj kwotę brutto i netto",
  "Jakie są najnowsze wiadomości o AI? Wygeneruj grafikę do posta o tym",
  "Wyszukaj w Google 'best coffee shops Kraków' i streszcz wyniki",
];

const featuredModes = agentModes.slice(0, 6);

const modeIconsByHref: Record<string, IconName> = {
  "/travel": "travel",
  "/react": "react",
  "/chat": "chat",
  "/think": "think",
  "/search": "search",
  "/translator": "translate",
  "/generate": "graphics",
  "/vision": "vision",
  "/extract": "analyzer",
  "/format": "format",
  "/legal-opposition": "legal",
};

function toolIconForName(name: string): IconName {
  const normalized = name.toLowerCase();
  if (normalized.includes("kalk")) return "calculator";
  if (normalized.includes("czas") || normalized.includes("data")) return "clock";
  if (normalized.includes("search") || normalized.includes("google")) return "search";
  if (normalized.includes("stron")) return "web";
  if (normalized.includes("obraz") || normalized.includes("graf")) return "image";
  if (normalized.includes("vision") || normalized.includes("analiz")) return "vision";
  return "agent";
}

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
  const [showAllModes, setShowAllModes] = useState(false);
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
      text: attachedImage ? `${userText}\n\nZałączono obraz.` : userText,
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
          <a className="nav-link" href="/react">
            <GoldIcon name="react" size={16} /> ReAct
          </a>
          <a className="nav-link" href="/chat">
            <GoldIcon name="chat" size={16} /> Chat
          </a>
          <a className="nav-link" href="/think">
            <GoldIcon name="think" size={16} /> Myślenie
          </a>
          <a className="nav-link" href="/search">
            <GoldIcon name="search" size={16} /> Szukaj
          </a>
          <a className="nav-link" href="/generate">
            <GoldIcon name="graphics" size={16} /> Grafiki
          </a>
          <a className="nav-link" href="/vision">
            <GoldIcon name="vision" size={16} /> Vision
          </a>
          <a className="nav-link" href="/extract">
            <GoldIcon name="analyzer" size={16} /> Analizator
          </a>
          <a className="nav-link" href="/format">
            <GoldIcon name="format" size={16} /> Formater
          </a>
          <a className="nav-link" href="/legal-opposition">
            <GoldIcon name="legal" size={16} /> Legal Briefing
          </a>
          <AuthStatus compact />
        </nav>

        <header className="chat-header pro-header">
          <div>
            <h1 className="chat-title"><GoldIcon name="agent" size={30} /> Agent AI - Pełna moc</h1>
            <p className="agent-description">
              {tools.length} narzędzi • autonomiczne decyzje
            </p>
            <div className="agent-mode-panel" aria-label="Tryby w zakładce Agent">
              <button
                className="agent-mode-toggle"
                onClick={() => setShowAllModes((visible) => !visible)}
                type="button"
              >
                {showAllModes ? "Pokaż mniej" : `Wszystkie narzędzia (${agentModes.length})`}
              </button>
              {(showAllModes ? agentModes : featuredModes).map((mode) => (
                <a className="agent-mode-card" href={mode.href} key={mode.href}>
                  <span><GoldIcon name={modeIconsByHref[mode.href]} /></span>
                  <strong>{mode.label}</strong>
                  <em>{mode.description}</em>
                </a>
              ))}
            </div>
            <div className="example-questions" aria-label="Scenariusze">
              {scenarios.slice(0, 4).map((scenario) => (
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
                      <span className="model-badge flash"><GoldIcon name="agent" size={14} /> agent</span>
                    </div>
                  ) : null}

                  {message.tools && message.tools.length > 0 ? (
                    <div className="tool-timeline">
                      <strong><GoldIcon name="agent" size={16} /> Agent wykonuje zadanie...</strong>
                      {message.tools.map((item) => (
                        <div className="tool-step" key={item.id}>
                          <div>
                            <span>{item.index}</span>
                            <strong>
                              <GoldIcon name={toolIconForName(item.name)} size={16} /> {item.name}
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
                            <GoldIcon name="download" size={16} /> Pobierz
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
                  <span className="model-badge flash"><GoldIcon name="agent" size={14} /> agent</span>
                </div>
                <div className="tool-timeline loading">
                  <strong><GoldIcon name="agent" size={16} /> Agent wykonuje zadanie...</strong>
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

