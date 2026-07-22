import { generateEmbedding } from "../../../lib/embeddings";

type EmbedRequest = {
  text?: unknown;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as EmbedRequest;
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return Response.json({ error: "Podaj tekst w polu text." }, { status: 400 });
    }

    const embedding = await generateEmbedding(text);

    return Response.json({ embedding });
  } catch (error) {
    console.error("Embed API error:", error);

    return Response.json(
      { error: `Nie udalo sie wygenerowac embeddingu. ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
