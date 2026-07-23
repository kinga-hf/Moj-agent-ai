import { google } from "@ai-sdk/google";
import { jsonSchema, stepCountIs, streamText, tool } from "ai";

type ReadWebPageInput = {
  url: string;
};

type SearchWikipediaInput = {
  query: string;
};

const model = "gemini-3.1-flash-lite";
const maxSteps = 8;

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
      description: "Pojęcie prawne lub doktrynalne do wyszukania w Wikipedii.",
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
    .slice(0, 10000);
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
      title:
        /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ??
        targetUrl.hostname,
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
    query?: { search?: Array<{ pageid: number; title: string }> };
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

function getTodayLabel() {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
    timeZone: "Europe/Warsaw",
  }).format(new Date());
}

const legalBriefingPrompt = `Jesteś narzędziem Legal Opposition Summarizer & Briefing Tool dla prawnika procesowego. Analizujesz pisma procesowe przeciwnika: sprzeciwy, apelacje, odpowiedzi na pozew i podobne pisma.

Twoim celem jest zwięzła synteza treści, a nie kalkulacja kosztów. Całkowicie pomiń wyliczenia finansowe, opłaty, odsetki, koszty zastępstwa procesowego i budżet sprawy.

## NARZĘDZIA I PROCES
1. Najpierw ustal główną tezę przeciwnika na podstawie treści pisma.
2. Wyodrębnij tylko kluczowe zarzuty, bez przepisywania całego pisma.
3. Wyodrębnij wnioski procesowe i dowodowe.
4. Użyj Google Search, aby znaleźć 1-2 aktualne orzeczenia Sądu Najwyższego lub sądów apelacyjnych, które mogą obalać albo osłabiać główny zarzut przeciwnika. Podaj link i krótko wyjaśnij przydatność.
5. Użyj Wikipedii tylko wtedy, gdy w piśmie występują pojęcia doktrynalne lub procesowe, które warto krótko zdefiniować.

## FORMAT ODPOWIEDZI

# ⚖️ Legal Opposition Summarizer & Briefing Tool
Data briefingu: [data]
Rodzaj pisma: [rodzaj]

## 1. Główna teza przeciwnika
[2-3 zwięzłe zdania. Bez długiego streszczania.]

## 2. Kluczowe zarzuty
- **[zarzut]** - [krótko: czego dotyczy i jakie ma znaczenie]
- **[zarzut]** - ...

## 3. Wnioski procesowe i dowodowe
| Wniosek | Charakter | Znaczenie dla sprawy |
|---|---|---|
| ... | procesowy / dowodowy | ... |

## 4. Pojęcia wymagające szybkiego wyjaśnienia
[Jeśli występują: krótka definicja i źródło. Jeśli brak, napisz: "Nie wykryto pojęć wymagających definicji."]

## 5. Orzecznictwo do kontrargumentacji
| Główny zarzut | Orzeczenie / źródło | Jak może pomóc |
|---|---|---|
| ... | ... | ... |

## 6. Checklist dla prawnika
- [co sprawdzić w aktach]
- [jakie dowody przygotować]
- [jaki kontrargument rozważyć]

## Zastrzeżenie
To jest roboczy briefing, nie porada prawna. Wymaga weryfikacji w aktach sprawy, przepisach i aktualnym orzecznictwie.

ZASADY:
- Pisz po polsku.
- Bądź zwięzły i selektywny.
- Nie cytuj długich fragmentów pisma.
- Nie wykonuj żadnych wyliczeń finansowych.
- Jeśli treść pisma jest zbyt krótka, wskaż czego brakuje do rzetelnej analizy.
- Jeżeli Google Search nie zwróci pewnego orzecznictwa, napisz to wprost i zaproponuj frazy do dalszego sprawdzenia w bazach prawniczych.`;

function asCleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(req: Request) {
  try {
    const {
      pleadingType,
      pleadingText,
      caseContext,
    }: {
      pleadingType?: unknown;
      pleadingText?: unknown;
      caseContext?: unknown;
    } = await req.json();

    const cleanPleadingType = asCleanText(pleadingType, 120);
    const cleanPleadingText = asCleanText(pleadingText, 18000);
    const cleanCaseContext = asCleanText(caseContext, 1500);

    if (!cleanPleadingType || cleanPleadingText.length < 80) {
      return Response.json(
        { error: "Podaj rodzaj pisma oraz treść pisma przeciwnika." },
        { status: 400 },
      );
    }

    const tools = {
      google_search: google.tools.googleSearch({}),
      readWebPage: tool({
        description: "Pobiera i czyta zawartość strony internetowej.",
        inputSchema: readWebPageInputSchema,
        execute: async ({ url }) => readWebPage(url),
      }),
      searchWikipedia: tool({
        description: "Wyszukuje pojęcie prawne lub doktrynalne w Wikipedii i zwraca krótkie opisy oraz linki.",
        inputSchema: searchWikipediaInputSchema,
        execute: async ({ query }) => searchWikipedia(query),
      }),
    };

    const result = streamText({
      model: google(model),
      system: `${legalBriefingPrompt}\n\nDzisiejsza data: ${getTodayLabel()}`,
      prompt: `Przygotuj briefing dla prawnika.

Rodzaj pisma przeciwnika: ${cleanPleadingType}
Kontekst sprawy: ${cleanCaseContext || "brak dodatkowego kontekstu"}

Treść pisma przeciwnika:
${cleanPleadingText}`,
      tools,
      stopWhen: stepCountIs(maxSteps),
      maxRetries: 0,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Legal opposition briefing API error:", error);

    return Response.json(
      { error: "Nie udało się przygotować briefingu pisma przeciwnika." },
      { status: 500 },
    );
  }
}
