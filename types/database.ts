// ============================================================================
// SpikOS TaskOS — Database Types
// ============================================================================
// Hand-typed stub based on supabase/migrations/20240101000000_initial_schema.sql
// REGENERATE in Phase 14 with:
//   supabase gen types typescript --local > types/database.ts
// ============================================================================

export type TaskStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "archived";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type WorkspaceRole = "owner" | "admin" | "member";

export type TaskActivityType =
  | "comment"
  | "status_change"
  | "priority_change"
  | "assignee_change"
  | "title_change"
  | "description_change"
  | "due_date_change"
  | "start_date_change"
  | "tags_change"
  | "custom_field_change"
  | "timer_start"
  | "timer_stop"
  | "attachment_add"
  | "attachment_remove"
  | "created";

export type NotificationType =
  | "task_assigned"
  | "task_mentioned"
  | "task_comment"
  | "task_status_changed"
  | "task_due_soon"
  | "workspace_invite";

export type CustomFieldType = "text" | "number" | "select" | "boolean" | "date";

export type WebhookSource = "slack" | "email" | "other";

// ---- Row types ----

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  slack_webhook_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  due_date: string | null;
  start_date: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  fractional_index: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  workspace_id: string;
  user_id: string;
  type: TaskActivityType;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  workspace_id: string;
  task_id: string | null;
  user_id: string;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedView {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  name: string;
  config: SavedViewConfig;
  is_shared: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SavedViewConfig {
  filters?: {
    status?: TaskStatus[];
    assignee?: string | "me";
    priority?: TaskPriority[];
    tags?: string[];
    due_within_days?: number;
  };
  sort?: {
    field: "due_date" | "priority" | "created_at" | "updated_at";
    direction: "asc" | "desc";
  };
  view_type?: "board" | "list";
}

export interface CustomFieldDefinition {
  id: string;
  workspace_id: string;
  name: string;
  field_key: string;
  field_type: CustomFieldType;
  options: string[] | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  workspace_id: string;
  uploaded_by: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  created_at: string;
}

export interface Notification {
  id: string;
  workspace_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  task_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  workspace_id: string | null;
  source: WebhookSource;
  raw_payload: Record<string, unknown>;
  processed: boolean;
  created_task_id: string | null;
  error: string | null;
  created_at: string;
}

// ---- Supabase Database generic wrapper ----
// Used by createClient<Database>() for full type-safety.
// Regenerated from live schema in Phase 14.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id" | "created_at">>;
      };
      workspaces: {
        Row: Workspace;
        Insert: Omit<Workspace, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Workspace, "id" | "created_at">>;
      };
      workspace_members: {
        Row: WorkspaceMember;
        Insert: Omit<WorkspaceMember, "id" | "joined_at">;
        Update: Partial<Pick<WorkspaceMember, "role">>;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Task, "id" | "workspace_id" | "created_by" | "created_at">>;
      };
      task_activity: {
        Row: TaskActivity;
        Insert: Omit<TaskActivity, "id" | "created_at">;
        Update: never;
      };
      time_entries: {
        Row: TimeEntry;
        Insert: Omit<TimeEntry, "id" | "created_at" | "updated_at">;
        Update: Partial<Pick<TimeEntry, "stopped_at" | "duration_seconds" | "note">>;
      };
      saved_views: {
        Row: SavedView;
        Insert: Omit<SavedView, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<SavedView, "id" | "workspace_id" | "created_at">>;
      };
      custom_field_definitions: {
        Row: CustomFieldDefinition;
        Insert: Omit<CustomFieldDefinition, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<CustomFieldDefinition, "id" | "workspace_id" | "created_at">>;
      };
      task_attachments: {
        Row: TaskAttachment;
        Insert: Omit<TaskAttachment, "id" | "created_at">;
        Update: never;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, "id" | "created_at">;
        Update: Partial<Pick<Notification, "is_read">>;
      };
      webhook_events: {
        Row: WebhookEvent;
        Insert: Omit<WebhookEvent, "id" | "created_at">;
        Update: Partial<Pick<WebhookEvent, "processed" | "created_task_id" | "error">>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_tasks_by_status: {
        Args: { p_workspace_id: string };
        Returns: { status: TaskStatus; count: number }[];
      };
      get_time_logged_this_week: {
        Args: { p_workspace_id: string; p_user_id: string };
        Returns: number;
      };
      get_due_soon_tasks: {
        Args: { p_workspace_id: string };
        Returns: {
          id: string;
          title: string;
          status: TaskStatus;
          priority: TaskPriority;
          due_date: string;
          assignee_id: string | null;
        }[];
      };
      get_task_time_totals: {
        Args: { p_task_id: string; p_user_id: string };
        Returns: { today_seconds: number; week_seconds: number }[];
      };
      is_workspace_member: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      is_workspace_admin: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      task_status: TaskStatus;
      task_priority: TaskPriority;
      workspace_role: WorkspaceRole;
      task_activity_type: TaskActivityType;
      notification_type: NotificationType;
      custom_field_type: CustomFieldType;
      webhook_source: WebhookSource;
    };
  };
};
