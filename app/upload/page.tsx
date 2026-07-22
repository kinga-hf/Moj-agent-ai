"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";
import { useAuth } from "../components/AuthGate";
import { supabase } from "../../lib/supabase";

type KnowledgeDocument = {
  title: string;
  chunks: number;
  created_at: string;
  updated_at: string;
};

type KnowledgeSearchResult = {
  title: string;
  content: string;
  similarity: number;
  added_at?: string | null;
};

type UploadEvent =
  | { type: "start"; total_chunks: number }
  | { type: "progress"; chunk_index: number; total_chunks: number; message: string }
  | { type: "done"; success: true; chunks_saved: number }
  | { type: "error"; error: string };

const examples = [
  {
    label: "Cennik",
    title: "Cennik 2026",
    content: `CENNIK USLUG 2026

Pakiet Basic: 99 zl/miesiac
- 5 uzytkownikow
- 10 GB miejsca
- Wsparcie email

Pakiet Premium: 299 zl/miesiac
- 25 uzytkownikow
- 100 GB miejsca
- Wsparcie email + telefon
- Priorytetowa obsluga

Pakiet VIP: 599 zl/miesiac
- Nielimitowani uzytkownicy
- 1 TB miejsca
- Wsparcie 24/7
- Dedykowany opiekun
- Szkolenie wdrozeniowe

Wszystkie pakiety z 14-dniowym okresem probnym.
Faktura VAT wystawiana automatycznie.
Rezygnacja mozliwa w dowolnym momencie.`,
  },
  {
    label: "FAQ",
    title: "FAQ klienta",
    content:
      "Q: Jak moge anulowac subskrypcje? A: Wyslij email do obslugi klienta minimum 24 godziny przed koncem okresu rozliczeniowego. Q: Czy wystawiacie faktury VAT? A: Tak, faktura VAT jest generowana automatycznie po platnosci.",
  },
  {
    label: "Regulamin",
    title: "Regulamin firmy",
    content:
      "Paragraf 1. Postanowienia ogolne. Niniejszy regulamin okresla zasady korzystania z uslug. Paragraf 2. Klient ma prawo do 14-dniowego okresu probnego. Paragraf 3. Rezygnacja jest mozliwa w dowolnym momencie.",
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));
}

