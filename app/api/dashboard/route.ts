type WeatherData = {
  city: string;
  country?: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  precipitation?: number;
  updatedAt: string;
  error?: string;
};

type CurrencyData = {
  code: string;
  rate?: number;
  previousRate?: number;
  change?: number;
  effectiveDate?: string;
  updatedAt: string;
  error?: string;
};

type HolidayData = {
  date: string;
  localName: string;
  name: string;
  daysUntil: number;
};

const timeoutMs = 5000;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Timeout - serwer nie odpowiedzial w 5 sekund.";
  }

  return error instanceof Error ? error.message : String(error);
}

async function fetchJson<T>(url: string | URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API zwrocilo blad ${response.status}.`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function getCoordinates(city: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "pl");
  url.searchParams.set("format", "json");

  const data = await fetchJson<{
    results?: Array<{
      name: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  }>(url);
  const result = data.results?.[0];

  if (!result) {
    throw new Error(`Nie znalazlem miasta ${city}.`);
  }

  return result;
}

async function getWeather(city: string): Promise<WeatherData> {
  const updatedAt = new Date().toISOString();

  try {
    const location = await getCoordinates(city);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m");
    url.searchParams.set("timezone", "Europe/Warsaw");

    const data = await fetchJson<{
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        precipitation?: number;
        wind_speed_10m?: number;
      };
    }>(url);

    return {
      city: location.name,
      country: location.country,
      temperature: data.current?.temperature_2m,
      humidity: data.current?.relative_humidity_2m,
      windSpeed: data.current?.wind_speed_10m,
      precipitation: data.current?.precipitation,
      updatedAt,
    };
  } catch (error) {
    return {
      city,
      updatedAt,
      error: getErrorMessage(error),
    };
  }
}

async function getExchangeRate(code: string): Promise<CurrencyData> {
  const updatedAt = new Date().toISOString();

  try {
    const data = await fetchJson<{
      code: string;
      rates: Array<{ effectiveDate: string; mid: number }>;
    }>(`https://api.nbp.pl/api/exchangerates/rates/a/${code}/last/2/?format=json`);
    const previous = data.rates[0];
    const current = data.rates[data.rates.length - 1];

    return {
      code: data.code,
      rate: current?.mid,
      previousRate: previous?.mid,
      change:
        current?.mid !== undefined && previous?.mid !== undefined
          ? Number((current.mid - previous.mid).toFixed(4))
          : undefined,
      effectiveDate: current?.effectiveDate,
      updatedAt,
    };
  } catch (error) {
    return {
      code,
      updatedAt,
      error: getErrorMessage(error),
    };
  }
}

async function getHolidays(countryCode: string, year: number) {
  const updatedAt = new Date().toISOString();

  try {
    const holidays = await fetchJson<Array<{ date: string; localName: string; name: string }>>(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`,
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = holidays
      .map((holiday) => {
        const date = new Date(`${holiday.date}T00:00:00`);
        const daysUntil = Math.ceil((date.getTime() - today.getTime()) / 86_400_000);

        return {
          date: holiday.date,
          localName: holiday.localName,
          name: holiday.name,
          daysUntil,
        };
      })
      .filter((holiday) => holiday.daysUntil >= 0)
      .slice(0, 4);

    return {
      countryCode,
      year,
      upcoming,
      updatedAt,
    };
  } catch (error) {
    return {
      countryCode,
      year,
      upcoming: [] as HolidayData[],
      updatedAt,
      error: getErrorMessage(error),
    };
  }
}

export async function GET() {
  const now = new Date();
  const [weather, eur, usd, holidays] = await Promise.all([
    getWeather("Ostrów Wielkopolski"),
    getExchangeRate("EUR"),
    getExchangeRate("USD"),
    getHolidays("PL", 2026),
  ]);

  return Response.json({
    generatedAt: now.toISOString(),
    dateTime: {
      iso: now.toISOString(),
      label: new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Europe/Warsaw",
      }).format(now),
      day: new Intl.DateTimeFormat("pl-PL", {
        weekday: "long",
        timeZone: "Europe/Warsaw",
      }).format(now),
    },
    weather,
    currencies: [eur, usd],
    holidays,
  });
}
