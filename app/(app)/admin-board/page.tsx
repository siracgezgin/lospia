import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { KanbanBoard, type ManagerOption } from "@/components/board/KanbanBoard";
import { asVisibility, type TaskVisibility } from "@/lib/utils/visibility";
import { asNoteType, asNoteActionStatus } from "@/lib/notes/note-types";
import type {
  Task, Profile, WorkspaceContact, WorkspaceDepartment, WorkspaceRole, TaskParticipant,
  WorkspaceNote, BoardNoteFeedItem,
} from "@/types";
import type { BoardMember } from "@/app/(app)/board/page";

/* Sekme başlığı sidebar/registry/AppHeader ile BİREBİR aynı ad olmalı (tek
   terminoloji kuralı); bu sayfada hiç yoktu ve tarayıcı sekmesinde uygulamanın
   genel adı yazıyordu. */
export const metadata = { title: "Admin Board" };

export default async function AdminBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ visibility?: string; manager?: string }>;
}) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirectToSignIn();

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  const userRole = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;
  const isAdmin = userRole === "owner" || userRole === "admin";

  // Server-side guard: Yönetici Pano is owner/admin only. A member who guesses
  // the URL is sent back to the normal board (its existence isn't advertised).
  if (!workspaceId || !isAdmin) redirect("/board");

  const params = await searchParams;
  const visibility: TaskVisibility = asVisibility(params.visibility);
  const manager = params.manager ?? "all";

  /* NOT SÜTUNU Yönetici Pano'da da çizilir (Sıraç, 2026-08-29: "soldaki notlar
     kısmı neden burda yok"). Sorgular normal Pano ile BİREBİR aynı; hepsi
     AYNI dalgada gider — kabuk kuralı: maliyet sıralı adım sayısıdır. */
  const [
    tasksResult, profilesResult, contactsResult, deptsResult, completionsResult, deptMembersResult,
    notesResult, feedResult, ackResult,
  ] =
    await Promise.all([
      // Admin sees every task via RLS; we still drop archived/deleted here.
      supabase
        .from("tasks")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .is("deleted_at", null)
        .order("fractional_index"),
      supabase
        .from("workspace_members")
        .select("id, user_id, role, profiles(id, full_name, email, avatar_url)")
        .eq("workspace_id", workspaceId),
      supabase
        .from("workspace_contacts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at"),
      supabase
        .from("workspace_departments")
        .select("id, parent_id, name, color_key")
        .eq("workspace_id", workspaceId)
        .order("position"),
      // Participants → both the card chips and the canonical responsibility map.
      supabase
        .from("task_member_completions")
        .select("task_id, member_id, completed_at, workspace_members(id, user_id, profiles(id, full_name, email))")
        .eq("workspace_id", workspaceId),
      supabase
        .from("department_members")
        .select("department_id, member_id")
        .eq("workspace_id", workspaceId),
      // Çalışma alanı notları — not sütununun sabit kartları.
      supabase
        .from("workspace_notes")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("position")
        .order("created_at"),
      // Haftanın Not Akışı — görev notları, göreviyle ve yazarıyla birlikte.
      supabase
        .from("task_notes")
        .select("*, task:tasks!inner(id, title, department_id, due_date, archived_at, deleted_at, visibility), author:profiles!task_notes_author_id_fkey(id, full_name, email)")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(150),
      // Not makbuzları ("gördüm / üstlendim"). Tablo migrate edilmemişse boş döner.
      supabase
        .from("task_note_acknowledgements")
        .select("note_id, user_id, action")
        .eq("workspace_id", workspaceId)
        .limit(1000),
    ]);

  const allTasks: Task[] = tasksResult.data ?? [];

  type ProfileLite = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;
  type MemberRow = { id: string; user_id: string; role: string; profiles: ProfileLite | ProfileLite[] | null };
  const memberRowsData = (profilesResult.data ?? []) as unknown as MemberRow[];

  const profiles: ProfileLite[] = memberRowsData.flatMap((m) =>
    Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : [],
  );
  const members: BoardMember[] = memberRowsData.map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      memberId: m.id,
      userId: m.user_id,
      name: prof?.full_name ?? prof?.email ?? "—",
      isAdmin: m.role === "owner" || m.role === "admin",
    };
  });

  // Manager (owner/admin) people only — drive the person filter and the canonical
  // "manager responsible" set.
  const managerUserIds = members.filter((m) => m.isAdmin && m.userId).map((m) => m.userId);
  const managerUserIdSet = new Set(managerUserIds);
  const managers: ManagerOption[] = members
    .filter((m) => m.isAdmin && m.userId)
    .map((m) => ({ userId: m.userId, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  // Card participant chips + canonical responsible user_ids, from one query.
  type CompRow = {
    task_id: string;
    member_id: string;
    completed_at: string | null;
    workspace_members:
      | { id: string; user_id: string | null; profiles: ProfileLite | ProfileLite[] | null }
      | { id: string; user_id: string | null; profiles: ProfileLite | ProfileLite[] | null }[]
      | null;
  };
  const participantsByTask: Record<string, TaskParticipant[]> = {};
  const participantUsersByTask: Record<string, string[]> = {};
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
    if (wm?.user_id) (participantUsersByTask[row.task_id] ??= []).push(wm.user_id);
  }

  const responsibleByTask: Record<string, string[]> = {};
  for (const t of allTasks) {
    const participants = participantUsersByTask[t.id];
    if (participants && participants.length > 0) {
      responsibleByTask[t.id] = Array.from(new Set(participants));
    } else if (t.assignee_id) {
      responsibleByTask[t.id] = [t.assignee_id];
    } else {
      responsibleByTask[t.id] = [];
    }
  }

  // Candidate set passed to the board (both visibilities; the tab is a client
  // filter). admin_only is managers-only by construction; workspace tasks must
  // have at least one manager responsible to belong on the manager board.
  const tasks = allTasks.filter((t) => {
    if (asVisibility(t.visibility) === "admin_only") return true;
    return (responsibleByTask[t.id] ?? []).some((uid) => managerUserIdSet.has(uid));
  });

  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];
  const deptMembers = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];

  /* ── Not sütununun verisi — normal Pano ile AYNI dönüşüm ─────────────────
     Yönetici zaten tüm görevleri görüyor (RLS), yine de görünürlük ve
     silinmişlik kontrolü Pano'daki gibi burada da uygulanır: dönüşümün iki
     yüzeyde ayrışması, aynı notun iki panoda farklı görünmesi demekti. */
  const notes: WorkspaceNote[] = (notesResult.data ?? []) as WorkspaceNote[];

  type FeedTaskRow = {
    id: string; title: string; department_id: string | null; due_date: string | null;
    archived_at: string | null; deleted_at: string | null; visibility: string | null;
  };
  type FeedNoteRow = {
    id: string; task_id: string; author_id: string | null; content: string; created_at: string;
    note_type?: string; action_status?: string; metadata?: Record<string, unknown> | null;
    task: FeedTaskRow | FeedTaskRow[] | null;
    author: Pick<Profile, "id" | "full_name" | "email"> | Pick<Profile, "id" | "full_name" | "email">[] | null;
  };

  const nameOfUser = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const p = profiles.find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? null;
  };
  const nameOfContact = (id: string): string | null =>
    contacts.find((c) => c.id === id)?.name ?? null;

  const noteFeed: BoardNoteFeedItem[] = ((feedResult.data ?? []) as unknown as FeedNoteRow[])
    .map((row) => {
      const task = Array.isArray(row.task) ? row.task[0] : row.task;
      if (!task || task.archived_at || task.deleted_at) return null;
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

  return (
    <KanbanBoard
      tasks={tasks}
      savedViews={[]}
      viewSlug={null}
      workspaceId={workspaceId}
      userId={user.id}
      profiles={profiles}
      contacts={contacts}
      notes={notes}
      noteFeed={noteFeed}
      noteAcks={noteAcks}
      departments={departments}
      participantsByTask={participantsByTask}
      members={members}
      deptMembers={deptMembers}
      userRole={userRole}
      adminBoard={{
        visibility,
        manager,
        managers,
        managerUserIds,
        responsibleByTask,
      }}
    />
  );
}
