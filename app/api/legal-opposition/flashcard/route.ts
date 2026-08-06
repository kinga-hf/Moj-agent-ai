import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { getAuthenticatedRequest } from "../../../../lib/supabase-request";

const model = "gemini-3.1-flash-lite";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(req: Request) {
  try {
    await getAuthenticatedRequest(req);
    const body = (await req.json()) as { analysis?: unknown; pleadingType?: unknown };
    const analysis = cleanText(body.analysis, 36000);
    const pleadingType = cleanText(body.pleadingType, 160);

    if (!analysis) {
      return Response.json({ error: "Najpierw przygotuj analizę pisma." }, { status: 400 });
    }

    const result = await generateText({
      model: google(model),
      system: `Jesteś prawniczym asystentem przygotowującym krótką fiszkę na rozprawę na podstawie briefingu procesowego.
Nie dodawaj faktów, których nie ma w briefingu. Zachowaj odwołania do stron w formacie [--- STRONA n ---]. Pisz po polsku.

Zwróć dokładnie strukturę:
## Fiszka na rozprawę
### Sprawa i cel
### Najważniejsze tezy przeciwnika
### Nasze kontrargumenty
### Dowody i dokumenty
### Pytania do świadka
### Ryzyka i braki
### Trzy rzeczy do powiedzenia na rozprawie

Każda sekcja ma zawierać krótkie, praktyczne punkty. To pomoc robocza, nie porada prawna.`,
      prompt: `Rodzaj pisma: ${pleadingType || "pismo procesowe"}

BRIEFING:
${analysis}`,
      maxRetries: 0,
    });

    return Response.json({ flashcard: result.text });
  } catch (error) {
    console.error("Legal opposition flashcard API error:", error);
    return Response.json({ error: "Nie udało się przygotować fiszki na rozprawę." }, { status: 500 });
  }
}
