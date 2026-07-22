import { supabase } from "./supabase";

export type UserProfile = {
  id: string;
  name: string | null;
  preferences: Record<string, string>;
};

export async function ensureUserProfile(userId: string) {
  if (!supabase) {
    return null;
  }

  const { data: existingProfile, error: selectError } = await supabase
    .from("user_profiles")
    .select("id, name, preferences")
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existingProfile?.name) {
    return {
      id: existingProfile.id,
      name: existingProfile.name,
      preferences:
        (existingProfile.preferences as Record<string, string> | null) ?? {},
    } satisfies UserProfile;
  }

  if (existingProfile) {
    return {
      id: existingProfile.id,
      name: existingProfile.name,
      preferences:
        (existingProfile.preferences as Record<string, string> | null) ?? {},
    } satisfies UserProfile;
  }

  const { data: newProfile, error: insertError } = await supabase
    .from("user_profiles")
    .insert({ id: userId, preferences: {} })
    .select("id, name, preferences")
    .single();

  if (insertError) {
    throw insertError;
  }

  return {
    id: newProfile.id,
    name: newProfile.name,
    preferences: (newProfile.preferences as Record<string, string> | null) ?? {},
  } satisfies UserProfile;
}
