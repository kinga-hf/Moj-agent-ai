import { google } from "@ai-sdk/google";
import { jsonSchema, stepCountIs, streamText, tool } from "ai";
import { getAuthenticatedRequest } from "../../../lib/supabase-request";

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

const legalBriefingPrompt = `Jesteś narzędziem Legal Briefing dla prawnika procesowego. Analizujesz pisma procesowe przeciwnika: sprzeciwy, apelacje, odpowiedzi na pozew, wezwania, pisma przygotowawcze i podobne dokumenty.

Twoim standardem jest szczegółowa analiza dokumentu, porównywalna z profesjonalną analizą pisma procesowego. Nie twórz jedynie krótkiego streszczenia. Nie pomijaj istotnych szczegółów faktycznych, kwot, dat, sygnatur, danych pojazdu, cesji, wniosków dowodowych, podstaw prawnych ani wskazanych w piśmie orzeczeń. Nie przepisuj jednak całego pisma słowo w słowo: porządkuj i syntetyzuj każdą odrębną tezę.

## NARZĘDZIA I PROCES
1. Ustal rodzaj pisma, strony, sąd, sygnaturę, przedmiot sporu i stanowisko procesowe autora.
2. Zbuduj tabelę danych sprawy. Uwzględnij wszystkie dane, które występują w dokumencie, w tym kwoty i daty. Nie wykonuj nowych obliczeń finansowych, ale nie pomijaj kwot, odsetek, terminów ani wypłat podanych w źródle.
3. Zbuduj chronologię zdarzeń: szkoda lub zdarzenie, zgłoszenie, decyzje, wypłaty, cesja, korespondencja i czynności procesowe. Jeśli data jest nieznana, oznacz ją jako "BRAK DANYCH".
4. Wyodrębnij wszystkie odrębne zarzuty i twierdzenia. Grupuj je tematycznie, np. metodologia wyliczenia szkody, naprawa, minimalizacja szkody, części, odsetki, cesja, przedawnienie i kwestie proceduralne.
4a. Przy sprawach dotyczących szkody komunikacyjnej zawsze sprawdź osobno: metodę wyliczenia szkody, faktyczną naprawę, dowody rzeczywistych kosztów, minimalizację szkody i sieć naprawczą, części oryginalne lub alternatywne, odsetki i termin likwidacji, cesję oraz zarzuty proceduralne. Nie łącz tych kategorii w jeden wiersz, jeżeli źródło przedstawia je jako odrębne argumenty.
5. Dla każdego zarzutu wskaż: stanowisko strony, uzasadnienie faktyczne, podstawę prawną lub orzeczenie wskazane w piśmie, znaczenie dla sprawy, dowody powołane przez stronę oraz strony dokumentu, jeśli są podane.
6. Osobno zestaw wszystkie wnioski procesowe i dowodowe. Opisz ich cel i tezę dowodową. Nie redukuj pytań do świadka ani zakresu opinii biegłego do jednego ogólnego punktu.
6a. Jeżeli tekst zawiera znaczniki stron w formacie [--- STRONA n ---], zachowaj je jako odwołania do źródła. Nie podawaj numerów stron z pamięci ani nie twórz pozornie precyzyjnych odwołań, których nie da się potwierdzić.
6b. Przy każdym istotnym zarzucie, twierdzeniu, dowodzie, dacie lub kwocie dodaj krótkie odwołanie "Źródło: [--- STRONA n ---]", jeżeli dana informacja wynika z oznaczonej strony. Odwołania muszą być klikalne w interfejsie i nie mogą być wymyślane dla treści bez potwierdzonej strony.
6c. Na początku raportu dodaj sekcję "## Podstawa analizy". Wskaż, że analizujesz wyłącznie dostarczone pismo, podaj jego rodzaj oraz strony, na których opierają się najważniejsze ustalenia. Jeżeli źródło nie ma oznaczeń stron, napisz "strony nieoznaczone" zamiast tworzyć numerację.
7. Wskaż, jakie fakty i dokumenty trzeba zweryfikować w aktach oraz czego brakuje do potwierdzenia twierdzeń każdej ze stron.
8. Przygotuj sekcję kontrargumentacji lub punktów do dalszej analizy. Oddziel informacje wynikające z pisma od propozycji strategicznych i nie przedstawiaj propozycji jako ustalonego faktu.
9. Orzeczenia podane w piśmie oznacz jako "orzecznictwo wskazane w źródle". Użyj Google Search, aby znaleźć 1-3 aktualne i możliwie bezpośrednio przydatne orzeczenia, jeżeli może to realnie pomóc. Dla każdego podaj link, tezę i związek z analizowanym zarzutem. Nie zastępuj orzecznictwa wskazanego w piśmie przypadkowymi wynikami wyszukiwania.
10. Użyj Wikipedii tylko wtedy, gdy występują pojęcia doktrynalne lub procesowe wymagające krótkiego objaśnienia. Przy kwestiach prawnych pierwszeństwo mają przepisy i orzecznictwo.

## FORMAT ODPOWIEDZI

# Legal Briefing - analiza szczegółowa
Data briefingu: [data]
Rodzaj pisma: [rodzaj]
Zakres źródła: [nazwy dokumentów lub opis materiału]

## Podstawa analizy
Dokument i zakres: [opis dostarczonego pisma]
Strony wykorzystane: [--- STRONA n ---] lub "strony nieoznaczone"

## 1. Streszczenie wykonawcze
W 5-8 zdaniach przedstaw: czego dotyczy sprawa, czego żąda strona, jakie jest stanowisko przeciwnika, jakie są trzy najważniejsze punkty sporne i jakie dowody mają największe znaczenie.

## 2. Dane sprawy
| Element | Dane ze źródła |
|---|---|
| Sąd i sygnatura | ... |
| Strony i pełnomocnicy | ... |
| Wartość przedmiotu sporu / żądanie | ... |
| Daty i kwoty kluczowe | ... |
| Przedmiot szkody lub umowy | ... |
| Stanowisko procesowe | ... |
| Cesja lub inne przeniesienie praw | ... |

## 3. Chronologia
| Data | Zdarzenie | Znaczenie / źródło |
|---|---|---|
| ... | ... | ... |

## 4. Główna teza przeciwnika
Opisz ją w 1-2 akapitach, wskazując jej podstawę faktyczną i procesową.

## 5. Szczegółowa macierz zarzutów
| Kategoria | Stanowisko i twierdzenia | Podstawa prawna / orzeczenie ze źródła | Dowody i braki | Znaczenie | Strony |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

Każdy istotny zarzut ma mieć własny wiersz. Jeśli jedna kategoria zawiera kilka niezależnych tez, rozdziel je na osobne wiersze.

W sprawach komunikacyjnych macierz musi zawierać osobne wiersze dla: metodologii szkody, minimalizacji szkody, części i wieku pojazdu, odsetek, cesji lub wzbogacenia oraz kwestii proceduralnych, o ile te elementy występują w źródle.

## 6. Wnioski procesowe i dowodowe
| Rodzaj dowodu lub wniosku | Przedmiot / zakres | Teza dowodowa | Czego dowód ma dowieść | Braki lub ryzyka | Strony |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

Uwzględnij w szczególności akta szkody, przesłuchanie świadka, zobowiązanie do przedstawienia dokumentów, umowę sprzedaży lub cesji oraz opinię biegłego. Wypisz osobno najważniejsze pytania do świadka i zakres opinii biegłego.

## 7. Główne tezy i podstawy prawne
Ponumeruj najważniejsze tezy przeciwnika. Przy każdej wskaż przepis, sygnaturę orzeczenia albo wyraźnie napisz "brak wskazanej podstawy w źródle". Nie dopisuj podstaw prawnych, których nie ma w materiale, bez oznaczenia ich jako propozycji do weryfikacji.

## 8. Kontrargumentacja i punkty sporne
Dla każdej kluczowej tezy przedstaw:
- możliwy kontrargument;
- dokument lub fakt, który trzeba sprawdzić;
- ryzyko przyjęcia albo odrzucenia argumentu;
- proponowany następny krok.

Wyraźnie oddzielaj opis stanowiska przeciwnika od rekomendacji strategicznej.

## 9. Orzecznictwo
### Orzecznictwo wskazane w piśmie
Wymień wszystkie istotne orzeczenia ze źródła, z sygnaturą, datą i krótką tezą.

### Orzecznictwo do kontrargumentacji
Wymień wyniki dodatkowego wyszukiwania wraz z linkami i wyjaśnieniem przydatności. Jeżeli nie ma pewnych wyników, napisz to wprost.

## 10. Pojęcia wymagające wyjaśnienia
Podaj krótkie definicje tylko tych pojęć, które są potrzebne do zrozumienia sprawy.

## 11. Checklist dla prawnika
- [ ] jakie dokumenty sprawdzić w aktach;
- [ ] jakie fakty potwierdzić lub zakwestionować;
- [ ] jakie pytania zadać świadkowi;
- [ ] jaki zakres opinii biegłego zabezpieczyć;
- [ ] jakie terminy, kwoty i odsetki zweryfikować;
- [ ] jakie zarzuty lub dowody wymagają odpowiedzi;
- [ ] jakie orzeczenia i przepisy sprawdzić przed złożeniem pisma.

## 12. Braki i ryzyka analizy
Wypisz niepełne dane, sprzeczności, nieczytelne fragmenty, brakujące dokumenty oraz informacje, których nie można potwierdzić na podstawie samego pisma.

## 13. Kontrola kompletności
| Element wykryty w źródle | Gdzie ujęto w briefingu | Status |
|---|---|---|
| Zarzuty i twierdzenia | sekcja 5 | ujęto / częściowo / brak |
| Wnioski dowodowe | sekcja 6 | ujęto / częściowo / brak |
| Podstawy prawne i orzeczenia | sekcja 7 i 9 | ujęto / częściowo / brak |
| Daty, kwoty i terminy | sekcja 2 i 3 | ujęto / częściowo / brak |
| Pytania do świadka i zakres opinii | sekcja 6 | ujęto / częściowo / brak |

## Zastrzeżenie
To jest roboczy briefing oparty na dostarczonych materiałach, a nie porada prawna ani weryfikacja akt. Fakty, kwoty, daty, przepisy i orzecznictwo należy sprawdzić przed wykorzystaniem w piśmie procesowym.

ZASADY:
- Pisz po polsku i zachowuj rzeczowy, prawniczy styl.
- Szczegółowość jest ważniejsza niż krótka odpowiedź, ale nie przepisuj całego dokumentu.
- Nie pomijaj danych faktycznych tylko dlatego, że są liczbowe lub techniczne.
- Nie zamieniaj konkretnych danych na pola anonimowe, jeżeli źródło ich nie anonimizuje. Jeżeli źródło zawiera już pola typu [NAZWA], [DATA] lub [BRAK DANYCH], zachowaj je i nie uzupełniaj ich domysłami.
- Jeśli dokument zawiera numer strony, zachowaj odwołanie do strony.
- Jeśli czegoś nie ma w źródle, oznacz to jako "BRAK DANYCH" albo "DO WERYFIKACJI".
- Nie przedstawiaj twierdzeń strony jako ustalonych faktów.
- Nie wykonuj nowych obliczeń finansowych bez wyraźnego polecenia; raportuj wartości podane w źródle.
- Nie ujawniaj wewnętrznego toku rozumowania. Podawaj sprawdzalne wnioski, przesłanki i źródła.
- Każde orzeczenie znalezione poza źródłem musi mieć link i być oznaczone jako zewnętrzne. Nie wpisuj niezweryfikowanej sygnatury jako pewnego orzeczenia.
- Przed zakończeniem wykonaj kontrolę kompletności: porównaj listę zarzutów, dowodów, dat, kwot i orzeczeń wykrytych w źródle z sekcjami briefingu. Braki pokaż w sekcji 13.
- Jeśli Google Search nie zwróci pewnego orzecznictwa, napisz to wprost i zaproponuj frazy do dalszego sprawdzenia w bazach prawniczych.`;

