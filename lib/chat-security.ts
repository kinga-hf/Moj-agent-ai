import { supabaseAdmin } from "./supabase-admin";

export const MAX_MESSAGE_LENGTH = 2000;
export const MESSAGE_RATE_LIMIT = 50;
export const MESSAGE_RATE_WINDOW_MS = 60 * 60 * 1000;

export const BLOCKED_MESSAGE =
  "Ta wiadomość została zablokowana z powodów bezpieczeństwa.";
export const BLOCKED_OUTPUT =
  "Przepraszam, nie mogę udostępnić tych informacji.";

const blockedInputPhrases = [
  "ignore previous",
  "system prompt",
  "ignore instructions",
  "reveal",
  "show me your",
  "translate your prompt",
];

const sensitiveOutputPatterns = [
  /system\s*prompt/i,
  /(?:api|application)[_\s-]*key/i,
  /(?:supabase|google|gemini)[_\s-]*(?:url|key|service[_\s-]*role|anon[_\s-]*key)/i,
  /\b(?:NEXT_PUBLIC_[A-Z0-9_]+|SUPABASE_[A-Z0-9_]+|GEMINI_[A-Z0-9_]+)\b/i,
  /\b(?:user_profiles|message_logs|auth\.users|service_role)\b/i,
  /\bprocess\.env\.[A-Z0-9_]+\b/i,
];

function removeUnsafeCharacters(value: string) {
  return value.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g,
    "",
  );
}

function normalizeForSecurity(value: string) {
  return removeUnsafeCharacters(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeUserInput(value: string) {
  return removeUnsafeCharacters(value).normalize("NFKC");
}

export function validateUserInput(value: string) {
  const sanitized = sanitizeUserInput(value);
  const normalized = normalizeForSecurity(sanitized);

  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    return { ok: false as const, value: sanitized, reason: "length" as const };
  }

  if (blockedInputPhrases.some((phrase) => normalized.includes(phrase))) {
    return { ok: false as const, value: sanitized, reason: "blacklist" as const };
  }

  return { ok: true as const, value: sanitized };
}

function containsSensitiveOutput(value: string, systemPromptFragments: string[]) {
  if (sensitiveOutputPatterns.some((pattern) => pattern.test(value))) {
    return true;
  }

  const normalizedOutput = normalizeForSecurity(value);
  return systemPromptFragments.some((fragment) => {
    const normalizedFragment = normalizeForSecurity(fragment);
    return normalizedFragment.length >= 32 && normalizedOutput.includes(normalizedFragment);
  });
}

export function filterSensitiveOutput(value: string, systemPromptFragments: string[] = []) {
  return containsSensitiveOutput(value, systemPromptFragments) ? BLOCKED_OUTPUT : value;
}

function getRequestIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return `ip:${forwardedFor || realIp || "unknown"}`;
}

const memoryRateLimit = new Map<string, number[]>();

function consumeMemoryRateLimit(identifier: string, now: number) {
  const cutoff = now - MESSAGE_RATE_WINDOW_MS;
  const timestamps = (memoryRateLimit.get(identifier) ?? []).filter(
    (timestamp) => timestamp > cutoff,
  );

  if (timestamps.length >= MESSAGE_RATE_LIMIT) {
    const retryAfterMinutes = Math.max(
      1,
      Math.ceil((timestamps[0] + MESSAGE_RATE_WINDOW_MS - now) / 60_000),
    );
    memoryRateLimit.set(identifier, timestamps);
    return {
      allowed: false as const,
      retryAfterMinutes,
    };
  }

  timestamps.push(now);
  memoryRateLimit.set(identifier, timestamps);
  return { allowed: true as const };
}

export async function consumeMessageRateLimit({
  request,
  userId,
  messageLength,
}: {
  request: Request;
  userId: string | null;
  messageLength: number;
}) {
  const now = Date.now();

  if (userId && supabaseAdmin) {
    const cutoff = new Date(now - MESSAGE_RATE_WINDOW_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from("message_logs")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(MESSAGE_RATE_LIMIT);

    if (!error && data) {
      if (data.length >= MESSAGE_RATE_LIMIT) {
        const oldestTimestamp = new Date(data[0].created_at).getTime();
        return {
          allowed: false as const,
          retryAfterMinutes: Math.max(
            1,
            Math.ceil((oldestTimestamp + MESSAGE_RATE_WINDOW_MS - now) / 60_000),
          ),
        };
      }

      const { error: insertError } = await supabaseAdmin.from("message_logs").insert({
        user_id: userId,
        message_length: messageLength,
      });

      if (!insertError) {
        return { allowed: true as const };
      }

      console.warn("Nie udało się zapisać logu wiadomości, używam limitu pamięci.", insertError);
    } else if (error) {
      console.warn("Nie udało się odczytać logów wiadomości, używam limitu pamięci.", error);
    }
  }

  return consumeMemoryRateLimit(
    userId ? `user:${userId}` : getRequestIdentifier(request),
    now,
  );
}

export async function recordBlockedMessage({
  userId,
  message,
  reason,
}: {
  userId: string | null;
  message: string;
  reason: string;
}) {
  if (!userId || !supabaseAdmin) {
    return;
  }

  const { error } = await supabaseAdmin.from("message_logs").insert({
    user_id: userId,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    message_length: Math.min(message.length, MAX_MESSAGE_LENGTH),
    blocked: true,
    block_reason: reason,
  });

  if (error) {
    console.warn("Nie udało się zapisać zablokowanej wiadomości.", error);
  }
}
