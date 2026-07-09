export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      custom_field_definitions: {
        Row: {
          created_at: string
          field_key: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          name: string
          options: Json | null
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          name: string
          options?: Json | null
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          name?: string
          options?: Json | null
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      department_members: {
        Row: {
          created_at: string
          department_id: string
          id: string
          member_id: string
          role: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          member_id: string
          role?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          member_id?: string
          role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "workspace_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          task_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          task_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          task_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          cycle: number
          id: string
          metadata: Json
          points_amount: number
          source_type: string
          task_id: string | null
          transaction_type: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cycle?: number
          id?: string
          metadata?: Json
          points_amount: number
          source_type?: string
          task_id?: string | null
          transaction_type: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cycle?: number
          id?: string
          metadata?: Json
          points_amount?: number
          source_type?: string
          task_id?: string | null
          transaction_type?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_shared: boolean
          name: string
          owner_id: string | null
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_shared?: boolean
          name: string
          owner_id?: string | null
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_shared?: boolean
          name?: string
          owner_id?: string | null
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity: {
        Row: {
          content: string | null
          created_at: string
          id: string
          metadata: Json | null
          task_id: string
          type: Database["public"]["Enums"]["task_activity_type"]
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id: string
          type: Database["public"]["Enums"]["task_activity_type"]
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id?: string
          type?: Database["public"]["Enums"]["task_activity_type"]
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          field_name: string | null
          id: string
          metadata: Json
          new_value: Json | null
          old_value: Json | null
          task_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          field_name?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          task_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          field_name?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          storage_path: string
          task_id: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          storage_path: string
          task_id: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_member_completions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          member_id: string
          task_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          member_id: string
          task_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          member_id?: string
          task_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_member_completions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_member_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_member_completions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notes: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          task_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          task_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          task_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          approval_required: boolean
          approval_status: string
          archived_at: string | null
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          deleted_at: string | null
          department_id: string | null
          description: string | null
          due_date: string | null
          effort_size: string
          fractional_index: string
          id: string
          points_cycle: number
          points_value: number
          priority: Database["public"]["Enums"]["task_priority"]
          responsible_contact_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          title: string
          updated_at: string
          visibility: string
          waiting_on_contact_id: string | null
          waiting_on_member_id: string | null
          waiting_reason: string | null
          workspace_id: string
        }
        Insert: {
          approval_required?: boolean
          approval_status?: string
          archived_at?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          effort_size?: string
          fractional_index?: string
          id?: string
          points_cycle?: number
          points_value?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          responsible_contact_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          title: string
          updated_at?: string
          visibility?: string
          waiting_on_contact_id?: string | null
          waiting_on_member_id?: string | null
          waiting_reason?: string | null
          workspace_id: string
        }
        Update: {
          approval_required?: boolean
          approval_status?: string
          archived_at?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          effort_size?: string
          fractional_index?: string
          id?: string
          points_cycle?: number
          points_value?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          responsible_contact_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          visibility?: string
          waiting_on_contact_id?: string | null
          waiting_on_member_id?: string | null
          waiting_reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "workspace_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_responsible_contact_id_fkey"
            columns: ["responsible_contact_id"]
            isOneToOne: false
            referencedRelation: "workspace_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_waiting_on_contact_id_fkey"
            columns: ["waiting_on_contact_id"]
            isOneToOne: false
            referencedRelation: "workspace_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          note: string | null
          started_at: string
          stopped_at: string | null
          task_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          note?: string | null
          started_at?: string
          stopped_at?: string | null
          task_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          note?: string | null
          started_at?: string
          stopped_at?: string | null
          task_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          created_task_id: string | null
          error: string | null
          id: string
          processed: boolean
          raw_payload: Json
          source: Database["public"]["Enums"]["webhook_source"]
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_task_id?: string | null
          error?: string | null
          id?: string
          processed?: boolean
          raw_payload: Json
          source: Database["public"]["Enums"]["webhook_source"]
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_task_id?: string | null
          error?: string | null
          id?: string
          processed?: boolean
          raw_payload?: Json
          source?: Database["public"]["Enums"]["webhook_source"]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_created_task_id_fkey"
            columns: ["created_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          role_label: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          role_label?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          role_label?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_departments: {
        Row: {
          color_key: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "workspace_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_departments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          role: string
          username: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          role: string
          username?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          email_notifications_enabled: boolean
          id: string
          joined_at: string
          last_rules_seen_at: string | null
          notification_email: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          email_notifications_enabled?: boolean
          id?: string
          joined_at?: string
          last_rules_seen_at?: string | null
          notification_email?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          email_notifications_enabled?: boolean
          id?: string
          joined_at?: string
          last_rules_seen_at?: string | null
          notification_email?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_notes: {
        Row: {
          body: string | null
          color: string
          created_at: string
          created_by: string | null
          id: string
          position: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_rules: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          position: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          position?: number
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          position?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          slack_webhook_url: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slack_webhook_url?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slack_webhook_url?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_access_grant:
        | { Args: { p_full_name?: string }; Returns: Json }
        | { Args: { p_full_name?: string; p_username?: string }; Returns: Json }
      admin_set_member_name: {
        Args: { p_full_name: string; p_member_id: string }
        Returns: undefined
      }
      admin_set_member_username: {
        Args: { p_member_id: string; p_username: string }
        Returns: undefined
      }
      can_access_task: { Args: { p_task_id: string }; Returns: boolean }
      check_email_access_grant: { Args: { p_email: string }; Returns: boolean }
      check_signup_access: {
        Args: { p_email: string; p_username: string }
        Returns: string
      }
      create_default_saved_views: {
        Args: { p_owner_id: string; p_workspace_id: string }
        Returns: undefined
      }
      create_task_notifications: {
        Args: {
          p_body: string
          p_dedupe_seconds?: number
          p_task_id: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_user_ids: string[]
          p_workspace_id: string
        }
        Returns: number
      }
      dedupe_workspace_departments: {
        Args: { p_workspace_id?: string }
        Returns: undefined
      }
      finalize_task_points: { Args: { p_task_id: string }; Returns: Json }
      get_due_soon_tasks: {
        Args: { p_workspace_id: string }
        Returns: {
          assignee_id: string
          due_date: string
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }[]
      }
      get_task_time_totals: {
        Args: { p_task_id: string; p_user_id: string }
        Returns: {
          today_seconds: number
          week_seconds: number
        }[]
      }
      get_tasks_by_status: {
        Args: { p_workspace_id: string }
        Returns: {
          count: number
          status: Database["public"]["Enums"]["task_status"]
        }[]
      }
      get_time_logged_this_week: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: number
      }
      is_workspace_admin: { Args: { p_workspace_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      provision_af_departments: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      provision_workspace: { Args: { p_full_name?: string }; Returns: Json }
      repair_missing_task_points: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      repair_pending_workspace_invites: { Args: never; Returns: number }
      resolve_username_to_email: {
        Args: { p_username: string }
        Returns: string
      }
      revoke_task_points: { Args: { p_task_id: string }; Returns: Json }
      to_workspace_role: {
        Args: { p_role: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      custom_field_type: "text" | "number" | "select" | "boolean" | "date"
      notification_type:
        | "task_assigned"
        | "task_mentioned"
        | "task_comment"
        | "task_status_changed"
        | "task_due_soon"
        | "workspace_invite"
        | "task_note_added"
        | "task_waiting_on"
      task_activity_type:
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
        | "created"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "backlog"
        | "ready"
        | "in_progress"
        | "blocked"
        | "review"
        | "done"
        | "archived"
      webhook_source: "slack" | "email" | "other"
      workspace_role: "owner" | "admin" | "member" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      custom_field_type: ["text", "number", "select", "boolean", "date"],
      notification_type: [
        "task_assigned",
        "task_mentioned",
        "task_comment",
        "task_status_changed",
        "task_due_soon",
        "workspace_invite",
        "task_note_added",
        "task_waiting_on",
      ],
      task_activity_type: [
        "comment",
        "status_change",
        "priority_change",
        "assignee_change",
        "title_change",
        "description_change",
        "due_date_change",
        "start_date_change",
        "tags_change",
        "custom_field_change",
        "timer_start",
        "timer_stop",
        "attachment_add",
        "attachment_remove",
        "created",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "backlog",
        "ready",
        "in_progress",
        "blocked",
        "review",
        "done",
        "archived",
      ],
      webhook_source: ["slack", "email", "other"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const

