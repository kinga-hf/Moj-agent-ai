import { google } from "@ai-sdk/google";
import { translate } from "@vitalets/google-translate-api";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";

type CalculatorInput = { expression: string };
type CityInput = { city: string };
type CurrencyInput = { currency: string };
type CountryInput = { countryCode?: string; year?: number };
type SearchInput = { query: string };
type TranslationInput = { text: string; targetLanguage: string };
type TravelRequest = { task?: unknown };

export const runtime = "nodejs";

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

type TravelCard = {
  kind: "weather" | "currency" | "holiday" | "attraction" | "budget" | "translation";
  title: string;
  value: string;
  detail: string;
  source?: string;
};

const systemPrompt = `Jesteś profesjonalnym asystentem podróży. Gdy użytkownik opisuje planowaną podróż, autonomicznie zbierasz potrzebne informacje i zwracasz praktyczny plan.

## DLA KAŻDEJ PODRÓŻY SPRAWDŹ:
1. Pogodę w miejscu docelowym przez getWeather.
2. Kurs lokalnej waluty przez getExchangeRate.
3. Dni wolne i święta w kraju docelowym przez getHolidays.
4. Informacje o mieście przez searchWikipedia lub googleSearch.
5. Przeliczenie budżetu przez calculator, jeśli użytkownik poda budżet.
6. Przy podróży zagranicznej przygotuj mini rozmówki przez translateTravelPhrase.

## FORMAT ODPOWIEDZI:

## 🗺️ Plan podróży: [MIASTO]

### 📋 Podsumowanie
- Destynacja: [miasto, kraj]
- Pogoda: [temperatura, krótki opis]
- Waluta: [kurs, ile PLN = 1 lokalna waluta]

### 🌤️ Pogoda
[Szczegóły pogody + co spakować]

### 💰 Budżet
[Przeliczenia walutowe, orientacyjne koszty]

### 📅 Ważne daty
[Święta, dni wolne, co może być zamknięte]

### 🏛️ Co zobaczyć
[Główne atrakcje na podstawie Wikipedii i Google]

### 🌍 Tłumacz podróżny
[5 praktycznych zwrotów w języku kraju docelowego: powitanie, pytanie o drogę, zamówienie jedzenia, prośba o pomoc, podziękowanie]

### ✅ Checklist przed wyjazdem
[Lista rzeczy do zrobienia/spakowania]

Jeśli użytkownik prosi o porównanie miast, sprawdź dane dla obu i dodaj tabelę porównawczą oraz rekomendację.

## ZASADY:
- Używaj prawdziwych danych z narzędzi, nie zgaduj.
- Jeśli narzędzie zwróci błąd, poinformuj i kontynuuj.
- Bądź praktyczny i konkretny.
- Podawaj ceny w PLN i w walucie lokalnej, jeśli da się przeliczyć.
- Jeśli kraj docelowy nie jest polskojęzyczny, użyj translateTravelPhrase do rozmówek. Możesz przetłumaczyć kilka zwrotów naraz, oddzielając je nowymi liniami.
- Odpowiadaj po polsku.${safetyPrompt}`;

const calculatorInputSchema = jsonSchema<CalculatorInput>({
  type: "object",
  properties: {
    expression: {
      type: "string",
      description: "Działanie matematyczne, np. 3000 / 5.12.",
    },
  },
  required: ["expression"],
  additionalProperties: false,
});

const cityInputSchema = jsonSchema<CityInput>({
  type: "object",
  properties: {
    city: { type: "string", description: "Miasto docelowe." },
  },
  required: ["city"],
  additionalProperties: false,
});

const currencyInputSchema = jsonSchema<CurrencyInput>({
  type: "object",
  properties: {
    currency: { type: "string", description: "Kod waluty ISO, np. EUR, GBP, CZK, JPY." },
  },
  required: ["currency"],
  additionalProperties: false,
});

const countryInputSchema = jsonSchema<CountryInput>({
  type: "object",
  properties: {
    countryCode: { type: "string", description: "Kod kraju ISO-2, np. DE, FR, CZ, JP." },
    year: { type: "number", description: "Rok, domyślnie aktualny." },
  },
  additionalProperties: false,
});

