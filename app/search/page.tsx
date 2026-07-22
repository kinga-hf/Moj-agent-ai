"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { BackNavLink } from "../components/BackNavLink";
import {
  AttachedImagePreview,
  DropOverlay,
  HiddenImageInput,
  ImageUploadButton,
  useImageAttachment,
} from "../components/ImageAttachment";

const starterQuestions = [
  "Jakie są najnowsze wiadomości o sztucznej inteligencji?",
  "Ile kosztuje iPhone 16 Pro w Polsce?",
  "Kto wygrał ostatni mecz reprezentacji Polski?",
  "Jakie filmy są teraz w kinach?",
];

function getMessageText(parts: { type: string; text?: string }[]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function renderLinkedText(text: string) {
  const nodes: ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<)]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const markdownLabel = match[1];
    const markdownUrl = match[2];
    const plainUrl = match[3];
    const url = markdownUrl || plainUrl;
    const label = markdownLabel || plainUrl;

    nodes.push(
      <a href={url} key={`${url}-${match.index}`} rel="noreferrer" target="_blank">
        {label}
      </a>,
    );
    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function LinkedMessage({ text }: { text: string }) {
  return (
    <div className="linked-message">
      {text.split("\n").map((line, index) => (
        <p key={`${line}-${index}`}>{renderLinkedText(line)}</p>
      ))}
    </div>
  );
}

export default function SearchPage() {
  const [input, setInput] = useState("");
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
  const { error, messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function sendText(text: string) {
    const trimmedText = text.trim();
    if ((!trimmedText && !attachedImage) || isLoading) {
      return;
    }

    setInput("");
    const imageToSend = attachedImage?.dataUrl;
    removeImage();
    await sendMessage(
      { text: trimmedText || "Przeanalizuj załączony obraz." },
      {
        body: {
          mode: "expert",
          model: "flash",
          purpose: "search",
          image: imageToSend,
        },
      },
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendText(input);
  }

  return (
    <main className="chat-shell">
      <section className="chat-app search-app" aria-label="Agent z wyszukiwarką">
        <DropOverlay visible={isDraggingImage} />
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
          <a className="nav-link" href="/format">
            📐 Formater
          </a>
          <a className="nav-link active" href="/search">
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
            <h1 className="chat-title">🌐 Agent z wyszukiwarką</h1>
            <p className="agent-description">
              Przeszukuję prawdziwy internet i czytam strony.
            </p>
            <div className="example-questions" aria-label="Pytania startowe">
              {starterQuestions.map((question) => (
                <button
                  className="example-button"
                  disabled={isLoading}
                  key={question}
                  onClick={() => void sendText(question)}
                  type="button"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
          <div className="chat-status" aria-live="polite">
            {isLoading ? "Szukam..." : "Gotowy"}
          </div>
        </header>

        <div
          className="messages"
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(event) => void handleDrop(event)}
        >
          {messages.length === 0 ? (
            <p className="empty-state">
              Zapytaj o aktualne informacje albo podaj adres strony do
              przeczytania.
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
                      <span className="model-badge flash">🌐 search</span>
                    </div>
                  ) : null}
                  {message.role === "assistant" ? (
                    <LinkedMessage text={getMessageText(message.parts)} />
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
                  <span className="model-badge flash">🌐 search</span>
                </div>
                Szukam...
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="message-row assistant">
              <div className="message-bubble error-bubble">
                Nie udało się wyszukać odpowiedzi. Spróbuj ponownie za chwilę
                albo sprawdź limit klucza Gemini.
              </div>
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
              aria-label="Pytanie do wyszukiwarki"
              className="composer-input"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => void handlePaste(event)}
              placeholder="Zapytaj o cokolwiek aktualnego..."
              value={input}
            />
            <button
              className="send-button"
              disabled={isLoading || (!input.trim() && !attachedImage)}
            >
              Wyślij
            </button>
            {isLoading ? (
              <button className="secondary-button" onClick={stop} type="button">
                Stop
              </button>
            ) : null}
          </form>
        </div>
      </section>
    </main>
  );
}

