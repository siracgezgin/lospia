// Re-exports from generated schema types
export type { Database, Json } from "./database";
export { Constants } from "./database";
export type {
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from "./database";

import type { Database } from "./database";

// Convenience row types
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export type TaskActivity = Database["public"]["Tables"]["task_activity"]["Row"];
export type TaskActivityInsert = Database["public"]["Tables"]["task_activity"]["Insert"];

// Phase 2A — dedicated audit trail (separate from task_activity)
export type TaskActivityLog = Database["public"]["Tables"]["task_activity_logs"]["Row"];
export type TaskActivityLogInsert = Database["public"]["Tables"]["task_activity_logs"]["Insert"];
// Activity log row joined with the actor's profile (for UI rendering)
export type TaskActivityLogWithActor = TaskActivityLog & {
  actor: Pick<Profile, "id" | "full_name" | "email"> | null;
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];

export type WorkspaceMember = Database["public"]["Tables"]["workspace_members"]["Row"];

export type SavedView = Database["public"]["Tables"]["saved_views"]["Row"];

export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

export type TaskAttachment = Database["public"]["Tables"]["task_attachments"]["Row"];

export type CustomFieldDefinition = Database["public"]["Tables"]["custom_field_definitions"]["Row"];

export type WebhookEvent = Database["public"]["Tables"]["webhook_events"]["Row"];

// workspace_contacts is not in the generated schema yet — define manually
export type WorkspaceContact = {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  role_label: string | null;
  created_at: string;
  updated_at: string;
};

// workspace_rules — daily SOPs / checklists
export type WorkspaceRule = Database["public"]["Tables"]["workspace_rules"]["Row"];
export type WorkspaceRuleInsert = Database["public"]["Tables"]["workspace_rules"]["Insert"];

// workspace_notes — sticky note board lane (not tasks)
export type NoteColor = "yellow" | "blue" | "green" | "purple";

export type WorkspaceNote = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  color: NoteColor;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// workspace_invites — pending email-based membership invites
export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  invited_by: string | null;
  accepted_at: string | null;
  created_at: string;
};

// workspace_departments — department tree (top-level + sub-areas)
export type WorkspaceDepartment = {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color_key: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

// department_members — person ↔ department (many-to-many)
export type DepartmentMember = {
  id: string;
  workspace_id: string;
  department_id: string;
  member_id: string;
  role: "lead" | "member";
  created_at: string;
};

// task_notes — user-authored notes on tasks ("Notlar")
export type TaskNote = {
  id: string;
  workspace_id: string;
  task_id: string;
  author_id: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type TaskNoteWithAuthor = TaskNote & {
  author: Pick<Profile, "id" | "full_name" | "email"> | null;
};

// Per-person task completion (multi-participant workflow)
export type TaskMemberCompletion = {
  id: string;
  workspace_id: string;
  task_id: string;
  member_id: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

// A task participant resolved for display: which workspace member, their name,
// and whether they have completed their part.
export type TaskParticipant = {
  memberId: string;     // workspace_members.id
  userId: string;       // profiles.id
  name: string;
  completed: boolean;
};

// Enum aliases
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];
export type TaskActivityType = Database["public"]["Enums"]["task_activity_type"];
export type NotificationType = Database["public"]["Enums"]["notification_type"];
export type CustomFieldType = Database["public"]["Enums"]["custom_field_type"];
export type WebhookSource = Database["public"]["Enums"]["webhook_source"];
