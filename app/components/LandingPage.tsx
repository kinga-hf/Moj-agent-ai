"use client";

import { GoldIcon, type IconName } from "./GoldIcon";
import { ThemeToggle } from "./ThemeToggle";

const features: Array<{
  icon: IconName;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    icon: "think",
    eyebrow: "PAMIĘĆ",
    title: "Pamięta Twoje rozmowy",
    description: "Wracaj do ważnych wątków bez przekopywania się przez historię. LexAI zna kontekst Twojej sprawy.",
  },
  {
    icon: "knowledge",
    eyebrow: "ANALIZA",
    title: "Analizuje pisma procesowe",
    description: "Dodaj wezwania, pozwy i notatki. Otrzymuj klarowne podsumowania oraz propozycje odpowiedzi.",
  },
  {
    icon: "security",
    eyebrow: "PRYWATNOŚĆ",
    title: "Prywatne dane per user",
    description: "Każdy użytkownik ma własną przestrzeń i historię. Twoje sprawy zostają tam, gdzie powinny.",
  },
  {
    icon: "clock",
    eyebrow: "CRON JOBS",
    title: "Pracuje 24/7 (cron jobs)",
    description: "Briefingi, raporty i przypomnienia mogą czekać na Ciebie, zanim zaczniesz dzień.",
  },
];

