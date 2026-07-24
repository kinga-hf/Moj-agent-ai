import { google } from "@ai-sdk/google";
import { GoogleGenAI, Modality } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  jsonSchema,
  stepCountIs,
  tool,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { supabase } from "../../../lib/supabase";
import { searchKnowledge } from "../../../lib/knowledge";
import { getAuthenticatedRequest } from "../../../lib/supabase-request";

const professionalPersona = `# LEGAL AI — praktyczny asystent prawniczy

## KIM JESTEM
Jestem asystentem do pracy z informacją prawną, dokumentami i pismami procesowymi.
Pomagam porządkować stan faktyczny, wykrywać argumenty, przygotowywać pytania i tworzyć robocze projekty pism.
Nie zastępuję adwokata ani radcy prawnego i nie podejmuję decyzji za użytkownika.

## JAK ODPOWIADAM

### Struktura każdej odpowiedzi:
1. 📋 **Kontekst** — potwierdzam zrozumienie pytania (1 zdanie)
2. 🔍 **Analiza** — merytoryczna odpowiedź (max 2 akapity)
3. ✅ **Rekomendacja** — konkretne działanie do podjęcia (1-3 punkty)
4. ❓ **Pytanie** — jedno pytanie pogłębiające do użytkownika

### Zasady:
- ZANIM odpowiem na złożone pytanie — ustalam najważniejszy kontekst sprawy
- Gdy podaję fakty — oznaczam pewność: ✓ pewne, ~ przybliżone, ? do weryfikacji
- **Pogrubiam** kluczowe terminy przy pierwszym użyciu
- Używam list numerowanych dla kroków, punktowanych dla opcji
- Maksymalnie 3 akapity + rekomendacja
- Korzystam z całej historii rozmowy, gdy pomaga to odpowiedzieć konkretniej

### Styl:
- Język: polski
- Ton: profesjonalny, ciepły i przystępny
- Gdy używam terminu branżowego — wyjaśniam go w nawiasie
- W razie potrzeby wskazuję, które fakty, dokumenty lub przepisy wymagają weryfikacji

## CZEGO NIE ROBIĘ
- Nie udaję pewności w kwestiach zależnych od aktualnego prawa lub akt sprawy
- Nie udaję, że wiem coś, czego nie wiem
- Nie przedstawiam roboczej analizy jako indywidualnej porady prawnej — zalecam weryfikację przez profesjonalnego pełnomocnika`;

const safetyPrompt = `

## OBSLUGA BLEDOW:
- Jesli narzedzie zwroci blad — NIE powtarzaj tego samego wywolania
- Zamiast tego: poinformuj uzytkownika i zaproponuj alternatywe
- Przyklad: jesli pogoda nie dziala → 'Nie udalo sie sprawdzic pogody w X. Moge poszukac w Google lub sprobowac innego miasta.'
- NIGDY nie wywoluj tego samego narzedzia z tymi samymi argumentami dwa razy z rzedu
- Jesli po 3 nieudanych probach nie masz danych — powiedz wprost czego brakuje`;

const systemPrompts = {
  casual: `${professionalPersona}

Tryb PRAKTYCZNY:
Pisz jasno, krótko i konkretnie. Najpierw podaj wniosek, potem uzasadnienie i kolejne kroki.${safetyPrompt}`,
  expert: `${professionalPersona}

Tryb EKSPERT:
Zachowaj strukturę profesjonalnej odpowiedzi. Pisz bardziej szczegółowo, precyzyjnie i technicznie, ale nadal zrozumiale.${safetyPrompt}`,
  creative: `${professionalPersona}

Tryb REDAKCJA:
Pomagaj tworzyć robocze projekty pism, tez, pytań i checklist. Oznaczaj miejsca wymagające uzupełnienia danymi ze sprawy.${safetyPrompt}`,
} as const;

const searchPrompt = `Jesteś asystentem prawnym wspierającym analizę aktualnych przepisów i orzecznictwa. Odpowiadasz po polsku, jasno i konkretnie.

Masz dostęp do prawdziwego wyszukiwania Google oraz narzędzia readWebPage do czytania stron WWW.

Zasady:
- Gdy pytanie dotyczy aktualnego przepisu, orzecznictwa, terminu lub procedury, użyj wyszukiwania.
- Preferuj oficjalne źródła: ISAP, RCL, Sąd Najwyższy, sądy i uznane bazy orzeczeń.
- Gdy użytkownik poda URL, użyj readWebPage i streść najważniejszą treść strony.
- Gdy korzystasz ze źródeł, podaj linki w odpowiedzi.
- Jeśli czegoś nie da się potwierdzić w źródłach, powiedz to wprost.
- Jeśli pytanie nie wymaga internetu, odpowiedz normalnie bez wyszukiwania.${safetyPrompt}`;

const visionPrompt = `Jesteś asystentem analizującym materiały wizualne związane ze sprawą: skany dokumentów, schematy, zrzuty ekranu i materiały dowodowe.

Odpowiadasz po polsku, konkretnie i praktycznie.

Zasady:
- Jeśli użytkownik prosi o opis, opisz najważniejsze elementy obrazu.
- Jeśli użytkownik prosi o tekst ze screena, wyciągnij cały widoczny tekst możliwie dokładnie.
- Jeśli użytkownik pyta o kolory, podaj dominujące kolory i przybliżone kody HEX.
- Jeśli obraz pokazuje błąd techniczny, wyjaśnij prawdopodobną przyczynę i podaj kroki naprawy.
- Jeśli materiał jest nieczytelny, wskaż, których fragmentów nie da się rzetelnie ocenić.${safetyPrompt}`;

const agentPrompt = `Jesteś Agentem AI - Pełna moc. Masz dostęp do kalkulatora, daty i czasu, Google Search, czytania stron, generowania obrazów oraz analizy obrazów przesłanych przez użytkownika.

Odpowiadasz po polsku, konkretnie i działasz autonomicznie:
- Gdy trzeba policzyć, użyj calculator.
- Gdy pytanie dotyczy aktualnych informacji, użyj Google Search.
- Gdy użytkownik poda URL lub trzeba sprawdzić stronę, użyj readWebPage.
- Gdy użytkownik prosi o logo, grafikę, ilustrację albo post wizualny, użyj generateImage.
- Gdy użytkownik wklei screenshot, przeanalizuj obraz w odpowiedzi.
- Łącz narzędzia, gdy zadanie tego wymaga.${safetyPrompt}`;

