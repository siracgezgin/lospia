import type { createClient } from "@/lib/supabase/server";

type SB = Awaited<ReturnType<typeof createClient>>;

// First instant of the current month, ISO — the window for "Bu ay" figures.
export function startOfMonthISO(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// ---------------------------------------------------------------------------
// Member summary — what a single user may see about THEMSELVES only.
//   monthPoints  : net points in the ledger this month (earned − revoked)
//   pending      : points of review-stage tasks they are responsible for
//   doneCount    : their responsible tasks currently in "done"
//   reviewCount  : their responsible tasks currently in "review"
// Pending is computed, never written to the ledger.
// ---------------------------------------------------------------------------
export interface MemberPointsSummary {
  monthPoints: number;
  pending: number;
  doneCount: number;
  reviewCount: number;
}

export async function getMemberPointsSummary(
  sb: SB,
  workspaceId: string,
  userId: string,
): Promise<MemberPointsSummary> {
  const monthStart = startOfMonthISO();

  // The user's membership row id (needed to find their participations).
  const { data: member } = await sb
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  const [ledgerRes, compsRes] = await Promise.all([
    sb.from("points_ledger")
      .select("points_amount")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .gte("created_at", monthStart),
    member?.id
      ? sb.from("task_member_completions").select("task_id").eq("member_id", member.id)
      : Promise.resolve({ data: [] as { task_id: string }[] }),
  ]);

  const monthPoints = (ledgerRes.data ?? []).reduce(
    (sum, r) => sum + (r.points_amount as number), 0,
  );

  const taskIds = ((compsRes.data ?? []) as { task_id: string }[]).map((c) => c.task_id);
  let pending = 0, doneCount = 0, reviewCount = 0;
  if (taskIds.length > 0) {
    const { data: tasks } = await sb
      .from("tasks")
      .select("status, points_value")
      .in("id", taskIds);
    for (const t of (tasks ?? []) as { status: string; points_value: number }[]) {
      if (t.status === "review") { pending += t.points_value; reviewCount += 1; }
      else if (t.status === "done") { doneCount += 1; }
    }
  }

  return { monthPoints, pending, doneCount, reviewCount };
}

// ---------------------------------------------------------------------------
// Admin summary — full workspace visibility (owner/admin only).
// ---------------------------------------------------------------------------
export interface AdminContributor {
  userId: string;
  name: string;
  earned: number;   // net ledger points this month
  pending: number;  // review-stage points awaiting approval
}

export interface AdminPointsData {
  monthEarned: number;
  pendingTotal: number;
  revokedCount: number;
  contributors: AdminContributor[];
  byDepartment: { name: string; color: string | null; points: number }[];
  ledger: {
    id: string;
    userName: string;
    taskTitle: string | null;
    amount: number;
    type: string;
    createdAt: string;
  }[];
}

export async function getAdminPointsData(
  sb: SB,
  workspaceId: string,
): Promise<AdminPointsData> {
  const monthStart = startOfMonthISO();

  const [ledgerRes, reviewRes, profilesRes, deptsRes, membersRes] = await Promise.all([
    sb.from("points_ledger")
      .select("id, user_id, points_amount, transaction_type, task_id, created_at, tasks(title, department_id)")
      .eq("workspace_id", workspaceId)
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false }),
    sb.from("tasks")
      .select("id, points_value")
      .eq("workspace_id", workspaceId)
      .eq("status", "review"),
    sb.from("profiles").select("id, full_name, email"),
    sb.from("workspace_departments")
      .select("id, name, color_key")
      .eq("workspace_id", workspaceId),
    sb.from("workspace_members").select("id, user_id").eq("workspace_id", workspaceId),
  ]);

  type LedgerRow = {
    id: string; user_id: string; points_amount: number; transaction_type: string;
    task_id: string | null; created_at: string;
    tasks: { title: string | null; department_id: string | null }
      | { title: string | null; department_id: string | null }[] | null;
  };
  const ledgerRows = (ledgerRes.data ?? []) as unknown as LedgerRow[];
  const reviewTasks = (reviewRes.data ?? []) as { id: string; points_value: number }[];
  const profiles = (profilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[];
  const depts = (deptsRes.data ?? []) as { id: string; name: string; color_key: string | null }[];
  const members = (membersRes.data ?? []) as { id: string; user_id: string }[];

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name ?? p?.email ?? "—";
  };
  const taskOf = (r: LedgerRow) => (Array.isArray(r.tasks) ? r.tasks[0] : r.tasks) ?? null;

  // KPIs
  let monthEarned = 0, revokedCount = 0;
  const earnedByUser = new Map<string, number>();   // net per user
  const earnedByDept = new Map<string | null, number>();
  for (const r of ledgerRows) {
    if (r.transaction_type === "earned") monthEarned += r.points_amount;
    if (r.transaction_type === "revoked") revokedCount += 1;
    earnedByUser.set(r.user_id, (earnedByUser.get(r.user_id) ?? 0) + r.points_amount);
    if (r.transaction_type === "earned") {
      const deptId = taskOf(r)?.department_id ?? null;
      earnedByDept.set(deptId, (earnedByDept.get(deptId) ?? 0) + r.points_amount);
    }
  }

  // Pending — points of review tasks per responsible participant.
  const reviewTaskMap = new Map(reviewTasks.map((t) => [t.id, t.points_value]));
  const memberToUser = new Map(members.map((m) => [m.id, m.user_id]));
  const pendingByUser = new Map<string, number>();
  let pendingTotal = 0;
  if (reviewTasks.length > 0) {
    const { data: comps } = await sb
      .from("task_member_completions")
      .select("task_id, member_id")
      .in("task_id", reviewTasks.map((t) => t.id));
    for (const c of (comps ?? []) as { task_id: string; member_id: string }[]) {
      const pts = reviewTaskMap.get(c.task_id) ?? 0;
      const uid = memberToUser.get(c.member_id);
      if (!uid) continue;
      pendingTotal += pts;
      pendingByUser.set(uid, (pendingByUser.get(uid) ?? 0) + pts);
    }
  }

  // Contributors = union of users with earned-this-month or pending.
  const userIds = new Set<string>([...earnedByUser.keys(), ...pendingByUser.keys()]);
  const contributors: AdminContributor[] = [...userIds]
    .map((uid) => ({
      userId: uid,
      name: nameOf(uid),
      earned: earnedByUser.get(uid) ?? 0,
      pending: pendingByUser.get(uid) ?? 0,
    }))
    .sort((a, b) => b.earned - a.earned || b.pending - a.pending);

  // By department
  const deptName = (id: string | null) => (id ? depts.find((d) => d.id === id)?.name ?? "Departmansız" : "Departmansız");
  const deptColor = (id: string | null) => (id ? depts.find((d) => d.id === id)?.color_key ?? null : null);
  const byDepartment = [...earnedByDept.entries()]
    .filter(([, pts]) => pts > 0)
    .map(([id, points]) => ({ name: deptName(id), color: deptColor(id), points }))
    .sort((a, b) => b.points - a.points);

  const ledger = ledgerRows.slice(0, 30).map((r) => ({
    id: r.id,
    userName: nameOf(r.user_id),
    taskTitle: taskOf(r)?.title ?? null,
    amount: r.points_amount,
    type: r.transaction_type,
    createdAt: r.created_at,
  }));

  return { monthEarned, pendingTotal, revokedCount, contributors, byDepartment, ledger };
}
