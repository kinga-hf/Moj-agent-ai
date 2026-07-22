import { google } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";

const maxSteps = 3;

type VisionRemixRequest = {
  image?: unknown;
  instruction?: unknown;
};

function parseImage(image: unknown) {
  if (typeof image !== "string" || !image.trim()) {
    return null;
  }

  const match = /^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i.exec(
    image.trim(),
  );

  if (!match) {
    return {
      data: image.trim(),
      mediaType: "image/png",
    };
  }

  return {
    data: match[2],
    mediaType: match[1].toLowerCase(),
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nieznany błąd.";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VisionRemixRequest;
    const image = parseImage(body.image);
    const instruction =
      typeof body.instruction === "string" && body.instruction.trim()
        ? body.instruction.trim()
        : "Wygeneruj podobny obraz w innym stylu.";

    if (!image) {
      return Response.json(
        { error: "Dodaj obraz, żeby wygenerować podobną wersję." },
        { status: 400 },
      );
    }

    const promptResult = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system:
        "Analizujesz obraz i tworzysz precyzyjny prompt do generatora grafiki. Zwróć wyłącznie prompt, bez komentarzy i bez markdown.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: image.data,
              mediaType: image.mediaType,
            },
            {
              type: "text",
              text: `Opisz ten obraz jako prompt do wygenerowania podobnej grafiki. Modyfikacja użytkownika: ${instruction}`,
            },
          ],
        },
      ],
      stopWhen: stepCountIs(maxSteps),
    });

    const imageResponse = await fetch(new URL("/api/generate-image", req.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: promptResult.text }),
    });
    const generated = (await imageResponse.json()) as {
      image?: string;
      text?: string;
      error?: string;
    };

    if (!imageResponse.ok || !generated.image) {
      return Response.json(
        {
          error:
            generated.error ||
            "Nie udało się wygenerować nowej wersji obrazu.",
          prompt: promptResult.text,
        },
        { status: imageResponse.status || 500 },
      );
    }

    return Response.json({
      prompt: promptResult.text,
      image: generated.image,
      text: generated.text,
    });
  } catch (error) {
    console.error("Vision remix API error:", error);

    return Response.json(
      {
        error: `Nie udało się przygotować podobnego obrazu. ${getErrorMessage(
          error,
        )}`,
      },
      { status: 500 },
    );
  }
}
