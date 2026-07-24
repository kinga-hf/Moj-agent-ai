"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BackNavLink } from "./BackNavLink";
import { AuthStatus } from "./AuthStatus";
import { useAuth } from "./AuthGate";
import { supabase } from "../../lib/supabase";
import { ensureUserProfile, type UserProfile } from "../../lib/user-profile";
import {
  AttachedLegalFilePreview,
  HiddenLegalFileInput,
  LegalDropOverlay,
  LegalFileUploadButton,
  useLegalAttachment,
} from "./LegalAttachment";

type ChatMode = "casual" | "expert" | "creative";
type AiModel = "flash" | "pro";
type CommandType = "chat" | "projekt";

const modes: Array<{
  id: ChatMode;
  label: string;
  badge: string;
}> = [
  { id: "casual", label: "💬 Praktyczny", badge: "💬 praktyczny" },
  { id: "expert", label: "🎓 Ekspert", badge: "🎓 ekspert" },
  { id: "creative", label: "✍️ Redakcja", badge: "✍️ redakcja" },
];

const models: Array<{
  id: AiModel;
  label: string;
  badge: string;
}> = [
  { id: "flash", label: "⚡ Flash", badge: "⚡ flash" },
  { id: "pro", label: "🧠 Pro", badge: "🧠 pro" },
];

const legalExampleQuestions = [
  "Przeanalizuj ten problem prawny i wskaż, jakich faktów brakuje.",
  "Wyjaśnij różnicę między sprzeciwem, zarzutem i wnioskiem procesowym.",
  "Przygotuj listę pytań do świadka w sprawie o niewykonanie umowy.",
  "Sprawdź aktualne orzecznictwo dotyczące przedawnienia roszczenia.",
];

const legalDraftExamples = [
  "projekt odpowiedzi na pozew o zapłatę",
  "projekt wniosku o przesłuchanie świadka",
];

const modeBadges = modes.reduce<Record<ChatMode, string>>((acc, item) => {
  acc[item.id] = item.badge;
  return acc;
}, {} as Record<ChatMode, string>);

const modelBadges = models.reduce<Record<AiModel, string>>((acc, item) => {
  acc[item.id] = item.badge;
  return acc;
}, {} as Record<AiModel, string>);

function getMessageText(parts: { type: string; text?: string }[]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function getConversationTitle(text: string) {
  const normalizedText = text.trim();
  const shortTitle = normalizedText.length <= 50
    ? normalizedText
    : `${normalizedText.slice(0, 47).trimEnd()}...`;

  return `Legal AI: ${shortTitle}`;
}

function splitMessageSources(text: string) {
  const match = text.match(
    /\n\s*((?:📎\s*)?(?:Źródło|Źródła|Zrodlo|Zrodla)\s*:\s*.+)$/i,
  );

  if (!match?.index) {
    return { body: text, source: "" };
  }

  return {
    body: text.slice(0, match.index).trimEnd(),
    source: match[1].trim(),
  };
}

function getSupabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Nieznany błąd Supabase.";
  }

  const details = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const message =
    typeof details.message === "string" ? details.message : "Błąd operacji Supabase.";
  const code = typeof details.code === "string" ? ` (${details.code})` : "";

  return `${message}${code}`;
}

