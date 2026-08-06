"use client";

import { ChangeEvent, DragEvent, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DashboardSidebar } from "../components/DashboardSidebar";
import { GoldIcon, type IconName } from "../components/GoldIcon";
import { useAuth } from "../components/AuthGate";
import { supabase } from "../../lib/supabase";
import type { LegalPdfCitation } from "../components/LegalPdfViewer";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

const LegalPdfViewer = dynamic(() => import("../components/LegalPdfViewer"), { ssr: false });

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

type AnalysisMode = "full" | "fast";

type DocumentPage = {
  number: number;
  text: string;
};

const pleadingTypeOptions = [
  "Sprzeciw od nakazu zapłaty",
  "Odpowiedź na pozew",
  "Pismo przygotowawcze",
  "Apelacja",
  "Zażalenie",
  "Inne pismo procesowe",
];

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

function splitDocumentPages(text: string): DocumentPage[] {
  const marker = /\[--- STRONA (\d+) ---\]/g;
  const matches = Array.from(text.matchAll(marker));

  if (matches.length === 0) {
    return [{ number: 1, text: text.trim() }];
  }

  return matches.map((match, index) => ({
    number: Number(match[1]),
    text: text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length).trim(),
  }));
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

function renderLegalInline(text: string, onPageReference?: (page: number) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\[--- STRONA (\d+) ---\]|\[(?:str\.?|s\.)\s*(\d+)\]|\((?:str\.?|s\.)\s*(\d+)\)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderInlineMarkdown(text.slice(lastIndex, match.index)));
    }

    const page = Number(match[1] || match[2] || match[3]);
    nodes.push(
      <button
        className="legal-page-reference"
        key={`page-reference-${match.index}-${page}`}
        onClick={() => onPageReference?.(page)}
        type="button"
      >
        str. {page}
      </button>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(...renderInlineMarkdown(text.slice(lastIndex)));
  }

  return nodes.length > 0 ? nodes : renderInlineMarkdown(text);
}

function getReferencedPages(text: string) {
  const regex = /\[--- STRONA (\d+) ---\]|\[(?:str\.?|s\.)\s*(\d+)\]|\((?:str\.?|s\.)\s*(\d+)\)/gi;
  return Array.from(text.matchAll(regex))
    .map((match) => Number(match[1] || match[2] || match[3]))
    .filter((page) => Number.isFinite(page));
}

function getPageReferencePattern(pageNumber: number) {
  return new RegExp(
    `(?:\\[---\\s*STRONA\\s+${pageNumber}\\s+---\\]|\\[(?:str\\.?|s\\.)\\s*${pageNumber}\\]|\\((?:str\\.?|s\\.)\\s*${pageNumber}\\))`,
    "i",
  );
}