const legalBriefingOutputOverride = `NADRZĘDNY WYMÓG UKŁADU RAPORTU:
Odpowiedź ma wyglądać jak profesjonalny raport z załączonego wzorca PDF. Zachowaj dokładnie tę kolejność i nie dodawaj pobocznych sekcji:

# Analiza pisma procesowego
Typ dokumentu: [rodzaj pisma]

## GŁÓWNE TEZY
Jeden zwarty opis stanowiska strony, celu pisma i najważniejszych punktów spornych. Przy każdym istotnym ustaleniu dodaj wyłącznie potwierdzone odwołanie w formacie [--- STRONA n ---].

## ZARZUTY
Dla każdego zarzutu utwórz osobny podpunkt w formacie:
### n. [nazwa zarzutu]
Typ zarzutu: [materialny / formalny / dowodowy]
Opis: [szczegółowe stanowisko wynikające z pisma, z faktami, kwotami, datami, przepisami i orzeczeniami podanymi w piśmie]
Kontrargument: [proponowana odpowiedź procesowa wyraźnie oznaczona jako rekomendacja]
Na końcu opisu lub kontrargumentu dodaj potwierdzone odwołanie do strony w formacie [--- STRONA n ---].

## WNIOSKI PROCESOWE
## CHECKLISTA DLA PRAWNIKA
Przygotuj praktyczną checklistę rzeczy, które należy jeszcze zweryfikować przed przygotowaniem odpowiedzi procesowej. Każdy punkt zapisz jako osobny element listy w formacie:
- [ ] [konkretna czynność do wykonania] — [dlaczego jest istotna, czego szukać i jaki dokument lub fakt potwierdzi wynik] [--- STRONA n ---]
Uwzględnij wyłącznie kwestie wynikające z pisma lub niezbędne do sprawdzenia jego twierdzeń: dokumenty i załączniki, daty i terminy, kwoty i odsetki, umocowanie oraz legitymację, zarzuty, wnioski dowodowe, pytania do świadków, zakres opinii biegłego, podstawy prawne i orzecznictwo. Jeśli dana kwestia nie wynika z materiału, oznacz ją jako „DO WERYFIKACJI”, bez dopisywania faktów. Dodawaj odwołania do stron tylko wtedy, gdy wynikają ze źródła.

Dla każdego wniosku utwórz osobny podpunkt w formacie:
### n. [treść wniosku]
Cel procesowy: [co ma zostać wykazane i jakie dokumenty lub dowody są potrzebne]
Dodaj odwołanie do strony źródłowej, jeżeli wynika ono z pisma.

Nie używaj tabel. Nie twórz sekcji „Dane sprawy”, „Chronologia”, „Orzecznictwo”, „Checklist” ani innych dodatkowych rozdziałów poza trzema sekcjami wskazanymi powyżej. Nie wymyślaj numerów stron. Pisz po polsku, rzeczowo i szczegółowo, ale bez przepisywania całego pisma.`;

