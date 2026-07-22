import { supabase } from "./supabase";

export const USER_ID_STORAGE_KEY = "user_id";

export type UserProfile = {
  id: string;
  name: string | null;
  preferences: Record<string, string>;
};

type SupabaseUserProfile = {
  id: string;
  name: string | null;
  preferences: Record<string, string> | null;
};

export function getOrCreateUserId() {
  if (typeof window === "undefined") {
    return null;
  }

  const existingId = window.localStorage.getItem(USER_ID_STORAGE_KEY);
  if (existingId) {
    return existingId;
  }

  const newId = crypto.randomUUID();
  window.localStorage.setItem(USER_ID_STORAGE_KEY, newId);
  return newId;
}

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

  const recoveredProfile = await findRememberedProfile();

  if (recoveredProfile) {
    window.localStorage.setItem(USER_ID_STORAGE_KEY, recoveredProfile.id);

    return {
      id: recoveredProfile.id,
      name: recoveredProfile.name,
      preferences: recoveredProfile.preferences ?? {},
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

async function findRememberedProfile() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, name, preferences")
    .not("name", "is", null)
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SupabaseUserProfile | null;
}
