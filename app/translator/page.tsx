"use client";

import { FormEvent, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";

const languages = [
  { code: "en", label: "Angielski" },
  { code: "de", label: "Niemiecki" },
  { code: "fr", label: "Francuski" },
  { code: "es", label: "Hiszpański" },
  { code: "it", label: "Włoski" },
  { code: "pl", label: "Polski" },
  { code: "uk", label: "Ukraiński" },
];

type TranslateResponse = {
  translatedText?: string;
  error?: string;
};

export default function TranslatorPage() {
  const [text, setText] = useState("Dzień dobry, zaplanujmy dzisiejszą pracę.");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [translatedText, setTranslatedText] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setTranslatedText("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage }),
      });
      const data = (await response.json()) as TranslateResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Nie udało się przetłumaczyć tekstu.");
      }

      setTranslatedText(data.translatedText ?? "");
    } catch (translateError) {
      setError(
        translateError instanceof Error
          ? translateError.message
          : "Nie udało się przetłumaczyć tekstu.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />

      <section className="dashboard-main" aria-label="Tłumacz">
        <header className="dashboard-hero translator-hero">
          <div>
            <span className="dashboard-kicker">Integracja językowa</span>
            <h1>Tłumacz</h1>
            <p>Tłumacz tekst przez endpoint Google Translate dostępny pod /api/translate.</p>
          </div>
          <div className="translator-status">Endpoint aktywny</div>
        </header>

        <section className="dashboard-card translator-card">
          <div className="dashboard-card-top">
            <span>🌐 Google Translate</span>
            <em>POST /api/translate</em>
          </div>

          <form className="translator-form" onSubmit={handleSubmit}>
            <div className="translator-grid">
              <label className="translator-field">
                <span>Tekst do tłumaczenia</span>
                <textarea
                  className="translator-textarea"
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Wpisz tekst..."
                  rows={9}
                  value={text}
                />
              </label>

              <div className="translator-output">
                <label className="translator-field">
                  <span>Język docelowy</span>
                  <select
                    className="translator-select"
                    onChange={(event) => setTargetLanguage(event.target.value)}
                    value={targetLanguage}
                  >
                    {languages.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="translator-result" aria-live="polite">
                  {translatedText || "Tutaj pojawi się tłumaczenie."}
                </div>
              </div>
            </div>

            {error ? <div className="translator-error">{error}</div> : null}

            <button className="send-button translator-submit" disabled={isLoading || !text.trim()} type="submit">
              {isLoading ? "Tłumaczę..." : "Przetłumacz"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
