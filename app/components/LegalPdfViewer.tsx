"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

export type LegalPdfCitation = {
  pageNumber: number;
  quote: string;
};

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function normalizeText(value: string) {
  return value.toLocaleLowerCase("pl-PL").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function containsCitationQuote(text: string, quote: string) {
  const textValue = normalizeText(text);
  const quoteWords = normalizeText(quote).split(" ").filter(Boolean);
  if (!textValue || quoteWords.length === 0) return false;

  const windowSize = Math.min(6, quoteWords.length);
  for (let index = 0; index <= quoteWords.length - windowSize; index += 1) {
    const phrase = quoteWords.slice(index, index + windowSize).join(" ");
    if (phrase.length > 12 && textValue.includes(phrase)) return true;
  }

  return false;
}

type LegalPdfViewerProps = {
  file: string | null;
  fileName?: string;
  citation: LegalPdfCitation | null;
  onPageChange?: (page: number) => void;
};

export default function LegalPdfViewer({ file, fileName, citation, onPageChange }: LegalPdfViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(560);
  const [loadError, setLoadError] = useState("");
  const [devicePixelRatio, setDevicePixelRatio] = useState(1.5);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const updatePixelRatio = () => {
      // Render at least 1.5x so PDF text stays crisp even on a standard-DPI display.
      setDevicePixelRatio(Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)));
    };

    updatePixelRatio();
    window.addEventListener("resize", updatePixelRatio);
    return () => window.removeEventListener("resize", updatePixelRatio);
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const updateWidth = () => setPageWidth(Math.max(220, viewer.clientWidth - 32));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setPageNumber(1);
      setPageCount(0);
      setLoadError("");
      setZoom(1);
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [file]);

  useEffect(() => {
    if (!citation || pageCount === 0) return;
    const nextPage = Math.min(Math.max(citation.pageNumber, 1), pageCount);
    const updateId = window.setTimeout(() => {
      setPageNumber(nextPage);
      viewerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      onPageChange?.(nextPage);
    }, 0);

    return () => window.clearTimeout(updateId);
  }, [citation, pageCount, onPageChange]);

  if (!file) {
    return <div className="legal-preview-empty">Wgraj plik PDF, aby otworzyć podgląd dokumentu.</div>;
  }

  const selectPage = (nextPage: number) => {
    const safePage = Math.min(Math.max(nextPage, 1), pageCount || 1);
    setPageNumber(safePage);
    viewerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    onPageChange?.(safePage);
  };

  return (
    <div className={`legal-pdf-document-viewer${zoom > 1 ? " is-zoomed" : ""}`}>
      <div className="legal-pdf-viewer-toolbar">
        <span className="legal-pdf-viewer-file" title={fileName || "Oryginalny plik PDF"}>
          {fileName || "Oryginalny plik PDF"}
        </span>
        <span className="legal-pdf-viewer-page-count">
          {pageCount > 0 ? `Strona ${pageNumber} / ${pageCount}` : "Ładowanie..."}
        </span>
        <div className="legal-pdf-viewer-zoom" aria-label="Sterowanie powiększeniem dokumentu">
          <button
            aria-label="Pomniejsz dokument"
            disabled={zoom <= 0.8}
            onClick={() => setZoom((current) => Math.max(0.8, Number((current - 0.1).toFixed(1))))}
            type="button"
          >
            −
          </button>
          <button
            aria-label="Dopasuj PDF do szerokości"
            className={zoom === 1 ? "is-active" : ""}
            onClick={() => setZoom(1)}
            type="button"
          >
            Dopasuj do szerokości
          </button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Powiększ dokument"
            disabled={zoom >= 1.4}
            onClick={() => setZoom((current) => Math.min(1.4, Number((current + 0.1).toFixed(1))))}
            type="button"
          >
            +
          </button>
        </div>
      </div>

      <div ref={viewerRef} className="legal-pdf-document-scroll">
        <Document
          file={file}
          onLoadSuccess={({ numPages }) => {
            setPageCount(numPages);
            setPageNumber((current) => Math.min(current, numPages));
            setLoadError("");
          }}
          onLoadError={(error) => setLoadError(error.message || "Nie udało się otworzyć pliku PDF.")}
          loading={<p className="legal-pdf-viewer-status">Ładowanie dokumentu...</p>}
          error={<p className="legal-pdf-viewer-status legal-pdf-viewer-error">{loadError || "Nie udało się otworzyć pliku PDF."}</p>}
        >
          {pageCount > 0 ? (
            <Page
              pageNumber={pageNumber}
              width={Math.round(pageWidth * zoom)}
              devicePixelRatio={devicePixelRatio}
              renderTextLayer
              renderAnnotationLayer
              customTextRenderer={({ str }) =>
                citation && citation.pageNumber === pageNumber && containsCitationQuote(str, citation.quote) ? (
                  `<mark class="legal-pdf-citation-highlight">${escapeHtml(str)}</mark>`
                ) : (
                  str
                )
              }
            />
          ) : null}
        </Document>
      </div>

      <div className="legal-pdf-viewer-controls" aria-label="Przewijanie stron dokumentu">
        <button disabled={pageNumber <= 1} onClick={() => selectPage(pageNumber - 1)} type="button" aria-label="Poprzednia strona">
          ←
        </button>
        <input
          aria-label="Numer strony"
          max={pageCount || 1}
          min={1}
          onChange={(event) => selectPage(Number(event.target.value) || 1)}
          type="number"
          value={pageNumber}
        />
        <button disabled={pageCount === 0 || pageNumber >= pageCount} onClick={() => selectPage(pageNumber + 1)} type="button" aria-label="Następna strona">
          →
        </button>
      </div>
    </div>
  );
}
