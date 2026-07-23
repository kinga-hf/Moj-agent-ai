"use client";

import { FormEvent, ReactNode, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";

type Example = {
  label: string;
  companies: [string, string, string];
  context: string;
};

const examples: Example[] = [
  {
    label: "Shopify vs WooCommerce vs PrestaShop",
    companies: ["Shopify", "WooCommerce", "PrestaShop"],
    context: "Szukam platformy e-commerce dla małego sklepu internetowego.",
  },
  {
    label: "Notion vs Obsidian vs Evernote",
    companies: ["Notion", "Obsidian", "Evernote"],
    context: "Wybieram narzędzie do notatek i zarządzania wiedzą dla małego zespołu.",
  },
  {
    label: "Vercel vs Netlify vs Railway",
    companies: ["Vercel", "Netlify", "Railway"],
    context: "Szukam hostingu dla aplikacji webowej budowanej w Next.js.",
  },
  {
    label: "ChatGPT vs Claude vs Gemini",
    companies: ["ChatGPT", "Claude", "Gemini"],
    context: "Porównuję asystentów AI do pracy biznesowej i researchu.",
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

function MarkdownAnalysis({ text }: { text: string }) {
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
          <div className="markdown-table-wrap competitor-table-wrap" key={`table-${index}`}>
            <table className="markdown-table competitor-table">
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

  return <article className="competitor-document">{blocks}</article>;
}

export default function CompetitorPage() {
  const [companies, setCompanies] = useState(["", "", ""]);
  const [context, setContext] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const filledCompanies = companies.map((company) => company.trim()).filter(Boolean);

  function updateCompany(index: number, value: string) {
    setCompanies((currentCompanies) =>
      currentCompanies.map((company, companyIndex) =>
        companyIndex === index ? value : company,
      ),
    );
  }

  function applyExample(example: Example) {
    setCompanies(example.companies);
    setContext(example.context);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (filledCompanies.length < 2 || isLoading) {
      return;
    }

    setAnalysis("");
    setError("");
    setCopyStatus("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: filledCompanies,
          context,
        }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Nie udało się uruchomić analizy konkurencji.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          const tail = decoder.decode();
          if (tail) {
            setAnalysis((current) => current + tail);
          }
          break;
        }

        setAnalysis((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udało się przygotować analizy konkurencji.");
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
    <main className="dashboard-shell">
      <DashboardSidebar />

      <section className="dashboard-main competitor-page" aria-label="Analiza konkurencji">
        <header className="dashboard-hero competitor-hero">
          <div>
            <span className="dashboard-kicker">Market intelligence</span>
            <h1>🏢 Analiza konkurencji</h1>
            <p>Podaj firmy - agent porówna ich ofertę, mocne strony, słabości i przygotuje rekomendację.</p>
          </div>
          <div className="dashboard-status">
            <span>{isLoading ? "Porównuję..." : `${filledCompanies.length} firmy`}</span>
          </div>
        </header>

        <section className="competitor-workspace">
          <form className="competitor-form" onSubmit={handleSubmit}>
            <div className="competitor-input-grid">
              {companies.map((company, index) => (
                <label key={`company-${index + 1}`}>
                  <span>Firma {index + 1}</span>
                  <input
                    disabled={isLoading}
                    onChange={(event) => updateCompany(index, event.target.value)}
                    placeholder={index === 0 ? "Np. Shopify" : index === 1 ? "Np. WooCommerce" : "Np. PrestaShop"}
                    value={company}
                  />
                </label>
              ))}
            </div>

            <label className="competitor-context">
              <span>Kontekst</span>
              <textarea
                disabled={isLoading}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Np. Szukam platformy e-commerce dla małego sklepu"
                value={context}
              />
            </label>

            <div className="competitor-actions">
              <button className="send-button competitor-submit" disabled={isLoading || filledCompanies.length < 2} type="submit">
                🔍 Porównaj
              </button>
            </div>
          </form>

          <div className="competitor-examples" aria-label="Przykładowe porównania">
            {examples.map((example) => (
              <button disabled={isLoading} key={example.label} onClick={() => applyExample(example)} type="button">
                {example.label}
              </button>
            ))}
          </div>
        </section>

        {error ? <div className="competitor-error">{error}</div> : null}

        {(analysis || isLoading) ? (
          <section className="competitor-result" aria-live="polite">
            <div className="competitor-result-actions">
              <div>
                <strong>{isLoading ? "Analiza powstaje..." : "Analiza gotowa"}</strong>
                <span>{filledCompanies.join(" vs ")}</span>
              </div>
              <button disabled={!analysis.trim()} onClick={() => void copyAnalysis()} type="button">
                {copyStatus || "📋 Kopiuj analizę"}
              </button>
            </div>

            {analysis ? <MarkdownAnalysis text={analysis} /> : <div className="competitor-loading">Agent zbiera informacje o firmach...</div>}
          </section>
        ) : null}
      </section>
    </main>
  );
}
