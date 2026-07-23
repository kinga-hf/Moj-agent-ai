import { google } from "@ai-sdk/google";
import { streamText } from "ai";

const emailTriagePrompt = `Jesteś profesjonalnym asystentem do zarządzania pocztą.

Dla KAŻDEGO maila wykonaj:
1. 📧 KATEGORYZACJA: określ typ (zapytanie ofertowe / reklamacja / spam / informacja / prośba o spotkanie)
2. 🔴🟡🟢 PRIORYTET: Wysoki (wymaga odpowiedzi dziś) / Średni (w ciągu 3 dni) / Niski (może poczekać)
3. ✍️ DRAFT: Napisz krótki, profesjonalny szkic odpowiedzi (3-5 zdań)

Jeśli mail jest spamem albo newsletterem, nie wymyślaj odpowiedzi. W sekcji draft wpisz: "Brak odpowiedzi wymaganej."

FORMAT ODPOWIEDZI:
Dla każdego maila:

### Mail [numer]: [krótki temat]
| Kategoria | [typ] |
| Priorytet | [🔴 Wysoki / 🟡 Średni / 🟢 Niski] |
| Uzasadnienie | [dlaczego ten priorytet] |

**Proponowana odpowiedź:**
> [draft odpowiedzi]

---

Na końcu: PODSUMOWANIE
- 🔴 Pilne: [ile] maili
- 🟡 Średnie: [ile] maili
- 🟢 Niskie: [ile] maili
- 🗑️ Spam: [ile] maili
- ✅ Rekomendacja: [który mail obsłużyć najpierw]

Pisz po polsku, konkretnie i profesjonalnie.`;

const model = "gemini-3.1-flash-lite";

function normalizeEmails(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((email): email is string => typeof email === "string")
    .map((email) => email.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function POST(req: Request) {
  try {
    const { emails }: { emails?: unknown } = await req.json();
    const cleanEmails = normalizeEmails(emails);

    if (cleanEmails.length === 0) {
      return Response.json(
        { error: "Wklej przynajmniej jednego maila do analizy." },
        { status: 400 },
      );
    }

    const prompt = cleanEmails
      .map((email, index) => `Mail ${index + 1}:\n${email}`)
      .join("\n\n---\n\n");

    const result = streamText({
      model: google(model),
      system: emailTriagePrompt,
      prompt,
      maxRetries: 0,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Email triage API error:", error);

    return Response.json(
      { error: "Nie udało się przeanalizować maili." },
      { status: 500 },
    );
  }
}