const searchInputSchema = jsonSchema<SearchInput>({
  type: "object",
  properties: {
    query: { type: "string", description: "Hasło do wyszukania." },
  },
  required: ["query"],
  additionalProperties: false,
});

const translationInputSchema = jsonSchema<TranslationInput>({
  type: "object",
  properties: {
    text: {
      type: "string",
      description: "Tekst lub lista krótkich zwrotów do przetłumaczenia.",
    },
    targetLanguage: {
      type: "string",
      description: "Kod języka docelowego, np. en, de, fr, es, it, cs, pt, ja.",
    },
  },
  required: ["text", "targetLanguage"],
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
    return { error: "Wyrażenie zawiera niedozwolone znaki" };
  }

  if (!/^[\d+\-*/().\s%]+$/.test(normalizedExpression)) {
    return { error: "Kalkulator obsługuje tylko liczby, nawiasy i operatory + - * / %." };
  }

  try {
    const result = Function(`"use strict"; return (${normalizedExpression});`)();

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return { error: `Nie mogę obliczyć: ${expression}` };
    }

    return { source: "calculator", expression: normalizedExpression, result };
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

  if (normalized.includes("warszaw")) return "Warszawa";
  if (normalized.includes("krak")) return "Kraków";
  if (normalized.includes("berlin")) return "Berlin";
  if (normalized.includes("pary") || normalized.includes("paris")) return "Paris";
  if (normalized.includes("prag") || normalized.includes("praha")) return "Prague";
  if (normalized.includes("wiede") || normalized.includes("vienna")) return "Vienna";
  if (normalized.includes("lond")) return "London";
  if (normalized.includes("barcel")) return "Barcelona";
  if (normalized.includes("lizbon") || normalized.includes("lisbon")) return "Lisbon";
  if (normalized.includes("tokio") || normalized.includes("tokyo")) return "Tokyo";

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
      country_code?: string;
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
    url.searchParams.set("forecast_days", "4");
    url.searchParams.set("timezone", "Europe/Warsaw");

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`API zwróciło błąd ${response.status}. Sprawdź parametry.`);
    }

    return {
      source: "Open-Meteo + Open-Meteo Geocoding",
      city: location.name,
      country: location.country,
      countryCode: location.country_code,
      weather: await response.json(),
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
    return { source: "NBP", code: "PLN", rateToPLN: 1, note: "PLN jest walutą bazową." };
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
    }>;
    const today = new Date();
    const nextHoliday = holidays.find((holiday) => new Date(`${holiday.date}T00:00:00`) >= today);

    return { source: "Nager.Date public holidays API", countryCode: code, year, nextHoliday, holidays };
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
      query?: { search?: Array<{ title: string }> };
    };
    const title = searchData.query?.search?.[0]?.title;

    if (!title) {
      return { source: "Wikipedia", query: cleanedQuery, result: null, message: "Brak wyników w polskiej Wikipedii." };
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
      system: "Użyj Google Search grounding i zwróć krótką odpowiedź po polsku z linkami do źródeł.",
      prompt: query,
      tools: { google_search: google.tools.googleSearch({}) },
      toolChoice: "auto",
      stopWhen: stepCountIs(maxSteps),
      maxRetries: 0,
      timeout: { totalMs: 25000, stepMs: 12000, toolMs: 10000 },
    });

    return { source: "Google Search grounding", query, text: appendSources(result.text, result.sources) };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

async function translateTravelPhrase(text: string, targetLanguage: string) {
  const cleanedText = text.trim();
  const language = targetLanguage.trim().toLowerCase();

  if (!cleanedText || !language) {
    return { error: "Podaj tekst i język docelowy tłumaczenia." };
  }

  try {
    const result = await translate(cleanedText, { to: language });

    return {
      source: "@vitalets/google-translate-api",
      targetLanguage: language,
      originalText: cleanedText,
      translatedText: result.text,
    };
  } catch (error) {
    return { error: `Nie udało się przetłumaczyć tekstu: ${getErrorMessage(error)}` };
  }
}

