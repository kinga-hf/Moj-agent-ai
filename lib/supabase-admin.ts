import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

export const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          persistSession: false,
        },
      })
    : null;

export function getSupabaseAdminMissingMessage() {
  return (
    "Tabela documents ma wlaczone RLS, wiec zapis z publicznego klucza jest blokowany. " +
    "Dodaj do .env.local prywatny klucz SUPABASE_SERVICE_ROLE_KEY albo w Supabase wylacz RLS dla tabeli documents."
  );
}