function BrandMark() {
  return (
    <span className="landing-brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function ProductMockup() {
  return (
    <div className="landing-product-frame" aria-label="Podgląd panelu LexAI — osobistego asystenta prawnego">
      <div className="landing-product-glow" />
      <div className="landing-product-window">
        <div className="landing-window-bar">
          <div className="landing-window-dots"><i /><i /><i /></div>
          <span>lexai / chat</span>
          <b>•••</b>
        </div>
        <div className="landing-window-body">
          <aside className="landing-mini-sidebar">
            <div className="landing-mini-logo"><BrandMark /></div>
            <span className="landing-mini-active"><GoldIcon name="dashboard" size={16} /></span>
            <span><GoldIcon name="chat" size={16} /></span>
            <span><GoldIcon name="knowledge" size={16} /></span>
            <span><GoldIcon name="legal" size={16} /></span>
            <span><GoldIcon name="spark" size={16} /></span>
            <span className="landing-mini-spacer" />
            <span><GoldIcon name="security" size={16} /></span>
          </aside>
          <div className="landing-mini-content">
            <div className="landing-mini-heading">
              <div>
                <span className="landing-mini-kicker">DOBRY WIECZÓR, KASIA</span>
                <h3>W czym mogę Ci dziś pomóc?</h3>
              </div>
              <span className="landing-avatar">K</span>
            </div>
            <div className="landing-mini-stats">
              <div><span>Zapamiętane</span><strong>128</strong><em>↗ 12% w tym tygodniu</em></div>
              <div><span>Dokumenty</span><strong>24</strong><em>+ 3 nowe pliki</em></div>
            </div>
            <div className="landing-mini-chat">
              <div className="landing-mini-message landing-mini-message-user">Przygotuj odpowiedź na wezwanie do zapłaty na podstawie moich notatek.</div>
              <div className="landing-mini-message landing-mini-message-agent"><span className="landing-agent-dot"><GoldIcon name="spark" size={14} /></span><div><strong>LexAI</strong><p>Jasne. Wyłuskałem najważniejsze fakty i przygotowałem szkic odpowiedzi z powołaniem na Twoje notatki.</p><small>Na podstawie: wezwanie do zapłaty · 12 min temu</small></div></div>
            </div>
            <div className="landing-mini-input"><span>Napisz do LexAI...</span><b>↑</b></div>
          </div>
        </div>
      </div>
      <div className="landing-float-card landing-float-card-left"><span><GoldIcon name="legal" size={14} /></span><div><strong>Pismo przeanalizowane</strong><small>Wezwanie do zapłaty.pdf</small></div><b>✓</b></div>
      <div className="landing-float-card landing-float-card-right"><span><GoldIcon name="spark" size={14} /></span><div><strong>Odpowiedź gotowa</strong><small>Dziś, 08:00</small></div></div>
    </div>
  );
}

function KnowledgeMockup() {
  return (
    <div className="landing-knowledge-card">
      <div className="landing-knowledge-top"><span className="landing-overline">TWOJA BAZA SPRAW</span><span className="landing-knowledge-count">24 dokumenty</span></div>
      <div className="landing-knowledge-title"><span className="landing-folder-icon">▱</span><div><strong>Akta i notatki</strong><small>Zaktualizowano przed chwilą</small></div><b>•••</b></div>
      <div className="landing-file-row landing-file-row-scan"><span className="landing-file-icon pdf">PDF</span><div><strong>Wezwanie do zapłaty</strong><small>2,4 MB · dzisiaj</small></div><span className="landing-file-check">✓</span><span className="landing-file-scan-marker" aria-hidden="true"><GoldIcon name="search" size={12} /></span></div>
      <div className="landing-file-row"><span className="landing-file-icon doc">DOC</span><div><strong>Notatki do sprawy</strong><small>840 KB · wczoraj</small></div><span className="landing-file-check">✓</span></div>
      <div className="landing-file-row"><span className="landing-file-icon xls">XLS</span><div><strong>Historia płatności</strong><small>1,1 MB · 2 dni temu</small></div><span className="landing-file-check">✓</span></div>
      <div className="landing-knowledge-progress"><span /><em>LexAI może już odpowiadać na pytania z tych dokumentów</em></div>
    </div>
  );
}

function LegalTechNetwork() {
  return (
    <div className="landing-legal-network" aria-hidden="true">
      <svg viewBox="0 0 620 360" role="presentation">
        <path d="M84 230C174 176 220 172 306 194S446 246 536 116" />
        <path d="M170 70C214 134 246 158 306 194S420 280 486 286" />
        <path d="M84 230L170 70M306 194L536 116M306 194L486 286" />
        <circle cx="84" cy="230" r="7" />
        <circle cx="170" cy="70" r="7" />
        <circle cx="306" cy="194" r="9" />
        <circle cx="536" cy="116" r="7" />
        <circle cx="486" cy="286" r="7" />
        <g className="landing-network-document">
          <rect x="52" y="196" width="42" height="52" rx="7" />
          <path d="M64 211h18M64 220h18M64 229h12" />
        </g>
        <text className="landing-network-law" x="150" y="57">§</text>
        <path className="landing-network-spark" d="M306 176l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" />
        <path className="landing-network-ai" d="M520 92l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
      </svg>
    </div>
  );
}

function KnowledgeVisual() {
  return (
    <div className="landing-knowledge-visual">
      <LegalTechNetwork />
      <KnowledgeMockup />
      <div className="landing-legal-float-card">
        <span><GoldIcon name="security" size={15} /></span>
        <div><strong>Weryfikacja ryzyk procesowych</strong><small>3 obszary wymagają uwagi</small></div>
      </div>
    </div>
  );
}

function AudienceSection() {
  return (
    <section className="landing-audience section-shell" id="dla-kogo">
      <div className="landing-section-heading landing-audience-heading">
        <div>
          <span className="landing-overline">DLA KOGO JEST LEXAI</span>
          <h2>Gdy pismo prawne<br /><em>komplikuje dzień.</em></h2>
        </div>
        <p>LexAI porządkuje trudne dokumenty i pomaga przejść od niepewności do konkretnego następnego kroku.</p>
      </div>
      <div className="landing-audience-grid">
        <article className="landing-audience-card audience-private">
          <div className="landing-audience-icon"><GoldIcon name="legal" size={23} /></div>
          <span className="landing-feature-eyebrow">OSOBY PRYWATNE</span>
          <h3>Dostałeś pismo i nie wiesz, od czego zacząć?</h3>
          <p>Wyjaśnij treść wezwania, uporządkuj fakty i przygotuj się do rozmowy z prawnikiem.</p>
          <div className="landing-audience-example">Wezwania · reklamacje · umowy</div>
        </article>
        <article className="landing-audience-card audience-business">
          <div className="landing-audience-icon"><GoldIcon name="calculator" size={23} /></div>
          <span className="landing-feature-eyebrow">PRZEDSIĘBIORCY</span>
          <h3>Masz sprawę do uporządkowania przed ważną decyzją?</h3>
          <p>Analizuj dokumenty, zbieraj notatki i trzymaj całą historię sprawy w jednym miejscu.</p>
          <div className="landing-audience-example">Kontrakty · płatności · windykacja</div>
        </article>
        <article className="landing-audience-card audience-team">
          <div className="landing-audience-icon"><GoldIcon name="knowledge" size={23} /></div>
          <span className="landing-feature-eyebrow">ZESPOŁY I KANCELARIE</span>
          <h3>Potrzebujesz szybkiego dostępu do wspólnej wiedzy?</h3>
          <p>Pracuj na dokumentach zespołu, wracaj do kontekstu i przygotowuj robocze wersje pism.</p>
          <div className="landing-audience-example">Akta · pisma · briefingi</div>
        </article>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <main className="landing-page">
      <div className="landing-orb landing-orb-one" />
      <div className="landing-orb landing-orb-two" />
      <nav className="landing-nav">
        <a className="landing-logo" href="/" aria-label="LexAI — strona główna"><BrandMark /><span>LexAI</span></a>
        <div className="landing-nav-links"><a href="#mozliwosci">Możliwości</a><a href="#jak-dziala">Jak działa</a><a href="#dla-kogo">Dla kogo</a></div>
        <div className="landing-nav-actions"><ThemeToggle /><a className="landing-login-link" href="/login">Zaloguj się</a><a className="landing-nav-cta" href="/login">Zacznij za darmo <span>↗</span></a></div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span className="landing-eyebrow-pulse" /> Osobisty asystent prawny AI</div>
          <h1>Prawo bez chaosu.<br /><span>Twoje sprawy</span><br />pod kontrolą.</h1>
          <p className="landing-hero-description">Twój osobisty asystent prawny AI — pomaga analizować dokumenty, porządkować sprawy i przygotowywać pisma na podstawie Twoich notatek.</p>
          <div className="landing-hero-actions"><a className="landing-primary-button" href="/login"><GoldIcon name="spark" size={16} /> Zacznij za darmo <span>↗</span></a><a className="landing-text-button" href="#jak-dziala">Zobacz jak działa <span>↓</span></a></div>
          <div className="landing-hero-note"><span><GoldIcon name="spark" size={14} /></span> Bez karty kredytowej <i /> Gotowe w 30 sekund</div>
        </div>
        <ProductMockup />
      </section>

      <section className="landing-trust-row" aria-label="Najważniejsze obszary pracy"><span>JEDEN AGENT. WIELE MOŻLIWOŚCI.</span><div><b>ROZMOWY</b><i /> <b>DOKUMENTY</b><i /> <b>BRIEFINGI</b><i /> <b>AUTOMATYZACJE</b></div></section>

      <section className="landing-features section-shell" id="mozliwosci">
        <div className="landing-section-heading"><div><span className="landing-overline">SPOKOJNIEJ, PEWNIEJ, KONKRETNIEJ</span><h2>Twoja sprawa.<br /><em>Jasny następny krok.</em></h2></div><p>LexAI skraca drogę od dokumentu do konkretnego działania. Bez chaosu. Bez powtarzania tego samego.</p></div>
        <div className="landing-feature-grid">{features.map((feature) => <article className="landing-feature-card" key={feature.title}><div className="landing-feature-icon"><GoldIcon name={feature.icon} size={22} /></div><span className="landing-feature-eyebrow">{feature.eyebrow}</span><h3>{feature.title}</h3><p>{feature.description}</p><span className="landing-card-arrow">↗</span></article>)}</div>
      </section>

      <section className="landing-showcase section-shell" id="jak-dziala">
        <div className="landing-showcase-copy"><span className="landing-showcase-overline"><GoldIcon name="spark" size={14} /><span className="landing-overline">AKTA, KTÓRE PRACUJĄ</span></span><h2>Nie czytaj akt godzinami.<br /><em>Zapytaj LexAI.</em></h2><p>Dodaj wezwania, pisma i notatki. LexAI znajdzie w nich odpowiedź, pokaże źródło i zachowa kontekst Twojej sprawy.</p><a className="landing-inline-link" href="/login"><GoldIcon name="folder" size={15} /> Dodaj pierwszy dokument <span>↗</span></a></div>
        <KnowledgeVisual />
      </section>

      <AudienceSection />

      <section className="landing-final-cta section-shell"><div className="landing-final-card"><div className="landing-final-orb" /><div className="landing-final-copy"><span className="landing-overline">PIERWSZY KROK JEST PROSTY</span><h2>Gotowy? Zacznij<br /><em>w 30 sekund.</em></h2><p>Dołącz do spokojniejszego sposobu pracy z AI.</p></div><a className="landing-primary-button landing-final-button" href="/login">Stwórz konto <span>↗</span></a></div></section>

      <footer className="landing-footer"><a className="landing-logo" href="/" aria-label="LexAI — strona główna"><BrandMark /><span>LexAI</span></a><span>Twoja sprawa. Jasny następny krok.</span><div><a href="/login">Zaloguj się</a><a href="/login">Zacznij za darmo</a></div></footer>
    </main>
  );
}
