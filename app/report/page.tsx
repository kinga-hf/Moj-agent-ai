"use client";

import { FormEvent, ReactNode, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";

const examples = [
  "Rynek AI w Polsce - trendy, firmy, prognozy na 2026",
  "Porównanie platform e-commerce: Shopify vs WooCommerce vs PrestaShop",
  "Wpływ pracy zdalnej na produktywność - badania i statystyki",
  "Rynek nieruchomości w Krakowie - ceny, trendy, prognozy",
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

function MarkdownReport({ text }: { text: string }) {
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

    if (trimmed.startsWith(">")) {
      const quotes: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quotes.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push(<blockquote key={`quote-${index}`}>{quotes.join("\n")}</blockquote>);
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

  return <article className="report-document">{blocks}</article>;
}

export default function ReportPage() {
  const [topic, setTopic] = useState("");
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanTopic = topic.trim();
    if (!cleanTopic || isLoading) {
      return;
    }

    setReport("");
    setError("");
    setCopyStatus("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: cleanTopic }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Nie udało się uruchomić generatora raportu.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          const tail = decoder.decode();
          if (tail) {
            setReport((current) => current + tail);
          }
          break;
        }

        setReport((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udało się wygenerować raportu.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyReport() {
    if (!report.trim()) {
      return;
    }

    await navigator.clipboard.writeText(report.trim());
    setCopyStatus("Skopiowano");
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />

      <section className="dashboard-main report-page" aria-label="Generator raportów">
        <header className="dashboard-hero report-hero">
          <div>
            <span className="dashboard-kicker">Research agent</span>
            <h1>📊 Generator raportów</h1>
            <p>Opisz temat - agent zbierze informacje, ułoży sekcje i przygotuje raport biznesowy z wnioskami.</p>
          </div>
          <div className="dashboard-status">
            <span>{isLoading ? "Piszę raport..." : report ? "Raport gotowy" : "Gotowy"}</span>
          </div>
        </header>

        <section className="report-workspace">
          <form className="report-form" onSubmit={handleSubmit}>
            <label>
              <span>O czym ma być raport?</span>
              <input
                disabled={isLoading}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Np. Rynek AI w Polsce w 2026 roku..."
                value={topic}
              />
            </label>
            <button className="send-button report-submit" disabled={isLoading || !topic.trim()} type="submit">
              📊 Generuj raport
            </button>
          </form>

          <div className="report-examples" aria-label="Przykładowe tematy">
            {examples.map((example) => (
              <button disabled={isLoading} key={example} onClick={() => setTopic(example)} type="button">
                {example}
              </button>
            ))}
          </div>
        </section>

        {error ? <div className="report-error">{error}</div> : null}

        {(report || isLoading) ? (
          <section className="report-result" aria-live="polite">
            <div className="report-actions">
              <div>
                <strong>{isLoading ? "Raport powstaje..." : "Raport gotowy"}</strong>
                <span>{report.trim().split(/\s+/).filter(Boolean).length} słów</span>
              </div>
              <button disabled={!report.trim()} onClick={() => void copyReport()} type="button">
                {copyStatus || "📋 Kopiuj do schowka"}
              </button>
            </div>

            {report ? <MarkdownReport text={report} /> : <div className="report-loading">Agent zbiera dane i układa raport...</div>}
          </section>
        ) : null}
      </section>
    </main>
  );
}
