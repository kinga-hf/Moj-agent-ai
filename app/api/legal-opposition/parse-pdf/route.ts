import pdf from "pdf-parse/lib/pdf-parse.js";
import { getAuthenticatedRequest } from "../../../../lib/supabase-request";

export const runtime = "nodejs";

const maxPdfSize = 12 * 1024 * 1024;
const maxExtractedText = 18000;

export async function POST(req: Request) {
  try {
    await getAuthenticatedRequest(req);

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Nie wybrano pliku PDF." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return Response.json({ error: "Wybierz plik w formacie PDF." }, { status: 400 });
    }

    if (file.size > maxPdfSize) {
      return Response.json(
        { error: "PDF jest za duży. Maksymalny rozmiar pliku to 12 MB." },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdf(buffer);
    const text = parsed.text.replace(/\s+/g, " ").trim();

    if (text.length < 20) {
      return Response.json(
        {
          error:
            "Nie udało się odczytać tekstu z PDF. Jeśli to skan, potrzebne będzie OCR.",
        },
        { status: 422 },
      );
    }

    return Response.json({
      text: text.slice(0, maxExtractedText),
      pages: parsed.numpages ?? null,
      truncated: text.length > maxExtractedText,
    });
  } catch (error) {
    console.error("Legal briefing PDF parsing error:", error);
    return Response.json(
      { error: "Nie udało się odczytać tego PDF-a. Spróbuj innego pliku." },
      { status: 500 },
    );
  }
}