function stringifyPreview(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.length > 260 ? `${value.slice(0, 260)}...` : value;

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
    getWeather: "🌤️",
    getExchangeRate: "💶",
    getHolidays: "📅",
    searchWikipedia: "📖",
    googleSearch: "🌐",
    translateTravelPhrase: "🌍",
  };

  return emojis[toolName] || "⚙️";
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

  if (uniqueSources.length === 0) return text;

  const sourceLines = uniqueSources
    .slice(0, 8)
    .map((source, index) => `${index + 1}. [${source.title?.trim() || `Źródło ${index + 1}`}](${source.url})`)
    .join("\n");

  return `${text.trim()}\n\nŹródła Google:\n${sourceLines}`;
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
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown; providerExecuted?: boolean }>;
  toolResults: Array<{ toolCallId: string; output?: unknown }>;
}) {
  return result.toolCalls.map((toolCall, index) => {
    const matchingResult = result.toolResults.find((toolResult) => toolResult.toolCallId === toolCall.toolCallId);
    const output = "output" in (matchingResult ?? {}) ? matchingResult?.output : undefined;
    const error = getToolError(output);

    return {
      id: toolCall.toolCallId,
      index: index + 1,
      name: toolCall.toolName,
      emoji: getToolEmoji(toolCall.toolName),
      input: stringifyPreview(toolCall.input),
      output: stringifyPreview(output),
      rawOutput: output,
      hasError: Boolean(error),
      error,
    };
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildTravelCards(
  tools: Array<{ name: string; input: string; rawOutput?: unknown }>,
): TravelCard[] {
  return tools.flatMap((item): TravelCard[] => {
    const output = item.rawOutput;

    if (!isObject(output) || "error" in output) return [];

    if (item.name === "getWeather") {
      const weather = isObject(output.weather) ? output.weather : {};
      const current = isObject(weather.current) ? weather.current : {};
      const temp = getNumber(current.temperature_2m);
      const wind = getNumber(current.wind_speed_10m);
      const humidity = getNumber(current.relative_humidity_2m);
      const city = typeof output.city === "string" ? output.city : "Destynacja";
      const country = typeof output.country === "string" ? output.country : "";

      return [
        {
          kind: "weather",
          title: `Pogoda: ${city}`,
          value: temp === undefined ? "Dane pobrane" : `${temp}°C`,
          detail: `Wilgotność: ${humidity ?? "?"}% · Wiatr: ${wind ?? "?"} km/h · ${country}`,
          source: typeof output.source === "string" ? output.source : undefined,
        },
      ];
    }

    if (item.name === "getExchangeRate") {
      const code = typeof output.code === "string" ? output.code : "Waluta";
      const rate = getNumber(output.rateToPLN);
      const date = typeof output.effectiveDate === "string" ? output.effectiveDate : "";

      return [
        {
          kind: "currency",
          title: `Waluta: ${code}`,
          value: rate === undefined ? "Kurs pobrany" : `1 ${code} = ${rate.toFixed(4)} PLN`,
          detail: date ? `Kurs średni NBP z dnia ${date}` : "Kurs średni NBP",
          source: typeof output.source === "string" ? output.source : undefined,
        },
      ];
    }

    if (item.name === "getHolidays") {
      const nextHoliday = isObject(output.nextHoliday) ? output.nextHoliday : null;
      const countryCode = typeof output.countryCode === "string" ? output.countryCode : "Kraj";
      const name =
        nextHoliday && typeof nextHoliday.localName === "string"
          ? nextHoliday.localName
          : "Brak kolejnego święta w danych";
      const date = nextHoliday && typeof nextHoliday.date === "string" ? nextHoliday.date : "";

      return [
        {
          kind: "holiday",
          title: `Święta: ${countryCode}`,
          value: name,
          detail: date ? `Najbliższa data: ${date}` : "Sprawdź godziny otwarcia atrakcji lokalnie.",
          source: typeof output.source === "string" ? output.source : undefined,
        },
      ];
    }

    if (item.name === "searchWikipedia") {
      const title = typeof output.title === "string" ? output.title : "Atrakcje i kontekst";
      const extract = typeof output.extract === "string" ? output.extract : "Informacje pobrane z Wikipedii.";

      return [
        {
          kind: "attraction",
          title,
          value: "Co zobaczyć",
          detail: extract.length > 180 ? `${extract.slice(0, 180)}...` : extract,
          source: typeof output.url === "string" ? output.url : "Wikipedia",
        },
      ];
    }

    if (item.name === "calculator") {
      const result = getNumber(output.result);

      return [
        {
          kind: "budget",
          title: "Budżet",
          value: result === undefined ? "Przeliczenie wykonane" : result.toFixed(2),
          detail: typeof output.expression === "string" ? `Działanie: ${output.expression}` : "Obliczenia budżetu",
          source: "calculator",
        },
      ];
    }

    if (item.name === "translateTravelPhrase") {
      const translatedText =
        typeof output.translatedText === "string" ? output.translatedText : "Tłumaczenie gotowe";
      const originalText = typeof output.originalText === "string" ? output.originalText : "";
      const targetLanguage = typeof output.targetLanguage === "string" ? output.targetLanguage.toUpperCase() : "";

      return [
        {
          kind: "translation",
          title: targetLanguage ? `Tłumacz: ${targetLanguage}` : "Tłumacz",
          value: translatedText.length > 90 ? `${translatedText.slice(0, 90)}...` : translatedText,
          detail: originalText ? `Oryginał: ${originalText}` : "Praktyczne zwroty na wyjazd",
          source: typeof output.source === "string" ? output.source : undefined,
        },
      ];
    }

    return [];
  });
}

const travelTools = {
  calculator: tool({
    description: "Przelicza budżety, waluty i koszty.",
    inputSchema: calculatorInputSchema,
    execute: async ({ expression }) => calculateExpression(expression),
  }),
  currentDateTime: tool({
    description: "Zwraca aktualną datę i godzinę w Polsce.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => currentDateTime(),
  }),
  getWeather: tool({
    description: "Sprawdza aktualną pogodę i krótką prognozę dla miasta.",
    inputSchema: cityInputSchema,
    execute: async ({ city }) => getWeather(city),
  }),
  getExchangeRate: tool({
    description: "Pobiera kurs waluty do PLN z API NBP.",
    inputSchema: currencyInputSchema,
    execute: async ({ currency }) => getExchangeRate(currency),
  }),
  getHolidays: tool({
    description: "Pobiera święta publiczne dla kraju.",
    inputSchema: countryInputSchema,
    execute: async ({ countryCode, year }) => getHolidays(countryCode || "PL", year),
  }),
  searchWikipedia: tool({
    description: "Pobiera podstawowe informacje o mieście, kraju lub atrakcji z Wikipedii.",
    inputSchema: searchInputSchema,
    execute: async ({ query }) => searchWikipedia(query),
  }),
  googleSearch: tool({
    description: "Wyszukuje aktualne informacje turystyczne w Google.",
    inputSchema: searchInputSchema,
    execute: async ({ query }) => googleSearch(query),
  }),
  translateTravelPhrase: tool({
    description:
      "Tłumaczy praktyczne zwroty podróżne na język kraju docelowego. Można podać kilka krótkich zwrotów w jednym tekście.",
    inputSchema: translationInputSchema,
    execute: async ({ text, targetLanguage }) => translateTravelPhrase(text, targetLanguage),
  }),
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TravelRequest;
    const task = typeof body.task === "string" ? body.task.trim() : "";

    if (!task) {
      return Response.json({ error: "Opisz planowaną podróż." }, { status: 400 });
    }

    const startedAt = Date.now();
    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: systemPrompt,
      prompt: `PLANOWANA PODRÓŻ:\n${task}`,
      tools: travelTools,
      toolChoice: "auto",
      prepareStep: ({ steps }) => ({
        toolChoice: steps.length === 0 ? "required" : "auto",
      }),
      stopWhen: stepCountIs(maxSteps),
      maxRetries: 0,
      timeout: { totalMs: 90000, stepMs: 20000, toolMs: 14000 },
    });
    const tools = buildToolTimeline(result);
    const cards = buildTravelCards(tools);

    return Response.json({
      text: appendSources(result.text, result.sources),
      cards,
      tools: tools.map(({ rawOutput, ...item }) => item),
      metrics: {
        toolCount: tools.length,
        durationMs: Date.now() - startedAt,
        model: "gemini-3.1-flash-lite",
        maxSteps,
      },
    });
  } catch (error) {
    console.error("Travel API error:", error);

    return Response.json(
      { error: `Asystent podróży nie wykonał zadania: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
