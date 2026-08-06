import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  type UIMessage,
} from "ai";

const fewShotPrompt = `Jesteś słownikiem LexAI dla zespołu zajmującego się analizą pism procesowych i dochodzeniem roszczeń. Odpowiadasz w DOKŁADNIE takim formacie jak w przykładach poniżej.

## PRZYKŁADY

Użytkownik: "Czym jest cesja wierzytelności?"
Asystent:
⚖️ **Cesja wierzytelności**
Prosty opis: To przeniesienie prawa do żądania zapłaty z jednej osoby lub firmy na inną.
⚡ W sprawie: Nowy wierzyciel może dochodzić roszczenia, ale powinien wykazać umowę cesji i swoją legitymację czynną.
🔎 Sprawdź w dokumencie: datę cesji, zakres przeniesionych praw, strony umowy i zawiadomienie dłużnika.
🔗 Powiązane: wierzytelność, legitymacja czynna, dłużnik, przedawnienie

Użytkownik: "Co oznacza przedawnienie roszczenia?"
Asystent:
⚖️ **Przedawnienie roszczenia**
Prosty opis: Po upływie określonego terminu dochodzenie roszczenia może zostać ograniczone przez zarzut przedawnienia.
⚡ W sprawie: Trzeba ustalić początek biegu terminu, ewentualne przerwanie lub zawieszenie oraz datę wniesienia pozwu.
🔎 Sprawdź w dokumencie: terminy płatności, wezwania do zapłaty, uznanie długu i czynności procesowe.
🔗 Powiązane: wymagalność, zarzut, przerwanie biegu, odsetki

## ZASADY
- ZAWSZE odpowiadaj w DOKŁADNIE tym formacie: ⚖️ termin -> Prosty opis -> ⚡ znaczenie w sprawie -> 🔎 co sprawdzić w dokumencie -> 🔗 powiązane terminy.
- Używaj przykładów z pozwów, sprzeciwów, apelacji, umów, cesji, szkód i postępowania dowodowego.
- Nie przesądzaj wyniku sprawy i zaznacz, gdy znaczenie zależy od treści dokumentów.
- Odpowiedź maksymalnie 8 linii.
- Jeśli pytanie NIE jest o definicję albo termin, odpowiedz normalnie, ale krótko i czytelnie.
- Odpowiadaj po polsku.`;

const models = {
  flash: "gemini-3.1-flash-lite",
  pro: "gemini-3.1-flash-lite",
} as const;

const flashFallbackModel = "gemini-3.1-flash-lite";
const maxSteps = 3;

type AiModel = keyof typeof models;

function getAiModel(model: unknown): AiModel {
  return model === "pro" ? "pro" : "flash";
}

function isQuotaError(error: unknown) {
  const maybeStatus = error as { statusCode?: unknown };
  const message = error instanceof Error ? error.message : String(error);

  return maybeStatus.statusCode === 429 || message.toLowerCase().includes("quota");
}

async function generateFewShotAnswer(messages: UIMessage[], model: AiModel) {
  try {
    const result = await generateText({
      model: google(models[model]),
      system: fewShotPrompt,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(maxSteps),
    });

    return result.text;
  } catch (error) {
    if (model === "flash" && isQuotaError(error)) {
      console.warn(
        `Model ${models.flash} wyczerpał limit. Próbuję fallback ${flashFallbackModel}.`,
      );

      const fallbackResult = await generateText({
        model: google(flashFallbackModel),
        system: fewShotPrompt,
        messages: await convertToModelMessages(messages),
        stopWhen: stepCountIs(maxSteps),
      });

      return fallbackResult.text;
    }

    throw error;
  }
}

function createChatResponse(text: string, originalMessages: UIMessage[]) {
  const stream = createUIMessageStream<UIMessage>({
    originalMessages,
    execute: ({ writer }) => {
      const id = `msg-${Date.now()}`;

      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  try {
    const { messages, model }: { messages?: unknown; model?: unknown } =
      await req.json();
    const chatMessages = Array.isArray(messages) ? (messages as UIMessage[]) : [];
    const selectedModel = getAiModel(model);
    const text = await generateFewShotAnswer(chatMessages, selectedModel);

    return createChatResponse(text, chatMessages);
  } catch (error) {
    console.error("Few-shot API error:", error);

    return Response.json(
      {
        error: "Nie udało się obsłużyć Słownika AI.",
      },
      { status: 500 },
    );
  }
}
