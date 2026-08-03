import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const model = "gemini-3.1-flash-lite";
const maxDataLength = 12_000;

const supportedTypes = ["feedback", "alert", "order"] as const;
type WebhookType = (typeof supportedTypes)[number];

function isWebhookType(value: unknown): value is WebhookType {
  return typeof value === "string" && supportedTypes.includes(value as WebhookType);
}

function getAnalysisInstructions(type: WebhookType) {
  switch (type) {
    case "feedback":
      return `Przeanalizuj opinię klienta. W odpowiedzi podaj:
- sentyment: pozytywny, neutralny albo negatywny,
- priorytet: niski, średni albo wysoki,
- najważniejszy problem lub pochwałę,
- krótką sugestię odpowiedzi dla klienta,
- jedno konkretne zalecenie dla zespołu.`;
    case "alert":
      return `Przeanalizuj alert techniczny. W odpowiedzi podaj:
- severity: low, medium albo high,
- co prawdopodobnie oznacza alert,
- rekomendowane działanie krok po kroku,
- czy i kiedy eskalować problem.`;
    case "order":
      return `Przeanalizuj zamówienie. W odpowiedzi podaj:
- krótkie potwierdzenie zamówienia,
- produkt, klienta i kwotę,
- najważniejsze informacje do dalszej obsługi,
- rekomendowane następne działanie.`;
  }
}

function getSystemPrompt(type: WebhookType) {
  return `Jesteś agentem reagującym na zdarzenia z webhooków. Pisz po polsku, konkretnie i bez wymyślania danych.

${getAnalysisInstructions(type)}

Zwróć krótką analizę w czytelnym Markdownie. Opieraj się wyłącznie na danych zdarzenia.`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nieznany błąd.";
}

export function GET() {
  return Response.json({
    endpoint: "/api/webhook",
    method: "POST",
    message: "Webhook działa. Wyślij żądanie POST z polami type i data.",
    supportedTypes: supportedTypes,
    example: {
      type: "feedback",
      data: {
        customer: "Jan",
        rating: 2,
        comment: "Długi czas oczekiwania na odpowiedź",
      },
    },
  });
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return Response.json(
      { error: "Brak konfiguracji Supabase. Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as { type?: unknown; data?: unknown };

    if (!isWebhookType(body.type)) {
      return Response.json(
        { error: "Nieobsługiwany typ zdarzenia. Użyj: feedback, alert albo order." },
        { status: 400 },
      );
    }

    if (body.data === undefined) {
      return Response.json({ error: "Pole data jest wymagane." }, { status: 400 });
    }

    const serializedData = JSON.stringify(body.data);
    if (serializedData.length > maxDataLength) {
      return Response.json(
        { error: `Dane webhooka są za duże. Maksymalny rozmiar to ${maxDataLength} znaków.` },
        { status: 413 },
      );
    }

    const result = await generateText({
      model: google(model),
      system: getSystemPrompt(body.type),
      prompt: `Typ zdarzenia: ${body.type}\nDane zdarzenia:\n${serializedData}`,
      maxRetries: 0,
    });
    const analysis = result.text.trim();

    if (!analysis) {
      throw new Error("Agent zwrócił pustą analizę.");
    }

    const { data: event, error: insertError } = await supabaseAdmin
      .from("webhook_events")
      .insert({
        type: body.type,
        data: body.data,
        analysis,
      })
      .select("id")
      .single();

    if (insertError || !event) {
      throw new Error(
        `Nie udało się zapisać webhooka w Supabase: ${insertError?.message ?? "brak identyfikatora zdarzenia"}. Uruchom supabase/webhook_events.sql.`,
      );
    }

    return Response.json({
      success: true,
      analysis,
      event_id: event.id,
    });
  } catch (error) {
    console.error("Webhook API error:", error);
    return Response.json(
      { error: getErrorMessage(error) || "Nie udało się obsłużyć webhooka." },
      { status: 500 },
    );
  }
}
