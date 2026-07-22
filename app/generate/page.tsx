"use client";

import { FormEvent, useState } from "react";
import { BackNavLink } from "../components/BackNavLink";

const promptExamples = [
  "Minimalistyczne logo kawiarni w stylu japońskim",
  "Post na Instagram: kawa latte art, ciepłe światło, widok z góry",
  "Kreacja reklamowa: wyprzedaż letnia -50%, nowoczesny design",
  "Ikona aplikacji: robot AI, gradient fioletowo-niebieski, flat design",
  "Infografika: 5 kroków do produktywności, pastelowe kolory",
  "Zdjęcie produktowe: elegancki zegarek na ciemnym tle",
];

type ImageResult = {
  image: string;
  text: string;
  prompt: string;
};

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<ImageResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function generateImage(promptToUse: string) {
    const trimmedPrompt = promptToUse.trim();
    if (!trimmedPrompt || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });
      const data = (await response.json()) as {
        image?: string;
        text?: string;
        error?: string;
      };

      if (!response.ok || !data.image) {
        throw new Error(data.error || "Nie udało się wygenerować obrazu.");
      }

      setResult({
        image: data.image,
        text: data.text || "Grafika została wygenerowana.",
        prompt: trimmedPrompt,
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się wygenerować obrazu.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateImage(prompt);
  }

  function handleDownload() {
    if (!result?.image) {
      return;
    }

    const link = document.createElement("a");
    link.href = result.image;
    link.download = "ai-generated.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="chat-shell">
      <section className="chat-app generate-app" aria-label="Generator grafik AI">
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
          <a className="nav-link active" href="/generate">
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
            <h1 className="chat-title">🎨 Generator grafik AI</h1>
            <p className="agent-description">
              Opisz co chcesz - AI stworzy obraz w kilka sekund.
            </p>
            <div className="example-questions" aria-label="Przykłady promptów">
              {promptExamples.map((example) => (
                <button
                  className="example-button"
                  disabled={isLoading}
                  key={example}
                  onClick={() => setPrompt(example)}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
          <div className="chat-status" aria-live="polite">
            {isLoading ? "Generuję..." : "Gotowy"}
          </div>
        </header>

        <section className="generate-workspace">
          <form className="generate-form" onSubmit={handleSubmit}>
            <textarea
              aria-label="Opis obrazu"
              className="prompt-textarea"
              disabled={isLoading}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Opisz obraz który chcesz wygenerować..."
              value={prompt}
            />
            <button
              className="send-button generate-button"
              disabled={isLoading || !prompt.trim()}
              type="submit"
            >
              🎨 Generuj
            </button>
          </form>

          {isLoading ? (
            <div className="generation-loading" aria-live="polite">
              Generuję... (5-15 sekund)
            </div>
          ) : null}

          {error ? <div className="generation-error">{error}</div> : null}

          {result ? (
            <section className="generation-result" aria-label="Wygenerowany obraz">
              <img
                alt={result.prompt}
                className="generated-image"
                src={result.image}
              />
              <p className="generation-caption">{result.text}</p>
              <div className="generation-actions">
                <button
                  className="secondary-button"
                  onClick={handleDownload}
                  type="button"
                >
                  💾 Pobierz
                </button>
                <button
                  className="secondary-button"
                  disabled={isLoading}
                  onClick={() => void generateImage(result.prompt)}
                  type="button"
                >
                  🔄 Ponownie
                </button>
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}

