import { google } from "@ai-sdk/google";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";

type CalculatorInput = {
  expression: string;
};

type CityInput = {
  city: string;
};

type CurrencyInput = {
  currency: string;
};

type CountryInput = {
  countryCode?: string;
  year?: number;
};

type SearchInput = {
  query: string;
};

type ReadWebPageInput = {
  url: string;
};

type SaveNoteInput = {
  title: string;
  content: string;
};

type ReactRequest = {
  task?: unknown;
};

type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

const notes: Note[] = [];

const fetchTimeoutMs = 5000;
const maxSteps = 3;
const enableSearchGrounding = process.env.ENABLE_SEARCH_GROUNDING === "true";

if (enableSearchGrounding) {
  console.warn(
    "UWAGA: Search Grounding jest WLACZONY. " +
      "To jest najdrozsza funkcja API ($14/1000 zapytan). " +
      "Uzywaj TYLKO do testow. Wylacz po testach usuwajac ENABLE_SEARCH_GROUNDING z .env.local, " +
      "bo inni uczestnicy kursu maja wtedy ograniczony dostep do modeli.",
  );
}

const safetyPrompt = `

## OBSLUGA BLEDOW:
- Jesli narzedzie zwroci blad — NIE powtarzaj tego samego wywolania
- Zamiast tego: poinformuj uzytkownika i zaproponuj alternatywe
- Przyklad: jesli pogoda nie dziala → 'Nie udalo sie sprawdzic pogody w X. Moge poszukac w Google lub sprobowac innego miasta.'
- NIGDY nie wywoluj tego samego narzedzia z tymi samymi argumentami dwa razy z rzedu
- Jesli po 3 nieudanych probach nie masz danych — powiedz wprost czego brakuje`;

const systemPrompt = `Jestes autonomicznym agentem ReAct. Gdy dostajesz ZADANIE, realizujesz je krok po kroku.

## TWOJ PROCES:

Dla kazdego glownego kroku pokaz krotki, jawny tok pracy:

### Mysle...
Co trzeba ustalic teraz? Jakich danych brakuje? Ktorego narzedzia uzyjesz?

Potem uzyj narzedzia.

Po otrzymaniu wyniku:

### Obserwuje...
Co dostales? Czy to wystarczy? Jaki jest nastepny krok?

Powtarzaj az cel bedzie zrealizowany.

Na koniec:

### Wynik koncowy
Podaj pelna, konkretna odpowiedz oparta na zebranych danych. Cytuj zrodla, gdy korzystasz z API, Wikipedii lub Google.

## ZASADY:
- Nie zgaduj danych aktualnych: uzyj narzedzi.
- W kazdym zadaniu wykonaj przynajmniej jedno narzedzie. Dla pogody uzyj getWeather, dla walut getExchangeRate, dla obliczen calculator, dla dat currentDateTime, dla wiedzy searchWikipedia lub Google.
- Maksymalnie 5 glownych krokow widocznych dla uzytkownika.
- Jesli narzedzie zwroci blad, sprobuj inaczej albo powiedz jasno, czego nie udalo sie ustalic.
- Lacz dane z wielu narzedzi w spojna odpowiedz.
- Odpowiadaj po polsku.${safetyPrompt}`;

const calculatorInputSchema = jsonSchema<CalculatorInput>({
  type: "object",
  properties: {
    expression: {
      type: "string",
      description: "Dzialanie matematyczne, np. 5000 * 4.25 albo 10000 / 3.91.",
    },
  },
  required: ["expression"],
  additionalProperties: false,
});

const cityInputSchema = jsonSchema<CityInput>({
  type: "object",
  properties: {
    city: {
      type: "string",
      description: "Nazwa miasta, np. Warszawa, Krakow, Berlin.",
    },
  },
  required: ["city"],
  additionalProperties: false,
});

const currencyInputSchema = jsonSchema<CurrencyInput>({
  type: "object",
  properties: {
    currency: {
      type: "string",
      description: "Kod waluty ISO, np. EUR, USD, CHF.",
    },
  },
  required: ["currency"],
  additionalProperties: false,
});

const countryInputSchema = jsonSchema<CountryInput>({
  type: "object",
  properties: {
    countryCode: {
      type: "string",
      description: "Kod kraju ISO-2, domyslnie PL.",
    },
    year: {
      type: "number",
      description: "Rok, domyslnie aktualny rok.",
    },
  },
  additionalProperties: false,
});

const searchInputSchema = jsonSchema<SearchInput>({
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Haslo do wyszukania w Wikipedii.",
    },
  },
  required: ["query"],
  additionalProperties: false,
});

const readWebPageInputSchema = jsonSchema<ReadWebPageInput>({
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "Pelny adres URL strony internetowej.",
    },
  },
  required: ["url"],
  additionalProperties: false,
});

