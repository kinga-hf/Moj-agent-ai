import { supabaseAdmin } from "./supabase-admin";

export const DAILY_TOKEN_LIMIT = 10_000;
export const DAILY_TOKEN_LIMIT_MESSAGE =
  "Dzienny limit tokenów (10k) został wyczerpany. Wróć jutro!";

type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

type UsageRecord = {
  userId: string | null;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  endpoint: string;
};

export class DailyTokenLimitError extends Error {
  constructor() {
    super(DAILY_TOKEN_LIMIT_MESSAGE);
    this.name = "DailyTokenLimitError";
  }
}

function startOfUtcDay() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

const fallbackDailyUsage = new Map<string, { day: string; tokens: number }>();

function getFallbackUsage(userId: string) {
  const day = startOfUtcDay();
  const current = fallbackDailyUsage.get(userId);

  if (!current || current.day !== day) {
    const next = { day, tokens: 0 };
    fallbackDailyUsage.set(userId, next);
    return next;
  }

  return current;
}

async function getStoredDailyUsage(userId: string) {
  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("api_usage")
    .select("tokens_input, tokens_output")
    .eq("user_id", userId)
    .gte("created_at", startOfUtcDay());

  if (error) {
    console.warn("Nie udało się odczytać dziennego zużycia tokenów.", error);
    return null;
  }

  return (data ?? []).reduce(
    (total, row) =>
      total +
      (Number(row.tokens_input) || 0) +
      (Number(row.tokens_output) || 0),
    0,
  );
}

export async function assertDailyTokenBudget(userId: string | null) {
  if (!userId) {
    return;
  }

  const storedUsage = await getStoredDailyUsage(userId);

  if (storedUsage !== null) {
    if (storedUsage >= DAILY_TOKEN_LIMIT) {
      throw new DailyTokenLimitError();
    }

    return;
  }

  if (getFallbackUsage(userId).tokens >= DAILY_TOKEN_LIMIT) {
    throw new DailyTokenLimitError();
  }
}

export async function recordApiUsage({
  userId,
  tokensInput,
  tokensOutput,
  model,
  endpoint,
}: UsageRecord) {
  if (!userId) {
    return;
  }

  const safeInput = Math.max(0, Math.round(tokensInput));
  const safeOutput = Math.max(0, Math.round(tokensOutput));
  const totalTokens = safeInput + safeOutput;

  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from("api_usage").insert({
      user_id: userId,
      tokens_input: safeInput,
      tokens_output: safeOutput,
      model,
      endpoint,
    });

    if (!error) {
      return;
    }

    console.warn("Nie udało się zapisać zużycia tokenów, używam pamięci.", error);
  }

  const fallback = getFallbackUsage(userId);
  fallback.tokens += totalTokens;
}

export async function recordLanguageModelUsage({
  userId,
  usage,
  model,
  endpoint,
}: {
  userId: string | null;
  usage: TokenUsage | undefined;
  model: string;
  endpoint: string;
}) {
  await recordApiUsage({
    userId,
    tokensInput: usage?.inputTokens ?? 0,
    tokensOutput: usage?.outputTokens ?? 0,
    model,
    endpoint,
  });
}

