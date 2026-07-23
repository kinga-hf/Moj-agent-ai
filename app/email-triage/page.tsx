"use client";

import { FormEvent, useMemo, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";

type Priority = "high" | "medium" | "low" | "spam" | "unknown";

type ParsedMail = {
  id: string;
  title: string;
  category: string;
  priority: string;
  priorityType: Priority;
  reason: string;
  draft: string;
  raw: string;
};

const sampleEmails = `Mail 1 - PILNY:
Od: jan.kowalski@firma.pl
Temat: PILNE - Problem z fakturą
Treść: Dzień dobry, mam problem z fakturą FV/2026/001. Kwota jest nieprawidłowa - powinno być 5000 zł a jest 3000 zł. Proszę o PILNĄ korektę. Termin płatności mija jutro.

Mail 2 - SPAM:
Od: winner@lucky-prize.com
Temat: Congratulations! You won $1,000,000
Treść: Click here to claim your prize! Limited time offer. Act now!

Mail 3 - OFERTA:
Od: anna.nowak@partner.pl
Temat: Propozycja współpracy
Treść: Dzień dobry, reprezentuję firmę ABC Solutions. Chcielibyśmy omówić możliwość współpracy w zakresie dostarczania usług IT. Czy możemy umówić się na spotkanie w przyszłym tygodniu?

Mail 4 - REKLAMACJA:
Od: klient123@gmail.com
Temat: Nie działa usługa od 3 dni
Treść: Witam, od poniedziałku nie mogę się zalogować do panelu klienta. Próbowałem resetować hasło ale nie dostaje maila. To już trzeci dzień! Jeśli nie rozwiążecie tego dziś, zrezygnuję z usługi.

Mail 5 - INFO:
Od: newsletter@branżowy-portal.pl
Temat: Nowe trendy AI w biznesie - raport 2026
Treść: Zapraszamy do lektury naszego najnowszego raportu o zastosowaniach AI w polskich firmach. Pobierz za darmo na naszej stronie.`;

function splitEmails(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  const numberedEmails = trimmed
    .split(/\n(?=Mail\s+\d+\s*[-:])/i)
    .map((email) => email.trim())
    .filter(Boolean);

  if (numberedEmails.length > 1) {
    return numberedEmails;
  }

  return trimmed
    .split(/\n\s*\n+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function getTableValue(block: string, label: string) {
  const regex = new RegExp(`\\|\\s*${label}\\s*\\|\\s*([^|]+)\\|`, "i");
  const match = block.match(regex);

  return match?.[1]?.trim() ?? "";
}

function normalizePriority(priority: string, category: string): Priority {
  const text = `${priority} ${category}`.toLowerCase();

  if (text.includes("spam")) {
    return "spam";
  }

  if (text.includes("wysoki") || text.includes("piln")) {
    return "high";
  }

  if (text.includes("średni") || text.includes("sredni")) {
    return "medium";
  }

  if (text.includes("niski")) {
    return "low";
  }

  return "unknown";
}

function getPriorityLabel(priority: Priority) {
  if (priority === "high") {
    return "Pilne";
  }

  if (priority === "medium") {
    return "Średnie";
  }

  if (priority === "low") {
    return "Niskie";
  }

  if (priority === "spam") {
    return "Spam";
  }

  return "W toku";
}

function parseDraft(block: string) {
  const draftMatch = block.match(/\*\*Proponowana odpowiedź:\*\*\s*([\s\S]*)/i);
  const draftBlock = draftMatch?.[1] ?? "";

  return draftBlock
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trimEnd())
    .join("\n")
    .replace(/\n?---[\s\S]*$/g, "")
    .trim();
}

function parseTriageResult(text: string) {
  const matches = Array.from(text.matchAll(/^###\s*Mail\s+(\d+):\s*(.+)$/gim));
  const summaryIndex = text.search(/(?:^|\n)PODSUMOWANIE/i);
  const cards: ParsedMail[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index ?? 0;
    const nextStart = matches[index + 1]?.index ?? (summaryIndex > start ? summaryIndex : text.length);
    const block = text.slice(start, nextStart).trim();
    const category = getTableValue(block, "Kategoria");
    const priority = getTableValue(block, "Priorytet");
    const priorityType = normalizePriority(priority, category);

    cards.push({
      id: match[1],
      title: match[2].trim(),
      category,
      priority,
      priorityType,
      reason: getTableValue(block, "Uzasadnienie"),
      draft: parseDraft(block),
      raw: block,
    });
  }

  const summary =
    summaryIndex >= 0 ? text.slice(summaryIndex).replace(/^PODSUMOWANIE\s*/i, "").trim() : "";

  return { cards, summary };
}

function countPriorities(cards: ParsedMail[]) {
  return cards.reduce(
    (counts, card) => {
      counts[card.priorityType] += 1;
      return counts;
    },
    { high: 0, medium: 0, low: 0, spam: 0, unknown: 0 } as Record<Priority, number>,
  );
}

function formatSummaryLine(counts: Record<Priority, number>) {
  const parts = [
    `${counts.high} pilne`,
    `${counts.medium} średnie`,
    `${counts.low} niskie`,
    `${counts.spam} spam`,
  ];

  return parts.join(", ");
}

export default function EmailTriagePage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState("");
  const parsed = useMemo(() => parseTriageResult(result), [result]);
  const counts = useMemo(() => countPriorities(parsed.cards), [parsed.cards]);
  const emailCount = splitEmails(input).length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const emails = splitEmails(input);
    if (emails.length === 0 || isLoading) {
      return;
    }

    setResult("");
    setError("");
    setCopiedDraft("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/email-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Nie udało się uruchomić analizy maili.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          const tail = decoder.decode();
          if (tail) {
            setResult((current) => current + tail);
          }
          break;
        }

        setResult((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udało się przeanalizować maili.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyDraft(card: ParsedMail) {
    if (!card.draft) {
      return;
    }

    await navigator.clipboard.writeText(card.draft);
    setCopiedDraft(card.id);
    window.setTimeout(() => setCopiedDraft(""), 1800);
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />

      <section className="dashboard-main email-triage-page" aria-label="E-mail Triage">
        <header className="dashboard-hero email-triage-hero">
          <div>
            <span className="dashboard-kicker">Business agent</span>
            <h1>📧 E-mail Triage</h1>
            <p>Wklej maile - agent posortuje je według kategorii, priorytetu i przygotuje szkice odpowiedzi.</p>
          </div>
          <div className="dashboard-status">
            <span>{isLoading ? "Analizuję..." : `${emailCount} maili`}</span>
          </div>
        </header>

        <form className="email-triage-workspace" onSubmit={handleSubmit}>
          <label className="email-triage-input">
            <span>Maile do analizy</span>
            <textarea
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Wklej maile tutaj - oddziel je pustą linią..."
              value={input}
            />
          </label>

          <div className="email-triage-actions">
            <button className="secondary-button" disabled={isLoading} onClick={() => setInput(sampleEmails)} type="button">
              📋 Wklej przykład
            </button>
            <button className="send-button email-triage-submit" disabled={isLoading || emailCount === 0} type="submit">
              📧 Analizuj maile
            </button>
          </div>
        </form>

        {error ? <div className="email-triage-error">{error}</div> : null}

        {(result || isLoading) ? (
          <section className="email-triage-results" aria-live="polite">
            <div className="email-triage-summary">
              <strong>{parsed.cards.length ? formatSummaryLine(counts) : "Analiza w toku..."}</strong>
              <span>{isLoading ? "Agent dopisuje kolejne karty" : "Gotowe do obsługi"}</span>
            </div>

            {parsed.cards.length > 0 ? (
              <div className="email-card-list">
                {parsed.cards.map((card) => (
                  <article className={`email-card ${card.priorityType}`} key={card.id}>
                    <div className="email-card-header">
                      <div>
                        <span>{getPriorityLabel(card.priorityType)}</span>
                        <h2>Mail {card.id}: {card.title}</h2>
                      </div>
                      <strong>{card.category || "Kategoryzuję..."}</strong>
                    </div>

                    <dl className="email-card-meta">
                      <div>
                        <dt>Priorytet</dt>
                        <dd>{card.priority || "W toku"}</dd>
                      </div>
                      <div>
                        <dt>Uzasadnienie</dt>
                        <dd>{card.reason || "Agent analizuje treść maila."}</dd>
                      </div>
                    </dl>

                    <div className="email-draft">
                      <div>
                        <strong>Proponowana odpowiedź</strong>
                        <button disabled={!card.draft} onClick={() => void copyDraft(card)} type="button">
                          {copiedDraft === card.id ? "Skopiowano" : "Kopiuj draft"}
                        </button>
                      </div>
                      <blockquote>{card.draft || "Draft pojawi się za chwilę..."}</blockquote>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <pre className="email-triage-raw">{result || "Łączę się z agentem..."}</pre>
            )}

            {parsed.summary ? (
              <div className="email-final-summary">
                <strong>Podsumowanie agenta</strong>
                <pre>{parsed.summary}</pre>
              </div>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
