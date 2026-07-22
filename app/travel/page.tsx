"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";
import { BackNavLink } from "../components/BackNavLink";

type TravelCard = {
  kind: "weather" | "currency" | "holiday" | "attraction" | "budget" | "translation";
  title: string;
  value: string;
  detail: string;
  source?: string;
};

type ToolTimelineItem = {
  id: string;
  index: number;
  name: string;
  emoji: string;
  input: string;
  output: string;
  hasError?: boolean;
  error?: string;
};

type TravelMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: TravelCard[];
  tools?: ToolTimelineItem[];
  metrics?: {
    toolCount: number;
    durationMs: number;
    model: string;
    maxSteps: number;
  };
};

type TranslateResponse = {
  translatedText?: string;
  error?: string;
};

const scenarios = [
  "Planuję weekend w Berlinie. Budżet: 2000 PLN",
  "Lecę do Paryża na tydzień w sierpniu",
  "Wycieczka do Pragi z rodziną na 3 dni",
  "Podróż służbowa do Londynu w przyszłym tygodniu",
  "Porównaj Barcelonę i Lizbonę na wakacje",
];

const cardIcons: Record<TravelCard["kind"], string> = {
  weather: "🌤️",
  currency: "💶",
  holiday: "📅",
  attraction: "🏛️",
  budget: "💰",
  translation: "🌍",
};

const translationLanguages = [
  { code: "de", label: "Niemiecki" },
  { code: "fr", label: "Francuski" },
  { code: "es", label: "Hiszpański" },
  { code: "it", label: "Włoski" },
  { code: "en", label: "Angielski" },
  { code: "cs", label: "Czeski" },
  { code: "pt", label: "Portugalski" },
];

function createId() {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parsePlanSections(text: string) {
  const headingPattern = /^(#{2,3})\s+(.+)$/gm;
  const matches = Array.from(text.matchAll(headingPattern));

  if (matches.length === 0) {
    return [{ id: "plain", title: "Plan podróży", body: text.trim() }];
  }

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;

    return {
      id: `section-${index}`,
      title: match[2].trim(),
      body: text.slice(start, end).trim(),
    };
  });
}

function renderLines(text: string) {
  return text.split("\n").map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <br key={`br-${index}`} />;
    }

    return <p key={`${trimmed}-${index}`}>{trimmed}</p>;
  });
}

