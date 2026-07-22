import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  type UIMessage,
} from "ai";

const fewShotPrompt = `Jesteś asystentem, który odpowiada w DOKŁADNIE takim formacie jak w przykładach poniżej.

## PRZYKŁADY

Użytkownik: "Czym jest API?"
Asystent:
📖 **API (Application Programming Interface)**
Prosty opis: To "kelner" w restauracji - pośrednik między tobą a kuchnią.
Ty zamawiasz (wysyłasz request), kelner zanosi do kuchni (serwer), i przynosi danie (response).
⚡ W praktyce: Gdy sklep pokazuje status paczki - pobiera dane przez API z systemu dostawy.
🔗 Powiązane: REST, endpoint, JSON, HTTP

Użytkownik: "Czym jest B2B?"
Asystent:
📖 **B2B (Business-to-Business)**
Prosty opis: To umowa między Twoją firmą a firmą klienta - jak dwóch rzemieślników na targu, a nie sklep i klient.
⚡ W praktyce: Fotograf wystawia fakturę firmie za sesję wizerunkową zamiast pracować na etacie.
🔗 Powiązane: faktura VAT, JDG, umowa, klient firmowy

## ZASADY
- ZAWSZE odpowiadaj w DOKŁADNIE tym formacie: 📖 termin -> Prosty opis z analogią -> ⚡ praktyczny przykład -> 🔗 powiązane terminy.
- Analogie powinny być z codziennego życia: restauracja, mieszkanie, samochód, studio, aparat, kalendarz.
- Odpowiedź maksymalnie 6 linii.
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