const models = {
  flash: "gemini-3.1-flash-lite",
  pro: "gemini-3.1-flash-lite",
} as const;
const flashFallbackModel = "gemini-3.1-flash-lite";
const maxSteps = 3;
const enableSearchGrounding = process.env.ENABLE_SEARCH_GROUNDING === "true";
const agentTextTimeout = { totalMs: 25000, stepMs: 14000, toolMs: 8000 };
const chatTextTimeout = { totalMs: 30000, stepMs: 15000, toolMs: 8000 };
const imageGenerationTimeoutMs = 25000;
const knowledgePrompt = `

## PRYWATNA BAZA WIEDZY PRAWNICZEJ:
Masz dostęp do prywatnej bazy wiedzy zalogowanego użytkownika przez narzędzie searchKnowledge.

ZASADY KORZYSTANIA Z BAZY WIEDZY:
1. Użyj searchKnowledge, gdy odpowiedź może zależeć od dokumentów zapisanych przez użytkownika.
2. Oddzielaj treść znalezioną w bazie od własnej analizy i nie dopisuj faktów, których nie ma w dokumentach.
3. Jeśli baza nie zawiera odpowiedzi, powiedz: "Nie znalazłem tego w prywatnej bazie wiedzy." Nie udawaj, że dokument istnieje.
4. Przy analizie pisma szukaj przede wszystkim argumentów, podstaw prawnych, wniosków, dowodów, terminów i ryzyk procesowych.
5. Gdy korzystasz z dokumentów, dodaj na końcu: "Źródła z bazy: [tytuł dokumentu]".`;

if (enableSearchGrounding) {
  console.warn(
    "UWAGA: Search Grounding jest WLACZONY. " +
      "To jest najdrozsza funkcja API ($14/1000 zapytan). " +
      "Uzywaj TYLKO do testow. Wylacz po testach usuwajac ENABLE_SEARCH_GROUNDING z .env.local, " +
      "bo inni użytkownicy mogą wtedy mieć ograniczony dostęp do modeli.",
  );
}

type ReadWebPageInput = {
  url: string;
};
type CalculatorInput = {
  expression: string;
};
type GenerateImageInput = {
  prompt: string;
};
type SaveUserNameInput = {
  name: string;
};
type SaveUserPreferenceInput = {
  key: string;
  value: string;
};
type SearchKnowledgeInput = {
  query: string;
};

const readWebPageInputSchema = jsonSchema<ReadWebPageInput>(
  {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Pełny adres URL strony internetowej do przeczytania.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  {
    validate: (value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "url" in value &&
        typeof value.url === "string"
      ) {
        return { success: true, value: { url: value.url } };
      }

      return {
        success: false,
        error: new Error("Parametr url musi być tekstem."),
      };
    },
  },
);

const calculatorInputSchema = jsonSchema<CalculatorInput>(
  {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description:
          "Działanie matematyczne, np. 8500 * 0.23 albo (8500 + 1955).",
      },
    },
    required: ["expression"],
    additionalProperties: false,
  },
  {
    validate: (value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "expression" in value &&
        typeof value.expression === "string"
      ) {
        return { success: true, value: { expression: value.expression } };
      }

      return {
        success: false,
        error: new Error("Parametr expression musi być tekstem."),
      };
    },
  },
);

const generateImageInputSchema = jsonSchema<GenerateImageInput>(
  {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Opis obrazu do wygenerowania.",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  {
    validate: (value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "prompt" in value &&
        typeof value.prompt === "string"
      ) {
        return { success: true, value: { prompt: value.prompt } };
      }

      return {
        success: false,
        error: new Error("Parametr prompt musi być tekstem."),
      };
    },
  },
);

const saveUserNameInputSchema = jsonSchema<SaveUserNameInput>(
  {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Imię użytkownika do zapamiętania.",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
  {
    validate: (value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "name" in value &&
        typeof value.name === "string"
      ) {
        return { success: true, value: { name: value.name } };
      }

      return {
        success: false,
        error: new Error("Parametr name musi być tekstem."),
      };
    },
  },
);

const saveUserPreferenceInputSchema = jsonSchema<SaveUserPreferenceInput>(
  {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Krótki klucz preferencji, np. miasto lub ulubione_jedzenie.",
      },
      value: {
        type: "string",
        description: "Wartość preferencji użytkownika.",
      },
    },
    required: ["key", "value"],
    additionalProperties: false,
  },
  {
    validate: (value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "key" in value &&
        "value" in value &&
        typeof value.key === "string" &&
        typeof value.value === "string"
      ) {
        return {
          success: true,
          value: { key: value.key, value: value.value },
        };
      }

      return {
        success: false,
        error: new Error("Parametry key i value muszą być tekstami."),
      };
    },
  },
);

const searchKnowledgeInputSchema = jsonSchema<SearchKnowledgeInput>(
  {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Pytanie do prywatnej bazy wiedzy prawniczej, np. jakie stanowisko wynika z pisma albo jakie orzeczenia zapisano w sprawie.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  {
    validate: (value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "query" in value &&
        typeof value.query === "string"
      ) {
        return { success: true, value: { query: value.query } };
      }

      return {
        success: false,
        error: new Error("Parametr query musi byc tekstem."),
      };
    },
  },
);

const knowledgeTools = {
  searchKnowledge: tool({
    description:
      "Wyszukuje informacje w prywatnej bazie wiedzy prawniczej użytkownika: pisma, przepisy, orzeczenia, komentarze, wzory i dokumenty spraw.",
    inputSchema: searchKnowledgeInputSchema,
    execute: async ({ query }) => searchKnowledge(query),
  }),
};

function createKnowledgeTools(
  userId: string | null,
  database?: SupabaseClient | null,
) {
  return {
    searchKnowledge: tool({
      description:
        "Wyszukuje informacje w prywatnej bazie wiedzy prawniczej zalogowanego użytkownika: pisma, przepisy, orzeczenia, komentarze, wzory i dokumenty spraw.",
      inputSchema: searchKnowledgeInputSchema,
      execute: async ({ query }) =>
        searchKnowledge(query, userId, database),
    }),
  };
}

const googleSearchTools = {
  google_search: google.tools.googleSearch({}),
};

