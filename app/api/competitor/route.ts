import { google } from "@ai-sdk/google";
import { jsonSchema, stepCountIs, streamText, tool } from "ai";

type ReadWebPageInput = {
  url: string;
};

type SearchWikipediaInput = {
  query: string;
};

const model = "gemini-3.1-flash-lite";
const maxSteps = 10;
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
      description: "Nazwa firmy, produktu lub tematu do wyszukania w Wikipedii.",
    },
  },
  required: ["query"],
  additionalProperties: false,
});

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

const competitorPrompt = `Jesteś analitykiem konkurencji. Gdy użytkownik poda nazwy firm,
AUTONOMICZNIE zbierasz informacje i porównujesz je.

## TWÓJ PROCES:
1. Dla KAŻDEJ firmy: szukaj informacji (Google, Wikipedia, strony firmowe)
2. Zbierz: opis, branża, wielkość, produkty, ceny, mocne/słabe strony
3. Stwórz tabelę porównawczą
4. Napisz rekomendację

## FORMAT:

# 🏢 Analiza konkurencji

## Porównanie

| Aspekt | [Firma 1] | [Firma 2] | [Firma 3] |
|--------|-----------|-----------|-----------|
| Branża | ... | ... | ... |
| Wielkość | ... | ... | ... |
| Główny produkt | ... | ... | ... |
| Mocne strony | ... | ... | ... |
| Słabe strony | ... | ... | ... |
| Ceny (orientacyjne) | ... | ... | ... |

## Szczegółowa analiza
[Rozwinięcie dla każdej firmy - 3-4 zdania]

## Rekomendacja
[Która firma jest najlepsza i dlaczego - w kontekście użytkownika]

## Źródła
[Linki do stron firmowych i artykułów]

ZASADY:
- Pisz po polsku.
- Podawaj źródła przy istotnych faktach.
- Jeśli cena lub wielkość firmy nie jest potwierdzona, napisz "brak jednoznacznych danych" zamiast zgadywać.
- Jeśli Google Search jest wyłączony, używaj Wikipedii i oficjalnych stron, a w źródłach nazwij ograniczenia.
- Bądź konkretny i praktyczny.`;

function normalizeCompanies(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((company): company is string => typeof company === "string")
    .map((company) => company.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function POST(req: Request) {
  try {
    const {
      companies,
      context,
    }: {
      companies?: unknown;
      context?: unknown;
    } = await req.json();
    const cleanCompanies = normalizeCompanies(companies);
    const cleanContext = typeof context === "string" ? context.trim().slice(0, 600) : "";

    if (cleanCompanies.length < 2) {
      return Response.json(
        { error: "Podaj co najmniej dwie firmy do porównania." },
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
        description: "Wyszukuje firmę lub produkt w Wikipedii i zwraca krótkie opisy oraz linki.",
        inputSchema: searchWikipediaInputSchema,
        execute: async ({ query }) => searchWikipedia(query),
      }),
    };

    const result = streamText({
      model: google(model),
      system: competitorPrompt,
      prompt: [
        `Porównaj firmy: ${cleanCompanies.join(", ")}.`,
        cleanContext ? `Kontekst decyzji użytkownika: ${cleanContext}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      tools,
      stopWhen: stepCountIs(maxSteps),
      maxRetries: 0,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Competitor API error:", error);

    return Response.json(
      { error: "Nie udało się przygotować analizy konkurencji." },
      { status: 500 },
    );
  }
}
