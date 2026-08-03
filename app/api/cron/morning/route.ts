import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const model = "gemini-3.1-flash-lite";
const timezone = "Europe/Warsaw";
const requestTimeoutMs = 5000;

type WeatherData = {
  city: string;
  temperature?: number;
  description?: string;
  humidity?: number;
  windSpeed?: number;
  error?: string;
};

type ExchangeRateData = {
  code: string;
  rate?: number;
  effectiveDate?: string;
  error?: string;
};

type NewsItem = {
  title: string;
  link?: string;
  publishedAt?: string;
};

type HolidayData = {
  localName: string;
  name: string;
};

function getWarsawDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return Object.fromEntries(parts.map(({ type, value }) => [type, value])) as {
    year: string;
    month: string;
    day: string;
  };
}

function getWarsawDate(date = new Date()) {
  const parts = getWarsawDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getDayLabel(date = new Date()) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Przekroczono limit czasu odpowiedzi zewnętrznego API.";
  }

  return error instanceof Error ? error.message : "Nieznany błąd.";
}

async function fetchJson<T>(url: string | URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": "MorningBriefing/1.0" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API zwróciło błąd ${response.status}.`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string | URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": "MorningBriefing/1.0" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API zwróciło błąd ${response.status}.`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function weatherDescription(code?: number) {
  const descriptions: Record<number, string> = {
    0: "bezchmurnie",
    1: "głównie bezchmurnie",
    2: "częściowe zachmurzenie",
    3: "zachmurzenie całkowite",
    45: "mgła",
    48: "mgła osadzająca szadź",
    51: "lekka mżawka",
    53: "mżawka",
    55: "silna mżawka",
    61: "lekki deszcz",
    63: "deszcz",
    65: "silny deszcz",
    71: "lekki śnieg",
    73: "śnieg",
    75: "silny śnieg",
    80: "przelotne opady deszczu",
    81: "przelotny deszcz",
    82: "gwałtowne przelotne opady deszczu",
    95: "burza",
    96: "burza z gradem",
    99: "silna burza z gradem",
  };

  return code === undefined ? undefined : descriptions[code] ?? "zmienna pogoda";
}

async function getCoordinates(city: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "pl");
  url.searchParams.set("format", "json");

  const data = await fetchJson<{
    results?: Array<{ name: string; latitude: number; longitude: number }>;
  }>(url);
  const location = data.results?.[0];

  if (!location) {
    throw new Error(`Nie znaleziono miasta ${city}.`);
  }

  return location;
}

async function getWeather(city: string): Promise<WeatherData> {
  try {
    const location = await getCoordinates(city);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
    );
    url.searchParams.set("timezone", timezone);

    const data = await fetchJson<{
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    }>(url);

    return {
      city: location.name,
      temperature: data.current?.temperature_2m,
      description: weatherDescription(data.current?.weather_code),
      humidity: data.current?.relative_humidity_2m,
      windSpeed: data.current?.wind_speed_10m,
    };
  } catch (error) {
    return { city, error: getErrorMessage(error) };
  }
}

async function getExchangeRate(code: string): Promise<ExchangeRateData> {
  try {
    const data = await fetchJson<{
      code: string;
      rates?: Array<{ effectiveDate: string; mid: number }>;
    }>(`https://api.nbp.pl/api/exchangerates/rates/a/${code}/?format=json`);
    const rate = data.rates?.[0];

    return {
      code: data.code,
      rate: rate?.mid,
      effectiveDate: rate?.effectiveDate,
    };
  } catch (error) {
    return { code, error: getErrorMessage(error) };
  }
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function readXmlTag(item: string, tag: string) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(item);
  return match ? decodeXml(match[1]) : undefined;
}

async function getNews(): Promise<{ items: NewsItem[]; error?: string }> {
  try {
    const xml = await fetchText(
      "https://news.google.com/rss?hl=pl&gl=PL&ceid=PL:pl",
    );
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      .map((match) => {
        const item = match[1];
        return {
          title: readXmlTag(item, "title") ?? "",
          link: readXmlTag(item, "link"),
          publishedAt: readXmlTag(item, "pubDate"),
        };
      })
      .filter((item) => item.title)
      .slice(0, 5);

    return { items };
  } catch (error) {
    return { items: [], error: getErrorMessage(error) };
  }
}