const webTools = {
  ...knowledgeTools,
  ...(enableSearchGrounding ? googleSearchTools : {}),
  readWebPage: tool({
    description:
      "Pobiera i czyta zawartość strony internetowej. Używaj gdy użytkownik poda URL lub gdy chcesz przeczytać artykuł/stronę znalezioną w wyszukiwarce.",
    inputSchema: readWebPageInputSchema,
    execute: async ({ url }) => readWebPage(url),
  }),
};

const localTools = {
  ...knowledgeTools,
  readWebPage: webTools.readWebPage,
  calculator: tool({
    description:
      "Wykonuje bezpieczne obliczenia matematyczne potrzebne do analizy sprawy, terminów, udziałów i prostych działań.",
    inputSchema: calculatorInputSchema,
    execute: async ({ expression }) => calculateExpression(expression),
  }),
  currentDateTime: tool({
    description:
      "Zwraca aktualną datę i godzinę w Polsce. Używaj, gdy pytanie dotyczy dzisiaj, teraz, daty lub czasu.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => {
      const now = new Date();

      return {
        iso: now.toISOString(),
        poland: new Intl.DateTimeFormat("pl-PL", {
          dateStyle: "full",
          timeStyle: "medium",
          timeZone: "Europe/Warsaw",
        }).format(now),
      };
    },
  }),
  generateImage: tool({
    description:
      "Generuje obraz na podstawie opisu. Używaj gdy użytkownik prosi o logo, grafikę, ilustrację, post wizualny.",
    inputSchema: generateImageInputSchema,
    execute: async ({ prompt }) => {
      try {
        return await generateImageWithGoogle(prompt);
      } catch (error) {
        return {
          error: getImageErrorMessage(error),
        };
      }
    },
  }),
};

type StoredUserProfile = {
  id: string;
  display_name: string | null;
  preferences: Record<string, string> | null;
};

async function getUserProfile(
  userId: unknown,
  database?: SupabaseClient | null,
) {
  const profileDatabase = database ?? supabase;

  if (!profileDatabase || typeof userId !== "string" || !userId.trim()) {
    return null;
  }

  const { data, error } = await profileDatabase
    .from("user_profiles")
    .select("id, display_name, preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const profile = data as StoredUserProfile | null;

  return profile as StoredUserProfile | null;
}

function buildProfilePrompt(profile: StoredUserProfile | null) {
  if (profile?.display_name) {
    const preferences = profile.preferences ?? {};
    const preferenceText = Object.keys(preferences).length
      ? ` Zapamiętane preferencje: ${JSON.stringify(preferences)}.`
      : "";

    return `\n\nUżytkownik ma na imię ${profile.display_name}. Zwracaj się do niego po imieniu. Bądź ciepły i personalny — to Twój stały użytkownik.${preferenceText}`;
  }

  return "\n\nNie znasz jeszcze imienia użytkownika. Na początku rozmowy zapytaj o nie grzecznie. Gdy użytkownik poda imię, użyj narzędzia updateUserName, aby je zapamiętać.";
}

function createProfileTools(
  userId: string | null,
  database?: SupabaseClient | null,
) {
  const profileDatabase = database ?? supabase;

  return {
    updateUserName: tool({
      description:
        "Zapisuje imię użytkownika w jego profilu. Użyj, gdy użytkownik poda swoje imię.",
      inputSchema: saveUserNameInputSchema,
      execute: async ({ name }: SaveUserNameInput) => {
        if (!profileDatabase || !userId) {
          return { saved: false, error: "Brak identyfikatora użytkownika." };
        }

        const cleanedName = name.trim().replace(/\s+/g, " ").slice(0, 80);
        if (!cleanedName) {
          return { saved: false, error: "Imię nie może być puste." };
        }

        const { error } = await profileDatabase
          .from("user_profiles")
          .upsert(
            { id: userId, display_name: cleanedName },
            { onConflict: "id" },
          );

        if (error) {
          return { saved: false, error: error.message };
        }

        return { saved: true, name: cleanedName };
      },
    }),
    saveUserPreference: tool({
      description:
        "Zapisuje preferencję użytkownika bez nadpisywania pozostałych preferencji.",
      inputSchema: saveUserPreferenceInputSchema,
      execute: async ({ key, value }: SaveUserPreferenceInput) => {
        const cleanKey = key.trim().slice(0, 80);
        const cleanValue = value.trim().slice(0, 200);
        if (!cleanKey || !cleanValue) {
          return { saved: false, error: "Klucz i wartość nie mogą być puste." };
        }

        if (!profileDatabase || !userId) {
          return { saved: false, error: "Brak identyfikatora użytkownika." };
        }

        const { data: profile, error: profileError } = await profileDatabase
          .from("user_profiles")
          .select("preferences")
          .eq("id", userId)
          .maybeSingle();

        if (profileError) {
          return { saved: false, error: profileError.message };
        }

        const preferences = {
          ...((profile?.preferences as Record<string, string> | null) ?? {}),
          [cleanKey]: cleanValue,
        };
        const { error } = await profileDatabase
          .from("user_profiles")
          .upsert({ id: userId, preferences }, { onConflict: "id" });

        if (error) {
          return { saved: false, error: error.message };
        }

        return { saved: true, key: cleanKey, value: cleanValue };
      },
    }),
  };
}

const draftPrompt = `Jesteś asystentem prawniczym i tworzysz robocze projekty pism procesowych.

Jeśli użytkownik zaczyna wiadomość od słowa "projekt", przygotuj wyłącznie uporządkowany projekt wskazanego pisma.

Zasady redakcji:
- Pisz po polsku, jasno i profesjonalnie.
- Nie wymyślaj faktów, sygnatur, dat ani przepisów. Oznacz brakujące dane nawiasami kwadratowymi.
- Rozdziel stan faktyczny, podstawę argumentacji, wnioski i uzasadnienie.
- Zachowaj neutralny język i dodaj krótką checklistę elementów do weryfikacji przez prawnika.
- Nie przedstawiaj projektu jako gotowej porady prawnej ani gwarancji wyniku.
- Jeśli użytkownik poda typ pisma, dopasuj strukturę do tego pisma.

Przygotuj zwięzły, edytowalny dokument z nagłówkami i miejscami do uzupełnienia.`;

type ChatMode = keyof typeof systemPrompts;
type AiModel = keyof typeof models;
type ChatRequestMessage = UIMessage & {
  content?: unknown;
};
type AttachedImage = {
  data: string;
  mediaType: string;
};

type AttachedTextFile = {
  name: string;
  text: string;
};

function getChatMode(mode: unknown): ChatMode {
  return mode === "expert" || mode === "creative" ? mode : "casual";
}

function getAiModel(model: unknown): AiModel {
  return model === "pro" ? "pro" : "flash";
}

function getTextFromMessage(message: ChatRequestMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
  }

  return "";
}

