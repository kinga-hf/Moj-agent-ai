import pdf from "pdf-parse/lib/pdf-parse.js";
import { getAuthenticatedRequest } from "../../../../lib/supabase-request";

export const runtime = "nodejs";

const maxPdfSize = 12 * 1024 * 1024;
const maxExtractedText = 40000;

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

type PdfPageData = {
  getTextContent: (options: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }) => Promise<{ items: PdfTextItem[] }>;
};

async function renderPageWithMarker(pageData: PdfPageData, pageNumber: number) {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  });
  let lastY: number | undefined;
  let pageText = "";

  for (const item of textContent.items) {
    const y = item.transform?.[5];
    if (lastY === undefined || y === lastY) {
      pageText += item.str ?? "";
    } else {
      pageText += `\n${item.str ?? ""}`;
    }
    lastY = y;
  }

  return `[--- STRONA ${pageNumber} ---]\n${pageText}`;
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
    let pageNumber = 0;
    const parsed = await pdf(buffer, {
      pagerender: (pageData: PdfPageData) => {
        pageNumber += 1;
        return renderPageWithMarker(pageData, pageNumber);
      },
    });
    const text = normalizeExtractedText(parsed.text);

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
