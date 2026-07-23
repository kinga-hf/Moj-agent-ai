import { google } from "@ai-sdk/google";
import { jsonSchema, stepCountIs, streamText, tool } from "ai";

type ReadWebPageInput = {
  url: string;
};

type SearchWikipediaInput = {
  query: string;
};

type CalculatorInput = {
  expression: string;
};

const model = "gemini-3.1-flash-lite";
const maxSteps = 8;
const enableSearchGrounding = process.env.ENABLE_SEARCH_GROUNDING === "true";

const readWebPageInputSchema = jsonSchema<ReadWebPageInput>({
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "Pełny adres URL strony internetowej do przeczytania.",
    },
  },
  required: ["url"],
  additionalProperties: false,
});

const searchWikipediaInputSchema = jsonSchema<SearchWikipediaInput>({
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Hasło lub temat do wyszukania w Wikipedii.",
    },
  },
  required: ["query"],
  additionalProperties: false,
});

const calculatorInputSchema = jsonSchema<CalculatorInput>({
  type: "object",
  properties: {
    expression: {
      type: "string",
      description: "Proste działanie matematyczne, np. 2500000 * 0.18.",
    },
  },
  required: ["expression"],
  additionalProperties: false,
});

function getTodayLabel() {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
    timeZone: "Europe/Warsaw",
  }).format(new Date());
}

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 9000);
}

async function readWebPage(url: string) {
  try {
    const targetUrl = new URL(url);
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return { error: "Obsługiwane są tylko adresy http i https." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(targetUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AgentAI/1.0)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        error: `Strona zwróciła status ${response.status}.`,
        url: targetUrl.toString(),
      };
    }

    const html = await response.text();

    return {
      url: targetUrl.toString(),
      title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? targetUrl.hostname,
      content: cleanHtml(html),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Nie udało się pobrać strony.",
      url,
    };
  }
}

async function searchWikipedia(query: string) {
  const cleanQuery = query.trim().slice(0, 120);
  if (!cleanQuery) {
    return { results: [] };
  }

  const searchUrl = new URL("https://pl.wikipedia.org/w/api.php");
  searchUrl.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: cleanQuery,
    srlimit: "3",
    format: "json",
    origin: "*",
  }).toString();

  const searchResponse = await fetch(searchUrl);
  const searchData = (await searchResponse.json()) as {
    query?: { search?: Array<{ pageid: number; title: string; snippet: string }> };
  };
  const pages = searchData.query?.search ?? [];

  if (pages.length === 0) {
    return { results: [] };
  }

  const pageIds = pages.map((page) => String(page.pageid)).join("|");
  const detailsUrl = new URL("https://pl.wikipedia.org/w/api.php");
  detailsUrl.search = new URLSearchParams({
    action: "query",
    pageids: pageIds,
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    format: "json",
    origin: "*",
  }).toString();

  const detailsResponse = await fetch(detailsUrl);
  const detailsData = (await detailsResponse.json()) as {
    query?: {
      pages?: Record<
        string,
        { title: string; extract?: string; fullurl?: string }
      >;
    };
  };
  const details = detailsData.query?.pages ?? {};

  return {
    results: pages.map((page) => ({
      title: page.title,
      url: details[String(page.pageid)]?.fullurl,
      extract: details[String(page.pageid)]?.extract?.slice(0, 1800) ?? "",
    })),
  };
}

function calculateExpression(expression: string) {
  const cleaned = expression.replace(/,/g, ".").trim();

  if (!/^[\d\s.+\-*/()%]+$/.test(cleaned)) {
    return { error: "Dozwolone są tylko liczby i podstawowe operatory matematyczne." };
  }

  try {
    const result = Function(`"use strict"; return (${cleaned});`)() as unknown;

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return { error: "Wynik nie jest poprawną liczbą." };
    }

    return { expression: cleaned, result };
  } catch {
    return { error: "Nie udało się obliczyć wyrażenia." };
  }
}

function buildReportPrompt(today: string) {
  return `Jesteś profesjonalnym analitykiem biznesowym. Gdy użytkownik poda temat, AUTONOMICZNIE zbierasz informacje i piszesz raport.

## TWÓJ PROCES:
1. Przeanalizuj temat - co trzeba zbadać?
2. Szukaj danych: Google Search, Wikipedia, strony branżowe
3. Zbierz fakty, liczby, statystyki
4. Napisz raport w profesjonalnym formacie

## FORMAT RAPORTU:

# 📊 Raport: [TEMAT]
Data: ${today}
Autor: Agent AI

## Streszczenie (Executive Summary)
[3-4 zdania - kluczowe wnioski]

## 1. Wprowadzenie
[Kontekst, dlaczego ten temat jest ważny]

## 2. Kluczowe dane i fakty
[Wylistowane punkty z danymi - ze źródłami]

## 3. Analiza
[Interpretacja danych, trendy, porównania]

## 4. Wnioski i rekomendacje
[Co z tego wynika? Co robić?]

## Implikacje biznesowe
[Najważniejsze skutki dla decyzji, zespołu, budżetu lub strategii]

## Appendix
[Krótka lista założeń, ograniczeń i dodatkowych uwag]

## Źródła
[Lista użytych źródeł z linkami]

ZASADY:
- Używaj prawdziwych danych i źródeł.
- Jeśli Google Search jest niedostępny, korzystaj z Wikipedii, readWebPage i jasno nazwij ograniczenia.
- Podawaj źródła przy ważnych faktach.
- Bądź konkretny: liczby, daty, nazwy.
- Raport powinien mieć 500-1000 słów.
- Nie wymyślaj statystyk. Jeśli czegoś nie potwierdzisz, napisz to wprost.
- Pisz po polsku, profesjonalnie i czytelnie.`;
}

export async function POST(req: Request) {
  try {
    const { topic }: { topic?: unknown } = await req.json();
    const cleanTopic = typeof topic === "string" ? topic.trim().slice(0, 300) : "";

    if (!cleanTopic) {
      return Response.json(
        { error: "Podaj temat raportu." },
        { status: 400 },
      );
    }

    const tools = {
      ...(enableSearchGrounding ? { google_search: google.tools.googleSearch({}) } : {}),
      readWebPage: tool({
        description: "Pobiera i czyta zawartość strony internetowej.",
        inputSchema: readWebPageInputSchema,
        execute: async ({ url }) => readWebPage(url),
      }),
      searchWikipedia: tool({
        description: "Wyszukuje temat w Wikipedii i zwraca krótkie opisy oraz linki.",
        inputSchema: searchWikipediaInputSchema,
        execute: async ({ query }) => searchWikipedia(query),
      }),
      calculator: tool({
        description: "Wykonuje proste obliczenia matematyczne do raportu.",
        inputSchema: calculatorInputSchema,
        execute: async ({ expression }) => calculateExpression(expression),
      }),
    };

    const result = streamText({
      model: google(model),
      system: buildReportPrompt(getTodayLabel()),
      prompt: `Przygotuj raport biznesowy na temat: ${cleanTopic}`,
      tools,
      stopWhen: stepCountIs(maxSteps),
      maxRetries: 0,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Report API error:", error);

    return Response.json(
      { error: "Nie udało się wygenerować raportu." },
      { status: 500 },
    );
  }
}
