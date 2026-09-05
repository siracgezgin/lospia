import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { KanbanBoard } from "@/components/board/KanbanBoard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Task, SavedView, Profile, WorkspaceContact, WorkspaceNote, WorkspaceRole, WorkspaceDepartment, TaskParticipant, BoardNoteFeedItem } from "@/types";
import { asNoteType, asNoteActionStatus } from "@/lib/notes/note-types";

export type BoardRule = { id: string; title: string; category: string | null; updated_at: string };
export type BoardMember = {
  memberId: string; userId: string; name: string; isAdmin?: boolean;
  /** Yöneticinin seçtiği kimlik (20240313). null → id'den otomatik türetilir. */
  colorKey?: string | null;
  iconKey?: string | null;
  /** Kartta görünen ünvan (20240323). null → rolden türetilen etiket. */
  jobTitle?: string | null;
};

function parseWeekParam(weekStr?: string): string | null {
  if (!weekStr) return null;
  const d = new Date(weekStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return weekStr.slice(0, 10);
}

export const metadata = { title: "Board" };

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; week?: string }>;
}) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirectToSignIn();

  const params = await searchParams;
  const weekIso = parseWeekParam(params.week);

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, last_rules_seen_at")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  const lastRulesSeen = memberRows?.[0]?.last_rules_seen_at ?? null;
  const userRole = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;

  if (!workspaceId) {
    // Ortak boş durum (token renkleri; ham gray/blue yok). Sunucu bileşeni —
    // EmptyState hook'suz, düğme düz bağlantı.
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          className="max-w-md"
          title="Çalışma alanı bulunamadı"
          description="Çalışma alanınız yüklenemedi. Genellikle geçicidir; sayfayı yenileyin."
          action={
            <a
              href="/board"
              className="inline-flex h-8 items-center rounded-control border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-xs transition-[background-color,border-color] duration-150 hover:border-line-strong hover:bg-surface-muted"
            >
              Yenile
            </a>
          }
        />
      </div>
    );
  }

  // Admin_only tasks are hidden from non-admins at the RLS layer; we also filter
  // explicitly here as defense-in-depth (and so counts/columns never include them).
  const isAdmin = userRole === "owner" || userRole === "admin";
  const tasksQuery = supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .is("deleted_at", null);
  if (!isAdmin) tasksQuery.eq("visibility", "workspace");

  /* TEK DALGA.
     Sayfa eskiden üç adım SIRAYLA bekliyordu: [9 sorgu] → not akışı →
     not makbuzları. Üçü de yalnız workspaceId'ye bağlı; birbirini beklemeleri
     için hiçbir sebep yoktu. Supabase uzaktayken her sıralı adım bir tur
     gecikme demek — kabuktaki iki turla birlikte Pano'yu açan bekleme buydu.
     Makbuz sorgusu eskiden "not var mı?" kontrolünden sonra atılıyordu; artık
     koşulsuz ve paralel gidiyor: not yoksa boş döner, duvar saatinde bedava. */
  const [tasksResult, viewsResult, profilesResult, contactsResult, notesResult, rulesResult, deptsResult, completionsResult, deptMembersResult, feedResult, ackResult] = await Promise.all([
    tasksQuery.order("fractional_index"),
    supabase
      .from("saved_views")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`is_shared.eq.true,owner_id.eq.${user.id}`)
      .order("position"),
    // Member profiles via a single join (no sequential sub-query). Includes the
    // workspace_members row id so we can build the dept-filtered responsible picker.
    supabase
      .from("workspace_members")
      .select("id, user_id, role, color_key, icon_key, job_title, profiles(id, full_name, email, avatar_url)")
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_contacts")
      .select("*")
      /* Panonun kişi ızgarası EKİBİ gösterir. Dış ilişkiler (müşteri,
         tedarikçi, basın) CRM'de yaşar; pano kapısında müşteri kartı
         çıkmamalı. Ayrım `kind` ile (bkz. 20240322). */
      .eq("kind", "team")
      .eq("workspace_id", workspaceId)
      .order("created_at"),
    supabase
      .from("workspace_notes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position")
      .order("created_at"),
    // Active rules (compact list for the board panel + "new since last seen" count)
    supabase
      .from("workspace_rules")
      .select("id, title, category, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("position"),
    // Departments — drive card colours and the Departman filter
    supabase
      .from("workspace_departments")
      .select("id, parent_id, name, color_key")
      .eq("workspace_id", workspaceId)
      .order("position"),
    // Per-person completions → participant chips on cards
    supabase
      .from("task_member_completions")
      .select("task_id, member_id, completed_at, workspace_members(id, profiles(id, full_name, email))")
      .eq("workspace_id", workspaceId),
    // Department assignments → drive the create-task responsible picker filter
    supabase
      .from("department_members")
      .select("department_id, member_id")
      .eq("workspace_id", workspaceId),
    // Haftanın Not Akışı
    supabase
      .from("task_notes")
      .select("*, task:tasks!inner(id, title, department_id, due_date, archived_at, deleted_at, visibility), author:profiles!task_notes_author_id_fkey(id, full_name, email)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(150),
    // Kullanıcının kendi makbuzları (RLS: kendi satırları; yönetici hepsini
    // görür — panoda yalnız "bunu gördüm/üstlendim mi?" lazım). Tablo migrate
    // edilmemişse sessizce boş döner.
    supabase
      .from("task_note_acknowledgements")
      .select("note_id, user_id, action")
      .eq("workspace_id", workspaceId)
      .limit(1000),
  ]);

  const tasks: Task[] = tasksResult.data ?? [];
  const savedViews: SavedView[] = viewsResult.data ?? [];
  type ProfileLite = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;
  type MemberRow = { id: string; user_id: string; role: string; color_key: string | null; icon_key: string | null; job_title?: string | null; profiles: ProfileLite | ProfileLite[] | null };
  const memberRowsData = (profilesResult.data ?? []) as unknown as MemberRow[];
  const profiles: ProfileLite[] = memberRowsData
    .flatMap((m) => (Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : []));
  // Workspace members keyed by workspace_members.id — the unit task participants use.
  const members: BoardMember[] = memberRowsData.map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      memberId: m.id, userId: m.user_id, name: prof?.full_name ?? prof?.email ?? "—",
      isAdmin: m.role === "owner" || m.role === "admin",
      colorKey: m.color_key, iconKey: m.icon_key, jobTitle: m.job_title ?? null,
    };
  });
  const deptMembers = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const notes: WorkspaceNote[] = (notesResult.data ?? []) as WorkspaceNote[];
  const activeRules = (rulesResult.data ?? []) as BoardRule[];
  const newRulesCount = lastRulesSeen
    ? activeRules.filter((r) => r.updated_at > lastRulesSeen).length
    : activeRules.length;
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];

  // Build participants-by-task map for card chips.
  type CompRow = {
    task_id: string;
    member_id: string;
    completed_at: string | null;
    workspace_members:
      | { id: string; profiles: ProfileLite | ProfileLite[] | null }
      | { id: string; profiles: ProfileLite | ProfileLite[] | null }[]
      | null;
  };
  const participantsByTask: Record<string, TaskParticipant[]> = {};
  for (const row of (completionsResult.data ?? []) as unknown as CompRow[]) {
    const wm = Array.isArray(row.workspace_members) ? row.workspace_members[0] : row.workspace_members;
    const prof = wm && (Array.isArray(wm.profiles) ? wm.profiles[0] : wm.profiles);
    if (!prof) continue;
    (participantsByTask[row.task_id] ??= []).push({
      memberId: row.member_id,
      userId: prof.id,
      name: prof.full_name ?? prof.email ?? "—",
      completed: row.completed_at != null,
    });
  }

  // ── Weekly note feed (Haftanın Not Akışı) ─────────────────────────────────
  // Latest task notes joined with their task; the client filters by the selected
  // board week (info notes: creation week only; open action notes carry over).
  // The tasks!inner join runs under the tasks RLS, so notes of admin_only tasks
  // never reach a member; we re-assert visibility below as defense-in-depth.
  // Pre-migration schemas (no note_type column) still return rows — the new
  // fields are simply absent and default to info/open on the client.
  type FeedTaskRow = {
    id: string; title: string; department_id: string | null; due_date: string | null;
    archived_at: string | null; deleted_at: string | null; visibility: string | null;
  };
  type FeedNoteRow = {
    id: string; task_id: string; author_id: string | null; content: string; created_at: string;
    note_type?: string; action_status?: string; metadata?: Record<string, unknown> | null;
    due_date_at_note_time?: string | null;
    task: FeedTaskRow | FeedTaskRow[] | null;
    author: Pick<Profile, "id" | "full_name" | "email"> | Pick<Profile, "id" | "full_name" | "email">[] | null;
  };
  const feedRows = feedResult.data;

  const nameOfUser = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const p = profiles.find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? null;
  };
  const nameOfContact = (id: string): string | null =>
    contacts.find((c) => c.id === id)?.name ?? null;

  const noteFeed: BoardNoteFeedItem[] = ((feedRows ?? []) as unknown as FeedNoteRow[])
    .map((row) => {
      const task = Array.isArray(row.task) ? row.task[0] : row.task;
      if (!task || task.archived_at || task.deleted_at) return null;
      if (!isAdmin && task.visibility === "admin_only") return null;
      const author = Array.isArray(row.author) ? row.author[0] : row.author;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const notifyUserIds = Array.isArray(meta.notify_user_ids) ? (meta.notify_user_ids as string[]) : [];
      const notifyContactIds = Array.isArray(meta.notify_contact_ids) ? (meta.notify_contact_ids as string[]) : [];
      const notifiedNames = [
        ...notifyUserIds.map((id) => nameOfUser(id)),
        ...notifyContactIds.map((id) => nameOfContact(id)),
      ].filter((n): n is string => !!n);
      return {
        id: row.id,
        taskId: task.id,
        taskTitle: task.title,
        taskDueDate: task.due_date ? String(task.due_date).slice(0, 10) : null,
        departmentId: task.department_id,
        authorId: row.author_id,
        authorName: author?.full_name ?? author?.email ?? "Bilinmeyen kullanıcı",
        content: row.content,
        noteType: asNoteType(row.note_type),
        actionStatus: asNoteActionStatus(row.action_status),
        createdAt: row.created_at,
        notifiedNames: [...new Set(notifiedNames)],
        claimedByName: nameOfUser(typeof meta.claimed_by === "string" ? meta.claimed_by : null),
      } satisfies BoardNoteFeedItem;
    })
    .filter((x): x is BoardNoteFeedItem => x !== null);

  const noteAcks = (ackResult.data ?? []) as { note_id: string; user_id: string; action: string }[];

  const viewSlug = params.view ?? null;

  return (
    <KanbanBoard
      tasks={tasks}
      savedViews={savedViews}
      viewSlug={viewSlug}
      weekIso={weekIso}
      workspaceId={workspaceId}
      userId={user.id}
      profiles={profiles}
      contacts={contacts}
      notes={notes}
      rules={activeRules}
      newRulesCount={newRulesCount}
      departments={departments}
      participantsByTask={participantsByTask}
      members={members}
      deptMembers={deptMembers}
      userRole={userRole}
      noteFeed={noteFeed}
      noteAcks={noteAcks}
    />
  );
}
