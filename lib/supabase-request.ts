import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

export type AuthenticatedRequest = {
  user: User;
  database: SupabaseClient;
};

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function getAuthenticatedRequest(req: Request): Promise<AuthenticatedRequest> {
  const token = getBearerToken(req);

  if (!supabaseUrl || !supabaseAnonKey || !token) {
    throw new Error("Musisz byc zalogowana.");
  }

  const database = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data, error } = await database.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Sesja wygasla. Zaloguj sie ponownie.");
  }

  return { user: data.user, database };
}
