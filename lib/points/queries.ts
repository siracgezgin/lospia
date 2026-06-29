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

  // Responsible tasks = the user's participations ∪ tasks assigned to them
  // (legacy assignee fallback), so the summary matches the "Bana atananlar"
  // board filter and the canonical points ownership rule.
  const participantIds = ((compsRes.data ?? []) as { task_id: string }[]).map((c) => c.task_id);
  const orFilter = participantIds.length > 0
    ? `assignee_id.eq.${userId},id.in.(${participantIds.join(",")})`
    : `assignee_id.eq.${userId}`;
  const { data: tasks } = await sb
    .from("tasks")
    .select("status, points_value")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .or(orFilter);

  let pending = 0, doneCount = 0, reviewCount = 0;
  for (const t of (tasks ?? []) as { status: string; points_value: number }[]) {
    if (t.status === "review") { pending += t.points_value; reviewCount += 1; }
    else if (t.status === "done") { doneCount += 1; }
  }

  return { monthPoints, pending, doneCount, reviewCount };
}

// ---------------------------------------------------------------------------
// Member dashboard — strictly the user's OWN work. A member never receives
// workspace-wide task counts, other people's points, or department rollups.
// "Responsible" = the user is the assignee OR a participant of the task.
// All filtering happens server-side so global data never crosses to the client.
// ---------------------------------------------------------------------------
export interface MemberDashboardTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string;
}

export interface MemberDashboardData {
  active: number;       // responsible, not done/archived
  overdue: number;      // responsible, due_date < today, not done/archived
  dueThisWeek: number;  // responsible, due_date today…end-of-week, not done/archived
  review: number;       // responsible, status = review
  done: number;         // responsible, status = done
  dueSoon: MemberDashboardTask[]; // responsible risk list (overdue + upcoming)
}

// End of the current week (Sunday) as YYYY-MM-DD.
function endOfWeekISO(now = new Date()): string {
  const d = new Date(now);
  const dow = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + (dow === 0 ? 0 : 7 - dow));
  return d.toISOString().slice(0, 10);
}

export async function getMemberDashboardData(
  sb: SB,
  workspaceId: string,
  userId: string,
): Promise<MemberDashboardData> {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = endOfWeekISO();

  // The user's responsible task ids = tasks assigned to them ∪ tasks they
  // participate in (task_member_completions resolved via their membership row).
  const { data: member } = await sb
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: comps } = member?.id
    ? await sb.from("task_member_completions").select("task_id").eq("member_id", member.id)
    : { data: [] as { task_id: string }[] };
  const participantIds = new Set(((comps ?? []) as { task_id: string }[]).map((c) => c.task_id));

  // Pull just the responsible tasks (assignee OR participant), only the columns
  // we aggregate. `.or` with an `in (...)` list keeps this to one round-trip.
  const idList = [...participantIds];
  const orFilter = idList.length > 0
    ? `assignee_id.eq.${userId},id.in.(${idList.join(",")})`
    : `assignee_id.eq.${userId}`;

  const { data: rows } = await sb
    .from("tasks")
    .select("id, title, status, priority, due_date")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .or(orFilter);

  const tasks = (rows ?? []) as MemberDashboardTask[];

  let active = 0, overdue = 0, dueThisWeek = 0, review = 0, done = 0;
  const dueSoon: MemberDashboardTask[] = [];
  for (const t of tasks) {
    if (t.status === "done") { done += 1; continue; }
    // everything below is non-done, non-archived → "active"
    active += 1;
    if (t.status === "review") review += 1;
    if (t.due_date) {
      if (t.due_date < today) { overdue += 1; dueSoon.push(t); }
      else if (t.due_date <= weekEnd) { dueThisWeek += 1; dueSoon.push(t); }
      else if (t.due_date <= addDaysISO(today, 14)) { dueSoon.push(t); }
    }
  }
  dueSoon.sort((a, b) => a.due_date.localeCompare(b.due_date));

  return { active, overdue, dueThisWeek, review, done, dueSoon };
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

  // Pending — points of review tasks per responsible person (participants, with
  // a legacy assignee fallback for review tasks that have no participant rows).
  const reviewTaskMap = new Map(reviewTasks.map((t) => [t.id, t.points_value]));
  const memberToUser = new Map(members.map((m) => [m.id, m.user_id]));
  const pendingByUser = new Map<string, number>();
  let pendingTotal = 0;
  if (reviewTasks.length > 0) {
    const reviewIds = reviewTasks.map((t) => t.id);
    const [{ data: comps }, { data: reviewAssignees }] = await Promise.all([
      sb.from("task_member_completions").select("task_id, member_id").in("task_id", reviewIds),
      sb.from("tasks").select("id, assignee_id").in("id", reviewIds),
    ]);
    const tasksWithParticipants = new Set<string>();
    for (const c of (comps ?? []) as { task_id: string; member_id: string }[]) {
      const pts = reviewTaskMap.get(c.task_id) ?? 0;
      const uid = memberToUser.get(c.member_id);
      if (!uid) continue;
      tasksWithParticipants.add(c.task_id);
      pendingTotal += pts;
      pendingByUser.set(uid, (pendingByUser.get(uid) ?? 0) + pts);
    }
    for (const t of (reviewAssignees ?? []) as { id: string; assignee_id: string | null }[]) {
      if (!t.assignee_id || tasksWithParticipants.has(t.id)) continue;
      const pts = reviewTaskMap.get(t.id) ?? 0;
      pendingTotal += pts;
      pendingByUser.set(t.assignee_id, (pendingByUser.get(t.assignee_id) ?? 0) + pts);
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