export default function TravelPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<TravelMessage[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [phrase, setPhrase] = useState("Dzień dobry. Gdzie jest dworzec?");
  const [targetLanguage, setTargetLanguage] = useState("de");
  const [translatedPhrase, setTranslatedPhrase] = useState("");
  const [translationError, setTranslationError] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, error]);

  async function sendTask(task: string) {
    const trimmedTask = task.trim();

    if (!trimmedTask || isLoading) {
      return;
    }

    const userMessage: TravelMessage = {
      id: createId(),
      role: "user",
      text: trimmedTask,
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setError("");
    setIsLoading(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 95000);

    try {
      const response = await fetch("/api/travel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ task: trimmedTask }),
      });
      const data = (await response.json()) as {
        text?: string;
        cards?: TravelCard[];
        tools?: ToolTimelineItem[];
        metrics?: TravelMessage["metrics"];
        error?: string;
      };

      if (!response.ok || !data.text) {
        throw new Error(data.error || "Asystent podróży nie zwrócił planu.");
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createId(),
          role: "assistant",
          text: data.text ?? "",
          cards: data.cards ?? [],
          tools: data.tools ?? [],
          metrics: data.metrics,
        },
      ]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.name === "AbortError"
          ? "Asystent podróży pracował zbyt długo, więc przerwałam zadanie. Spróbuj krótszego celu."
          : caughtError instanceof Error
            ? caughtError.message
            : "Nie udało się zaplanować podróży.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendTask(input);
  }

  async function handleTranslate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = phrase.trim();

    if (!text || isTranslating) {
      return;
    }

    setIsTranslating(true);
    setTranslatedPhrase("");
    setTranslationError("");

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage }),
      });
      const data = (await response.json()) as TranslateResponse;

      if (!response.ok) {
        throw new Error(data.error || "Nie udało się przetłumaczyć zwrotu.");
      }

      setTranslatedPhrase(data.translatedText ?? "");
    } catch (caughtError) {
      setTranslationError(
        caughtError instanceof Error ? caughtError.message : "Nie udało się przetłumaczyć zwrotu.",
      );
    } finally {
      setIsTranslating(false);
    }
  }

  return (
    <main className="chat-shell">
      <section className="chat-app travel-app" aria-label="Asystent podróży AI">
        <nav className="top-nav" aria-label="Nawigacja">
          <BackNavLink />
          <a className="nav-link active" href="/travel">
            ✈️ Podróże
          </a>
        </nav>

        <header className="chat-header pro-header">
          <div>
            <h1 className="chat-title">✈️ Asystent podróży AI</h1>
            <p className="agent-description">
              Powiedz dokąd jedziesz — agent sprawdzi pogodę, walutę, święta,
              atrakcje, rozmówki i przygotuje plan.
            </p>
            <div className="example-questions" aria-label="Scenariusze podróży">
              {scenarios.map((scenario) => (
                <button
                  className="example-button"
                  disabled={isLoading}
                  key={scenario}
                  onClick={() => void sendTask(scenario)}
                  type="button"
                >
                  {scenario}
                </button>
              ))}
            </div>
            <form className="travel-translator-inline" onSubmit={handleTranslate}>
              <div className="travel-translator-inline-top">
                <strong>🌍 Rozmówki / tłumacz</strong>
                <select
                  aria-label="Język rozmówek"
                  onChange={(event) => setTargetLanguage(event.target.value)}
                  value={targetLanguage}
                >
                  {translationLanguages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="travel-translator-inline-grid">
                <textarea
                  aria-label="Zwrot do przetłumaczenia"
                  onChange={(event) => setPhrase(event.target.value)}
                  rows={3}
                  value={phrase}
                />
                <div className="travel-translator-inline-result" aria-live="polite">
                  {translatedPhrase || translationError || "Tutaj pojawi się tłumaczenie rozmówki."}
                </div>
              </div>
              <button className="secondary-button" disabled={isTranslating || !phrase.trim()} type="submit">
                {isTranslating ? "Tłumaczę..." : "Przetłumacz zwrot"}
              </button>
            </form>
          </div>
          <div className="chat-status" aria-live="polite">
            {isLoading ? "Planuję..." : "Gotowy"}
          </div>
        </header>

        <div className="messages travel-messages">
          {messages.length === 0 ? (
            <p className="empty-state">
              Wpisz cel podróży, termin i budżet, a agent przygotuje praktyczny
              plan z prawdziwych danych.
            </p>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <div className="badge-row">
                      <span className="model-badge flash">✈️ podróże</span>
                    </div>
                  ) : null}

                  {message.role === "assistant" && message.cards?.length ? (
                    <div className="travel-card-grid">
                      {message.cards.map((card, index) => (
                        <section className={`travel-card ${card.kind}`} key={`${card.title}-${index}`}>
                          <span>{cardIcons[card.kind]}</span>
                          <div>
                            <h2>{card.title}</h2>
                            <strong>{card.value}</strong>
                            <p>{card.detail}</p>
                            {card.source ? <em>{card.source}</em> : null}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : null}

                  {message.role === "assistant" ? (
                    <DiagnosticsPanel metrics={message.metrics} tools={message.tools ?? []} />
                  ) : null}

                  {message.role === "assistant" ? (
                    <div className="travel-plan">
                      {parsePlanSections(message.text).map((section) => (
                        <section className="travel-plan-section" key={section.id}>
                          <h2>{section.title}</h2>
                          <div>{renderLines(section.body)}</div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    message.text
                  )}

                  {message.tools && message.tools.length > 0 ? (
                    <details className="travel-tool-details">
                      <summary>Użyte źródła i narzędzia ({message.tools.length})</summary>
                      <div className="tool-timeline">
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
                          </div>
                        ))}
                      </div>
                    </details>
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
                  <span className="model-badge flash">✈️ podróże</span>
                </div>
                <div className="tool-timeline loading">
                  <strong>Sprawdzam dane podróży...</strong>
                  <div className="tool-step">
                    <div>
                      <span>1</span>
                      <strong>Pogoda, waluty, święta, atrakcje</strong>
                    </div>
                    <p>→ agent zbiera prawdziwe dane i układa plan</p>
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
          <form className="composer" onSubmit={handleSubmit}>
            <input
              aria-label="Plan podróży"
              className="composer-input"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Np. Lecę do Barcelony na weekend..."
              value={input}
            />
            <button className="send-button" disabled={isLoading || !input.trim()}>
              Wyślij
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