async function getHoliday(date: string): Promise<HolidayData | null> {
  try {
    const year = date.slice(0, 4);
    const holidays = await fetchJson<Array<HolidayData & { date: string }>>(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/PL`,
    );
    return holidays.find((holiday) => holiday.date === date) ?? null;
  } catch {
    return null;
  }
}

function formatRate(data: ExchangeRateData) {
  return data.rate === undefined ? data.error ?? "brak danych" : `${data.rate.toFixed(4)} PLN`;
}

function buildPrompt({
  date,
  dayLabel,
  weather,
  eur,
  usd,
  news,
  holiday,
}: {
  date: string;
  dayLabel: string;
  weather: WeatherData;
  eur: ExchangeRateData;
  usd: ExchangeRateData;
  news: NewsItem[];
  holiday: HolidayData | null;
}) {
  const weatherLine = weather.error
    ? `Dane pogodowe niedostępne: ${weather.error}`
    : `${weather.temperature ?? "brak"}°C, ${weather.description ?? "brak opisu"}, wilgotność ${weather.humidity ?? "brak"}%, wiatr ${weather.windSpeed ?? "brak"} km/h`;
  const newsLines = news.length
    ? news.map((item, index) => `${index + 1}. ${item.title}${item.link ? ` (${item.link})` : ""}`).join("\n")
    : "Brak dostępnych wiadomości.";

  return `Przygotuj poranny briefing po polsku na podstawie wyłącznie danych poniżej. Nie wymyślaj faktów. Bądź krótki, konkretny i pozytywny.

Data: ${date}
Dzień tygodnia i data: ${dayLabel}
Pogoda w Warszawie: ${weatherLine}
EUR: ${formatRate(eur)}${eur.effectiveDate ? ` (z dnia ${eur.effectiveDate})` : ""}
USD: ${formatRate(usd)}${usd.effectiveDate ? ` (z dnia ${usd.effectiveDate})` : ""}
Święto państwowe: ${holiday ? `${holiday.localName} (${holiday.name})` : "nie"}
Najnowsze wiadomości:
${newsLines}

Zwróć briefing dokładnie w tym formacie:

# ☀️ Dzień dobry! Twój briefing na ${date}

## 🌤️ Pogoda
[temperatura, opis, co ubrać]

## 💶 Kursy walut
- EUR: [kurs] PLN
- USD: [kurs] PLN

## 📅 Dzisiejszy dzień
- Dzień tygodnia: [...]
- Uwagi: [czy dziś święto? dzień wolny?]

## 📰 Najważniejsze wiadomości
[2-5 krótkich punktów na podstawie dostarczonych nagłówków]

## 💡 Porada dnia
[Krótka, pozytywna porada na dzień]`;
}

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Nieprawidłowe uwierzytelnienie crona." }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return Response.json(
      { error: "Brak konfiguracji Supabase. Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const date = getWarsawDate();
  const dayLabel = getDayLabel();

  try {
    const [weather, eur, usd, news, holiday] = await Promise.all([
      getWeather("Warszawa"),
      getExchangeRate("EUR"),
      getExchangeRate("USD"),
      getNews(),
      getHoliday(date),
    ]);

    const result = await generateText({
      model: google(model),
      system:
        "Jesteś osobistym asystentem. Napisz poranny briefing w języku polskim, zgodnie z formatem przekazanym w poleceniu użytkownika.",
      prompt: buildPrompt({ date, dayLabel, weather, eur, usd, news: news.items, holiday }),
      maxRetries: 0,
    });

    const content = result.text.trim();
    if (!content) {
      throw new Error("Model AI zwrócił pusty briefing.");
    }

    const { error: insertError } = await supabaseAdmin.from("briefings").insert({
      content,
      date,
    });

    if (insertError) {
      throw new Error(
        `Nie udało się zapisać briefingu w Supabase: ${insertError.message}. Uruchom supabase/briefings.sql.`,
      );
    }

    return Response.json({
      success: true,
      date,
      preview: content.slice(0, 300),
      newsCount: news.items.length,
    });
  } catch (error) {
    console.error("Morning briefing cron error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Nie udało się wygenerować briefingu." },
      { status: 500 },
    );
  }
}
