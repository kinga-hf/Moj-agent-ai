import { getAuthenticatedRequest } from "../../../../lib/supabase-request";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await getAuthenticatedRequest(request);
    const { id } = await context.params;

    if (!supabaseAdmin) {
      return Response.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from("briefings")
      .select("id, created_at, content, date")
      .eq("id", id)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Nie znaleziono tego briefingu." }, { status: 404 });

    return Response.json({ briefing: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się pobrać briefingu.";
    const status = message.includes("zalogowana") || message.includes("Sesja wygasla") ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