function getLastUserText(messages: unknown) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as ChatRequestMessage | undefined;

    if (message?.role === "user") {
      return getTextFromMessage(message);
    }
  }

  return "";
}

function isDraftCommand(text: string) {
  const normalizedText = text.trim().toLowerCase();

  return normalizedText.startsWith("projekt");
}

function getDraftDetails(text: string) {
  return text.trim().slice("projekt".length).trim();
}

function parseAttachedImage(image: unknown): AttachedImage | null {
  if (typeof image !== "string" || !image.trim()) {
    return null;
  }

  const trimmedImage = image.trim();
  const dataUrlMatch = /^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i.exec(
    trimmedImage,
  );

  if (dataUrlMatch) {
    return {
      mediaType: dataUrlMatch[1].toLowerCase(),
      data: dataUrlMatch[2],
    };
  }

  return {
    mediaType: "image/png",
    data: trimmedImage,
  };
}

function addAttachmentsToLastUserMessage({
  messages,
  image,
  attachment,
  text,
}: {
  messages: ModelMessage[];
  image: AttachedImage | null;
  attachment?: AttachedTextFile | null;
  text: string;
}) {
  if (!image && !attachment) {
    return messages;
  }

  const nextMessages = [...messages];
  const lastUserIndex = nextMessages.findLastIndex(
    (message) => message.role === "user",
  );

  const content = [
    ...(image
      ? [{
          type: "image" as const,
          image: image.data,
          mediaType: image.mediaType,
        }]
      : []),
    {
      type: "text" as const,
      text: attachment
        ? `Załącznik: ${attachment.name}\n\nTreść załącznika:\n${attachment.text}\n\nPytanie użytkownika:\n${text || "Przeanalizuj załączone pismo."}`
        : text || "Przeanalizuj załączony materiał.",
    },
  ];

  if (lastUserIndex === -1) {
    nextMessages.push({ role: "user", content });
    return nextMessages;
  }

  nextMessages[lastUserIndex] = {
    ...nextMessages[lastUserIndex],
    role: "user",
    content,
  };

  return nextMessages;
}

function isQuotaError(error: unknown) {
  const maybeStatus = error as { statusCode?: unknown };
  const message = error instanceof Error ? error.message : String(error);

  return maybeStatus.statusCode === 429 || message.toLowerCase().includes("quota");
}

function isTimeoutError(error: unknown) {
  const maybeError = error as { name?: unknown; code?: unknown };
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return (
    maybeError.name === "AbortError" ||
    maybeError.code === "ETIMEDOUT" ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("przekroczono limit czasu") ||
    normalizedMessage.includes("deadline")
  );
}

function isRecoverableGenerationError(error: unknown) {
  const maybeStatus = error as { statusCode?: unknown; status?: unknown };
  const status = maybeStatus.statusCode ?? maybeStatus.status;
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return (
    isQuotaError(error) ||
    isTimeoutError(error) ||
    status === 400 ||
    status === 404 ||
    status === 503 ||
    normalizedMessage.includes("high demand") ||
    normalizedMessage.includes("overloaded") ||
    normalizedMessage.includes("try again later") ||
    normalizedMessage.includes("not found") ||
    normalizedMessage.includes("not supported") ||
    normalizedMessage.includes("invalid_request")
  );
}

function getGenerationProblemMessage(error: unknown) {
  if (isQuotaError(error)) {
    return "limit Google Gemini API jest teraz wyczerpany";
  }

  if (isTimeoutError(error)) {
    return "model lub narzędzie odpowiadało zbyt długo";
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("high demand") ||
    normalizedMessage.includes("overloaded") ||
    normalizedMessage.includes("try again later")
  ) {
    return "model Google jest teraz przeciążony";
  }

  if (message) {
    return message;
  }

  return "nieznany problem po stronie modelu";
}

function getChatApiErrorMessage(error: unknown) {
  if (isTimeoutError(error)) {
    return "Model odpowiadał zbyt długo, więc przerwałem zadanie. Spróbuj ponownie albo podziel polecenie na krótsze kroki.";
  }

  if (isQuotaError(error)) {
    return "Limit Google Gemini API jest teraz wyczerpany. Spróbuj ponownie za chwilę albo użyj klucza z dostępnym limitem.";
  }

  if (isRecoverableGenerationError(error)) {
    return `Model nie zwrócił poprawnej odpowiedzi: ${getGenerationProblemMessage(error)}.`;
  }

  return "Nie udało się obsłużyć wiadomości czatu.";
}

function calculateExpression(expression: string) {
  const normalizedExpression = expression.replace(/,/g, ".").trim();

  if (/\b(import|require|eval|process)\b/i.test(normalizedExpression)) {
    return {
      error: "Wyrażenie zawiera niedozwolone znaki",
    };
  }

  if (!/^[\d+\-*/().\s%]+$/.test(normalizedExpression)) {
    return {
      error:
        "Kalkulator obsługuje tylko liczby, nawiasy oraz operatory + - * / %.",
    };
  }

  try {
    const result = Function(`"use strict"; return (${normalizedExpression});`)();

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return { error: `Nie mogę obliczyć: ${expression}` };
    }

    return {
      expression: normalizedExpression,
      result,
    };
  } catch {
    return { error: `Nie mogę obliczyć: ${expression}` };
  }
}

function getGoogleApiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

function getImageErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('"code":429') || message.includes("RESOURCE_EXHAUSTED")) {
    return "Limit Google AI Studio dla modelu obrazowego jest teraz wyczerpany. Spróbuj ponownie później albo użyj klucza z dostępnym limitem.";
  }

  try {
    const parsed = JSON.parse(message) as { error?: { message?: string } };
    return parsed.error?.message || message;
  } catch {
    return message || "Nieznany błąd generowania obrazu.";
  }
}

