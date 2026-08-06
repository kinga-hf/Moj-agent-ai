"use client";

import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";
import { GoldIcon, type IconName } from "../components/GoldIcon";

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
  "Przygotuj checklistę dokumentów potrzebnych do dochodzenia roszczenia z tytułu szkody komunikacyjnej.",
  "Uporządkuj strategię odpowiedzi na sprzeciw od nakazu zapłaty: zarzuty, dowody i kolejne kroki.",
  "Sprawdź, jakie argumenty i podstawy prawne warto zweryfikować przy roszczeniu z umowy cesji wierzytelności.",
  "Przygotuj listę pytań do świadka w sprawie o niewykonanie umowy oraz wskaż, jakie dokumenty potwierdzą jego zeznania.",
];

const tools = [
  { icon: "legal", label: "Analiza pisma" },
  { icon: "calculator", label: "Wyliczenia roszczeń" },
  { icon: "clock", label: "Terminy procesowe" },
  { icon: "search", label: "Wyszukiwanie orzeczeń" },
  { icon: "dictionary", label: "Pojęcia prawne" },
  { icon: "page", label: "Czytanie dokumentów" },
  { icon: "download", label: "Notatki do sprawy" },
] satisfies ReadonlyArray<{ icon: IconName; label: string }>;

function getToolIcon(name: string): IconName {
  const normalized = name.toLowerCase();

  if (normalized.includes("kalk") || normalized.includes("calc")) return "calculator";
  if (normalized.includes("czas") || normalized.includes("date")) return "clock";
  if (normalized.includes("pogod") || normalized.includes("weather")) return "weather";
  if (normalized.includes("kurs") || normalized.includes("currenc")) return "currency";
  if (normalized.includes("świę") || normalized.includes("swiet") || normalized.includes("holid")) return "holiday";
  if (normalized.includes("wikip") || normalized.includes("słownik") || normalized.includes("dictionary")) return "dictionary";
  if (normalized.includes("google") || normalized.includes("szuk") || normalized.includes("search")) return "search";
  if (normalized.includes("stron") || normalized.includes("page") || normalized.includes("read")) return "page";
  if (normalized.includes("notat") || normalized.includes("note")) return "download";

  return "agent";
}

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

function getDisplayTitle(section: ReactSection): ReactNode {
  if (section.kind === "thought") {
    return <><GoldIcon name="think" size={18} /> Myślę...</>;
  }

  if (section.kind === "observation") {
    return <><GoldIcon name="vision" size={18} /> Obserwuję...</>;
  }

  if (section.kind === "final") {
    return <><GoldIcon name="spark" size={18} /> Wynik końcowy</>;
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
                  <GoldIcon name={getToolIcon(item.name)} size={18} /> {item.name}
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
            <span className="agent-header-badge">LEXAI • STRATEGIA PROCESOWA</span>
            <h1 className="chat-title"><GoldIcon name="react" size={30} /> Strategia procesowa</h1>
            <p className="agent-description">
              Opisz problem prawny → agent uporządkuje fakty, dobierze narzędzia,
              wskaże braki w dokumentach i zaproponuje kolejne kroki.
            </p>
            <div className="agent-tool-panel" aria-label="Narzędzia ReAct">
              {tools.map((tool) => (
                <div className="agent-tool" key={tool.label}>
                  <span><GoldIcon name={tool.icon} size={18} /></span>
                  <strong>{tool.label}</strong>
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
              Wybierz scenariusz albo opisz sprawę. LexAI pokaże tok analizy,
              wykorzystane narzędzia i rekomendowane działania.
            </p>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <div className="badge-row">
                      <span className="model-badge flash"><GoldIcon name="react" size={14} /> ReAct</span>
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
                  <span className="model-badge flash"><GoldIcon name="react" size={14} /> ReAct</span>
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
                  <strong><GoldIcon name="agent" size={16} /> Agent planuje i działa...</strong>
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