const saveNoteInputSchema = jsonSchema<SaveNoteInput>({
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Krotki tytul notatki.",
    },
    content: {
      type: "string",
      description: "Tresc notatki do zapisania.",
    },
  },
  required: ["title", "content"],
  additionalProperties: false,
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getFetchErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Timeout — serwer nie odpowiedział w 5 sekund. Spróbuj ponownie.";
  }

  return `Błąd połączenia: ${getErrorMessage(error)}`;
}

async function fetchWithTimeout(input: string | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(getFetchErrorMessage(error));
  } finally {
    clearTimeout(timeout);
  }
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
      error: "Kalkulator obsluguje tylko liczby, nawiasy oraz operatory + - * / %.",
    };
  }

  try {
    const result = Function(`"use strict"; return (${normalizedExpression});`)();

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return { error: `Nie mogę obliczyć: ${expression}` };
    }

    return {
      source: "calculator",
      expression: normalizedExpression,
      result,
    };
  } catch {
    return { error: `Nie mogę obliczyć: ${expression}` };
  }
}

function currentDateTime() {
  const now = new Date();

  return {
    source: "local system time",
    iso: now.toISOString(),
    poland: new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "full",
      timeStyle: "medium",
      timeZone: "Europe/Warsaw",
    }).format(now),
  };
}

function normalizeCity(city: string) {
  const normalized = city.trim().toLowerCase();

  if (normalized.includes("warszaw")) {
    return "Warszawa";
  }

  if (normalized.includes("krak")) {
    return "Kraków";
  }

  if (normalized.includes("pary") || normalized.includes("paris")) {
    return "Paris";
  }

  if (normalized.includes("berlin")) {
    return "Berlin";
  }

  return city.trim();
}

async function getCoordinates(city: string) {
  const cleanedCity = city.trim();

  if (!cleanedCity) {
    throw new Error("Podaj nazwę miasta");
  }

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", normalizeCity(cleanedCity));
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "pl");
  url.searchParams.set("format", "json");

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`API zwróciło błąd ${response.status}. Sprawdź parametry.`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      name: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  const result = data.results?.[0];

  if (!result) {
    throw new Error(`Nie znalazłem miasta ${cleanedCity}. Sprawdź pisownię.`);
  }

  return result;
}

async function getWeather(city: string) {
  try {
    const location = await getCoordinates(city);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    );
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
    url.searchParams.set("forecast_days", "3");
    url.searchParams.set("timezone", "Europe/Warsaw");

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`API zwróciło błąd ${response.status}. Sprawdź parametry.`);
    }

    const weather = await response.json();

    return {
      source: "Open-Meteo + Open-Meteo Geocoding",
      city: location.name,
      country: location.country,
      weather,
    };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

