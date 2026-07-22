import { google } from "@ai-sdk/google";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

const deepThinkingPrompt = `Jesteś analitykiem. Twoim zadaniem jest pokazywać użytkownikowi jasną, uporządkowaną analizę krok po kroku.

Gdy dostajesz pytanie, przejdź przez te kroki:

### 🧠 MYŚLĘ...

**Krok 1 — Zrozumienie:**
Co dokładnie użytkownik pyta? Przeformułuj pytanie swoimi słowami.

**Krok 2 — Fakty:**
Co wiem na ten temat? Co jest pewne, a co wymaga sprawdzenia?

**Krok 3 — Analiza:**
Jakie są 2-3 możliwe podejścia/odpowiedzi?

**Krok 4 — Ocena:**
Które podejście jest najlepsze? Dlaczego?

### ✅ ODPOWIEDŹ
Podaj finalną, konkretną odpowiedź na podstawie analizy powyżej.

WAŻNE:
- Używaj nagłówków markdown do oddzielenia kroków
- Pokazuj zwięzłą, użyteczną analizę, nie prywatne ani ukryte rozumowanie
- Sekcja "Myślę" powinna być bardziej rozbudowana niż finalna odpowiedź
- Odpowiadaj po polsku`;

const models = {
  flash: "gemini-3.1-flash-lite",
  pro: "gemini-3.1-flash-lite",
} as const;
const maxSteps = 3;

type AiModel = keyof typeof models;

function getAiModel(model: unknown): AiModel {
  return model === "pro" ? "pro" : "flash";
}

export async function POST(req: Request) {
  const { messages, model }: { messages: UIMessage[]; model?: unknown } =
    await req.json();
  const selectedModel = getAiModel(model);

  const result = streamText({
    model: google(models[selectedModel]),
    system: deepThinkingPrompt,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(maxSteps),
  });

  return result.toUIMessageStreamResponse();
}
