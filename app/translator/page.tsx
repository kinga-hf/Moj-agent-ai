"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { GoldIcon } from "../components/GoldIcon";
import { DashboardSidebar } from "../components/DashboardSidebar";

const languages = [
  { code: "en", label: "Angielski" },
  { code: "de", label: "Niemiecki" },
  { code: "fr", label: "Francuski" },
  { code: "es", label: "Hiszpański" },
  { code: "it", label: "Włoski" },
  { code: "pl", label: "Polski" },
  { code: "uk", label: "Ukraiński" },
  { code: "cs", label: "Czeski" },
  { code: "pt", label: "Portugalski" },
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
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedLanguage = languages.find((language) => language.code === targetLanguage) ?? languages[0];

  useEffect(() => {
    function closeLanguageMenu(event: MouseEvent) {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageOpen(false);
      }
    }

    document.addEventListener("mousedown", closeLanguageMenu);
    return () => document.removeEventListener("mousedown", closeLanguageMenu);
  }, []);

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
            <h1><GoldIcon name="translate" size={30} /> Tłumacz</h1>
            <p>Tłumacz tekst przez endpoint Google Translate dostępny pod /api/translate.</p>
          </div>
          <div className="translator-status">Endpoint aktywny</div>
        </header>

        <section className="dashboard-card translator-card">
          <div className="dashboard-card-top">
            <span><GoldIcon name="translate" size={18} /> Google Translate</span>
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
                    <div className="translator-select-wrap" ref={languageMenuRef}>
                      <button
                        aria-expanded={languageOpen}
                        aria-haspopup="listbox"
                        className="translator-select-button"
                        onClick={() => setLanguageOpen((open) => !open)}
                        type="button"
                      >
                        <span>{selectedLanguage.label}</span>
                        <span aria-hidden="true">⌄</span>
                      </button>
                      {languageOpen ? (
                        <div className="translator-options" role="listbox" aria-label="Wybierz język docelowy">
                          {languages.map((language) => (
                            <button
                              aria-selected={language.code === targetLanguage}
                              className={language.code === targetLanguage ? "selected" : ""}
                              key={language.code}
                              onClick={() => {
                                setTargetLanguage(language.code);
                                setLanguageOpen(false);
                              }}
                              role="option"
                              type="button"
                            >
                              {language.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
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