export default function UploadPage() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeSearchResult[]>([]);
  const [isSearchingKnowledge, setIsSearchingKnowledge] = useState(false);

  const progressPercent = useMemo(() => {
    if (!progressTotal) {
      return isUploading ? 8 : 0;
    }

    return Math.min(100, Math.round((progressCurrent / progressTotal) * 100));
  }, [isUploading, progressCurrent, progressTotal]);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!supabase) {
      return {};
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadDocuments() {
    setIsLoadingList(true);

    try {
      const response = await fetch("/api/upload-knowledge", {
        cache: "no-store",
        headers: await getAuthHeaders(),
      });
      const data = (await response.json()) as {
        documents?: KnowledgeDocument[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Nie udalo sie pobrac dokumentow.");
      }

      setDocuments(data.documents ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie pobrac dokumentow.");
    } finally {
      setIsLoadingList(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [user]);

  function useExample(index: number) {
    const example = examples[index];
    setTitle(example.title);
    setContent(example.content);
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || !content.trim() || isUploading) {
      return;
    }

    setIsUploading(true);
    setError("");
    setSuccess("");
    setProgressCurrent(0);
    setProgressTotal(0);
    setProgressMessage("Dziele tekst na fragmenty...");

    try {
      const response = await fetch("/api/upload-knowledge?stream=1", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, content }),
      });

      if (!response.body) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Serwer nie zwrocil postepu przetwarzania.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const update = JSON.parse(line) as UploadEvent;

          if (update.type === "start") {
            setProgressTotal(update.total_chunks);
            setProgressMessage(`Znalazlem ${update.total_chunks} fragmentow.`);
          }

          if (update.type === "progress") {
            setProgressCurrent(update.chunk_index);
            setProgressTotal(update.total_chunks);
            setProgressMessage(update.message);
          }

          if (update.type === "done") {
            setProgressCurrent(update.chunks_saved);
            setProgressTotal(update.chunks_saved);
            setSuccess(`Zapisano ${update.chunks_saved} fragmentow.`);
            setTitle("");
            setContent("");
          }

          if (update.type === "error") {
            throw new Error(update.error);
          }
        }
      }

      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie zapisac dokumentu.");
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteDocument(documentTitle: string) {
    if (isUploading) {
      return;
    }

    const confirmed = window.confirm(`Usunac dokument "${documentTitle}" z bazy wiedzy?`);

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/upload-knowledge?title=${encodeURIComponent(documentTitle)}`, {
        method: "DELETE",
        headers: await getAuthHeaders(),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Nie udalo sie usunac dokumentu.");
      }

      setSuccess(`Usunieto dokument "${documentTitle}".`);
      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie usunac dokumentu.");
    }
  }

  async function searchKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = knowledgeQuery.trim();
    if (!query || isSearchingKnowledge) {
      return;
    }

    setIsSearchingKnowledge(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/search-knowledge", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
      const data = (await response.json()) as {
        results?: KnowledgeSearchResult[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Nie udalo sie przeszukac bazy wiedzy.");
      }

      setKnowledgeResults(data.results ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie przeszukac bazy wiedzy.");
    } finally {
      setIsSearchingKnowledge(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />

      <section className="dashboard-main" aria-label="Baza wiedzy">
        <header className="dashboard-hero">
          <div>
            <span className="dashboard-kicker">Baza wiedzy</span>
            <h1>Baza wiedzy</h1>
            <p>Wklej tekst, a aplikacja podzieli go na fragmenty, wygeneruje wektory i zapisze je w Supabase.</p>
          </div>
          <div className="dashboard-status">
            <span>{isUploading ? "Przetwarzam" : "Gotowe do zapisu"}</span>
          </div>
        </header>

        {error ? <div className="dashboard-error">{error}</div> : null}
        {success ? <div className="upload-success">{success}</div> : null}

        <section className="upload-layout">
          <form className="upload-card upload-form" onSubmit={handleSubmit}>
            <div className="dashboard-card-top">
              <span>Nowy dokument</span>
              <em>{content.trim().length} znakow</em>
            </div>

            <label className="upload-field">
              <span>Tytul dokumentu</span>
              <input
                disabled={isUploading}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Np. Cennik 2026, FAQ, Regulamin firmy"
                value={title}
              />
            </label>

            <label className="upload-field">
              <span>Tresc dokumentu</span>
              <textarea
                disabled={isUploading}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Wklej tutaj tresc dokumentu..."
                value={content}
              />
            </label>

            <div className="upload-examples" aria-label="Przykladowe dokumenty">
              {examples.map((example, index) => (
                <button
                  disabled={isUploading}
                  key={example.label}
                  onClick={() => useExample(index)}
                  type="button"
                >
                  {example.label}
                </button>
              ))}
            </div>

            <div className="upload-progress" aria-label="Postep zapisu">
              <div>
                <span>{progressMessage || "Czekam na dokument."}</span>
                <strong>{progressPercent}%</strong>
              </div>
              <progress max={100} value={progressPercent} />
            </div>

            <button className="send-button upload-submit" disabled={isUploading || !title.trim() || !content.trim()} type="submit">
              {isUploading ? "Zapisuje..." : "Zapisz w bazie wiedzy"}
            </button>
          </form>

          <section className="upload-card upload-list">
            <div className="dashboard-card-top">
              <span>Zapisane dokumenty</span>
              <em>{isLoadingList ? "Laduje..." : `${documents.length} pozycji`}</em>
            </div>

            {isLoadingList ? (
              <p className="upload-empty">Pobieram liste dokumentow.</p>
            ) : documents.length === 0 ? (
              <p className="upload-empty">Baza wiedzy jest jeszcze pusta.</p>
            ) : (
              <div className="upload-documents">
                {documents.map((document) => (
                  <article className="upload-document" key={document.title}>
                    <div>
                      <h2>{document.title}</h2>
                      <p>
                        {document.chunks} fragmentow · dodano {formatDate(document.created_at)}
                      </p>
                    </div>
                    <button
                      aria-label={`Usun dokument ${document.title}`}
                      disabled={isUploading}
                      onClick={() => void deleteDocument(document.title)}
                      type="button"
                    >
                      Usun
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="upload-card upload-search">
            <div className="dashboard-card-top">
              <span>Test wyszukiwania</span>
              <em>{knowledgeResults.length} wynikow</em>
            </div>

            <form className="upload-search-form" onSubmit={searchKnowledge}>
              <label className="upload-field">
                <span>Szukaj w bazie wiedzy</span>
                <input
                  disabled={isSearchingKnowledge}
                  onChange={(event) => setKnowledgeQuery(event.target.value)}
                  placeholder="Np. ile kosztuje Premium?"
                  value={knowledgeQuery}
                />
              </label>
              <button className="send-button upload-submit" disabled={isSearchingKnowledge || !knowledgeQuery.trim()} type="submit">
                {isSearchingKnowledge ? "Szukam..." : "Szukaj"}
              </button>
            </form>

            {knowledgeResults.length === 0 ? (
              <p className="upload-empty">Wpisz pytanie, zeby sprawdzic najlepiej pasujace fragmenty.</p>
            ) : (
              <div className="knowledge-results">
                {knowledgeResults.map((result, index) => (
                  <article className="knowledge-result" key={`${result.title}-${index}`}>
                    <div>
                      <strong>{result.title}</strong>
                      <span>similarity {result.similarity}</span>
                    </div>
                    <p>{result.content}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