function getSourceEvidence(pageText: string, analysisText: string, pageNumber: number) {
  const normalizedPageText = pageText.replace(/\s+/g, " ").trim();
  if (!normalizedPageText) {
    return "Brak tekstu możliwego do podświetlenia na tej stronie.";
  }

  const relevantSentence = analysisText
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => getPageReferencePattern(pageNumber).test(sentence));
  const keywords = (relevantSentence ?? analysisText)
    .replace(/\[---\s*STRONA\s+\d+\s+---\]/gi, "")
    .replace(/\[(?:str\.?|s\.)\s*\d+\]|\((?:str\.?|s\.)\s*\d+\)/gi, "")
    .toLocaleLowerCase("pl-PL")
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((word) => word.length >= 5);

  const lines = pageText
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 20);
  const bestLine = lines
    .map((line, index) => ({
      index,
      line,
      score: keywords.reduce(
        (score, keyword) => score + (line.toLocaleLowerCase("pl-PL").includes(keyword) ? 1 : 0),
        0,
      ),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.line;

  return (bestLine ?? normalizedPageText).slice(0, 520).trim();
}

function renderHighlightedSource(pageText: string, analysisText: string, pageNumber: number): ReactNode {
  const evidence = getSourceEvidence(pageText, analysisText, pageNumber);
  const normalizedPageText = pageText.replace(/\s+/g, " ").trim();
  const matchIndex = normalizedPageText.toLocaleLowerCase("pl-PL").indexOf(evidence.toLocaleLowerCase("pl-PL"));

  if (matchIndex >= 0) {
    return (
      <>
        {normalizedPageText.slice(0, matchIndex)}
        <mark>{normalizedPageText.slice(matchIndex, matchIndex + evidence.length)}</mark>
        {normalizedPageText.slice(matchIndex + evidence.length, matchIndex + evidence.length + 220)}
      </>
    );
  }

  return <mark>{evidence}</mark>;
}

function getAnalysisSectionIcon(title: string): IconName | null {
  const normalized = title.toLocaleLowerCase("pl-PL");

  if (normalized.includes("główne tezy") || normalized.includes("główna teza")) {
    return "bookmark";
  }

  if (normalized.includes("zarzut")) {
    return "legal";
  }

  if (normalized.includes("kontrargument") || normalized.includes("strateg")) {
    return "security";
  }

  if (normalized.includes("braki") || normalized.includes("ryzyk")) {
    return "warning";
  }

  if (normalized.includes("checklist")) {
    return "briefings";
  }

  return null;
}

function MarkdownLegal({ text, onPageReference }: { text: string; onPageReference?: (page: number) => void }) {
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
                    <th key={cell}>{renderLegalInline(cell, onPageReference)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rowIndex) => (
                  <tr key={`${row.join("-")}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${cell}-${cellIndex}`}>{renderLegalInline(cell, onPageReference)}</td>
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
      blocks.push(<h1 key={`h1-${index}`}>{renderLegalInline(trimmed.slice(2), onPageReference)}</h1>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      const title = trimmed.slice(3);
      const icon = getAnalysisSectionIcon(title);
      blocks.push(
        <h2 className={icon ? "legal-analysis-heading" : undefined} key={`h2-${index}`}>
          {icon ? <GoldIcon name={icon} size={22} /> : null}
          <span>{renderLegalInline(title, onPageReference)}</span>
        </h2>,
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      const title = trimmed.slice(4);
      const icon = getAnalysisSectionIcon(title);
      blocks.push(
        <h3 className={icon ? "legal-analysis-heading" : undefined} key={`h3-${index}`}>
          {icon ? <GoldIcon name={icon} size={19} /> : null}
          <span>{renderLegalInline(title, onPageReference)}</span>
        </h3>,
      );
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
          {items.map((item, itemIndex) => {
            const checklistMatch = item.match(/^\[([ xX])\]\s+(.*)$/);
            const itemText = checklistMatch?.[2] ?? item;

            return (
              <li className={checklistMatch ? "legal-checklist-item" : undefined} key={`${item}-${itemIndex}`}>
                {checklistMatch ? (
                  <span aria-hidden="true" className="legal-check-box">
                    {checklistMatch[1].trim() ? "✓" : ""}
                  </span>
                ) : null}
                <span>{renderLegalInline(itemText, onPageReference)}</span>
              </li>
            );
          })}
        </ListTag>,
      );
      continue;
    }

    blocks.push(<p key={`p-${index}`}>{renderLegalInline(trimmed, onPageReference)}</p>);
    index += 1;
  }

  return <article className="legal-document">{blocks}</article>;
}

function PdfDocumentPage({
  analysis,
  page,
  pageNumber,
  pdfUrl,
}: {
  analysis: string;
  page: DocumentPage;
  pageNumber: number;
  pdfUrl: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderPdfPage() {
      setIsLoading(true);
      setError("");

      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const pdf = await pdfjs.getDocument({ url: pdfUrl }).promise;
        const pdfPage = await pdf.getPage(pageNumber);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(viewerRef.current?.clientWidth ?? 0, 520);
        const scale = Math.min(1.8, Math.max(0.85, (availableWidth - 28) / baseViewport.width));
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        const textLayer = textLayerRef.current;

        if (cancelled || !canvas || !textLayer) {
          return;
        }

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        textLayer.replaceChildren();

        await pdfPage.render({
          canvas,
          canvasContext: canvas.getContext("2d") as CanvasRenderingContext2D,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        }).promise;

        const textContent = await pdfPage.getTextContent();
        const evidenceTerms = getSourceEvidence(page.text, analysis, pageNumber)
          .toLocaleLowerCase("pl-PL")
          .split(/[^\p{L}\p{N}]+/gu)
          .filter((term) => term.length >= 5);

        for (const item of textContent.items as Array<{ str?: string; transform?: number[] }>) {
          if (!item.str || !item.transform) {
            continue;
          }

          const transform = pdfjs.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.max(8, Math.hypot(transform[2], transform[3]));
          const span = document.createElement("span");
          const itemText = item.str.toLocaleLowerCase("pl-PL");
          const matchingTerms = evidenceTerms.filter((term) => itemText.includes(term));

          span.textContent = item.str;
          span.style.left = `${transform[4]}px`;
          span.style.top = `${transform[5] - fontHeight}px`;
          span.style.fontSize = `${fontHeight}px`;
          span.style.transform = `rotate(${Math.atan2(transform[1], transform[0])}rad)`;
          span.style.transformOrigin = "0 0";
          span.className = matchingTerms.length > 0 ? "is-evidence" : "";
          textLayer.appendChild(span);
        }

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Nie udało się wyświetlić strony PDF.");
          setIsLoading(false);
        }
      }
    }

    void renderPdfPage();
    return () => {
      cancelled = true;
    };
  }, [analysis, page.number, page.text, pageNumber, pdfUrl]);

  return (
    <div className="legal-pdf-page-stage" ref={viewerRef}>
      <div className="legal-pdf-page-canvas">
        <canvas ref={canvasRef} />
        <div aria-label="Warstwa tekstowa dokumentu PDF" className="legal-pdf-text-layer" ref={textLayerRef} />
      </div>
      {isLoading ? <div className="legal-pdf-page-status">Wczytywanie strony {pageNumber}...</div> : null}
      {error ? <div className="legal-pdf-page-status legal-pdf-page-error">{error}</div> : null}
    </div>
  );
}

