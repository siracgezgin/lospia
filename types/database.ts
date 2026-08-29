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
      creative_assets: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          notes: string | null
          provider: string
          related_contact_id: string | null
          related_task_id: string | null
          status: string
          title: string
          updated_at: string
          url: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          notes?: string | null
          provider?: string
          related_contact_id?: string | null
          related_task_id?: string | null
          status?: string
          title: string
          updated_at?: string
          url: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          notes?: string | null
          provider?: string
          related_contact_id?: string | null
          related_task_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_assets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "workspace_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_assets_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "workspace_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_assets_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
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
      document_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          position: number
          section: string
          updated_at: string
          updated_by: string | null
          visibility: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          section?: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          section?: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_versions: {
        Row: {
          content_html: string | null
          content_json: Json | null
          created_at: string
          created_by: string | null
          id: string
          plain_text: string | null
          template_id: string
          version_no: number
        }
        Insert: {
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          plain_text?: string | null
          template_id: string
          version_no?: number
        }
        Update: {
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          plain_text?: string | null
          template_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          archived_at: string | null
          category: string
          channel: string
          content_html: string | null
          content_json: Json | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          id: string
          metadata: Json
          owner_id: string | null
          plain_text: string | null
          related_contact_id: string | null
          related_task_id: string | null
          status: string
          tags: string[]
          title: string
          updated_at: string
          variables: string[]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          category?: string
          channel?: string
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          owner_id?: string | null
          plain_text?: string | null
          related_contact_id?: string | null
          related_task_id?: string | null
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          variables?: string[]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          channel?: string
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          owner_id?: string | null
          plain_text?: string | null
          related_contact_id?: string | null
          related_task_id?: string | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          variables?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "workspace_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "workspace_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_payments: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payee: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payee?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payee?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payments_workspace_id_fkey"
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
      operation_documents: {
        Row: {
          archived_at: string | null
          body: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          document_type: string
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          folder_id: string | null
          id: string
          metadata: Json
          notes: string | null
          owner_id: string | null
          related_contact_id: string | null
          related_task_id: string | null
          section: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          url: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          document_type?: string
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          folder_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          owner_id?: string | null
          related_contact_id?: string | null
          related_task_id?: string | null
          section?: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          url?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          document_type?: string
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          folder_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          owner_id?: string | null
          related_contact_id?: string | null
          related_task_id?: string | null
          section?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "workspace_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_documents_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "workspace_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_documents_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_spreadsheet_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          snapshot: Json | null
          spreadsheet_id: string
          version_no: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot?: Json | null
          spreadsheet_id: string
          version_no?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot?: Json | null
          spreadsheet_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "operation_spreadsheet_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_spreadsheet_versions_spreadsheet_id_fkey"
            columns: ["spreadsheet_id"]
            isOneToOne: false
            referencedRelation: "operation_spreadsheets"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_spreadsheets: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          folder_id: string | null
          id: string
          metadata: Json
          owner_id: string | null
          related_contact_id: string | null
          related_task_id: string | null
          schema_json: Json
          section: string
          sheet_type: string
          snapshot: Json
          status: string
          tags: string[]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json
          owner_id?: string | null
          related_contact_id?: string | null
          related_task_id?: string | null
          schema_json?: Json
          section?: string
          sheet_type?: string
          snapshot?: Json
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json
          owner_id?: string | null
          related_contact_id?: string | null
          related_task_id?: string | null
          schema_json?: Json
          section?: string
          sheet_type?: string
          snapshot?: Json
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_spreadsheets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_spreadsheets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "workspace_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_spreadsheets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_spreadsheets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_spreadsheets_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "workspace_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_spreadsheets_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_spreadsheets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_bands: {
        Row: {
          category: string
          columns: Json
          created_at: string
          created_by: string | null
          id: string
          label: string
          position: number
          slot: string
          topic_rows: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          category?: string
          columns?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          position?: number
          slot?: string
          topic_rows?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          category?: string
          columns?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          position?: number
          slot?: string
          topic_rows?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_bands_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_meetings: {
        Row: {
          category: string
          collaborator_ids: string[]
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          kim: string | null
          meeting_date: string
          participant_ids: string[]
          position: number
          template_id: string | null
          time_slot: string
          title: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          category?: string
          collaborator_ids?: string[]
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kim?: string | null
          meeting_date: string
          participant_ids?: string[]
          position?: number
          template_id?: string | null
          time_slot?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          category?: string
          collaborator_ids?: string[]
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kim?: string | null
          meeting_date?: string
          participant_ids?: string[]
          position?: number
          template_id?: string | null
          time_slot?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_meetings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "planning_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_meetings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_meetings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_open_items: {
        Row: {
          category: string | null
          collaborator_user_id: string | null
          created_at: string
          created_by: string | null
          done: boolean
          done_at: string | null
          id: string
          owner_label: string | null
          owner_role: string | null
          owner_user_id: string | null
          position: number
          task_id: string | null
          text: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          category?: string | null
          collaborator_user_id?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          id?: string
          owner_label?: string | null
          owner_role?: string | null
          owner_user_id?: string | null
          position?: number
          task_id?: string | null
          text: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          category?: string | null
          collaborator_user_id?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          id?: string
          owner_label?: string | null
          owner_role?: string | null
          owner_user_id?: string | null
          position?: number
          task_id?: string | null
          text?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_open_items_collaborator_user_id_fkey"
            columns: ["collaborator_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_open_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_open_items_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_open_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_open_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_open_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_process_steps: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kim: string | null
          note: string | null
          participant_ids: string[]
          position: number
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kim?: string | null
          note?: string | null
          participant_ids?: string[]
          position?: number
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kim?: string | null
          note?: string | null
          participant_ids?: string[]
          position?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_process_steps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_process_steps_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_process_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_templates: {
        Row: {
          active: boolean
          category: string
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          participant_ids: string[]
          position: number
          time_slot: string
          title: string | null
          updated_at: string
          updated_by: string | null
          weekday: number
          workspace_id: string
        }
        Insert: {
          active?: boolean
          category?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          participant_ids?: string[]
          position?: number
          time_slot?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          weekday?: number
          workspace_id: string
        }
        Update: {
          active?: boolean
          category?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          participant_ids?: string[]
          position?: number
          time_slot?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          weekday?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_topics: {
        Row: {
          collaborator_ids: string[]
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          kim: string | null
          meeting_id: string
          participant_ids: string[]
          position: number
          task_id: string | null
          text: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          collaborator_ids?: string[]
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          kim?: string | null
          meeting_id: string
          participant_ids?: string[]
          position?: number
          task_id?: string | null
          text?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          collaborator_ids?: string[]
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          kim?: string | null
          meeting_id?: string
          participant_ids?: string[]
          position?: number
          task_id?: string | null
          text?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_topics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_topics_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "planning_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_topics_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_topics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_week_matrix: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          kim: string | null
          participant_ids: string[]
          position: number
          text: string | null
          time_slot: string
          updated_at: string
          updated_by: string | null
          week_start: string
          weekday: number
          workspace_id: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          kim?: string | null
          participant_ids?: string[]
          position?: number
          text?: string | null
          time_slot?: string
          updated_at?: string
          updated_by?: string | null
          week_start: string
          weekday: number
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kim?: string | null
          participant_ids?: string[]
          position?: number
          text?: string | null
          time_slot?: string
          updated_at?: string
          updated_by?: string | null
          week_start?: string
          weekday?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_week_matrix_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_week_matrix_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_week_matrix_workspace_id_fkey"
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
      production_sheet_materials: {
        Row: {
          consumption: number
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          note: string | null
          position: number
          sheet_id: string
          updated_at: string
          waste_pct: number
          workspace_id: string
        }
        Insert: {
          consumption?: number
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          note?: string | null
          position?: number
          sheet_id: string
          updated_at?: string
          waste_pct?: number
          workspace_id: string
        }
        Update: {
          consumption?: number
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          note?: string | null
          position?: number
          sheet_id?: string
          updated_at?: string
          waste_pct?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_sheet_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sheet_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "workspace_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sheet_materials_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "production_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sheet_materials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      production_sheets: {
        Row: {
          accessories_info: string | null
          archived_at: string | null
          category: string | null
          colorway: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          delivered_items: Json
          delivery_date: string | null
          description: string | null
          embellishments: string | null
          fabric_info: string | null
          fabric_lining: string | null
          id: string
          manufacturer_id: string | null
          measurements: Json
          meterage: string | null
          parent_sheet_id: string | null
          photo_refs: Json
          pricing: Json
          producer: string | null
          product_code: string | null
          product_kind: string | null
          production_date: string | null
          production_waste: string | null
          qc_revision: string | null
          revision_notes: string | null
          season: string | null
          season_id: string | null
          sewing_delivery_date: string | null
          sewing_instruction: string | null
          size_distribution: Json
          status: string
          subcategory: string | null
          title: string
          updated_at: string
          updated_by: string | null
          wash_instruction: string | null
          workmanship_notes: string | null
          workspace_id: string
        }
        Insert: {
          accessories_info?: string | null
          archived_at?: string | null
          category?: string | null
          colorway?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_items?: Json
          delivery_date?: string | null
          description?: string | null
          embellishments?: string | null
          fabric_info?: string | null
          fabric_lining?: string | null
          id?: string
          manufacturer_id?: string | null
          measurements?: Json
          meterage?: string | null
          parent_sheet_id?: string | null
          photo_refs?: Json
          pricing?: Json
          producer?: string | null
          product_code?: string | null
          product_kind?: string | null
          production_date?: string | null
          production_waste?: string | null
          qc_revision?: string | null
          revision_notes?: string | null
          season?: string | null
          season_id?: string | null
          sewing_delivery_date?: string | null
          sewing_instruction?: string | null
          size_distribution?: Json
          status?: string
          subcategory?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          wash_instruction?: string | null
          workmanship_notes?: string | null
          workspace_id: string
        }
        Update: {
          accessories_info?: string | null
          archived_at?: string | null
          category?: string | null
          colorway?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_items?: Json
          delivery_date?: string | null
          description?: string | null
          embellishments?: string | null
          fabric_info?: string | null
          fabric_lining?: string | null
          id?: string
          manufacturer_id?: string | null
          measurements?: Json
          meterage?: string | null
          parent_sheet_id?: string | null
          photo_refs?: Json
          pricing?: Json
          producer?: string | null
          product_code?: string | null
          product_kind?: string | null
          production_date?: string | null
          production_waste?: string | null
          qc_revision?: string | null
          revision_notes?: string | null
          season?: string | null
          season_id?: string | null
          sewing_delivery_date?: string | null
          sewing_instruction?: string | null
          size_distribution?: Json
          status?: string
          subcategory?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          wash_instruction?: string | null
          workmanship_notes?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_sheets_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sheets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sheets_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "workspace_manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sheets_parent_sheet_id_fkey"
            columns: ["parent_sheet_id"]
            isOneToOne: false
            referencedRelation: "production_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sheets_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "workspace_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sheets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sheets_workspace_id_fkey"
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
      request_access_leads: {
        Row: {
          company_name: string
          created_at: string
          current_workflow_tool: string | null
          email: string
          id: string
          main_operational_pain: string | null
          name: string
          note: string | null
          source: string
          status: string
          team_size: string | null
        }
        Insert: {
          company_name: string
          created_at?: string
          current_workflow_tool?: string | null
          email: string
          id?: string
          main_operational_pain?: string | null
          name: string
          note?: string | null
          source?: string
          status?: string
          team_size?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string
          current_workflow_tool?: string | null
          email?: string
          id?: string
          main_operational_pain?: string | null
          name?: string
          note?: string | null
          source?: string
          status?: string
          team_size?: string | null
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
      task_note_acknowledgements: {
        Row: {
          action: string
          created_at: string
          id: string
          note_id: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          note_id: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          note_id?: string
          task_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_note_acknowledgements_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "task_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_note_acknowledgements_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_note_acknowledgements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_note_acknowledgements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notes: {
        Row: {
          action_status: string
          author_id: string | null
          content: string
          created_at: string
          due_date_at_note_time: string | null
          id: string
          is_pinned: boolean
          metadata: Json
          note_type: string
          task_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_status?: string
          author_id?: string | null
          content: string
          created_at?: string
          due_date_at_note_time?: string | null
          id?: string
          is_pinned?: boolean
          metadata?: Json
          note_type?: string
          task_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_status?: string
          author_id?: string | null
          content?: string
          created_at?: string
          due_date_at_note_time?: string | null
          id?: string
          is_pinned?: boolean
          metadata?: Json
          note_type?: string
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
      workspace_activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_activity_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_activity_logs_workspace_id_fkey"
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
          crm_status: string | null
          email: string | null
          id: string
          kind: string
          last_contact_at: string | null
          metadata: Json
          name: string
          next_follow_up_at: string | null
          notes: string | null
          organization: string | null
          owner_id: string | null
          phone: string | null
          role_label: string | null
          seeding_stage: string | null
          segment: string | null
          source_channel: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          crm_status?: string | null
          email?: string | null
          id?: string
          kind?: string
          last_contact_at?: string | null
          metadata?: Json
          name: string
          next_follow_up_at?: string | null
          notes?: string | null
          organization?: string | null
          owner_id?: string | null
          phone?: string | null
          role_label?: string | null
          seeding_stage?: string | null
          segment?: string | null
          source_channel?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          crm_status?: string | null
          email?: string | null
          id?: string
          kind?: string
          last_contact_at?: string | null
          metadata?: Json
          name?: string
          next_follow_up_at?: string | null
          notes?: string | null
          organization?: string | null
          owner_id?: string | null
          phone?: string | null
          role_label?: string | null
          seeding_stage?: string | null
          segment?: string | null
          source_channel?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      workspace_manufacturers: {
        Row: {
          city: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          email: string | null
          id: string
          is_active: boolean
          lead_time_days: number | null
          min_order_qty: number | null
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          position: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          min_order_qty?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          min_order_qty?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_manufacturers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_manufacturers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_manufacturers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_materials: {
        Row: {
          category: string
          code: string | null
          composition: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          photo_url: string | null
          position: number
          supplier_id: string | null
          unit: string
          unit_price: number | null
          updated_at: string
          updated_by: string | null
          width_cm: number | null
          workspace_id: string
        }
        Insert: {
          category?: string
          code?: string | null
          composition?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          photo_url?: string | null
          position?: number
          supplier_id?: string | null
          unit?: string
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          width_cm?: number | null
          workspace_id: string
        }
        Update: {
          category?: string
          code?: string | null
          composition?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          photo_url?: string | null
          position?: number
          supplier_id?: string | null
          unit?: string
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          width_cm?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_materials_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "workspace_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_materials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_materials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          color_key: string | null
          email_notifications_enabled: boolean
          icon_key: string | null
          id: string
          job_title: string | null
          joined_at: string
          last_rules_seen_at: string | null
          notification_email: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          color_key?: string | null
          email_notifications_enabled?: boolean
          icon_key?: string | null
          id?: string
          job_title?: string | null
          joined_at?: string
          last_rules_seen_at?: string | null
          notification_email?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          color_key?: string | null
          email_notifications_enabled?: boolean
          icon_key?: string | null
          id?: string
          job_title?: string | null
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
      workspace_product_categories: {
        Row: {
          color_hex: string | null
          created_at: string
          created_by: string | null
          id: string
          key: string
          label: string
          parent_key: string | null
          position: number
          workspace_id: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          key: string
          label: string
          parent_key?: string | null
          position?: number
          workspace_id: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string
          label?: string
          parent_key?: string | null
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_product_categories_workspace_id_fkey"
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
      workspace_seasons: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          is_current: boolean
          name: string
          position: number
          starts_on: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name: string
          position?: number
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name?: string
          position?: number
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_seasons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_seasons_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_seasons_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_suppliers: {
        Row: {
          city: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          email: string | null
          id: string
          is_active: boolean
          lead_time_days: number | null
          name: string
          notes: string | null
          phone: string | null
          position: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          position?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          position?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_suppliers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_suppliers_workspace_id_fkey"
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
      _frac_index_b: { Args: { p_n: number }; Returns: string }
      _planning_contact: {
        Args: { p_code: string; p_ws: string }
        Returns: string
      }
      _planning_initials: { Args: { p_name: string }; Returns: string }
      _planning_kim_ids: {
        Args: { p_kim: string; p_ws: string }
        Returns: string[]
      }
      _planning_person: {
        Args: { p_code: string; p_ws: string }
        Returns: string
      }
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
      af_backfill_manufacturers: { Args: never; Returns: string }
      af_backfill_seasons: { Args: never; Returns: string }
      af_import_planning_templates: { Args: never; Returns: string }
      af_import_planning_week_2026_08_17: { Args: never; Returns: string }
      af_name_key: { Args: { t: string }; Returns: string }
      backfill_assignee_from_participants: { Args: never; Returns: string }
      can_access_task: { Args: { p_task_id: string }; Returns: boolean }
      can_manage_avatar_of: { Args: { p_user: string }; Returns: boolean }
      can_manage_task_participants: {
        Args: { p_member_id: string; p_task_id: string; p_workspace_id: string }
        Returns: boolean
      }
      check_email_access_grant: { Args: { p_email: string }; Returns: boolean }
      check_signup_access: {
        Args: { p_email: string; p_username: string }
        Returns: string
      }
      classify_contact_kinds: { Args: never; Returns: string }
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
      link_duplicate_contacts: { Args: never; Returns: string }
      migrate_creative_to_documents: { Args: never; Returns: string }
      planning_open_items_to_tasks: { Args: { p_ws?: string }; Returns: string }
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