async function generateImageWithGoogle(prompt: string) {
  const apiKey = getGoogleApiKey();

  if (!apiKey) {
    throw new Error(
      "Brakuje klucza GOOGLE_API_KEY lub GOOGLE_GENERATIVE_AI_API_KEY w pliku .env.local.",
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), imageGenerationTimeoutMs);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-image",
      contents: prompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        abortSignal: controller.signal,
        httpOptions: {
          timeout: imageGenerationTimeoutMs,
        },
      },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data);
    const textPart = parts.find((part) => part.text);
    const imageData = imagePart?.inlineData?.data;
    const mimeType = imagePart?.inlineData?.mimeType || "image/png";

    if (!imageData) {
      throw new Error("Model nie zwrócił obrazu. Spróbuj zmienić opis grafiki.");
    }

    return {
      image: `data:${mimeType};base64,${imageData}`,
      text: textPart?.text?.trim() || "Grafika została wygenerowana.",
      prompt,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        "Przekroczono limit czasu generowania grafiki. Spróbuj ponownie za chwilę albo użyj prostszego promptu.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractTextFromHtml(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, 3000);
}

async function readWebPage(url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return `Nie mogę przeczytać strony: "${url}" nie jest poprawnym adresem URL.`;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return "Nie mogę przeczytać strony: obsługuję tylko adresy http:// i https://.";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": "LegalAI/1.0 (+https://moj-agent.vercel.app)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return `Nie udało się pobrać strony ${parsedUrl.toString()}. Serwer zwrócił HTTP ${response.status}.`;
    }

    const html = await response.text();
    const text = extractTextFromHtml(html);

    if (!text) {
      return `Strona ${parsedUrl.toString()} została pobrana, ale nie udało się znaleźć czytelnej treści.`;
    }

    return `Źródło: ${parsedUrl.toString()}\n\n${text}`;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return `Nie udało się pobrać strony ${parsedUrl.toString()}: przekroczono limit 5 sekund.`;
    }

    return `Nie udało się pobrać strony ${parsedUrl.toString()}: ${
      error instanceof Error ? error.message : "strona jest niedostępna"
    }.`;
  } finally {
    clearTimeout(timeout);
  }
}

function appendSources(
  text: string,
  sources: Array<{ sourceType?: string; title?: string; url?: string }>,
) {
  const uniqueSources = Array.from(
    new Map(
      sources
        .filter((source) => source.sourceType === "url" && source.url)
        .map((source) => [source.url, source]),
    ).values(),
  );

  if (uniqueSources.length === 0) {
    return text;
  }

  const sourceLines = uniqueSources
    .slice(0, 6)
    .map((source, index) => {
      const title = source.title?.trim() || `Źródło ${index + 1}`;
      return `${index + 1}. [${title}](${source.url})`;
    })
    .join("\n");

  return `${text.trim()}\n\nŹródła:\n${sourceLines}`;
}

function finalizeKnowledgeAnswer(
  text: string,
  toolResults: Array<{ toolCallId?: string; output?: unknown }>,
) {
  const knowledgeOutputs = toolResults
    .map((toolResult) => toolResult.output)
    .filter(
      (output): output is {
        total_found?: number;
        source_documents?: string[];
      } =>
        typeof output === "object" &&
        output !== null &&
        "total_found" in output &&
        "source_documents" in output,
    );

  if (knowledgeOutputs.length === 0) {
    return text;
  }

  const sourceDocuments = Array.from(
    new Set(
      knowledgeOutputs.flatMap((output) =>
        Array.isArray(output.source_documents)
          ? output.source_documents.filter(
              (source) => typeof source === "string" && source.trim(),
            )
          : [],
      ),
    ),
  );

  if (sourceDocuments.length === 0) {
    return "Nie mam informacji na ten temat w mojej bazie wiedzy.";
  }

  if (/(?:Zrodlo|Zrodla|Źródło|Źródła)\s*:/i.test(text)) {
    return text;
  }

  const label = sourceDocuments.length === 1 ? "Zrodlo" : "Zrodla";

  return `${text.trim()}\n\n${label}: ${sourceDocuments.join(", ")}`;
}

function stringifyPreview(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value.length > 220 ? `${value.slice(0, 220)}...` : value;
  }

  try {
    const text = JSON.stringify(value);
    return text.length > 220 ? `${text.slice(0, 220)}...` : text;
  } catch {
    return String(value);
  }
}

function getToolEmoji(toolName: string) {
  const emojis: Record<string, string> = {
    calculator: "🧮",
    currentDateTime: "🕐",
    google_search: "🌐",
    readWebPage: "📄",
    generateImage: "🎨",
  };

  return emojis[toolName] || "🛠️";
}

function extractImageFromOutput(output: unknown) {
  if (
    typeof output === "object" &&
    output !== null &&
    "image" in output &&
    typeof output.image === "string"
  ) {
    return output.image;
  }

  return undefined;
}

function getToolError(output: unknown) {
  if (
    typeof output === "object" &&
    output !== null &&
    "error" in output &&
    typeof output.error === "string"
  ) {
    return output.error;
  }

  if (
    typeof output === "string" &&
    /"error"\s*:|błąd|blad|nie udało|nie udalo|timeout|przekroczono limit|niedostępna|niedostepna/i.test(output)
  ) {
    try {
      const parsed = JSON.parse(output) as { error?: unknown };
      if (typeof parsed.error === "string") {
        return parsed.error;
      }
    } catch {
      // Plain text errors are returned below.
    }

    return output;
  }

  return "";
}

function buildToolTimeline(result: {
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    providerExecuted?: boolean;
  }>;
  toolResults: Array<{
    toolCallId: string;
    output?: unknown;
  }>;
}) {
  return result.toolCalls.map((toolCall, index) => {
    const matchingResult = result.toolResults.find(
      (toolResult) => toolResult.toolCallId === toolCall.toolCallId,
    );
    const output = "output" in (matchingResult ?? {}) ? matchingResult?.output : undefined;
    const error = getToolError(output);

    return {
      id: toolCall.toolCallId,
      index: index + 1,
      name: toolCall.toolName,
      emoji: getToolEmoji(toolCall.toolName),
      input: stringifyPreview(toolCall.input),
      output: stringifyPreview(output),
      image: extractImageFromOutput(output),
      hasError: Boolean(error),
      error: stringifyPreview(error),
      providerExecuted: toolCall.providerExecuted === true,
    };
  });
}