async function getExchangeRate(currency: string) {
  const code = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(code)) {
    return { error: "Podaj 3-literowy kod waluty (np. EUR, USD)" };
  }

  if (code === "PLN") {
    return {
      source: "NBP",
      currency: "PLN",
      rateToPLN: 1,
      note: "PLN jest waluta bazowa.",
    };
  }

  try {
    const response = await fetchWithTimeout(`https://api.nbp.pl/api/exchangerates/rates/a/${code}/?format=json`);

    if (!response.ok) {
      if (response.status === 404) {
        return { error: `Waluta ${code} nie jest w tabeli NBP. Popularne: EUR, USD, GBP, CHF` };
      }

      return { error: `API zwróciło błąd ${response.status}. Sprawdź parametry.` };
    }

    const data = (await response.json()) as {
      currency: string;
      code: string;
      rates: Array<{ no: string; effectiveDate: string; mid: number }>;
    };
    const rate = data.rates[0];

    return {
      source: "Narodowy Bank Polski API",
      currency: data.currency,
      code: data.code,
      rateToPLN: rate.mid,
      table: rate.no,
      effectiveDate: rate.effectiveDate,
    };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

async function getHolidays(countryCode = "PL", year = new Date().getFullYear()) {
  const code = countryCode.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) {
    return { error: "Podaj 2-literowy kod kraju (np. PL, DE, US)" };
  }

  try {
    const response = await fetchWithTimeout(`https://date.nager.at/api/v3/PublicHolidays/${year}/${code}`);

    if (!response.ok) {
      if (response.status === 404) {
        return { error: `Nie znalazłem świąt dla kraju ${code}. Popularne: PL, DE, US, GB, FR` };
      }

      return { error: `API zwróciło błąd ${response.status}. Sprawdź parametry.` };
    }

    const holidays = (await response.json()) as Array<{
      date: string;
      localName: string;
      name: string;
      countryCode: string;
      global: boolean;
    }>;
    const today = new Date();
    const nextHoliday = holidays.find((holiday) => new Date(`${holiday.date}T00:00:00`) >= today);

    return {
      source: "Nager.Date public holidays API",
      countryCode: code,
      year,
      nextHoliday,
      holidays,
    };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

async function searchWikipedia(query: string) {
  const cleanedQuery = query.trim();

  if (!cleanedQuery) {
    return { error: "Podaj hasło do wyszukania." };
  }

  try {
    const searchUrl = new URL("https://pl.wikipedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", cleanedQuery);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");

    const searchResponse = await fetchWithTimeout(searchUrl);

    if (!searchResponse.ok) {
      return { error: `API zwróciło błąd ${searchResponse.status}. Sprawdź parametry.` };
    }

    const searchData = (await searchResponse.json()) as {
      query?: { search?: Array<{ title: string; snippet: string }> };
    };
    const title = searchData.query?.search?.[0]?.title;

    if (!title) {
      return {
        source: "Wikipedia",
        query: cleanedQuery,
        result: null,
        message: "Brak wynikow w polskiej Wikipedii.",
      };
    }

    const summaryResponse = await fetchWithTimeout(
      `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    );

    if (!summaryResponse.ok) {
      return { error: `API zwróciło błąd ${summaryResponse.status}. Sprawdź parametry.` };
    }

    const summary = (await summaryResponse.json()) as {
      title: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };

    return {
      source: "Wikipedia",
      query: cleanedQuery,
      title: summary.title,
      extract: summary.extract,
      url: summary.content_urls?.desktop?.page,
    };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

async function googleSearch(query: string) {
  if (!enableSearchGrounding) {
    return {
      error:
        "Google Search grounding jest wylaczony. Aby wlaczyc platne wyszukiwanie testowo, ustaw ENABLE_SEARCH_GROUNDING=true w .env.local.",
    };
  }

  try {
    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system:
        "Uzyj Google Search grounding i zwroc krotka, konkretna odpowiedz po polsku z linkami do zrodel.",
      prompt: query,
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      toolChoice: "auto",
      stopWhen: stepCountIs(maxSteps),
      maxRetries: 0,
      timeout: {
        totalMs: 25000,
        stepMs: 12000,
        toolMs: 10000,
      },
    });

    return {
      source: "Google Search grounding",
      query,
      text: appendSources(result.text, result.sources),
    };
  } catch (error) {
    return { error: getErrorMessage(error) };
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
  ).slice(0, 3500);
}

async function readWebPage(url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return { error: `"${url}" nie jest poprawnym adresem URL.` };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { error: "Obslugiwane sa tylko adresy http:// i https://." };
  }

  try {
    const response = await fetchWithTimeout(parsedUrl.toString(), {
      headers: {
        "User-Agent": "ReActAgent/1.0 (+https://local.react-agent)",
      },
    });

    if (!response.ok) {
      return {
        error: `API zwróciło błąd ${response.status}. Sprawdź parametry.`,
        url: parsedUrl.toString(),
      };
    }

    const html = await response.text();
    const text = extractTextFromHtml(html);

    return {
      source: parsedUrl.toString(),
      text: text || "Strona zostala pobrana, ale nie znaleziono czytelnej tresci.",
    };
  } catch (error) {
    return { error: getErrorMessage(error), url: parsedUrl.toString() };
  }
}

function saveNote(title: string, content: string) {
  const note = {
    id: `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: title.trim() || "Notatka ReAct",
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };

  notes.unshift(note);

  return {
    source: "local in-memory notes",
    saved: true,
    note,
    totalNotes: notes.length,
  };
}

function getNotes() {
  return {
    source: "local in-memory notes",
    notes: notes.slice(0, 20),
  };
}

function stringifyPreview(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value.length > 260 ? `${value.slice(0, 260)}...` : value;
  }

  try {
    const text = JSON.stringify(value);
    return text.length > 260 ? `${text.slice(0, 260)}...` : text;
  } catch {
    return String(value);
  }
}

function getToolEmoji(toolName: string) {
  const emojis: Record<string, string> = {
    calculator: "🧮",
    currentDateTime: "🕐",
    getWeather: "🌦️",
    getExchangeRate: "💱",
    getHolidays: "📅",
    searchWikipedia: "📚",
    googleSearch: "🌐",
    readWebPage: "📄",
    saveNote: "💾",
    getNotes: "🗒️",
  };

  return emojis[toolName] || "⚙️";
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
    const hasOutput = matchingResult && "output" in matchingResult;
    const error = hasOutput ? getToolError(matchingResult.output) : "";

    return {
      id: toolCall.toolCallId,
      index: index + 1,
      name: toolCall.toolName,
      emoji: getToolEmoji(toolCall.toolName),
      input: stringifyPreview(toolCall.input),
      output: hasOutput
        ? stringifyPreview(matchingResult.output)
        : toolCall.providerExecuted
          ? "Narzędzie wykonane przez Google."
          : "",
      hasError: Boolean(error),
      error,
      providerExecuted: toolCall.providerExecuted === true,
    };
  });
}

