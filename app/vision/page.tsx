"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BackNavLink } from "../components/BackNavLink";
import {
  AttachedImagePreview,
  DropOverlay,
  HiddenImageInput,
  useImageAttachment,
} from "../components/ImageAttachment";

const visionQuestions = [
  "Co widzisz na tym obrazie?",
  "Wyciągnij cały tekst z tego screena",
  "Opisz to w 3 zdaniach",
  "Jakie kolory dominują? Podaj kody HEX",
  "Wygeneruj podobny obraz w innym stylu",
];

type RemixResult = {
  image: string;
  prompt: string;
  text?: string;
};

function getMessageText(parts: { type: string; text?: string }[]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

export default function VisionPage() {
  const [input, setInput] = useState("");
  const [remixResult, setRemixResult] = useState<RemixResult | null>(null);
  const [remixError, setRemixError] = useState("");
  const [isRemixing, setIsRemixing] = useState(false);
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
  const { error, messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });
  const isLoading =
    status === "submitted" || status === "streaming" || isRemixing;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, remixResult]);

  async function askAboutImage(question: string) {
    const trimmedQuestion = question.trim();

    if (!attachedImage || !trimmedQuestion || isLoading) {
      return;
    }

    setInput("");
    setRemixError("");
    await sendMessage(
      { text: trimmedQuestion },
      {
        body: {
          mode: "expert",
          model: "flash",
          purpose: "vision",
          image: attachedImage.dataUrl,
        },
      },
    );
  }

  async function generateSimilar() {
    if (!attachedImage || isLoading) {
      return;
    }

    setIsRemixing(true);
    setRemixError("");
    setRemixResult(null);

    try {
      const response = await fetch("/api/vision-remix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: attachedImage.dataUrl,
          instruction: "Wygeneruj podobny obraz w innym stylu",
        }),
      });
      const data = (await response.json()) as {
        image?: string;
        prompt?: string;
        text?: string;
        error?: string;
      };

      if (!response.ok || !data.image || !data.prompt) {
        throw new Error(data.error || "Nie udało się wygenerować podobnego obrazu.");
      }

      setRemixResult({
        image: data.image,
        prompt: data.prompt,
        text: data.text,
      });
    } catch (caughtError) {
      setRemixError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się wygenerować podobnego obrazu.",
      );
    } finally {
      setIsRemixing(false);
    }
  }

  async function handleQuestionClick(question: string) {
    if (question.startsWith("Wygeneruj podobny")) {
      await generateSimilar();
      return;
    }

    await askAboutImage(question);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await askAboutImage(input);
  }

  return (
    <main className="chat-shell">
      <section
        aria-label="Agent Vision"
        className="chat-app vision-app"
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(event) => void handleDrop(event)}
      >
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
          <a className="nav-link" href="/search">
            🌐 Szukaj
          </a>
          <a className="nav-link" href="/generate">
            🎨 Grafiki
          </a>
          <a className="nav-link active" href="/vision">
            👁️ Vision
          </a>
        </nav>

        <header className="chat-header pro-header">
          <div>
            <h1 className="chat-title">👁️ Agent Vision</h1>
            <p className="agent-description">
              Wklej screenshot, wrzuć plik lub przeciągnij obraz.
            </p>
          </div>
          <div className="chat-status" aria-live="polite">
            {isLoading ? "Analizuję..." : "Gotowy"}
          </div>
        </header>

        <section className="vision-workspace">
          <HiddenImageInput
            fileInputRef={fileInputRef}
            onChange={(event) => void handleFileChange(event)}
          />

          {!attachedImage ? (
            <button
              className="vision-drop-zone"
              onClick={openFilePicker}
              onPaste={(event) => void handlePaste(event)}
              type="button"
            >
              <span>📸 Ctrl+V - wklej screenshot</span>
              <span>📁 Kliknij - wybierz plik</span>
              <span>🖱️ Przeciągnij - upuść obraz</span>
            </button>
          ) : (
            <>
              <AttachedImagePreview image={attachedImage} onRemove={removeImage} />
              <div className="vision-image-frame">
                <img alt={attachedImage.name} src={attachedImage.dataUrl} />
              </div>

              <div className="example-questions" aria-label="Pytania o obraz">
                {visionQuestions.map((question) => (
                  <button
                    className="example-button"
                    disabled={isLoading}
                    key={question}
                    onClick={() => void handleQuestionClick(question)}
                    type="button"
                  >
                    {question}
                  </button>
                ))}
              </div>

              <form className="composer vision-composer" onSubmit={handleSubmit}>
                <textarea
                  aria-label="Pytanie o obraz"
                  className="prompt-textarea vision-question"
                  disabled={isLoading}
                  onChange={(event) => setInput(event.target.value)}
                  onPaste={(event) => void handlePaste(event)}
                  placeholder="Zadaj pytanie o ten obraz..."
                  value={input}
                />
                <button
                  className="send-button"
                  disabled={isLoading || !input.trim()}
                  type="submit"
                >
                  Wyślij
                </button>
              </form>
            </>
          )}

          {imageError ? <div className="attachment-error">{imageError}</div> : null}
          {remixError ? <div className="generation-error">{remixError}</div> : null}
          {isRemixing ? (
            <div className="generation-loading">Generuję podobny obraz...</div>
          ) : null}

          {remixResult && attachedImage ? (
            <section className="vision-remix-result" aria-label="Porównanie obrazów">
              <div>
                <h2>Oryginał</h2>
                <img alt="Oryginał" src={attachedImage.dataUrl} />
              </div>
              <div>
                <h2>Nowa wersja</h2>
                <img alt="Nowa wersja" src={remixResult.image} />
              </div>
              <p>{remixResult.text || "Nowa wersja została wygenerowana."}</p>
              <p className="generation-caption">Prompt: {remixResult.prompt}</p>
            </section>
          ) : null}

          <div className="messages vision-messages">
            {messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <div className="badge-row">
                      <span className="model-badge flash">👁️ vision</span>
                    </div>
                  ) : null}
                  {getMessageText(message.parts)}
                </div>
              </div>
            ))}

            {status === "submitted" ? (
              <div className="message-row assistant">
                <div className="message-bubble">
                  <div className="badge-row">
                    <span className="model-badge flash">👁️ vision</span>
                  </div>
                  Analizuję...
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="message-row assistant">
                <div className="message-bubble error-bubble">
                  Nie udało się przeanalizować obrazu. Sprawdź limit Gemini albo
                  spróbuj ponownie za chwilę.
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </section>
      </section>
    </main>
  );
}

