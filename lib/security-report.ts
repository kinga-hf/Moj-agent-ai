import { supabaseAdmin } from "./supabase-admin";

const REPORT_WINDOW_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type UsageRow = {
  user_id: string;
  created_at: string;
  tokens_input: number;
  tokens_output: number;
};

type MessageLogRow = {
  id: string;
  user_id: string;
  created_at: string;
  message: string | null;
  block_reason: string | null;
  blocked: boolean;
};

export type SecurityReportUser = {
  userId: string;
  email: string;
  tokensToday: number;
  tokensWeek: number;
  apiCalls: number;
  blockedMessages: number;
};

export type SecurityReportSnapshot = {
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  users: SecurityReportUser[];
  blockedMessages: Array<MessageLogRow & { email: string }>;
  totals: {
    users: number;
    tokensToday: number;
    tokensWeek: number;
    apiCalls: number;
    blockedMessages: number;
  };
};

function startOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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

export async function loadSecurityReportSnapshot(): Promise<SecurityReportSnapshot> {
  if (!supabaseAdmin) {
    throw new Error("Brak konfiguracji administracyjnego dostępu do Supabase.");
  }

  const now = new Date();
  const periodFrom = new Date(now.getTime() - REPORT_WINDOW_DAYS * DAY_IN_MS);
  const today = startOfUtcDay();

  const [usageResult, blockedResult, blockedCountResult] = await Promise.all([
    supabaseAdmin
      .from("api_usage")
      .select("user_id, created_at, tokens_input, tokens_output")
      .gte("created_at", periodFrom.toISOString())
      .order("created_at", { ascending: false })
      .limit(20_000),
    supabaseAdmin
      .from("message_logs")
      .select("id, user_id, created_at, message, block_reason, blocked")
      .eq("blocked", true)
      .gte("created_at", periodFrom.toISOString())
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("message_logs")
      .select("id", { count: "exact", head: true })
      .eq("blocked", true)
      .gte("created_at", periodFrom.toISOString()),
  ]);

  const firstError = usageResult.error ?? blockedResult.error ?? blockedCountResult.error;
  if (firstError) {
    throw firstError;
  }

  const authUsersResult = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (authUsersResult.error) {
    throw authUsersResult.error;
  }

  const usageRows = (usageResult.data ?? []) as UsageRow[];
  const blockedRows = (blockedResult.data ?? []) as MessageLogRow[];
  const usageByUser = new Map<string, { today: number; week: number; calls: number; blocked: number }>();

  for (const row of usageRows) {
    const current = usageByUser.get(row.user_id) ?? { today: 0, week: 0, calls: 0, blocked: 0 };
    const tokens = (Number(row.tokens_input) || 0) + (Number(row.tokens_output) || 0);
    current.week += tokens;
    current.calls += 1;
    if (new Date(row.created_at) >= today) {
      current.today += tokens;
    }
    usageByUser.set(row.user_id, current);
  }

  for (const row of blockedRows) {
    const current = usageByUser.get(row.user_id) ?? { today: 0, week: 0, calls: 0, blocked: 0 };
    current.blocked += 1;
    usageByUser.set(row.user_id, current);
  }

  const registeredUsers = authUsersResult.data.users ?? [];
  const allUserIds = new Set([
    ...registeredUsers.map((user) => user.id),
    ...usageByUser.keys(),
  ]);
  const emails = new Map(
    registeredUsers.map((user) => [user.id, user.email ?? user.id] as const),
  );
  const unresolvedUserIds = Array.from(allUserIds).filter((userId) => !emails.has(userId));
  const resolvedEmails = await resolveEmails(unresolvedUserIds);
  for (const [userId, email] of resolvedEmails) {
    emails.set(userId, email);
  }

  const users = Array.from(usageByUser.entries())
    .map(([userId, usage]) => ({
      userId,
      email: emails.get(userId) ?? userId,
      tokensToday: usage.today,
      tokensWeek: usage.week,
      apiCalls: usage.calls,
      blockedMessages: usage.blocked,
    }))
    .sort((left, right) => right.tokensWeek - left.tokensWeek);

  for (const userId of allUserIds) {
    if (!usageByUser.has(userId)) {
      users.push({
        userId,
        email: emails.get(userId) ?? userId,
        tokensToday: 0,
        tokensWeek: 0,
        apiCalls: 0,
        blockedMessages: 0,
      });
    }
  }

  const tokensToday = users.reduce((sum, user) => sum + user.tokensToday, 0);
  const tokensWeek = users.reduce((sum, user) => sum + user.tokensWeek, 0);
  const apiCalls = users.reduce((sum, user) => sum + user.apiCalls, 0);

  return {
    generatedAt: now.toISOString(),
    periodFrom: periodFrom.toISOString(),
    periodTo: now.toISOString(),
    users,
    blockedMessages: blockedRows.map((row) => ({
      ...row,
      email: emails.get(row.user_id) ?? row.user_id,
    })),
    totals: {
      users: users.length,
      tokensToday,
      tokensWeek,
      apiCalls,
      blockedMessages: blockedCountResult.count ?? blockedRows.length,
    },
  };
}
