import { translate } from "@vitalets/google-translate-api";

export const runtime = "nodejs";

type TranslateRequest = {
  text?: unknown;
  targetLanguage?: unknown;
};

function getCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  let body: TranslateRequest;

  try {
    body = (await req.json()) as TranslateRequest;
  } catch {
    return Response.json({ error: "Niepoprawny JSON." }, { status: 400 });
  }

  const text = getCleanString(body.text);
  const targetLanguage = getCleanString(body.targetLanguage);

  if (!text || !targetLanguage) {
    return Response.json(
      { error: "Brak tekstu lub języka docelowego." },
      { status: 400 },
    );
  }

  try {
    const result = await translate(text, { to: targetLanguage });

    return Response.json({ translatedText: result.text });
  } catch (error) {
    console.error("Błąd Google Translate:", error);

    return Response.json(
      { error: "Błąd podczas tłumaczenia." },
      { status: 500 },
    );
  }
}
