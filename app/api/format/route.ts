import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  type UIMessage,
} from "ai";

const formatPrompt = `Jesteś asystentem, który formatuje odpowiedzi według instrukcji użytkownika.

Rozpoznajesz komendy formatu na początku wiadomości:

/tabela [temat] - odpowiedz w formie tabeli markdown.
Kolumny dobierz do tematu. Minimum 3 kolumny i 5 wierszy.

/lista [temat] - odpowiedz jako lista numerowana z opisami.
Każdy punkt: numer + nagłówek pogrubiony + jedno zdanie opisu.

/porownanie [A] vs [B] - odpowiedz jako tabela porównawcza dwóch rzeczy.
Kolumny: Aspekt | [A] | [B] | Werdykt.
Minimum 6 aspektów oraz wiersz podsumowania.

/faq [temat] - odpowiedz jako lista pytań i odpowiedzi.
Format: **Q:** pytanie -> **A:** odpowiedź.
Minimum 5 par Q&A.

/email [opis] - napisz profesjonalny email.
Format: Temat | Od/Do | Treść | Podpis.

Jeśli wiadomość NIE zaczyna się od komendy, odpowiadaj normalnie, ale w czystym, czytelnym markdown.

ZASADY:
- Zawsze formatuj w markdown.
- Używaj nagłówków, pogrubień, tabel i list tam, gdzie pasują.
- Przy tabelach zwracaj poprawną tabelę markdown z separatorem nagłówka.
- Pisz po polsku.`;

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

async function generateFormatAnswer(messages: UIMessage[], model: AiModel) {
  try {
    const result = await generateText({
      model: google(models[model]),
      system: formatPrompt,
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
        system: formatPrompt,
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
    const text = await generateFormatAnswer(chatMessages, selectedModel);

    return createChatResponse(text, chatMessages);
  } catch (error) {
    console.error("Format API error:", error);

    return Response.json(
      {
        error: "Nie udało się obsłużyć formatera.",
      },
      { status: 500 },
    );
  }
}