function ensureReactSections(
  text: string,
  tools: Array<{ name: string; output: string }>,
) {
  const trimmedText = text.trim();

  if (trimmedText.includes("###")) {
    return trimmedText;
  }

  const toolNames = tools.map((item) => item.name).join(", ");
  const observations =
    tools.length > 0
      ? `Użyłem narzędzi: ${toolNames}. Najważniejsze wyniki są widoczne w kartach narzędzi powyżej.`
      : "Nie otrzymałem osobnych wyników narzędzi, więc opieram się na odpowiedzi modelu.";

  return `### Mysle...
Rozbiłem zadanie na kroki, dobrałem potrzebne narzędzia i zebrałem dane przed odpowiedzią.

### Obserwuje...
${observations}

### Wynik koncowy
${trimmedText || "Zadanie zostało wykonane, ale model nie zwrócił dodatkowego opisu."}`;
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
    .slice(0, 8)
    .map((source, index) => {
      const title = source.title?.trim() || `Źródło ${index + 1}`;
      return `${index + 1}. [${title}](${source.url})`;
    })
    .join("\n");

  return `${text.trim()}\n\nŹródła Google:\n${sourceLines}`;
}

const reactTools = {
  calculator: tool({
    description: "Wykonuje bezpieczne obliczenia matematyczne.",
    inputSchema: calculatorInputSchema,
    execute: async ({ expression }) => calculateExpression(expression),
  }),
  currentDateTime: tool({
    description: "Zwraca aktualna date i godzine w Polsce.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => currentDateTime(),
  }),
  getWeather: tool({
    description: "Sprawdza aktualna pogode i 3-dniowa prognoze dla miasta przez Open-Meteo.",
    inputSchema: cityInputSchema,
    execute: async ({ city }) => getWeather(city),
  }),
  getExchangeRate: tool({
    description: "Pobiera sredni kurs waluty do PLN z API Narodowego Banku Polskiego.",
    inputSchema: currencyInputSchema,
    execute: async ({ currency }) => getExchangeRate(currency),
  }),
  getHolidays: tool({
    description: "Pobiera swieta publiczne dla kraju i roku przez Nager.Date.",
    inputSchema: countryInputSchema,
    execute: async ({ countryCode, year }) => getHolidays(countryCode || "PL", year),
  }),
  searchWikipedia: tool({
    description: "Wyszukuje haslo w polskiej Wikipedii i zwraca streszczenie oraz link.",
    inputSchema: searchInputSchema,
    execute: async ({ query }) => searchWikipedia(query),
  }),
  googleSearch: tool({
    description:
      "Wyszukuje aktualne informacje w Google przez Google Search grounding. Uzywaj do najnowszych danych, trendow, firm, wydarzen i stron z internetu.",
    inputSchema: searchInputSchema,
    execute: async ({ query }) => googleSearch(query),
  }),
  readWebPage: tool({
    description: "Pobiera i streszcza tekst z podanej strony internetowej.",
    inputSchema: readWebPageInputSchema,
    execute: async ({ url }) => readWebPage(url),
  }),
  saveNote: tool({
    description: "Zapisuje notatke w lokalnej pamieci agenta.",
    inputSchema: saveNoteInputSchema,
    execute: async ({ title, content }) => saveNote(title, content),
  }),
  getNotes: tool({
    description: "Zwraca ostatnie notatki zapisane przez agenta.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => getNotes(),
  }),
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReactRequest;
    const task = typeof body.task === "string" ? body.task.trim() : "";

    if (!task) {
      return Response.json(
        { error: "Podaj zadanie dla agenta ReAct." },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: systemPrompt,
      prompt: `ZADANIE:\n${task}`,
      tools: reactTools,
      toolChoice: "auto",
      prepareStep: ({ steps }) => ({
        toolChoice: steps.length === 0 ? "required" : "auto",
      }),
      stopWhen: stepCountIs(maxSteps),
      maxRetries: 0,
      timeout: {
        totalMs: 70000,
        stepMs: 18000,
        toolMs: 12000,
      },
    });
    const tools = buildToolTimeline(result);
    const text = ensureReactSections(
      appendSources(result.text, result.sources),
      tools,
    );

    return Response.json({
      text,
      tools,
      metrics: {
        toolCount: tools.length,
        durationMs: Date.now() - startedAt,
        model: "gemini-3.1-flash-lite",
        maxSteps,
      },
    });
  } catch (error) {
    console.error("ReAct API error:", error);

    return Response.json(
      {
        error: `Agent ReAct nie wykonala zadania: ${getErrorMessage(error)}`,
      },
      { status: 500 },
    );
  }
}
