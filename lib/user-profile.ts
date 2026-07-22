import { supabase } from "./supabase";

export type UserProfile = {
  id: string;
  display_name: string | null;
  preferences: Record<string, string>;
};

export async function ensureUserProfile(userId: string) {
  if (!supabase) {
    return null;
  }

  const { data: existingProfile, error: selectError } = await supabase
    .from("user_profiles")
    .select("id, display_name, preferences")
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existingProfile) {
    return {
      id: existingProfile.id,
      display_name: existingProfile.display_name,
      preferences:
        (existingProfile.preferences as Record<string, string> | null) ?? {},
    } satisfies UserProfile;
  }

  const { data: newProfile, error: insertError } = await supabase
    .from("user_profiles")
    .insert({ id: userId, display_name: null, preferences: {} })
    .select("id, display_name, preferences")
    .single();

  if (insertError) {
    throw insertError;
  }

  return {
    id: newProfile.id,
    display_name: newProfile.display_name,
    preferences: (newProfile.preferences as Record<string, string> | null) ?? {},
  } satisfies UserProfile;
}