function DocumentPreview({
  analysis,
  documentPages,
  fileName,
  documentPreviewUrl,
  activeDocumentPage,
  citedPages,
  onPageSelect,
  pageRefs,
}: {
  analysis: string;
  documentPages: DocumentPage[];
  fileName: string;
  documentPreviewUrl: string;
  activeDocumentPage: number;
  citedPages: Set<number>;
  onPageSelect: (page: number) => void;
  pageRefs: { current: Record<number, HTMLElement | null> };
}) {
  return (
    <div className="legal-pdf-preview">
      <div className="legal-pdf-preview-heading">
        <span className="legal-clean-kicker">PRZEGLĄDARKA DOKUMENTU PDF</span>
        {documentPages.length > 0 ? <span>{documentPages.length} {documentPages.length === 1 ? "strona" : "stron"}</span> : null}
      </div>
      {documentPages.length > 0 ? (
        <>
          <div className="legal-pdf-viewer-toolbar">
            <span className="legal-pdf-viewer-file">{fileName || "Dokument procesowy.pdf"}</span>
            <span>Strona {activeDocumentPage} / {documentPages.length}</span>
          </div>
          {documentPreviewUrl ? (
            <LegalPdfViewer
              citation={
                analysis.trim()
                  ? {
                      pageNumber: activeDocumentPage,
                      quote: getSourceEvidence(
                        documentPages.find((page) => page.number === activeDocumentPage)?.text ?? "",
                        analysis,
                        activeDocumentPage,
                      ),
                    }
                  : null
              }
              file={documentPreviewUrl}
              fileName={fileName}
              onPageChange={onPageSelect}
            />
          ) : null}
          {documentPreviewUrl ? (
            <div className={`legal-native-pdf${citedPages.has(activeDocumentPage) ? " is-cited" : ""}`}>
              <div className="legal-native-pdf-label">
                <span>AKTYWNA STRONA: {activeDocumentPage}</span>
                {citedPages.has(activeDocumentPage) ? <strong>CYTOWANA W RAPORCIE</strong> : null}
              </div>
              <PdfDocumentPage
                analysis={analysis}
                page={documentPages.find((page) => page.number === activeDocumentPage) ?? documentPages[0]}
                pageNumber={activeDocumentPage}
                pdfUrl={documentPreviewUrl}
              />
              <iframe
                key={`${documentPreviewUrl}-${activeDocumentPage}`}
                src={`${documentPreviewUrl}#page=${activeDocumentPage}`}
                title={`Podgląd dokumentu PDF — strona ${activeDocumentPage}`}
              />
              {analysis.trim() ? (
                <div className="legal-source-evidence" aria-live="polite">
                  <div className="legal-source-evidence-heading">
                    <span>FRAGMENT ŹRÓDŁOWY · STRONA {activeDocumentPage}</span>
                    <strong>Podstawa analizy</strong>
                  </div>
                  <p>
                    {renderHighlightedSource(
                      documentPages.find((page) => page.number === activeDocumentPage)?.text ?? "",
                      analysis,
                      activeDocumentPage,
                    )}
                  </p>
                  <small>Podświetlono fragment tekstu źródłowego powiązany z wybraną stroną raportu.</small>
                </div>
              ) : null}
              <div className="legal-pdf-viewer-controls" aria-label="Przewijanie stron dokumentu">
                <button disabled={activeDocumentPage <= documentPages[0].number} onClick={() => onPageSelect(activeDocumentPage - 1)} type="button">
                  ‹
                </button>
                <span>{activeDocumentPage}</span>
                <button disabled={activeDocumentPage >= documentPages[documentPages.length - 1].number} onClick={() => onPageSelect(activeDocumentPage + 1)} type="button">
                  ›
                </button>
              </div>
            </div>
          ) : (
            <div className="legal-document-pages">
              {documentPages.map((page) => (
                <article
                  className={`legal-document-page${activeDocumentPage === page.number ? " is-active" : ""}${citedPages.has(page.number) ? " is-cited" : ""}`}
                  key={page.number}
                  ref={(element) => {
                    pageRefs.current[page.number] = element;
                  }}
                >
                  <header>
                    <span>STRONA {page.number}</span>
                    {citedPages.has(page.number) ? <strong>CYTOWANA W RAPORCIE</strong> : null}
                  </header>
                  <pre>{page.text || "Brak tekstu na tej stronie."}</pre>
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="legal-preview-empty">
          <GoldIcon name="page" size={24} />
          <h2>Podgląd PDF pojawi się tutaj</h2>
          <p>Wgraj plik PDF w strefie powyżej, aby przejrzeć dokument przed analizą.</p>
        </div>
      )}
    </div>
  );
}

export function LegalOppositionPage({ standalone = false }: { standalone?: boolean } = {}) {
  const { user } = useAuth();
  const [pleadingType, setPleadingType] = useState(pleadingTypeOptions[0]);
  const [caseContext, setCaseContext] = useState("");
  const [pleadingText, setPleadingText] = useState("");
  const [fileName, setFileName] = useState("");
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState("");
  const [documentPages, setDocumentPages] = useState<DocumentPage[]>([]);
  const [activeDocumentPage, setActiveDocumentPage] = useState(1);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("full");
  const [fileError, setFileError] = useState("");
  const [isFileDragging, setIsFileDragging] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [flashcard, setFlashcard] = useState("");
  const [isFlashcardLoading, setIsFlashcardLoading] = useState(false);
  const [flashcardError, setFlashcardError] = useState("");
  const [briefings, setBriefings] = useState<LegalBriefingSummary[]>([]);
  const [isBriefingsLoading, setIsBriefingsLoading] = useState(standalone);
  const [historyError, setHistoryError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const documentPageRefs = useRef<Record<number, HTMLElement | null>>({});

  useEffect(() => {
    return () => {
      if (documentPreviewUrl) {
        URL.revokeObjectURL(documentPreviewUrl);
      }
    };
  }, [documentPreviewUrl]);

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
    setDocumentPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setDocumentPages([{ number: 1, text: example.pleadingText }]);
    setActiveDocumentPage(1);
  }

  async function processFile(file: File) {
    if (!file) {
      return;
    }

    setFileError("");
    setFileName(file.name);

    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

      if (!isPdf) {
        throw new Error("Wgraj plik PDF, aby uruchomić analizę dokumentu.");
      }

      setDocumentPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return isPdf ? URL.createObjectURL(file) : "";
      });
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
      }

      const cleanText = text.trim();

      if (!cleanText) {
        throw new Error("Plik nie zawiera tekstu możliwego do wczytania.");
      }

      setPleadingText(cleanText.slice(0, 18000));
      const pages = splitDocumentPages(cleanText.slice(0, 18000));
      setDocumentPages(pages);
      setActiveDocumentPage(pages[0]?.number ?? 1);
    } catch (caughtError) {
      setFileError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się wczytać pliku.",
      );
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      void processFile(file);
    }
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsFileDragging(false);

    if (!isLoading) {
      const file = event.dataTransfer.files?.[0];
      if (file) {
        void processFile(file);
      }
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
    setFlashcard("");
    setFlashcardError("");
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
          analysisMode,
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

  async function createFlashcard() {
    if (!analysis.trim() || isFlashcardLoading) {
      return;
    }

    setIsFlashcardLoading(true);
    setFlashcardError("");

    try {
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/legal-opposition/flashcard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ analysis, pleadingType }),
      });
      const data = (await response.json().catch(() => null)) as { flashcard?: string; error?: string } | null;

      if (!response.ok || !data?.flashcard) {
        throw new Error(data?.error ?? "Nie udało się przygotować fiszki.");
      }

      setFlashcard(data.flashcard);
    } catch (caughtError) {
      setFlashcardError(caughtError instanceof Error ? caughtError.message : "Nie udało się przygotować fiszki.");
    } finally {
      setIsFlashcardLoading(false);
    }
  }

  async function handleDownloadPDFLegacy() {
    if (!analysis.trim() || isPdfLoading) {
      return;
    }

    const reportContent = document.getElementById("report-content");
    if (!reportContent) {
      setError("Nie znaleziono treści raportu do pobrania.");
      return;
    }

    setIsPdfLoading(true);
    setError("");

    let exportContent: HTMLElement | null = null;

    try {
      const { default: html2pdf } = await import("html2pdf.js");
      exportContent = reportContent.cloneNode(true) as HTMLElement;
      exportContent.id = "report-content-export";
      exportContent.classList.add("pdf-export-content");

      const exportHeader = document.createElement("div");
      exportHeader.className = "pdf-export-header";
      exportHeader.innerHTML = `
        <span>LITIGATION BRIEFING TOOL - RAPORT</span>
        <strong>Analiza pisma procesowego</strong>
        <small>Typ dokumentu: ${pleadingType || "Pismo procesowe"}</small>
      `;
      exportContent.prepend(exportHeader);
      exportContent.querySelector(".legal-report-title")?.remove();

      exportContent.querySelectorAll("[data-pdf-hide]").forEach((element) => element.remove());
      exportContent.querySelectorAll("button").forEach((button) => {
        const reference = document.createElement("span");
        reference.className = "pdf-page-reference";
        reference.textContent = button.textContent ?? "";
        button.replaceWith(reference);
      });

      Object.assign(exportContent.style, {
        boxSizing: "border-box",
        display: "block",
        height: "auto",
        maxHeight: "none",
        minHeight: "0",
        overflow: "visible",
        position: "absolute",
        left: "0",
        top: "0",
        width: "794px",
        zIndex: "9999",
        pointerEvents: "none",
      });
      document.body.appendChild(exportContent);

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      const date = new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());

      const pdfWorker = html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `Analiza_LexAI_${date}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            backgroundColor: "#111318",
            scale: 2,
            useCORS: true,
            logging: false,
            scrollX: 0,
            scrollY: 0,
            windowWidth: 794,
            windowHeight: Math.max(900, exportContent.scrollHeight),
          },
          jsPDF: { format: "a4", orientation: "portrait", unit: "mm" },
        })
        .from(exportContent)
        .toPdf();
      const pdf = await pdfWorker.get("pdf");
      const pageCount = pdf.internal.getNumberOfPages();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFontSize(8);
        pdf.setTextColor(105, 105, 105);
        pdf.text("Legal Opposition Summarizer", 15, pageHeight - 10);
        pdf.text(`${page}/${pageCount}`, pageWidth - 15, pageHeight - 10, { align: "right" });
      }

      await pdfWorker.save();
    } catch (caughtError) {
      console.error("Legal briefing PDF export error:", caughtError);
      setError("Nie udało się wygenerować pliku PDF. Spróbuj ponownie.");
    } finally {
      exportContent?.remove();
      setIsPdfLoading(false);
    }
  }

  async function handleDownloadPDF() {
    if (!analysis.trim() || isPdfLoading) {
      return;
    }

    setIsPdfLoading(true);
    setError("");

    try {
      const [pdfMakeModule, pdfFontsModule] = await Promise.all([
        import("pdfmake/build/pdfmake.js"),
        import("pdfmake/build/vfs_fonts.js"),
      ]);
      const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as unknown as {
        vfs?: Record<string, string>;
        addVirtualFileSystem?: (vfs: Record<string, string>) => void;
        createPdf: (definition: TDocumentDefinitions) => { download: (filename: string) => void };
      };
      const fonts = (pdfFontsModule.default ?? pdfFontsModule) as unknown as
        | Record<string, string>
        | { vfs: Record<string, string> };
      const vfs = ("vfs" in fonts ? fonts.vfs : fonts) as Record<string, string>;

      if (pdfMake.addVirtualFileSystem) {
        pdfMake.addVirtualFileSystem(vfs);
      } else {
        pdfMake.vfs = vfs;
      }

      const cleanPdfText = (value: string) => value
        .replace(/\[---\s*STRONA\s+(\d+)\s+---\]/gi, " (str. $1)")
        .replace(/\*\*/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const content: Content[] = [];
      const lines = analysis.split("\n");

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || /^#\s*Legal Briefing/i.test(line) || /^Data briefingu:/i.test(line) || /^Zakres [źz]r[oó]d[lł]a:/i.test(line)) {
          continue;
        }

        if (/^Rodzaj pisma:/i.test(line)) {
          continue;
        }

        if (line.startsWith("### ")) {
          content.push({ text: cleanPdfText(line.slice(4)), style: "itemTitle" });
          continue;
        }

        if (line.startsWith("## ")) {
          content.push({ text: cleanPdfText(line.slice(3)), style: "sectionTitle" });
          continue;
        }

        if (line.startsWith("# ")) {
          content.push({ text: cleanPdfText(line.slice(2)), style: "documentTitle" });
          continue;
        }

        if (/^\|?\s*[-:]+\s*\|/.test(line)) {
          continue;
        }

        if (line.startsWith("|")) {
          const cells = line.replace(/^\||\|$/g, "").split("|").map((cell) => cleanPdfText(cell));
          content.push({ text: cells.join(" - "), style: "bodyText" });
          continue;
        }

        const labelMatch = line.match(/^(Typ zarzutu|Opis|Kontrargument|Cel procesowy):\s*(.*)$/i);
        if (labelMatch) {
          content.push({
            text: [
              { text: `${labelMatch[1]}: `, bold: true },
              cleanPdfText(labelMatch[2]),
            ],
            style: "bodyText",
          });
          continue;
        }

        content.push({ text: cleanPdfText(line.replace(/^[-*]\s+/, "• ")), style: "bodyText" });
      }

      const definition: TDocumentDefinitions = {
        pageSize: "A4",
        pageMargins: [56, 54, 56, 54],
        defaultStyle: {
          font: "Roboto",
          fontSize: 10.5,
          color: "#111111",
          lineHeight: 1.35,
        },
        header: {
          text: "LITIGATION BRIEFING TOOL - RAPORT",
          alignment: "center",
          margin: [56, 24, 56, 0],
          fontSize: 8,
          bold: true,
          characterSpacing: 1.2,
          color: "#555555",
        },
        footer: (currentPage: number, pageCount: number) => ({
          columns: [
            { text: "Legal Opposition Summarizer", alignment: "left" },
            { text: `${currentPage}/${pageCount}`, alignment: "right" },
          ],
          margin: [56, 12, 56, 0],
          fontSize: 8,
          color: "#666666",
        }),
        content: [
          { text: "Analiza pisma procesowego", style: "documentTitle" },
          { text: `Typ dokumentu: ${pleadingType}`, style: "documentMeta" },
          ...content,
        ],
        styles: {
          documentTitle: {
            fontSize: 17,
            bold: true,
            alignment: "center",
            margin: [0, 12, 0, 20],
            color: "#0f172a",
          },
          documentMeta: {
            fontSize: 9,
            color: "#555555",
            margin: [0, 0, 0, 16],
          },
          sectionTitle: {
            fontSize: 12,
            bold: true,
            color: "#0f172a",
            margin: [0, 16, 0, 6],
            decoration: "underline",
          },
          itemTitle: {
            fontSize: 11,
            bold: true,
            color: "#0f172a",
            margin: [0, 8, 0, 3],
          },
          bodyText: {
            fontSize: 10.5,
            color: "#1e293b",
            alignment: "justify",
            margin: [0, 0, 0, 7],
          },
        },
      };

      const date = new Date().toISOString().slice(0, 10);
      pdfMake.createPdf(definition).download(`Analiza_Procesowa_${date}.pdf`);
    } catch (caughtError) {
      console.error("Legal briefing PDF export error:", caughtError);
      setError("Nie udało się wygenerować pliku PDF. Spróbuj ponownie.");
    } finally {
      setIsPdfLoading(false);
    }
  }

  function downloadAnalysisPdf() {
    void handleDownloadPDF();
  }

  function focusDocumentPage(page: number) {
    const targetPage = documentPages.some((item) => item.number === page) ? page : documentPages[0]?.number ?? 1;
    setActiveDocumentPage(targetPage);
    window.requestAnimationFrame(() => {
      documentPageRefs.current[targetPage]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  const citedPages = new Set(getReferencedPages(analysis));

  return (
    <main className={`${standalone ? "legal-standalone-shell" : "dashboard-shell"} legal-app-shell`}>
      {standalone ? null : <DashboardSidebar />}

      <section
        className={`dashboard-main legal-page${standalone ? " legal-standalone-page" : ""}`}
        aria-label="Legal Opposition Summarizer & Briefing Tool"
      >
        <header className="dashboard-hero legal-hero">
          <div>
            <span className="agent-header-badge legal-tool-badge">LEXAI · LEGAL BRIEFING</span>
            <h1>Analizator pism procesowych</h1>
            <p>Przekształć pismo procesowe w klarowną mapę zarzutów, kontrargumentów i rekomendowanych wniosków procesowych.</p>
          </div>
          <div className="dashboard-status">
            <span>{isLoading ? "Analizuję..." : "Gotowy"}</span>
          </div>
        </header>

        <nav aria-label="Moduły aplikacji" className="legal-module-tabs">
          <a className="legal-module-tab is-active" href="#analiza-pisma">Analiza pisma</a>
        </nav>

        <section className="legal-workspace" id="analiza-pisma">
          <div className="legal-split-screen">
            <div className="legal-left-column">
            <div className="legal-input-panel">
              <div className="legal-panel-heading">
                <span className="legal-clean-kicker">DOKUMENT DO ANALIZY</span>
                <h2>Wybierz dokument i przygotuj pismo do analizy.</h2>
              </div>

              <form className="legal-form" onSubmit={handleSubmit}>
                <div className="legal-brief-grid">
                  <label>
                    <span>Typ dokumentu</span>
                    <select disabled={isLoading} onChange={(event) => setPleadingType(event.target.value)} value={pleadingType}>
                      {pleadingTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>

                <div
                  className={`legal-dropzone${isFileDragging ? " is-dragging" : ""}${fileName ? " has-file" : ""}`}
                  onDragLeave={() => setIsFileDragging(false)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!isLoading) setIsFileDragging(true);
                  }}
                  onDrop={handleFileDrop}
                >
                  <input
                  accept=".pdf,application/pdf"
                    className="hidden-file-input"
                    onChange={(event) => void handleFileChange(event)}
                    ref={fileInputRef}
                    type="file"
                  />
                  <span aria-hidden="true" className="legal-dropzone-icon"><GoldIcon name="page" size={22} /></span>
                  <div className="legal-dropzone-copy">
                    <strong>{fileName || "Przeciągnij plik PDF tutaj"}</strong>
                    <span>{fileName ? "Plik jest gotowy do analizy." : "PDF zostanie automatycznie zamieniony na tekst"}</span>
                  </div>
                  <button className="legal-file-button" disabled={isLoading} onClick={() => fileInputRef.current?.click()} type="button">
                    Wybierz plik PDF
                  </button>
                </div>

                {fileError ? <div className="legal-error">{fileError}</div> : null}

                <div className="legal-analysis-mode">
                  <label>
                    <span>Tryb analizy</span>
                    <select disabled={isLoading} onChange={(event) => setAnalysisMode(event.target.value as AnalysisMode)} value={analysisMode}>
                      <option value="full">Pełna analiza procesowa — dokładniejsza</option>
                      <option value="fast">Szybka analiza — krótsza odpowiedź</option>
                    </select>
                  </label>
                  <p>Tryb szybki ogranicza rozumowanie i liczbę elementów, aby skrócić czas oczekiwania.</p>
                </div>

                <div className="legal-actions">
                  <button className="send-button legal-submit" disabled={isLoading || !pleadingType.trim() || pleadingText.trim().length < 80} type="submit">
                    <GoldIcon name="legal" size={16} /> {isLoading ? "Analizuję pismo..." : "Przeanalizuj pismo"}
                  </button>
                </div>
              </form>

            </div>

            <div className="legal-document-panel">
              <DocumentPreview
                activeDocumentPage={activeDocumentPage}
                analysis={analysis}
                citedPages={citedPages}
                documentPages={documentPages}
                documentPreviewUrl={documentPreviewUrl}
                fileName={fileName}
                onPageSelect={focusDocumentPage}
                pageRefs={documentPageRefs}
              />
            </div>
            <div className="legal-examples" aria-label="Przykłady briefingów procesowych">
              <span>Wczytaj przykład:</span>
              {examples.map((example) => (
                <button disabled={isLoading} key={example.label} onClick={() => applyExample(example)} type="button">
                  {example.label}
                </button>
              ))}
            </div>
            <p className="legal-disclaimer">
              Wynik jest roboczym briefingiem do weryfikacji w aktach i aktualnym orzecznictwie.
            </p>
            </div>

          <section aria-label="Raport z analizy prawnej" className="legal-preview-panel legal-report-section">
            <div className="legal-preview-header">
              <div>
                <span className="legal-clean-kicker legal-report-brand">LITIGATION BRIEFING TOOL <em>— RAPORT</em></span>
                <div className="legal-briefing-result-heading">
                  <span><GoldIcon name="legal" size={18} /></span>
                  <div>
                    <span className="legal-clean-kicker">BRIEFING</span>
                    <strong>Wyniki analizy</strong>
                  </div>
                </div>
              </div>
              <div className="legal-analysis-actions">
                <button disabled={!analysis.trim() || isFlashcardLoading} onClick={() => void createFlashcard()} type="button">
                  <GoldIcon name="legal" size={15} /> {isFlashcardLoading ? "Tworzę fiszkę..." : "Fiszka na Rozprawę"}
                </button>
                <button disabled={!analysis.trim() || isPdfLoading} onClick={() => void handleDownloadPDF()} type="button">
                  {isPdfLoading ? <span aria-hidden="true" className="pdf-loading-spinner" /> : <GoldIcon name="download" size={15} />}
                  {isPdfLoading ? "Generowanie PDF..." : "Pobierz PDF"}
                </button>
                {analysis ? (
                  <button disabled={!analysis.trim()} onClick={() => void copyAnalysis()} type="button">
                    {copyStatus || <><GoldIcon name="copy" size={15} /> Kopiuj</>}
                  </button>
                ) : null}
              </div>
            </div>

            <div aria-live="polite" className="legal-report-preview" id="report-content">
              <div className="legal-report-title">
                <span className="legal-clean-kicker">BRIEFING</span>
                <strong>{isLoading ? "Briefing powstaje..." : analysis ? "Analiza gotowa" : "Twoje wyniki pojawią się tutaj"}</strong>
              </div>
              {isLoading && !analysis ? (
                <div className="legal-loading">LexAI syntetyzuje tezy, zarzuty i wnioski...</div>
              ) : analysis ? (
                <>
                  {documentPages.length > 0 ? (
                    <section className="legal-analysis-source" aria-label="Podstawa analizy">
                      <span className="legal-clean-kicker">PODSTAWA ANALIZY</span>
                      <p>
                        Analiza opiera się na treści {fileName ? `dokumentu „${fileName}”` : "wgranego pisma procesowego"}.
                        Kliknij stronę, aby podświetlić ją w podglądzie PDF.
                      </p>
                      <div data-pdf-hide="true">
                        {documentPages.map((page) => (
                          <button
                            className={citedPages.has(page.number) ? "is-cited" : ""}
                            key={page.number}
                            onClick={() => focusDocumentPage(page.number)}
                            type="button"
                          >
                            str. {page.number}{citedPages.has(page.number) ? " · źródło" : ""}
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  <MarkdownLegal onPageReference={focusDocumentPage} text={analysis} />
                </>
              ) : (
                <div className="legal-report-placeholder">
                  <p>Wynik analizy pojawi się tutaj po uruchomieniu briefingu.</p>
                  <div className="legal-report-step"><span>01</span><strong>Wklej treść pisma</strong></div>
                  <div className="legal-report-step"><span>02</span><strong>Uruchom analizę LexAI</strong></div>
                </div>
              )}
            </div>
            {flashcardError ? <div className="legal-error">{flashcardError}</div> : null}
          </section>
          </div>
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

      </section>

      {flashcard ? (
        <div className="legal-flashcard-backdrop" role="presentation" onClick={() => setFlashcard("")}>
          <section
            aria-label="Fiszka na Rozprawę"
            className="legal-flashcard-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="legal-flashcard-header">
              <div>
                <span className="legal-clean-kicker">LEXAI · PRZYGOTOWANIE DO ROZPRAWY</span>
                <h2>Fiszka na Rozprawę</h2>
              </div>
              <button onClick={() => setFlashcard("")} type="button">Zamknij</button>
            </div>
            <MarkdownLegal onPageReference={focusDocumentPage} text={flashcard} />
            <button className="legal-flashcard-print" onClick={downloadAnalysisPdf} type="button">
              <GoldIcon name="download" size={15} /> Pobierz fiszkę do PDF
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default LegalOppositionPage;
