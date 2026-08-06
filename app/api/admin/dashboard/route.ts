import { getAuthenticatedRequest } from "../../../../lib/supabase-request";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

const INPUT_COST_PER_MILLION = 0.15;

type UsageRow = {
  user_id: string;
  created_at: string;
  tokens_input: number;
  tokens_output: number;
  endpoint: string;
};

type ConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function isAdminEmail(email: string | undefined) {
  const configured = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.length === 0 || Boolean(email && configured.includes(email.toLowerCase()));
}

function normalizeEndpoint(endpoint: string) {
  const value = endpoint.trim().toLowerCase();
  if (!value) return "/inne";
  return value.startsWith("/") ? value : `/${value}`;
}

async function resolveEmails(userIds: string[]) {
  const emails = new Map<string, string>();

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const result = await supabaseAdmin?.auth.admin.getUserById(userId);
        emails.set(userId, result?.data.user?.email ?? userId);
      } catch {
        emails.set(userId, userId);
      }
    }),
  );

  return emails;
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedRequest(request);

    if (!isAdminEmail(auth.user.email)) {
      return Response.json({ error: "Brak uprawnień administratora." }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return Response.json({ error: "Brak konfiguracji klucza administracyjnego Supabase." }, { status: 503 });
    }

    const today = startOfUtcDay();
    const firstDay = new Date(today);
    firstDay.setUTCDate(firstDay.getUTCDate() - 6);

    const [recentConversationsResult, conversationUsersResult, conversationCountResult, usageResult] = await Promise.all([
      supabaseAdmin
        .from("conversations")
        .select("id, user_id, title, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("conversations")
        .select("user_id")
        .not("user_id", "is", null)
        .limit(50_000),
      supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("api_usage")
        .select("user_id, created_at, tokens_input, tokens_output, endpoint")
        .gte("created_at", firstDay.toISOString())
        .order("created_at", { ascending: true })
        .limit(50_000),
    ]);

    const firstError = recentConversationsResult.error ?? conversationUsersResult.error ?? conversationCountResult.error ?? usageResult.error;
    if (firstError) throw firstError;

    const recentConversations = (recentConversationsResult.data ?? []) as ConversationRow[];
    const usageRows = (usageResult.data ?? []) as UsageRow[];
    const userIds = new Set(
      (conversationUsersResult.data ?? [])
        .map((row) => row.user_id as string | null)
        .filter((value): value is string => Boolean(value)),
    );

    const messageCounts = new Map<string, number>();
    if (recentConversations.length) {
      const messagesResult = await supabaseAdmin
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", recentConversations.map((conversation) => conversation.id))
        .limit(50_000);
      if (messagesResult.error) throw messagesResult.error;
      for (const row of messagesResult.data ?? []) {
        const conversationId = row.conversation_id as string;
        messageCounts.set(conversationId, (messageCounts.get(conversationId) ?? 0) + 1);
      }
    }

    const emails = await resolveEmails(recentConversations.map((conversation) => conversation.user_id));
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(firstDay);
      date.setUTCDate(firstDay.getUTCDate() + index);
      return {
        key: dayKey(date),
        label: new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "short", timeZone: "Europe/Warsaw" }).format(date),
        tokens: 0,
        conversations: 0,
      };
    });
    const dayMap = new Map(days.map((day) => [day.key, day]));
    let tokensToday = 0;
    let inputTokensToday = 0;
    const endpointMap = new Map<string, number>();

    for (const row of usageRows) {
      const tokens = (Number(row.tokens_input) || 0) + (Number(row.tokens_output) || 0);
      dayMap.get(dayKey(row.created_at))!.tokens += tokens;
      if (new Date(row.created_at) >= today) {
        tokensToday += tokens;
        inputTokensToday += Number(row.tokens_input) || 0;
      }
      const endpoint = normalizeEndpoint(row.endpoint);
      endpointMap.set(endpoint, (endpointMap.get(endpoint) ?? 0) + tokens);
    }

    const trendConversationsResult = await supabaseAdmin
      .from("conversations")
      .select("created_at")
      .gte("created_at", firstDay.toISOString())
      .limit(50_000);
    if (trendConversationsResult.error) throw trendConversationsResult.error;
    for (const row of trendConversationsResult.data ?? []) {
      const day = dayMap.get(dayKey(row.created_at as string));
      if (day) day.conversations += 1;
    }

    return Response.json({
      generatedAt: new Date().toISOString(),
      stats: {
        users: userIds.size,
        conversations: conversationCountResult.count ?? 0,
        tokensToday,
        estimatedCostToday: (inputTokensToday * INPUT_COST_PER_MILLION) / 1_000_000,
      },
      tokenTrend: days.map(({ key, label, tokens }) => ({ date: key, label, tokens })),
      conversationTrend: days.map(({ key, label, conversations }) => ({ date: key, label, conversations })),
      endpointData: Array.from(endpointMap.entries()).sort(([, left], [, right]) => right - left).map(([endpoint, tokens]) => ({ endpoint, tokens })),
      recentConversations: recentConversations.map((conversation) => ({
        id: conversation.id,
        email: emails.get(conversation.user_id) ?? conversation.user_id,
        title: conversation.title || "Nowa rozmowa",
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        messages: messageCounts.get(conversation.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error("Admin usage dashboard error:", error);
    return Response.json({ error: "Nie udało się wczytać dashboardu użycia." }, { status: 500 });
  }
}
