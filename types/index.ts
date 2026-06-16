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

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];

export type WorkspaceMember = Database["public"]["Tables"]["workspace_members"]["Row"];

export type SavedView = Database["public"]["Tables"]["saved_views"]["Row"];

export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

export type TaskAttachment = Database["public"]["Tables"]["task_attachments"]["Row"];

export type CustomFieldDefinition = Database["public"]["Tables"]["custom_field_definitions"]["Row"];

export type WebhookEvent = Database["public"]["Tables"]["webhook_events"]["Row"];

// Enum aliases
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];
export type TaskActivityType = Database["public"]["Enums"]["task_activity_type"];
export type NotificationType = Database["public"]["Enums"]["notification_type"];
export type CustomFieldType = Database["public"]["Enums"]["custom_field_type"];
export type WebhookSource = Database["public"]["Enums"]["webhook_source"];