function buildCalculatorFallback(text: string) {
  const vatMatch =
    /(\d+(?:[.,]\d+)?)\s*%\D+?(\d+(?:[.,]\d+)?)/i.exec(text) ??
    /(\d+(?:[.,]\d+)?).+?(\d+(?:[.,]\d+)?)\s*%/i.exec(text);

  if (vatMatch && /\b(vat|brutto|netto)\b/i.test(text)) {
    const first = Number(vatMatch[1].replace(",", "."));
    const second = Number(vatMatch[2].replace(",", "."));
    const percent = text.indexOf("%") < text.search(/8500|pln/i) ? first : second;
    const amount = percent === first ? second : first;
    const vat = amount * (percent / 100);
    const gross = amount + vat;

    return {
      id: "fallback-calculator",
      index: 1,
      name: "calculator",
      emoji: "🧮",
      input: `${amount} * ${percent / 100}`,
      output: JSON.stringify({
        netto: amount,
        vat,
        brutto: gross,
      }),
      image: undefined,
      hasError: false,
      error: "",
      providerExecuted: false,
    };
  }

  return null;
}

function extractCalculatorExpression(text: string) {
  const match = /(?:ile to|oblicz|policz)\s+(.+)/i.exec(text);
  return (match?.[1] ?? text).replace(/[?.!]+$/g, "").trim();
}

function wantsCurrentInfo(text: string) {
  const normalizedText = text.toLowerCase();

  return [
    "aktualn",
    "najnowsz",
    "wiadomo",
    "trendy",
    "wyszukaj",
    "google",
    "sprawdz",
    "sprawdź",
    "dzisiaj",
    "teraz",
  ].some((keyword) => normalizedText.includes(keyword));
}

function wantsGeneratedImage(text: string) {
  const normalizedText = text.toLowerCase();
  const hasCreateIntent = ["wygeneruj", "stwórz", "stworz", "zrob", "zrób", "zaprojektuj"].some(
    (keyword) => normalizedText.includes(keyword),
  );
  const hasImageTarget = ["grafik", "obraz", "ilustracj", "wizual", "post"].some(
    (keyword) => normalizedText.includes(keyword),
  );

  return hasCreateIntent && hasImageTarget;
}

function createManualToolStep({
  id,
  index,
  name,
  input,
  output,
  image,
}: {
  id: string;
  index: number;
  name: string;
  input: string;
  output: string;
  image?: string;
}) {
  const error = getToolError(output);

  return {
    id,
    index,
    name,
    emoji: getToolEmoji(name),
    input,
    output,
    image,
    hasError: Boolean(error),
    error: stringifyPreview(error),
    providerExecuted: false,
  };
}