export default function Home() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("casual");
  const [model, setModel] = useState<AiModel>("flash");
  const [memoryOpen, setMemoryOpen] = useState(true);
  const [copyStatus, setCopyStatus] = useState("");
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const userId = user?.id ?? null;
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [assistantModes, setAssistantModes] = useState<Record<string, ChatMode>>(
    {},
  );
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>(
    {},
  );
  const [assistantCommands, setAssistantCommands] = useState<
    Record<string, CommandType>
  >({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pendingModeRef = useRef<ChatMode>("casual");
  const pendingModelRef = useRef<AiModel>("flash");
  const pendingCommandRef = useRef<CommandType>("chat");
  const conversationIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const persistedMessageIdsRef = useRef(new Set<string>());
  const pendingPersistMessageIdsRef = useRef(new Set<string>());
  const persistenceQueueRef = useRef(Promise.resolve());
  const {
    attachedFile,
    fileError,
    fileInputRef,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileChange,
    isDraggingFile,
    openFilePicker,
    removeFile,
  } = useLegalAttachment();
  const { error, messages, sendMessage, setMessages, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });
  const isLoading = status === "submitted" || status === "streaming";
  const conversationText = messages
    .map((message) => {
      const author = message.role === "user" ? "User" : "Agent";
      return `${author}: ${getMessageText(message.parts)}`;
    })
    .join("\n");
  const characterCount = conversationText.length;
  const tokenCount = Math.ceil(characterCount / 4);

  async function refreshUserProfile(id: string) {
    try {
      const profile = await ensureUserProfile(id);
      setUserProfile(profile);
    } catch (caughtError) {
      console.error("Supabase profile load error:", caughtError);
    } finally {
      setIsProfileLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) {
      setIsProfileLoading(false);
      return;
    }

    setIsProfileLoading(true);
    void refreshUserProfile(userId);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestConversation() {
      if (!supabase) {
        hydratedRef.current = true;
        setIsHistoryLoading(false);
        return;
      }

      if (!userId) {
        hydratedRef.current = true;
        setIsHistoryLoading(false);
        return;
      }

      try {
        const requestedConversationId = new URLSearchParams(window.location.search).get(
          "conversation",
        );
        let conversationQuery = supabase
          .from("conversations")
          .select("id")
          .eq("user_id", userId)
          .like("title", "Legal AI:%");
        conversationQuery = requestedConversationId
          ? conversationQuery.eq("id", requestedConversationId)
          : conversationQuery.order("updated_at", { ascending: false });
        const { data: conversation, error: conversationError } = await conversationQuery
          .limit(1)
          .maybeSingle();

        if (conversationError) {
          throw conversationError;
        }

        if (!conversation) {
          return;
        }

        const { data: storedMessages, error: messagesError } = await supabase
          .from("messages")
          .select("id, role, content")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true });

        if (messagesError) {
          throw messagesError;
        }

        if (cancelled) {
          return;
        }

        const restoredMessages = (storedMessages ?? [])
          .filter(
            (message) =>
              (message.role === "user" || message.role === "assistant") &&
              typeof message.content === "string",
          )
          .map(
            (message): UIMessage => ({
              id: message.id,
              role: message.role as "user" | "assistant",
              parts: [{ type: "text", text: message.content }],
            }),
          );

        conversationIdRef.current = conversation.id;
        setConversationId(conversation.id);
        restoredMessages.forEach((message) =>
          persistedMessageIdsRef.current.add(message.id),
        );
        setMessages(restoredMessages);
      } catch (caughtError) {
        console.error("Supabase history load error:", caughtError);
        if (!cancelled) {
          setHistoryError(
            "Nie udało się wczytać historii. Czat działa lokalnie do czasu naprawienia połączenia z bazą.",
          );
        }
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setIsHistoryLoading(false);
        }
      }
    }

    void loadLatestConversation();

    return () => {
      cancelled = true;
    };
  }, [setMessages, userId]);

  useEffect(() => {
    if (!supabase || !hydratedRef.current || !userId) {
      return;
    }

    const client = supabase;

    const messagesToPersist = messages.filter((message) => {
      if (message.role !== "user" && message.role !== "assistant") {
        return false;
      }

      return (
        !persistedMessageIdsRef.current.has(message.id) &&
        !pendingPersistMessageIdsRef.current.has(message.id) &&
        getMessageText(message.parts).trim().length > 0
      );
    });

    if (messagesToPersist.length === 0) {
      return;
    }

    messagesToPersist.forEach((message) =>
      pendingPersistMessageIdsRef.current.add(message.id),
    );

    persistenceQueueRef.current = persistenceQueueRef.current
      .then(async () => {
        for (const message of messagesToPersist) {
          const content = getMessageText(message.parts).trim();
          let activeConversationId = conversationIdRef.current;

          if (!activeConversationId) {
            if (message.role !== "user") {
              continue;
            }

            const { data: newConversation, error: conversationError } =
              await client
                .from("conversations")
                .insert({ title: getConversationTitle(content), user_id: userId })
                .select("id")
                .single();

            if (conversationError || !newConversation) {
              throw conversationError ?? new Error("Nie utworzono rozmowy.");
            }

            activeConversationId = newConversation.id;
            conversationIdRef.current = activeConversationId;
            setConversationId(activeConversationId);
          }

          const { error: messageError } = await client.from("messages").insert({
            conversation_id: activeConversationId,
            role: message.role,
            content,
          });

          if (messageError) {
            throw messageError;
          }

          const { error: updateError } = await client
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", activeConversationId)
            .eq("user_id", userId);

          if (updateError) {
            throw updateError;
          }

          persistedMessageIdsRef.current.add(message.id);
          pendingPersistMessageIdsRef.current.delete(message.id);
        }
      })
      .catch((caughtError) => {
        messagesToPersist.forEach((message) =>
          pendingPersistMessageIdsRef.current.delete(message.id),
        );
        const errorMessage = getSupabaseErrorMessage(caughtError);
        console.error("Supabase history save error:", errorMessage);
        setHistoryError(
          `Nie udało się zapisać historii: ${errorMessage}`,
        );
      });
  }, [messages, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    setAssistantModes((currentModes) => {
      let changed = false;
      const nextModes = { ...currentModes };

      for (const message of messages) {
        if (message.role === "assistant" && !nextModes[message.id]) {
          nextModes[message.id] = pendingModeRef.current;
          changed = true;
        }
      }

      return changed ? nextModes : currentModes;
    });

    setAssistantModels((currentModels) => {
      let changed = false;
      const nextModels = { ...currentModels };

      for (const message of messages) {
        if (message.role === "assistant" && !nextModels[message.id]) {
          nextModels[message.id] = pendingModelRef.current;
          changed = true;
        }
      }

      return changed ? nextModels : currentModels;
    });

    setAssistantCommands((currentCommands) => {
      let changed = false;
      const nextCommands = { ...currentCommands };

      for (const message of messages) {
        if (message.role === "assistant" && !nextCommands[message.id]) {
          nextCommands[message.id] = pendingCommandRef.current;
          changed = true;
        }
      }

      return changed ? nextCommands : currentCommands;
    });
  }, [messages]);

  async function sendText(text: string) {
    const trimmedText = text.trim();
    if ((!trimmedText && !attachedFile) || isLoading) {
      return;
    }

    if (!userId || isProfileLoading) {
      return;
    }

    setInput("");
    pendingModeRef.current = mode;
    pendingModelRef.current = model;
    pendingCommandRef.current = /^projekt(\s|$)/i.test(trimmedText)
      ? "projekt"
      : "chat";
    const fileToSend = attachedFile;
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    removeFile();
    await sendMessage(
      { text: trimmedText || "Przeanalizuj załączone pismo." },
      {
        body: {
          mode,
          model,
          attachmentName: fileToSend?.name,
          attachmentText: fileToSend?.text,
          userId,
          authToken: sessionData.session?.access_token,
        },
      },
    );

    await refreshUserProfile(userId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendText(input);
  }

  async function handleNewConversation() {
    if (isLoading) {
      stop();
    }

    await persistenceQueueRef.current;

    setMessages([]);
    conversationIdRef.current = null;
    setConversationId(null);
    setAssistantModes({});
    setAssistantModels({});
    setAssistantCommands({});
    setCopyStatus("");
    pendingModeRef.current = mode;
    pendingModelRef.current = model;
    pendingCommandRef.current = "chat";

    if (!supabase || !userId) {
      return;
    }

    const { data: newConversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({ title: "Legal AI: Nowa rozmowa", user_id: userId })
      .select("id")
      .single();

    if (conversationError || !newConversation) {
      setHistoryError("Nie udało się utworzyć nowej rozmowy w Supabase.");
      return;
    }

    conversationIdRef.current = newConversation.id;
    setConversationId(newConversation.id);
  }

  async function handleExportConversation() {
    if (!conversationText) {
      return;
    }

    await navigator.clipboard.writeText(conversationText);
    setCopyStatus("Skopiowano!");
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  return (
    <main className="chat-shell">
      <section className="chat-app" aria-label="Asystent Prawny – Analiza Pism i Strategia">
        <LegalDropOverlay visible={isDraggingFile} />
        <nav className="top-nav" aria-label="Nawigacja">
          <BackNavLink />
          <a className="nav-link active" href="/chat">
            💬 Chat
          </a>
          <a className="nav-link" href="/history">
            📜 Historia
          </a>
          <a className="nav-link" href="/think">
            🧠 Myślenie
          </a>
          <a className="nav-link" href="/fewshot">
            📚 Słownik
          </a>
          <a className="nav-link" href="/format">
            📐 Formater
          </a>
          <a className="nav-link" href="/search">
            🌐 Szukaj
          </a>
          <a className="nav-link" href="/extract">
            📊 Analizator
          </a>
          <a className="nav-link" href="/legal-opposition">
            ⚖️ Legal Briefing
          </a>
          <AuthStatus compact />
        </nav>

        <header className="chat-header pro-header">
          <div>
            <h1 className="chat-title">Asystent Prawny – Analiza Pism i Strategia</h1>
            <p className="agent-description">
              Pomagam porządkować problemy prawne, analizować argumenty,
              szukać źródeł i przygotowywać robocze projekty pism.
            </p>
            <div className="example-questions" aria-label="Przykładowe pytania">
              {legalExampleQuestions.map((question) => (
                <button
                  className="example-button"
                  disabled={isLoading}
                  key={question}
                  onClick={() => void sendText(question)}
                  type="button"
                >
                  {question}
                </button>
              ))}
            </div>
            <div className="command-card">
              <div>
                <strong>Tryb redakcyjny:</strong> zacznij wiadomość od <code>projekt</code>,
                a asystent przygotuje roboczy projekt pisma procesowego.
              </div>
              <div className="command-examples">
                {legalDraftExamples.map((command) => (
                  <button
                    className="command-button"
                    disabled={isLoading}
                    key={command}
                    onClick={() => void sendText(command)}
                    type="button"
                  >
                    {command}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="chat-status" aria-live="polite">
            {isProfileLoading || isHistoryLoading
              ? "Wczytuję pamięć..."
              : isLoading
                ? "Myślę..."
                : "Gotowy"}
          </div>
        </header>

        <section className="memory-panel" aria-label="Kontekst rozmowy">
          {isHistoryLoading ? (
            <div className="history-loading" role="status">
              <span className="history-spinner" aria-hidden="true" />
              Wczytywanie historii rozmowy...
            </div>
          ) : null}
          {historyError ? (
            <div className="history-error" role="status">
              {historyError}
            </div>
          ) : null}
          <button
            aria-expanded={memoryOpen}
            className="memory-toggle"
            onClick={() => setMemoryOpen((open) => !open)}
            type="button"
          >
            <span>Kontekst rozmowy</span>
            <span>
              Wiadomości: {messages.length} | ~Tokeny: {tokenCount}
            </span>
          </button>

          {memoryOpen ? (
            <div className="memory-content">
              <div className="memory-count">
                Wiadomości: {messages.length} | ~Tokeny: {tokenCount}
              </div>
              <div className="memory-actions">
                <button
                  className="secondary-button"
                  disabled={messages.length === 0}
                  onClick={handleNewConversation}
                  type="button"
                >
                  🗑 Nowa rozmowa
                </button>
                <button
                  className="secondary-button"
                  disabled={messages.length === 0}
                  onClick={handleExportConversation}
                  type="button"
                >
                  📋 Eksportuj rozmowę
                </button>
                <span className="copy-status" aria-live="polite">
                  {copyStatus}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <div
          className="messages"
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(event) => void handleDrop(event)}
        >
          {messages.length === 0 ? (
            <p className="empty-state">
              {userProfile?.display_name
                ? `Cześć, ${userProfile.display_name}! Miło Cię znowu widzieć. `
                : "Cześć! Nie znamy się jeszcze. Jak masz na imię? "}
              Wybierz przykładowe pytanie albo opisz problem prawny, z którym
              chcesz pracować.
            </p>
          ) : (
            messages.map((message) => (
              <div
                className={`message-row ${message.role}`}
                key={message.id}
              >
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <div className="badge-row">
                      <span
                        className={`mode-badge ${
                          assistantModes[message.id] ?? "casual"
                        }`}
                      >
                        {modeBadges[assistantModes[message.id] ?? "casual"]}
                      </span>
                      <span
                        className={`model-badge ${
                          assistantModels[message.id] ?? "flash"
                        }`}
                      >
                        {modelBadges[assistantModels[message.id] ?? "flash"]}
                      </span>
                      {assistantCommands[message.id] === "projekt" ? (
                        <span className="command-badge">📄 projekt</span>
                      ) : null}
                    </div>
                  ) : null}
                  {(() => {
                    const { body, source } = splitMessageSources(
                      getMessageText(message.parts),
                    );

                    return (
                      <>
                        {body}
                        {source ? (
                          <div className="knowledge-source">{source}</div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))
          )}

          {status === "submitted" ? (
            <div className="message-row assistant">
              <div className="message-bubble">
                <div className="badge-row">
                  <span className={`mode-badge ${pendingModeRef.current}`}>
                    {modeBadges[pendingModeRef.current]}
                  </span>
                  <span className={`model-badge ${pendingModelRef.current}`}>
                    {modelBadges[pendingModelRef.current]}
                  </span>
                  {pendingCommandRef.current === "projekt" ? (
                    <span className="command-badge">📄 projekt</span>
                  ) : null}
                </div>
                Myślę...
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="message-row assistant">
              <div className="message-bubble error-bubble">
                Nie udało się wygenerować odpowiedzi. Limit Gemini API jest
                teraz wyczerpany albo model jest niedostępny dla tego klucza.
                Spróbuj ponownie za chwilę albo użyj nowego klucza Google AI
                Studio.
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="composer-panel">
          <AttachedLegalFilePreview file={attachedFile} onRemove={removeFile} />
          {fileError ? <div className="attachment-error">{fileError}</div> : null}
          <div className="model-switcher" aria-label="Model AI">
            {models.map((item) => (
              <button
                className={`model-button ${model === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setModel(item.id)}
                type="button"
              >
                {item.label}
                <span>
                  {item.id === "flash" ? "szybki" : "zaawansowany"}
                </span>
              </button>
            ))}
          </div>

          <div className="mode-switcher" aria-label="Tryb odpowiedzi">
            {modes.map((item) => (
              <button
                className={`mode-button ${mode === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setMode(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <HiddenLegalFileInput
              fileInputRef={fileInputRef}
              onChange={(event) => void handleFileChange(event)}
            />
            <LegalFileUploadButton disabled={isLoading} onClick={openFilePicker} />
            <input
              aria-label="Wiadomość"
              className="composer-input"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Wklej pismo procesowe lub zadaj pytanie dotyczące prawa..."
              value={input}
            />
            <button
              className="send-button"
              disabled={isLoading || (!input.trim() && !attachedFile)}
            >
              Wyślij
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