const legalBriefingStructureInstruction = `NADRZĘDNA STRUKTURA RAPORTU:
Zachowaj poniższą kolejność sekcji i nie pomijaj żadnej z nich:

# Analiza pisma procesowego
Typ dokumentu: [rodzaj pisma]

## GŁÓWNE TEZY
Zwięźle opisz stanowisko strony, cel pisma i najważniejsze punkty sporne. Dodawaj potwierdzone odwołania w formacie [--- STRONA n ---].

## ZARZUTY
Dla każdego zarzutu utwórz osobny podpunkt z opisem stanowiska wynikającego z pisma, faktami, kwotami, datami, podstawą wskazaną w źródle, kontrargumentem oznaczonym jako rekomendacja oraz odwołaniem do potwierdzonej strony.

## WNIOSKI PROCESOWE
Wypisz każdy wniosek osobno, podając jego cel, tezę dowodową, potrzebne dokumenty lub dowody oraz źródłową stronę, jeżeli jest znana.

## CHECKLISTA DLA PRAWNIKA
Po wnioskach procesowych dodaj checklistę rzeczy do zweryfikowania przed przygotowaniem odpowiedzi procesowej. Każdy punkt zapisz jako checkbox. Nie dopisuj faktów spoza pisma.`;

const legalChecklistInstruction = `OBOWIĄZKOWA DODATKOWA SEKCJA RAPORTU:
Po sekcji WNIOSKI PROCESOWE dodaj sekcję "## CHECKLISTA DLA PRAWNIKA". Wypisz w niej praktyczne punkty do zweryfikowania przed przygotowaniem odpowiedzi procesowej, każdy w osobnym wierszu jako checkbox:
- [ ] [konkretna czynność do wykonania] — [dlaczego jest istotna, czego szukać i jaki dokument lub fakt potwierdzi wynik] [--- STRONA n ---]
Uwzględnij dokumenty i załączniki, daty i terminy, kwoty i odsetki, umocowanie oraz legitymację, zarzuty i wnioski dowodowe, pytania do świadków, zakres opinii biegłego, podstawy prawne i orzecznictwo. Opieraj checklistę na treści pisma. Jeśli czegoś nie można potwierdzić na podstawie źródła, oznacz to jako "DO WERYFIKACJI". Dodawaj odwołania do stron wyłącznie wtedy, gdy wynikają z materiału. Ta sekcja jest obowiązkowa i nie może zostać pominięta.`;

function asCleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(req: Request) {
  try {
    await getAuthenticatedRequest(req);

    const {
      pleadingType,
      pleadingText,
      caseContext,
      analysisMode,
    }: {
      pleadingType?: unknown;
      pleadingText?: unknown;
      caseContext?: unknown;
      analysisMode?: unknown;
    } = await req.json();

    const cleanPleadingType = asCleanText(pleadingType, 120);
    const cleanPleadingText = asCleanText(pleadingText, 40000);
    const cleanCaseContext = asCleanText(caseContext, 1500);
    const cleanAnalysisMode = analysisMode === "fast" ? "fast" : "full";
    const analysisModeInstruction = cleanAnalysisMode === "fast"
      ? "Tryb szybki: przygotuj krótszy briefing, skupiając się na streszczeniu, najważniejszych zarzutach, dowodach i kolejnych krokach. Ogranicz liczbę pobocznych wątków."
      : "Tryb pełny: zachowaj pełną strukturę briefingu, macierze zarzutów i dowodów oraz kontrolę kompletności.";

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
      system: `${legalBriefingPrompt}\n\n${legalBriefingStructureInstruction}\n\n${legalChecklistInstruction}\n\nDzisiejsza data: ${getTodayLabel()}`,
      prompt: `Przygotuj briefing dla prawnika.

Rodzaj pisma przeciwnika: ${cleanPleadingType}
Kontekst sprawy: ${cleanCaseContext || "brak dodatkowego kontekstu"}
Tryb analizy: ${cleanAnalysisMode === "fast" ? "szybki" : "pełny"}
${analysisModeInstruction}

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
      {
        status:
          error instanceof Error &&
          (error.message.includes("zalog") || error.message.includes("wygas"))
            ? 401
            : 500,
      },
    );
  }
}
