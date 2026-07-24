"use client";

import { ChangeEvent, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";
import { useAuth } from "../components/AuthGate";
import { supabase } from "../../lib/supabase";

type Example = {
  label: string;
  pleadingType: string;
  caseContext: string;
  pleadingText: string;
};

type LegalBriefingSummary = {
  id: string;
  title: string | null;
  updated_at: string;
};

const examples: Example[] = [
  {
    label: "Sprzeciw od nakazu zapłaty",
    pleadingType: "Sprzeciw od nakazu zapłaty",
    caseContext: "Sprawa o zapłatę z faktur za usługi B2B. Powód dochodzi należności głównej i odsetek.",
    pleadingText:
      "Pozwany wnosi o oddalenie powództwa w całości. Zarzuca przedawnienie roszczenia, brak wykazania wymagalności faktur oraz brak legitymacji czynnej powoda z uwagi na cesję wierzytelności. Pozwany kwestionuje wysokość dochodzonej kwoty, wskazując, że część usług nie została wykonana prawidłowo. Wnosi o przesłuchanie dwóch świadków, zobowiązanie powoda do przedstawienia pełnej dokumentacji odbiorowej oraz dopuszczenie dowodu z opinii biegłego na okoliczność jakości wykonanych usług.",
  },
  {
    label: "Odpowiedź na pozew",
    pleadingType: "Odpowiedź na pozew",
    caseContext: "Spór kontraktowy o nienależyte wykonanie wdrożenia systemu informatycznego.",
    pleadingText:
      "Pozwany wnosi o oddalenie powództwa oraz zasądzenie kosztów procesu. Podnosi, że powód nie wykazał szkody ani adekwatnego związku przyczynowego. Według pozwanego opóźnienia wynikały z braku współdziałania powoda, niedostarczenia danych testowych i wielokrotnych zmian zakresu projektu. Pozwany zgłasza wniosek o przesłuchanie kierownika projektu, dopuszczenie korespondencji mailowej oraz przeprowadzenie dowodu z opinii biegłego informatyka.",
  },
  {
    label: "Apelacja przeciwnika",
    pleadingType: "Apelacja",
    caseContext: "Wyrok I instancji uwzględnił powództwo. Przeciwnik zaskarża wyrok w całości.",
    pleadingText:
      "Apelujący zarzuca naruszenie art. 233 k.p.c. przez dowolną, a nie swobodną ocenę dowodów oraz pominięcie istotnych dokumentów. Wskazuje na błędne ustalenie stanu faktycznego i niewłaściwe przyjęcie, że umowa została wykonana zgodnie z zamówieniem. Wnosi o zmianę wyroku przez oddalenie powództwa, ewentualnie uchylenie wyroku i przekazanie sprawy do ponownego rozpoznania. Apelujący wnosi także o dopuszczenie dowodu z uzupełniającej opinii biegłego.",
  },
];

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

function MarkdownLegal({ text }: { text: string }) {
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
          <div className="markdown-table-wrap legal-table-wrap" key={`table-${index}`}>
            <table className="markdown-table legal-table">
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
                      <td key={`${cell}-${cellIndex}`}>{renderInlineMarkdown(cell)}</td>
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

    if (trimmed.startsWith("# ")) {
      blocks.push(<h1 key={`h1-${index}`}>{renderInlineMarkdown(trimmed.slice(2))}</h1>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(<h2 key={`h2-${index}`}>{renderInlineMarkdown(trimmed.slice(3))}</h2>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(<h3 key={`h3-${index}`}>{renderInlineMarkdown(trimmed.slice(4))}</h3>);
      index += 1;
      continue;
    }

    if (/^(\d+\.|-|\*)\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];

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

  return <article className="legal-document">{blocks}</article>;
}

export function LegalOppositionPage({ standalone = false }: { standalone?: boolean } = {}) {
  const { user } = useAuth();
  const [pleadingType, setPleadingType] = useState("");
  const [caseContext, setCaseContext] = useState("");
  const [pleadingText, setPleadingText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [briefings, setBriefings] = useState<LegalBriefingSummary[]>([]);
  const [isBriefingsLoading, setIsBriefingsLoading] = useState(standalone);
  const [historyError, setHistoryError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadBriefings() {
    if (!standalone || !supabase || !user) {
      setIsBriefingsLoading(false);
      return;
    }

    setIsBriefingsLoading(true);
    const { data, error: queryError } = await supabase
      .from("conversations")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .like("title", "Legal Briefing:%")
      .order("updated_at", { ascending: false });

    if (queryError) {
      setHistoryError("Nie udało się wczytać Twojej historii briefingów.");
    } else {
      setBriefings((data ?? []) as LegalBriefingSummary[]);
      setHistoryError("");
    }

    setIsBriefingsLoading(false);
  }

  useEffect(() => {
    void loadBriefings();
  }, [standalone, user?.id]);

  async function saveBriefing(content: string) {
    if (!supabase || !user || !content.trim()) {
      return;
    }

    const title = `Legal Briefing: ${pleadingType.trim().slice(0, 100)}`;
    const userMessage = [
      `Rodzaj pisma: ${pleadingType.trim()}`,
      caseContext.trim() ? `Kontekst sprawy: ${caseContext.trim()}` : "",
      "",
      "Treść pisma przeciwnika:",
      pleadingText.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({ title, user_id: user.id })
      .select("id")
      .single();

    if (conversationError || !conversation) {
      throw conversationError ?? new Error("Nie udało się utworzyć briefingu.");
    }

    const { error: messagesError } = await supabase.from("messages").insert([
      { conversation_id: conversation.id, role: "user", content: userMessage },
      { conversation_id: conversation.id, role: "assistant", content: content.trim() },
    ]);

    if (messagesError) {
      throw messagesError;
    }

    await loadBriefings();
  }

  function applyExample(example: Example) {
    setPleadingType(example.pleadingType);
    setCaseContext(example.caseContext);
    setPleadingText(example.pleadingText);
    setFileName("");
    setFileError("");
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileError("");
    setFileName(file.name);

    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      let text = "";

      if (isPdf) {
        const { data: sessionData } = supabase
          ? await supabase.auth.getSession()
          : { data: { session: null } };
        const accessToken = sessionData.session?.access_token;
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/legal-opposition/parse-pdf", {
          method: "POST",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          body: formData,
        });
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          text?: string;
          pages?: number | null;
          truncated?: boolean;
        } | null;

        if (!response.ok || !data?.text) {
          throw new Error(data?.error ?? "Nie udało się odczytać PDF-a.");
        }

        text = data.text;
        setFileName(
          `${file.name}${data.pages ? ` • ${data.pages} stron` : ""}${data.truncated ? " • skrócono tekst" : ""}`,
        );
      } else {
        text = await file.text();
      }

      const cleanText = text.trim();

      if (!cleanText) {
        throw new Error("Plik nie zawiera tekstu możliwego do wczytania.");
      }

      setPleadingText(cleanText.slice(0, 18000));
    } catch (caughtError) {
      setFileError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się wczytać pliku.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pleadingType.trim() || pleadingText.trim().length < 80 || isLoading) {
      return;
    }

    setAnalysis("");
    setError("");
    setHistoryError("");
    setCopyStatus("");
    setIsLoading(true);

    try {
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/legal-opposition", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          pleadingType,
          pleadingText,
          caseContext,
        }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Nie udało się uruchomić briefingu pisma.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let completedAnalysis = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          const tail = decoder.decode();
          if (tail) {
            completedAnalysis += tail;
            setAnalysis((current) => current + tail);
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        completedAnalysis += chunk;
        setAnalysis((current) => current + chunk);
      }

      try {
        await saveBriefing(completedAnalysis);
      } catch (caughtError) {
        console.error("Legal briefing history save error:", caughtError);
        setHistoryError("Briefing jest gotowy, ale nie udało się zapisać go w Twojej historii.");
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udało się przygotować briefingu pisma.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyAnalysis() {
    if (!analysis.trim()) {
      return;
    }

    await navigator.clipboard.writeText(analysis.trim());
    setCopyStatus("Skopiowano");
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  return (
    <main className={standalone ? "legal-standalone-shell" : "dashboard-shell"}>
      {standalone ? null : <DashboardSidebar />}

      <section
        className={`dashboard-main legal-page${standalone ? " legal-standalone-page" : ""}`}
        aria-label="Legal Opposition Summarizer & Briefing Tool"
      >
        <header className="dashboard-hero legal-hero">
          <div>
            <span className="dashboard-kicker">Litigation briefing</span>
            <h1>⚖️ Legal Opposition Summarizer & Briefing Tool</h1>
            <p>Wyciąga z pism przeciwnika główną tezę, kluczowe zarzuty, wnioski procesowe i tropy do kontrargumentacji.</p>
          </div>
          <div className="dashboard-status">
            <span>{isLoading ? "Analizuję..." : "Gotowy"}</span>
          </div>
        </header>

        <section className="legal-workspace">
          <form className="legal-form" onSubmit={handleSubmit}>
            <div className="legal-brief-grid">
              <label>
                <span>Rodzaj pisma przeciwnika</span>
                <input
                  disabled={isLoading}
                  onChange={(event) => setPleadingType(event.target.value)}
                  placeholder="Np. apelacja, sprzeciw od nakazu zapłaty"
                  value={pleadingType}
                />
              </label>

              <label>
                <span>Kontekst sprawy</span>
                <input
                  disabled={isLoading}
                  onChange={(event) => setCaseContext(event.target.value)}
                  placeholder="Np. sprawa o zapłatę, odpowiedź na apelację"
                  value={caseContext}
                />
              </label>
            </div>

            <div className="legal-file-row">
              <input
                accept=".pdf,.txt,.md,.rtf,.csv,.log,application/pdf,text/plain,text/markdown,application/rtf,text/csv"
                className="hidden-file-input"
                onChange={(event) => void handleFileChange(event)}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="secondary-button"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                📎 Wczytaj PDF lub plik tekstowy
              </button>
              <span>{fileName || "Możesz też wkleić treść pisma niżej."}</span>
            </div>

            {fileError ? <div className="legal-error">{fileError}</div> : null}

            <label>
              <span>Treść pisma przeciwnika</span>
              <textarea
                className="legal-claims"
                disabled={isLoading}
                onChange={(event) => setPleadingText(event.target.value)}
                placeholder="Wklej treść sprzeciwu, apelacji, odpowiedzi na pozew albo wczytaj PDF..."
                value={pleadingText}
              />
            </label>

            <div className="legal-actions">
              <button className="send-button legal-submit" disabled={isLoading || !pleadingType.trim() || pleadingText.trim().length < 80} type="submit">
                ⚖️ Przygotuj briefing
              </button>
            </div>
          </form>

          <div className="legal-examples" aria-label="Przykłady briefingów procesowych">
            {examples.map((example) => (
              <button disabled={isLoading} key={example.label} onClick={() => applyExample(example)} type="button">
                {example.label}
              </button>
            ))}
          </div>

          <p className="legal-disclaimer">
            Narzędzie pomija koszty i wyliczenia. Wynik jest roboczym briefingiem do weryfikacji w aktach i aktualnym orzecznictwie.
          </p>
        </section>

        {standalone ? (
          <section className="legal-history" aria-label="Moje briefingi">
            <div className="legal-history-heading">
              <div>
                <span className="dashboard-kicker">Prywatna historia</span>
                <h2>Moje briefingi</h2>
              </div>
              <span>{briefings.length} zapisanych</span>
            </div>

            {historyError ? <div className="legal-error">{historyError}</div> : null}
            {isBriefingsLoading ? (
              <div className="legal-history-empty">Wczytywanie Twojej historii...</div>
            ) : briefings.length === 0 ? (
              <div className="legal-history-empty">Nie masz jeszcze zapisanych briefingów.</div>
            ) : (
              <div className="legal-history-list">
                {briefings.map((briefing) => (
                  <a className="legal-history-item" href={`/history/${briefing.id}`} key={briefing.id}>
                    <strong>{(briefing.title ?? "Legal Briefing").replace("Legal Briefing: ", "")}</strong>
                    <span>
                      {new Intl.DateTimeFormat("pl-PL", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(briefing.updated_at))}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {error ? <div className="legal-error">{error}</div> : null}

        {(analysis || isLoading) ? (
          <section className="legal-result" aria-live="polite">
            <div className="legal-result-actions">
              <div>
                <strong>{isLoading ? "Briefing powstaje..." : "Briefing gotowy"}</strong>
                <span>{pleadingType || "pismo procesowe"}</span>
              </div>
              <button disabled={!analysis.trim()} onClick={() => void copyAnalysis()} type="button">
                {copyStatus || "📋 Kopiuj briefing"}
              </button>
            </div>

            {analysis ? <MarkdownLegal text={analysis} /> : <div className="legal-loading">Agent syntetyzuje tezy, zarzuty i wnioski...</div>}
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default LegalOppositionPage;