async function generateAgentResponse({
  messages,
  image,
  attachment,
  text,
  userId,
  database,
  profilePrompt,
}: {
  messages: ModelMessage[];
  image: AttachedImage | null;
  attachment?: AttachedTextFile | null;
  text: string;
  userId: string | null;
  database?: SupabaseClient | null;
  profilePrompt: string;
}) {
  const startedAt = Date.now();
  const shouldSearch = wantsCurrentInfo(text);
  const shouldGenerateImage = wantsGeneratedImage(text);
  const shouldForceCalculator =
    /\b(vat|brutto|netto|procent|%|ile to)\b/i.test(text) &&
    /\d/.test(text);
  const directCalculatorFallback = buildCalculatorFallback(text);

  if (shouldForceCalculator && /\b(import|require|eval|process)\b/i.test(text)) {
    const expression = extractCalculatorExpression(text);
    const calculatorResult = calculateExpression(expression);
    const toolStep = createManualToolStep({
      id: "blocked-calculator-expression",
      index: 1,
      name: "calculator",
      input: expression,
      output: JSON.stringify(calculatorResult),
    });

    return {
      text:
        "Nie mogę obliczyć tego wyrażenia, bo zawiera niedozwolone elementy. Podaj zwykłe działanie matematyczne, np. 8500 * 0.23.",
      tools: [toolStep],
      images: [],
      metrics: {
        toolCount: 1,
        durationMs: Date.now() - startedAt,
        model: models.flash,
        maxSteps,
      },
    };
  }

  if (shouldForceCalculator && directCalculatorFallback) {
    let calculatorText = directCalculatorFallback.output;

    try {
      const parsed = JSON.parse(directCalculatorFallback.output) as {
        netto?: number;
        vat?: number;
        brutto?: number;
      };

      if (
        typeof parsed.netto === "number" &&
        typeof parsed.vat === "number" &&
        typeof parsed.brutto === "number"
      ) {
        calculatorText = `Kwota netto: ${parsed.netto} zł
VAT: ${parsed.vat} zł
Kwota brutto: ${parsed.brutto} zł`;
      }
    } catch {
      // JSON preview is already good enough as a fallback.
    }

    return {
      text: calculatorText,
      tools: [directCalculatorFallback],
      images: [],
      metrics: {
        toolCount: 1,
        durationMs: Date.now() - startedAt,
        model: models.flash,
        maxSteps,
      },
    };
  }

  const agentSystem = `${agentPrompt}${knowledgePrompt}${profilePrompt}

WAŻNE:
- Nie wywołuj narzędzia generowania grafiki w tej odpowiedzi. Jeśli użytkownik prosi o grafikę, przygotuj najpierw treść posta oraz krótki prompt graficzny.
- Jeśli narzędzie graficzne nie będzie dostępne, odpowiedź tekstowa nadal ma być kompletna.`;
  const modelMessages = addAttachmentsToLastUserMessage({
    messages,
    image,
    attachment,
    text,
  });
  let result: {
    text: string;
    sources: Array<{ sourceType?: string; title?: string; url?: string }>;
    toolCalls: Array<{
      toolCallId: string;
      toolName: string;
      input: unknown;
      providerExecuted?: boolean;
    }>;
    toolResults: Array<{
      toolCallId: string;
      output?: unknown;
    }>;
  };

  let usedModel: string = models.flash;
  const profileTools = createProfileTools(userId, database);
  const privateKnowledgeTools = createKnowledgeTools(userId, database);
  const runAgentGeneration = (modelId: string) =>
      shouldSearch && !shouldForceCalculator
        ? generateText({
            model: google(modelId),
            system: agentSystem,
            messages: modelMessages,
            tools: enableSearchGrounding
              ? { ...googleSearchTools, ...profileTools }
              : { ...localTools, ...privateKnowledgeTools, ...profileTools },
            toolChoice: "auto",
            maxRetries: 0,
            timeout: agentTextTimeout,
            stopWhen: stepCountIs(maxSteps),
          })
        : generateText({
            model: google(modelId),
            system: agentSystem,
            messages: modelMessages,
            tools: { ...localTools, ...privateKnowledgeTools, ...profileTools },
            toolChoice: shouldForceCalculator
              ? { type: "tool", toolName: "calculator" }
              : "auto",
            maxRetries: 0,
            timeout: agentTextTimeout,
            stopWhen: stepCountIs(maxSteps),
          });

  try {
    result = await runAgentGeneration(models.flash);
  } catch (error) {
    if (!isRecoverableGenerationError(error)) {
      throw error;
    }

    try {
      usedModel = flashFallbackModel;
      result = await runAgentGeneration(flashFallbackModel);
    } catch (fallbackError) {
      if (!isRecoverableGenerationError(fallbackError)) {
        throw fallbackError;
      }

      const problem = getGenerationProblemMessage(fallbackError);
      const toolTimeline = [
        ...(shouldSearch
          ? [
              createManualToolStep({
                id: "quota-google-search",
                index: 1,
                name: "google_search",
                input: text,
                output:
                  `Nie uruchomiono wyszukiwania, bo ${problem}.`,
              }),
            ]
          : []),
        ...(shouldGenerateImage
          ? [
              createManualToolStep({
                id: "quota-generate-image",
                index: shouldSearch ? 2 : 1,
                name: "generateImage",
                input: text,
                output:
                  `Nie uruchomiono generowania grafiki, bo ${problem}.`,
              }),
            ]
          : []),
      ];

      return {
        text: `Nie udało się teraz wykonać zadania, bo ${problem}.

Co się stało:
- agent przerwał oczekiwanie, żeby aplikacja się nie zawiesiła,
- model ${models.flash} oraz fallback ${flashFallbackModel} nie oddały poprawnej odpowiedzi w bezpiecznym czasie,
- możesz spróbować ponownie za chwilę albo rozbić zadanie na krótsze kroki.

Twoje zadanie zostało zatrzymane przed wykonaniem: ${text}`,
        tools: toolTimeline,
        images: [],
        metrics: {
          toolCount: toolTimeline.length,
          durationMs: Date.now() - startedAt,
          model: `${models.flash} → ${flashFallbackModel}`,
          maxSteps,
        },
      };
    }
  }
  let textWithSources = finalizeKnowledgeAnswer(
    appendSources(result.text, result.sources),
    result.toolResults,
  );
  let toolTimeline = buildToolTimeline(result);
  const calculatorFallback = buildCalculatorFallback(text);

  if (shouldSearch && !toolTimeline.some((item) => item.name === "google_search")) {
    toolTimeline = [
      createManualToolStep({
        id: "manual-google-search",
        index: 1,
        name: "google_search",
        input: text,
        output:
          enableSearchGrounding && result.sources.length > 0
            ? `Znaleziono ${result.sources.length} źródeł.`
            : "Wyszukiwanie zostało użyte lub zasugerowane, ale model nie zwrócił osobnych źródeł.",
      }),
      ...toolTimeline.map((item) => ({ ...item, index: item.index + 1 })),
    ];
  }

  if (
    calculatorFallback &&
    !toolTimeline.some((item) => item.name === "calculator")
  ) {
    toolTimeline = [
      calculatorFallback,
      ...toolTimeline.map((item) => ({ ...item, index: item.index + 1 })),
    ];
  }

  let finalText = textWithSources.trim();

  if (!finalText && toolTimeline.length > 0) {
    const lastTool = toolTimeline[toolTimeline.length - 1];

    finalText = `Zadanie zostało wykonane narzędziem ${lastTool.name}.

Wynik narzędzia:
${lastTool.output || "Brak dodatkowego opisu wyniku."}`;
  }

  if (shouldGenerateImage) {
    const imagePrompt = `Nowoczesna grafika do posta social media na podstawie zadania: ${text}. Styl: czysty, technologiczny, profesjonalny, czytelna kompozycja, bez drobnego tekstu.`;

    try {
      const imageResult = await generateImageWithGoogle(imagePrompt);

      toolTimeline = [
        ...toolTimeline,
        createManualToolStep({
          id: "manual-generate-image",
          index: toolTimeline.length + 1,
          name: "generateImage",
          input: imagePrompt,
          output: imageResult.text,
          image: imageResult.image,
        }),
      ];
    } catch (error) {
      const imageError = getImageErrorMessage(error);

      toolTimeline = [
        ...toolTimeline,
        createManualToolStep({
          id: "manual-generate-image-error",
          index: toolTimeline.length + 1,
          name: "generateImage",
          input: imagePrompt,
          output: imageError,
        }),
      ];
      finalText = `${finalText.trim()}

Uwaga: tekst zadania został przygotowany, ale grafika nie została wygenerowana, bo narzędzie obrazów zwróciło błąd: ${imageError}`;
    }
  }

  return {
    text: finalText,
    tools: toolTimeline,
    images: toolTimeline
      .filter((item) => item.image)
      .map((item) => ({
        image: item.image,
        prompt: item.input,
      })),
    metrics: {
      toolCount: toolTimeline.length,
      durationMs: Date.now() - startedAt,
      model: usedModel,
      maxSteps,
    },
  };
}

