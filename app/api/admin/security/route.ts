import { getAuthenticatedRequest } from "../../../../lib/supabase-request";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { DAILY_TOKEN_LIMIT } from "../../../../lib/api-usage";

type UsageRow = {
  user_id: string;
  created_at: string;
  tokens_input: number;
  tokens_output: number;
  model: string;
  endpoint: string;
};

type MessageLogRow = {
  id: string;
  user_id: string;
  created_at: string;
  message: string | null;
  block_reason: string | null;
  blocked: boolean;
};

function startOfUtcDay() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function startOfUtcWeek() {
  const day = startOfUtcDay();
  const dayOfWeek = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() - dayOfWeek + 1);
  return day;
}

function isAdminEmail(email: string | undefined) {
  const configured = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.length === 0 || Boolean(email && configured.includes(email.toLowerCase()));
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
      return Response.json(
        { error: "Brak konfiguracji klucza administracyjnego Supabase." },
        { status: 503 },
      );
    }

    const today = startOfUtcDay();
    const week = startOfUtcWeek();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const [usageResult, blockedResult, recentMessagesResult, blockedCountResult] =
      await Promise.all([
        supabaseAdmin
          .from("api_usage")
          .select("user_id, created_at, tokens_input, tokens_output, model, endpoint")
          .gte("created_at", week.toISOString())
          .order("created_at", { ascending: false })
          .limit(10_000),
        supabaseAdmin
          .from("message_logs")
          .select("id, user_id, created_at, message, block_reason, blocked")
          .eq("blocked", true)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("message_logs")
          .select("user_id, created_at")
          .gte("created_at", tenMinutesAgo.toISOString())
          .eq("blocked", false)
          .limit(10_000),
        supabaseAdmin
          .from("message_logs")
          .select("id", { count: "exact", head: true })
          .eq("blocked", true)
          .gte("created_at", week.toISOString()),
      ]);

    const firstError =
      usageResult.error ??
      blockedResult.error ??
      recentMessagesResult.error ??
      blockedCountResult.error;

    if (firstError) {
      throw firstError;
    }

    const usageRows = (usageResult.data ?? []) as UsageRow[];
    const blockedRows = (blockedResult.data ?? []) as MessageLogRow[];
    const recentMessages = (recentMessagesResult.data ?? []) as Array<{
      user_id: string;
      created_at: string;
    }>;

    const usageByUser = new Map<
      string,
      { today: number; week: number; messages: number }
    >();

    for (const row of usageRows) {
      const current = usageByUser.get(row.user_id) ?? { today: 0, week: 0, messages: 0 };
      const tokens = (Number(row.tokens_input) || 0) + (Number(row.tokens_output) || 0);
      current.week += tokens;
      if (new Date(row.created_at) >= today) {
        current.today += tokens;
      }
      usageByUser.set(row.user_id, current);
    }

    for (const row of recentMessages) {
      const current = usageByUser.get(row.user_id) ?? { today: 0, week: 0, messages: 0 };
      current.messages += 1;
      usageByUser.set(row.user_id, current);
    }

    const sortedUsers = Array.from(usageByUser.entries())
      .sort(([, left], [, right]) => right.today - left.today)
      .slice(0, 5);
    const allUserIds = Array.from(
      new Set([
        ...Array.from(usageByUser.keys()),
        ...blockedRows.map((row) => row.user_id),
      ]),
    );
    const emails = await resolveEmails(allUserIds);

    const topUsers = sortedUsers.map(([userId, usage]) => ({
      userId,
      email: emails.get(userId) ?? userId,
      tokensToday: usage.today,
      tokensWeek: usage.week,
      percentOfDailyLimit: Math.round((usage.today / DAILY_TOKEN_LIMIT) * 100),
    }));

    const alerts = topUsers
      .filter((user) => user.tokensToday >= DAILY_TOKEN_LIMIT * 0.8)
      .map((user) => ({
        level: "warning",
        type: "budget",
        message: `${user.email} wykorzystuje ${user.percentOfDailyLimit}% dziennego limitu tokenów.`,
      }));

    for (const [userId, usage] of usageByUser.entries()) {
      if (usage.messages > 20) {
        alerts.push({
          level: "critical",
          type: "burst",
          message: `${emails.get(userId) ?? userId} wysłał(a) ${usage.messages} wiadomości w 10 minut.`,
        });
      }
    }

    for (const row of blockedRows.slice(0, 10)) {
      alerts.push({
        level: "critical",
        type: "blocked",
        message: `Zablokowano wiadomość użytkownika ${emails.get(row.user_id) ?? row.user_id}.`,
      });
    }

    const tokensToday = usageRows
      .filter((row) => new Date(row.created_at) >= today)
      .reduce((sum, row) => sum + (Number(row.tokens_input) || 0) + (Number(row.tokens_output) || 0), 0);
    const tokensWeek = usageRows.reduce(
      (sum, row) => sum + (Number(row.tokens_input) || 0) + (Number(row.tokens_output) || 0),
      0,
    );
    const usersToday = new Set(
      usageRows.filter((row) => new Date(row.created_at) >= today).map((row) => row.user_id),
    ).size;

    return Response.json({
      generatedAt: new Date().toISOString(),
      blockedMessages: blockedRows.map((row) => ({
        ...row,
        email: emails.get(row.user_id) ?? row.user_id,
      })),
      topUsers,
      alerts: alerts.slice(0, 30),
      stats: {
        tokensToday,
        tokensWeek,
        blockedMessages: blockedCountResult.count ?? blockedRows.length,
        averageTokensPerUser: usersToday ? Math.round(tokensToday / usersToday) : 0,
      },
    });
  } catch (error) {
    console.error("Security dashboard API error:", error);
    return Response.json(
      { error: "Nie udało się wczytać panelu bezpieczeństwa." },
      { status: 500 },
    );
  }
}

