"use client";

import { useState } from "react";
import { BackNavLink } from "../components/BackNavLink";

export default function ExtractPage() {
  const [text, setText] = useState("");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text ? text.split("\n").length : 0;
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const urls = text.match(/https?:\/\/[^\s]+/gi) ?? [];

  return (
    <main className="chat-shell">
      <section className="chat-app extract-app" aria-label="Analizator">
        <nav className="top-nav" aria-label="Nawigacja">
          <BackNavLink />
          <a className="nav-link" href="/chat">
            💬 Chat
          </a>
          <a className="nav-link" href="/think">
            🧠 Myślenie
          </a>
          <a className="nav-link" href="/search">
            🌐 Szukaj
          </a>
          <a className="nav-link" href="/generate">
            🎨 Grafiki
          </a>
          <a className="nav-link" href="/vision">
            👁️ Vision
          </a>
          <a className="nav-link active" href="/extract">
            📊 Analizator
          </a>
          <a className="nav-link" href="/format">
            📐 Formater
          </a>
        </nav>

        <header className="chat-header pro-header">
          <div>
            <h1 className="chat-title">📊 Analizator</h1>
            <p className="agent-description">
              Wklej tekst, a zobaczysz szybkie podsumowanie, linki i adresy email.
              Do OCR ze screena użyj modułu Vision.
            </p>
          </div>
          <div className="chat-status">Gotowy</div>
        </header>

        <section className="generate-workspace">
          <textarea
            className="prompt-textarea"
            onChange={(event) => setText(event.target.value)}
            placeholder="Wklej tekst do analizy..."
            value={text}
          />
          <div className="extract-summary">
            <div>
              <strong>{text.length}</strong>
              <span>znaków</span>
            </div>
            <div>
              <strong>{words}</strong>
              <span>słów</span>
            </div>
            <div>
              <strong>{lines}</strong>
              <span>linii</span>
            </div>
            <div>
              <strong>{emails.length}</strong>
              <span>emaili</span>
            </div>
            <div>
              <strong>{urls.length}</strong>
              <span>linków</span>
            </div>
          </div>
          <div className="command-card">
            <strong>Wykryte linki:</strong>
            {urls.length ? urls.join("\n") : "Brak linków w tekście."}
          </div>
          <div className="command-card">
            <strong>Wykryte emaile:</strong>
            {emails.length ? emails.join("\n") : "Brak adresów email w tekście."}
          </div>
        </section>
      </section>
    </main>
  );
}

