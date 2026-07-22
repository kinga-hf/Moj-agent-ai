import { GoogleGenAI, Modality } from "@google/genai";

const imageModel = "gemini-3.1-flash-lite-image";

type GenerateImageRequest = {
  prompt?: unknown;
};

function getGoogleApiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('"code":429') || message.includes("RESOURCE_EXHAUSTED")) {
    return "Limit Google AI Studio dla modelu obrazowego jest teraz wyczerpany. Spróbuj ponownie później albo użyj klucza z dostępnym limitem.";
  }

  try {
    const parsed = JSON.parse(message) as { error?: { message?: string } };
    return parsed.error?.message || message;
  } catch {
    return message || "Nieznany błąd API.";
  }
}

async function generateImage(prompt: string, signal: AbortSignal) {
  const apiKey = getGoogleApiKey();

  if (!apiKey) {
    throw new Error(
      "Brakuje klucza GOOGLE_API_KEY lub GOOGLE_GENERATIVE_AI_API_KEY w pliku .env.local.",
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: imageModel,
    contents: prompt,
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  if (signal.aborted) {
    throw new Error("Generowanie obrazu przekroczyło limit 30 sekund.");
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  const textPart = parts.find((part) => part.text);
  const imageData = imagePart?.inlineData?.data;
  const mimeType = imagePart?.inlineData?.mimeType || "image/png";

  if (!imageData) {
    throw new Error("Model nie zwrócił obrazu. Spróbuj zmienić opis grafiki.");
  }

  return {
    image: `data:${mimeType};base64,${imageData}`,
    text: textPart?.text?.trim() || "Grafika została wygenerowana.",
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateImageRequest;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return Response.json(
        { error: "Podaj opis obrazu w polu prompt." },
        { status: 400 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const result = await Promise.race([
        generateImage(prompt, controller.signal),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("Generowanie obrazu przekroczyło limit 30 sekund.")),
            { once: true },
          );
        }),
      ]);

      return Response.json(result);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("Image generation API error:", error);

    return Response.json(
      {
        error: `Nie udało się wygenerować obrazu. ${getErrorMessage(error)}`,
      },
      { status: 500 },
    );
  }
}
