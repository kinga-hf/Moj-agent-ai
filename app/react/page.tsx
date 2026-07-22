"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";
import { BackNavLink } from "../components/BackNavLink";

type ToolTimelineItem = {
  id: string;
  index: number;
  name: string;
  emoji: string;
  input: string;
  output: string;
  hasError?: boolean;
  error?: string;
  providerExecuted?: boolean;
};

type ReactMetrics = {
  toolCount: number;
  durationMs: number;
  model: string;
  maxSteps: number;
};

type ReactMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: ToolTimelineItem[];
  metrics?: ReactMetrics;
};

type ReactSection = {
  id: string;
  kind: "thought" | "observation" | "final" | "plain";
  title: string;
  body: string;
};

const scenarios = [
  "Planuję weekend w Krakowie. Sprawdź pogodę, znajdź ciekawe miejsca w Wikipedii, i powiedz czy są jakieś święta w ten weekend",
  "Mam 5000 EUR do wydania. Przelicz na PLN, sprawdź ile to w dolarach, i zapisz wszystkie kursy w notatkach",
  "Porównaj pogodę w Warszawie, Berlinie i Paryżu. Które z tych miast ma dziś najlepszą pogodę?",
  "Ile dni do następnego święta w Polsce? Jaka będzie wtedy pogoda?",
];

const tools = [
  ["🧮", "Kalkulator"],
  ["🕐", "Data i czas"],
  ["🌦️", "Pogoda"],
  ["💱", "Kursy walut"],
  ["📅", "Święta"],
  ["📚", "Wikipedia"],
  ["🌐", "Google"],
  ["📄", "Czytanie stron"],
  ["💾", "Notatki"],
];

function createId() {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSectionKind(title: string): ReactSection["kind"] {
  const normalized = title.toLowerCase();

  if (normalized.includes("mysle") || normalized.includes("myśl")) {
    return "thought";
  }

  if (normalized.includes("obserw")) {
    return "observation";
  }

  if (normalized.includes("wynik")) {
    return "final";
  }

  return "plain";
}

function getDisplayTitle(section: ReactSection) {
  if (section.kind === "thought") {
    return "🧠 Myślę...";
  }

  if (section.kind === "observation") {
    return "👁️ Obserwuję...";
  }

  if (section.kind === "final") {
    return "✅ Wynik końcowy";
  }

  return section.title;
}

function parseReactSections(text: string) {
  const headingPattern = /^###\s+(.+)$/gm;
  const matches = Array.from(text.matchAll(headingPattern));

  if (matches.length === 0) {
    return [
      {
        id: "plain-0",
        kind: "plain" as const,
        title: "Odpowiedź",
        body: text.trim(),
      },
    ];
  }

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;
    const title = match[1].trim();
    const kind = getSectionKind(title);

    return {
      id: `${kind}-${index}`,
      kind,
      title,
      body: text.slice(start, end).trim(),
    };
  });
}

function countCompletedSteps(sections: ReactSection[]) {
  const thoughtCount = sections.filter((section) => section.kind === "thought").length;

  return Math.min(Math.max(thoughtCount, 1), 5);
}

function renderText(text: string) {
  return text.split("\n").map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <br key={`br-${index}`} />;
    }

    return <p key={`${trimmed}-${index}`}>{trimmed}</p>;
  });
}

