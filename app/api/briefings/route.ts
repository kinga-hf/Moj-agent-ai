import { getAuthenticatedRequest } from "../../../lib/supabase-request";
import { supabaseAdmin } from "../../../lib/supabase-admin";

function isAuthError(message: string) {
  return message.includes("zalogowana") || message.includes("Sesja wygasla");
}

export async function GET(request: Request) {
  try {
    await getAuthenticatedRequest(request);

    if (!supabaseAdmin) {
      return Response.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from("briefings")
      .select("id, created_at, content, date")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ briefings: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się pobrać briefingów.";
    return Response.json({ error: message }, { status: isAuthError(message) ? 401 : 500 });
  }
}
