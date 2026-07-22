"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
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

const commandExamples = [
  "/tabela języki programowania 2026",
  "/porownanie ChatGPT vs Claude",
  "/lista 5 kroków do pierwszego agenta AI",
  "/faq sztuczna inteligencja dla początkujących",
  "/email podziękowanie za udaną rekrutację",
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

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    nodes.push(<strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function isTableLine(line: string) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isSeparatorLine(line: string) {
  return /^\|?[\s:-]+\|[\s|:-]*$/.test(line.trim());
}

function parseTableRows(lines: string[]) {
  return lines
    .filter((line) => !isSeparatorLine(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (isTableLine(line)) {
      const tableLines: string[] = [];

      while (index < lines.length && isTableLine(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }

      const rows = parseTableRows(tableLines);
      const [header, ...body] = rows;

      if (header) {
        blocks.push(
          <div className="markdown-table-wrap" key={`table-${index}`}>
            <table className="markdown-table">
              <thead>
                <tr>
                  {header.map((cell) => (
                    <th key={cell}>{renderInlineMarkdown(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rowIndex) => (
                  <tr key={`${row.join("-")}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${cell}-${cellIndex}`}>
                        {renderInlineMarkdown(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }

      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(<h3 key={`h3-${index}`}>{renderInlineMarkdown(trimmed.slice(4))}</h3>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(<h2 key={`h2-${index}`}>{renderInlineMarkdown(trimmed.slice(3))}</h2>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push(<h2 key={`h1-${index}`}>{renderInlineMarkdown(trimmed.slice(2))}</h2>);
      index += 1;
      continue;
    }

    if (/^(\d+\.|-|\*)\s+/.test(trimmed)) {
      const items: string[] = [];
      const ordered = /^\d+\.\s+/.test(trimmed);

      while (
        index < lines.length &&
        (ordered ? /^\d+\.\s+/.test(lines[index].trim()) : /^(-|\*)\s+/.test(lines[index].trim()))
      ) {
        items.push(lines[index].trim().replace(/^(\d+\.|-|\*)\s+/, ""));
        index += 1;
      }

      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag className="markdown-list" key={`list-${index}`}>
          {items.map((item) => (
            <li key={item}>{renderInlineMarkdown(item)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    blocks.push(<p key={`p-${index}`}>{renderInlineMarkdown(trimmed)}</p>);
    index += 1;
  }

  return <div className="markdown-content">{blocks}</div>;
}

export default function FormatPage() {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AiModel>("flash");
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>(
    {},
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pendingModelRef = useRef<AiModel>("flash");
  const { error, messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/format",
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
      <section className="chat-app format-app" aria-label="Formatowanie">
        <nav className="top-nav" aria-label="Nawigacja">
          <BackNavLink />
          <a className="nav-link" href="/chat">
            💬 Chat
          </a>
          <a className="nav-link" href="/think">
            🧠 Myślenie
          </a>
          <a className="nav-link" href="/fewshot">
            📚 Słownik
          </a>
          <a className="nav-link active" href="/format">
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
            <h1 className="chat-title">📐 Formatowanie</h1>
            <p className="agent-description">
              Agent odpowiada w tabeli, liście, porównaniu, FAQ albo emailu -
              dokładnie na żądanie.
            </p>
            <div className="example-questions" aria-label="Komendy formatujące">
              {commandExamples.map((command) => (
                <button
                  className="example-button"
                  disabled={isLoading}
                  key={command}
                  onClick={() => setInput(command)}
                  type="button"
                >
                  {command}
                </button>
              ))}
            </div>
          </div>
          <div className="chat-status" aria-live="polite">
            {isLoading ? "Formatuję..." : "Gotowy"}
          </div>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <p className="empty-state">
              Wybierz komendę, dopisz własny temat i wyślij. Tabele będą
              wyświetlane jako normalne, czytelne tabele.
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
                      <span className="command-badge">📐 format</span>
                    </div>
                  ) : null}
                  {message.role === "assistant" ? (
                    <MarkdownContent text={getMessageText(message.parts)} />
                  ) : (
                    getMessageText(message.parts)
                  )}
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
                  <span className="command-badge">📐 format</span>
                </div>
                Formatuję...
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="message-row assistant">
              <div className="message-bubble error-bubble">
                Nie udało się wygenerować sformatowanej odpowiedzi. Spróbuj
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
              aria-label="Komenda formatowania"
              className="composer-input"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="/tabela temat, /lista temat, /email opis..."
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