async function generateAnswer({
  messages,
  model,
  prompt,
  system,
  enableWebTools = true,
  userId = null,
  database,
  profilePrompt = "",
}: {
  messages?: Awaited<ReturnType<typeof convertToModelMessages>>;
  model: AiModel;
  prompt?: string;
  system: string;
  enableWebTools?: boolean;
  userId?: string | null;
  database?: SupabaseClient | null;
  profilePrompt?: string;
}) {
  const selectedModel = models[model];
  const profileTools = createProfileTools(userId, database);
  const privateKnowledgeTools = createKnowledgeTools(userId, database);
  const availableTools = enableWebTools
    ? { ...webTools, ...privateKnowledgeTools, ...profileTools }
    : { ...knowledgeTools, ...privateKnowledgeTools, ...profileTools };
  const toolOptions = {
    tools: availableTools,
          stopWhen: stepCountIs(maxSteps),
  };
  const systemWithProfile = `${system}${knowledgePrompt}${profilePrompt}`;

  try {
    if (prompt !== undefined) {
      const result = await generateText({
        model: google(selectedModel),
        system: systemWithProfile,
        prompt,
        maxRetries: 0,
        timeout: chatTextTimeout,
        ...toolOptions,
      });

      return finalizeKnowledgeAnswer(
        appendSources(result.text, result.sources),
        result.toolResults,
      );
    }

    const result = await generateText({
      model: google(selectedModel),
      system: systemWithProfile,
      messages: messages ?? [],
      maxRetries: 0,
      timeout: chatTextTimeout,
      ...toolOptions,
    });

    return finalizeKnowledgeAnswer(
      appendSources(result.text, result.sources),
      result.toolResults,
    );
  } catch (error) {
    if (model === "flash" && isQuotaError(error)) {
      console.warn(
        `Model ${models.flash} wyczerpał limit. Próbuję fallback ${flashFallbackModel}.`,
      );

      if (prompt !== undefined) {
        const fallbackResult = await generateText({
          model: google(flashFallbackModel),
          system: systemWithProfile,
          prompt,
          maxRetries: 0,
          timeout: chatTextTimeout,
          ...toolOptions,
        });

        return finalizeKnowledgeAnswer(
          appendSources(fallbackResult.text, fallbackResult.sources),
          fallbackResult.toolResults,
        );
      }

      const fallbackResult = await generateText({
        model: google(flashFallbackModel),
        system: systemWithProfile,
        messages: messages ?? [],
        maxRetries: 0,
        timeout: chatTextTimeout,
        ...toolOptions,
      });

      return finalizeKnowledgeAnswer(
        appendSources(fallbackResult.text, fallbackResult.sources),
        fallbackResult.toolResults,
      );
    }

    throw error;
  }
}

function createChatResponse(text: string, originalMessages: UIMessage[]) {
  const stream = createUIMessageStream<UIMessage>({
    originalMessages,
    execute: ({ writer }) => {
      const id = `msg-${Date.now()}`;

      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      mode,
      model,
      purpose,
      image,
      attachmentName,
      attachmentText,
      userId,
      authToken,
    }: {
      messages?: unknown;
      mode?: unknown;
      model?: unknown;
      purpose?: unknown;
      image?: unknown;
      attachmentName?: unknown;
      attachmentText?: unknown;
      userId?: unknown;
      authToken?: unknown;
    } =
      await req.json();
    const chatMessages = Array.isArray(messages) ? (messages as UIMessage[]) : [];
    const selectedMode = getChatMode(mode);
    const selectedModel = getAiModel(model);
    const lastMessage = getLastUserText(chatMessages);
    const attachedImage = parseAttachedImage(image);
    const attachedTextFile =
      typeof attachmentText === "string" && attachmentText.trim()
        ? {
            name:
              typeof attachmentName === "string" && attachmentName.trim()
                ? attachmentName.trim().slice(0, 160)
                : "Załączony dokument",
            text: attachmentText.trim().slice(0, 18000),
          }
        : null;
    let activeUserId = typeof userId === "string" ? userId : null;
    let authenticatedDatabase: SupabaseClient | null = null;

    if (typeof authToken === "string" && authToken) {
      const auth = await getAuthenticatedRequest(
        new Request(req.url, {
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        }),
      );
      activeUserId = auth.user.id;
      authenticatedDatabase = auth.database;
    }
    const userProfile = await getUserProfile(activeUserId, authenticatedDatabase);
    const profilePrompt = buildProfilePrompt(userProfile);
    const isDraft = typeof lastMessage === "string" && isDraftCommand(lastMessage);

    if (isDraft) {
      const draftDetails = getDraftDetails(lastMessage);
      const draftQuery = [draftDetails, "wzór pisma procedura argumentacja"]
        .filter(Boolean)
        .join(" ");
      const draftKnowledge = await searchKnowledge(
        draftQuery,
        activeUserId,
        authenticatedDatabase,
      );

      if (draftKnowledge.total_found === 0) {
        return createChatResponse(
          "Nie znalazłem wystarczających informacji w prywatnej bazie wiedzy. Dodaj właściwe pismo, przepis, orzeczenie albo dokument sprawy.",
          chatMessages,
        );
      }

      const knowledgeContext = draftKnowledge.results
        .map(
          (result) =>
            `Dokument: ${result.title}\nTreść:\n${result.content}`,
        )
        .join("\n\n---\n\n");
      const text = await generateAnswer({
        model: selectedModel,
        system: `${draftPrompt}${safetyPrompt}${profilePrompt}

BEZWZGLĘDNE ZASADY DLA TEGO PROJEKTU:
- Korzystaj wyłącznie z poniższych fragmentów dokumentów jako materiału pomocniczego.
- Nie dopisuj faktów, sygnatur ani podstaw prawnych, których nie ma w danych.
- Jeśli czegoś brakuje, oznacz to jako [DO UZUPEŁNIENIA].

FRAGMENTY DOKUMENTÓW:
${knowledgeContext}`,
        enableWebTools: false,
        userId: activeUserId,
        database: authenticatedDatabase,
        profilePrompt: "",
        prompt:
          draftDetails ||
          "Przygotuj projekt pisma i oznacz brakujące dane.",
      });

      const sourceDocuments = draftKnowledge.source_documents ?? [];
      const hasSourceLabel = /(?:Zrodlo|Zrodla|Źródło|Źródła)\s*:/i.test(text);
      const finalText =
        sourceDocuments.length > 0 && !hasSourceLabel
          ? `${text}\n\nŹródło: ${sourceDocuments.join(", ")}`
          : text;

      return createChatResponse(finalText, chatMessages);
    }

    if (purpose === "agent") {
      const result = await generateAgentResponse({
        messages: await convertToModelMessages(chatMessages),
        image: attachedImage,
        attachment: attachedTextFile,
        text: lastMessage,
        userId: activeUserId,
        database: authenticatedDatabase,
        profilePrompt,
      });

      return Response.json(result);
    }

    const text = await generateAnswer({
      model: selectedModel,
      system:
        purpose === "search"
          ? searchPrompt
          : purpose === "vision"
            ? visionPrompt
            : systemPrompts[selectedMode],
      userId: activeUserId,
      database: authenticatedDatabase,
      profilePrompt,
      messages: addAttachmentsToLastUserMessage({
        messages: await convertToModelMessages(chatMessages),
        image: attachedImage,
        attachment: attachedTextFile,
        text: lastMessage,
      }),
    });

    return createChatResponse(text, chatMessages);
  } catch (error) {
    console.error("Chat API error:", error);

    return Response.json(
      {
        error: getChatApiErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