function ReactAnswer({
  text,
  tools,
  metrics,
}: {
  text: string;
  tools: ToolTimelineItem[];
  metrics?: ReactMetrics;
}) {
  const sections = useMemo(() => parseReactSections(text), [text]);
  const completedSteps = countCompletedSteps(sections);

  return (
    <div className="react-answer">
      <div className="react-progress" aria-label={`Krok ${completedSteps} z 5`}>
        <div>
          <strong>Krok {completedSteps} z 5</strong>
          <span>pętla ReAct zakończona</span>
        </div>
        <div className="react-progress-track">
          <span style={{ width: `${(completedSteps / 5) * 100}%` }} />
        </div>
      </div>

      <DiagnosticsPanel metrics={metrics} tools={tools} />

      {tools.length > 0 ? (
        <div className="tool-timeline react-tool-timeline">
          <strong>⚙️ Narzędzia użyte przez agenta</strong>
          {tools.map((item) => (
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
      ) : null}

      <div className="react-sections">
        {sections.map((section) => (
          <section className={`react-section ${section.kind}`} key={section.id}>
            <h2>{getDisplayTitle(section)}</h2>
            <div>{renderText(section.body)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function ReactPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ReactMessage[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const promptLoadedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, error]);

  useEffect(() => {
    if (promptLoadedRef.current) {
      return;
    }

    const prompt = new URLSearchParams(window.location.search).get("prompt");

    if (prompt) {
      setInput(prompt);
      promptLoadedRef.current = true;
    }
  }, []);

  async function sendTask(task: string) {
    const trimmedTask = task.trim();

    if (!trimmedTask || isLoading) {
      return;
    }

    const userMessage: ReactMessage = {
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
    const timeout = window.setTimeout(() => controller.abort(), 80000);

    try {
      const response = await fetch("/api/react", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({ task: trimmedTask }),
      });
      const data = (await response.json()) as {
        text?: string;
        tools?: ToolTimelineItem[];
        metrics?: ReactMetrics;
        error?: string;
      };

      if (!response.ok || !data.text) {
        throw new Error(data.error || "Agent ReAct nie zwrócił odpowiedzi.");
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createId(),
          role: "assistant",
          text: data.text ?? "",
          tools: data.tools ?? [],
          metrics: data.metrics,
        },
      ]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.name === "AbortError"
          ? "Agent ReAct pracował zbyt długo, więc przerwałam zadanie. Spróbuj ponownie albo uprość cel."
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
    await sendTask(input);
  }

  return (
    <main className="chat-shell">
      <section className="chat-app react-app" aria-label="Agent ReAct">
        <nav className="top-nav" aria-label="Nawigacja">
          <BackNavLink />
          <a className="nav-link active" href="/react">
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
        </nav>

        <header className="chat-header pro-header">
          <div>
            <h1 className="chat-title">🔄 Agent ReAct — Autonomiczne rozumowanie</h1>
            <p className="agent-description">
              Opisz cel → agent sam planuje, używa narzędzi, obserwuje wyniki i
              kończy konkretną odpowiedzią.
            </p>
            <div className="agent-tool-panel" aria-label="Narzędzia ReAct">
              {tools.map(([emoji, name]) => (
                <div className="agent-tool" key={name}>
                  <span>{emoji}</span>
                  <strong>{name}</strong>
                  <em>aktywny</em>
                </div>
              ))}
            </div>
            <div className="example-questions" aria-label="Scenariusze ReAct">
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
          </div>
          <div className="chat-status" aria-live="polite">
            {isLoading ? "Realizuję..." : "Gotowy"}
          </div>
        </header>

        <div className="messages react-messages">
          {messages.length === 0 ? (
            <p className="empty-state">
              Wybierz scenariusz albo wpisz złożony cel. Agent sam dobierze
              narzędzia i pokaże przebieg pracy.
            </p>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <div className="badge-row">
                      <span className="model-badge flash">🔄 ReAct</span>
                    </div>
                  ) : null}

                  {message.role === "assistant" ? (
                    <ReactAnswer
                      metrics={message.metrics}
                      text={message.text}
                      tools={message.tools ?? []}
                    />
                  ) : (
                    message.text
                  )}

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
                  <span className="model-badge flash">🔄 ReAct</span>
                </div>
                <div className="react-progress">
                  <div>
                    <strong>Krok 1 z 5</strong>
                    <span>analiza celu i dobór narzędzi</span>
                  </div>
                  <div className="react-progress-track">
                    <span style={{ width: "20%" }} />
                  </div>
                </div>
                <DiagnosticsPanel isLoading />
                <div className="tool-timeline loading">
                  <strong>⚙️ Agent planuje i działa...</strong>
                  <div className="tool-step">
                    <div>
                      <span>1</span>
                      <strong>ReAct loop</strong>
                    </div>
                    <p>→ myślę, wybieram narzędzie, obserwuję wynik</p>
                  </div>
                </div>
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
              aria-label="Cel dla agenta ReAct"
              className="composer-input"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Opisz co chcesz osiągnąć..."
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

