export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      a2a_activity: {
        Row: {
          created_at: string
          direction: Database["public"]["Enums"]["a2a_direction"]
          duration_ms: number | null
          error_message: string | null
          id: string
          input: Json | null
          output: Json | null
          peer_id: string
          skill_name: string | null
          status: Database["public"]["Enums"]["a2a_activity_status"]
        }
        Insert: {
          created_at?: string
          direction: Database["public"]["Enums"]["a2a_direction"]
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          peer_id: string
          skill_name?: string | null
          status?: Database["public"]["Enums"]["a2a_activity_status"]
        }
        Update: {
          created_at?: string
          direction?: Database["public"]["Enums"]["a2a_direction"]
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          peer_id?: string
          skill_name?: string | null
          status?: Database["public"]["Enums"]["a2a_activity_status"]
        }
        Relationships: [
          {
            foreignKeyName: "a2a_activity_peer_id_fkey"
            columns: ["peer_id"]
            isOneToOne: false
            referencedRelation: "a2a_peers"
            referencedColumns: ["id"]
          },
        ]
      }
      a2a_peers: {
        Row: {
          api_key_id: string | null
          capabilities: Json
          created_at: string
          created_by: string | null
          gateway_token: string | null
          id: string
          inbound_token_hash: string | null
          invitation_metadata: Json
          invited_by_peer_id: string | null
          last_seen_at: string | null
          mcp_api_key: string | null
          name: string
          outbound_token: string | null
          request_count: number
          status: Database["public"]["Enums"]["a2a_peer_status"]
          toolset_groups: string[]
          transport: Database["public"]["Enums"]["peer_transport"]
          updated_at: string
          url: string | null
        }
        Insert: {
          api_key_id?: string | null
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          gateway_token?: string | null
          id?: string
          inbound_token_hash?: string | null
          invitation_metadata?: Json
          invited_by_peer_id?: string | null
          last_seen_at?: string | null
          mcp_api_key?: string | null
          name: string
          outbound_token?: string | null
          request_count?: number
          status?: Database["public"]["Enums"]["a2a_peer_status"]
          toolset_groups?: string[]
          transport?: Database["public"]["Enums"]["peer_transport"]
          updated_at?: string
          url?: string | null
        }
        Update: {
          api_key_id?: string | null
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          gateway_token?: string | null
          id?: string
          inbound_token_hash?: string | null
          invitation_metadata?: Json
          invited_by_peer_id?: string | null
          last_seen_at?: string | null
          mcp_api_key?: string | null
          name?: string
          outbound_token?: string | null
          request_count?: number
          status?: Database["public"]["Enums"]["a2a_peer_status"]
          toolset_groups?: string[]
          transport?: Database["public"]["Enums"]["peer_transport"]
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "a2a_peers_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a2a_peers_invited_by_peer_id_fkey"
            columns: ["invited_by_peer_id"]
            isOneToOne: false
            referencedRelation: "a2a_peers"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_corrections: {
        Row: {
          agent_source: string | null
          corrected_account_code: string
          corrected_by: string | null
          corrected_vat_code: string | null
          created_at: string
          description_pattern: string | null
          id: string
          journal_entry_id: string | null
          original_account_code: string
          original_vat_code: string | null
          reason: string | null
          vendor_id: string | null
        }
        Insert: {
          agent_source?: string | null
          corrected_account_code: string
          corrected_by?: string | null
          corrected_vat_code?: string | null
          created_at?: string
          description_pattern?: string | null
          id?: string
          journal_entry_id?: string | null
          original_account_code: string
          original_vat_code?: string | null
          reason?: string | null
          vendor_id?: string | null
        }
        Update: {
          agent_source?: string | null
          corrected_account_code?: string
          corrected_by?: string | null
          corrected_vat_code?: string | null
          created_at?: string
          description_pattern?: string | null
          id?: string
          journal_entry_id?: string | null
          original_account_code?: string
          original_vat_code?: string | null
          reason?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_corrections_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_corrections_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          entry_count: number | null
          fiscal_year: number
          id: string
          notes: string | null
          period_month: number
          reopened_at: string | null
          reopened_by: string | null
          status: Database["public"]["Enums"]["accounting_period_status"]
          total_credit_cents: number | null
          total_debit_cents: number | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          entry_count?: number | null
          fiscal_year: number
          id?: string
          notes?: string | null
          period_month: number
          reopened_at?: string | null
          reopened_by?: string | null
          status?: Database["public"]["Enums"]["accounting_period_status"]
          total_credit_cents?: number | null
          total_debit_cents?: number | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          entry_count?: number | null
          fiscal_year?: number
          id?: string
          notes?: string | null
          period_month?: number
          reopened_at?: string | null
          reopened_by?: string | null
          status?: Database["public"]["Enums"]["accounting_period_status"]
          total_credit_cents?: number | null
          total_debit_cents?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      accounting_templates: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          is_system: boolean
          keywords: string[] | null
          locale: string
          template_lines: Json
          template_name: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          keywords?: string[] | null
          locale?: string
          template_lines?: Json
          template_name: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          keywords?: string[] | null
          locale?: string
          template_lines?: Json
          template_name?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      activities: {
        Row: {
          activity_type: string
          assigned_to: string | null
          body: string | null
          created_at: string
          created_by: string | null
          done_at: string | null
          due_at: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          subject: string | null
          updated_at: string
        }
        Insert: {
          activity_type: string
          assigned_to?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          subject?: string | null
          updated_at?: string
        }
        Update: {
          activity_type?: string
          assigned_to?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ad_campaigns: {
        Row: {
          budget_cents: number
          created_at: string
          created_by: string | null
          currency: string
          end_date: string | null
          external_id: string | null
          id: string
          metrics: Json
          name: string
          objective: string | null
          platform: string
          spent_cents: number
          start_date: string | null
          status: string
          target_audience: Json
          updated_at: string
        }
        Insert: {
          budget_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          external_id?: string | null
          id?: string
          metrics?: Json
          name: string
          objective?: string | null
          platform?: string
          spent_cents?: number
          start_date?: string | null
          status?: string
          target_audience?: Json
          updated_at?: string
        }
        Update: {
          budget_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          external_id?: string | null
          id?: string
          metrics?: Json
          name?: string
          objective?: string | null
          platform?: string
          spent_cents?: number
          start_date?: string | null
          status?: string
          target_audience?: Json
          updated_at?: string
        }
        Relationships: []
      }
      ad_creatives: {
        Row: {
          body: string | null
          campaign_id: string
          created_at: string
          cta_text: string | null
          headline: string | null
          id: string
          image_url: string | null
          performance: Json
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          campaign_id: string
          created_at?: string
          cta_text?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          performance?: Json
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          campaign_id?: string
          created_at?: string
          cta_text?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          performance?: Json
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          address_type: string
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_primary: boolean
          label: string | null
          notes: string | null
          owner_id: string
          owner_type: string
          phone: string | null
          postal_code: string | null
          state: string | null
          street: string | null
          street2: string | null
          updated_at: string
        }
        Insert: {
          address_type?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          notes?: string | null
          owner_id: string
          owner_type: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          street?: string | null
          street2?: string | null
          updated_at?: string
        }
        Update: {
          address_type?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          notes?: string | null
          owner_id?: string
          owner_type?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          street?: string | null
          street2?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_activity: {
        Row: {
          agent: Database["public"]["Enums"]["agent_type"]
          approval_request_id: string | null
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input: Json | null
          outcome_data: Json | null
          outcome_evaluated_at: string | null
          outcome_status:
            | Database["public"]["Enums"]["activity_outcome_status"]
            | null
          output: Json | null
          skill_id: string | null
          skill_name: string | null
          status: Database["public"]["Enums"]["agent_activity_status"]
          token_usage: Json | null
        }
        Insert: {
          agent?: Database["public"]["Enums"]["agent_type"]
          approval_request_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json | null
          outcome_data?: Json | null
          outcome_evaluated_at?: string | null
          outcome_status?:
            | Database["public"]["Enums"]["activity_outcome_status"]
            | null
          output?: Json | null
          skill_id?: string | null
          skill_name?: string | null
          status?: Database["public"]["Enums"]["agent_activity_status"]
          token_usage?: Json | null
        }
        Update: {
          agent?: Database["public"]["Enums"]["agent_type"]
          approval_request_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json | null
          outcome_data?: Json | null
          outcome_evaluated_at?: string | null
          outcome_status?:
            | Database["public"]["Enums"]["activity_outcome_status"]
            | null
          output?: Json | null
          skill_id?: string | null
          skill_name?: string | null
          status?: Database["public"]["Enums"]["agent_activity_status"]
          token_usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activity_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_audit_trail: {
        Row: {
          after_snapshot: Json | null
          agent_type: string | null
          before_snapshot: Json | null
          caller_api_key_id: string | null
          caller_user_id: string | null
          conversation_id: string | null
          created_at: string
          crud_action: string
          diff: Json | null
          entity_id: string | null
          error_message: string | null
          exported_at: string | null
          id: string
          occurred_at: string
          request_payload: Json
          request_payload_sha256: string
          retention_until: string | null
          skill_id: string | null
          skill_name: string | null
          success: boolean
          table_name: string
          trace_id: string | null
        }
        Insert: {
          after_snapshot?: Json | null
          agent_type?: string | null
          before_snapshot?: Json | null
          caller_api_key_id?: string | null
          caller_user_id?: string | null
          conversation_id?: string | null
          created_at?: string
          crud_action: string
          diff?: Json | null
          entity_id?: string | null
          error_message?: string | null
          exported_at?: string | null
          id?: string
          occurred_at?: string
          request_payload?: Json
          request_payload_sha256: string
          retention_until?: string | null
          skill_id?: string | null
          skill_name?: string | null
          success?: boolean
          table_name: string
          trace_id?: string | null
        }
        Update: {
          after_snapshot?: Json | null
          agent_type?: string | null
          before_snapshot?: Json | null
          caller_api_key_id?: string | null
          caller_user_id?: string | null
          conversation_id?: string | null
          created_at?: string
          crud_action?: string
          diff?: Json | null
          entity_id?: string | null
          error_message?: string | null
          exported_at?: string | null
          id?: string
          occurred_at?: string
          request_payload?: Json
          request_payload_sha256?: string
          retention_until?: string | null
          skill_id?: string | null
          skill_name?: string | null
          success?: boolean
          table_name?: string
          trace_id?: string | null
        }
        Relationships: []
      }
      agent_automations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          executor: string
          id: string
          last_error: string | null
          last_triggered_at: string | null
          name: string
          next_run_at: string | null
          run_count: number
          skill_arguments: Json
          skill_id: string | null
          skill_name: string | null
          trigger_config: Json
          trigger_type: Database["public"]["Enums"]["automation_trigger_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          executor?: string
          id?: string
          last_error?: string | null
          last_triggered_at?: string | null
          name: string
          next_run_at?: string | null
          run_count?: number
          skill_arguments?: Json
          skill_id?: string | null
          skill_name?: string | null
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["automation_trigger_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          executor?: string
          id?: string
          last_error?: string | null
          last_triggered_at?: string | null
          name?: string
          next_run_at?: string | null
          run_count?: number
          skill_arguments?: Json
          skill_id?: string | null
          skill_name?: string | null
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["automation_trigger_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_automations_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          processed_count: number
          source: string
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          processed_count?: number
          source?: string
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          processed_count?: number
          source?: string
        }
        Relationships: []
      }
      agent_locks: {
        Row: {
          expires_at: string
          lane: string
          locked_at: string
          locked_by: string
        }
        Insert: {
          expires_at?: string
          lane: string
          locked_at?: string
          locked_by: string
        }
        Update: {
          expires_at?: string
          lane?: string
          locked_at?: string
          locked_by?: string
        }
        Relationships: []
      }
      agent_memory: {
        Row: {
          category: Database["public"]["Enums"]["agent_memory_category"]
          created_at: string
          created_by: Database["public"]["Enums"]["agent_type"]
          embedding: string | null
          expires_at: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          category?: Database["public"]["Enums"]["agent_memory_category"]
          created_at?: string
          created_by?: Database["public"]["Enums"]["agent_type"]
          embedding?: string | null
          expires_at?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          category?: Database["public"]["Enums"]["agent_memory_category"]
          created_at?: string
          created_by?: Database["public"]["Enums"]["agent_type"]
          embedding?: string | null
          expires_at?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      agent_objective_activities: {
        Row: {
          activity_id: string
          created_at: string
          objective_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          objective_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          objective_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_objective_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "agent_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_objective_activities_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "agent_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_objectives: {
        Row: {
          completed_at: string | null
          constraints: Json
          created_at: string
          created_by: string | null
          goal: string
          id: string
          locked_at: string | null
          locked_by: string | null
          progress: Json
          status: Database["public"]["Enums"]["agent_objective_status"]
          success_criteria: Json
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          constraints?: Json
          created_at?: string
          created_by?: string | null
          goal: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          progress?: Json
          status?: Database["public"]["Enums"]["agent_objective_status"]
          success_criteria?: Json
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          constraints?: Json
          created_at?: string
          created_by?: string | null
          goal?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          progress?: Json
          status?: Database["public"]["Enums"]["agent_objective_status"]
          success_criteria?: Json
          updated_at?: string
        }
        Relationships: []
      }
      agent_skill_packs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          installed: boolean
          installed_at: string | null
          name: string
          skills: Json
          version: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          installed?: boolean
          installed_at?: string | null
          name: string
          skills?: Json
          version?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          installed?: boolean
          installed_at?: string | null
          name?: string
          skills?: Json
          version?: string
        }
        Relationships: []
      }
      agent_skills: {
        Row: {
          category: Database["public"]["Enums"]["agent_skill_category"]
          created_at: string
          description: string | null
          enabled: boolean
          handler: string
          id: string
          instructions: string | null
          mcp_exposed: boolean | null
          name: string
          origin: Database["public"]["Enums"]["skill_origin"]
          requires: Json | null
          requires_staging: boolean
          scope: Database["public"]["Enums"]["agent_scope"]
          tool_definition: Json
          trust_level: Database["public"]["Enums"]["skill_trust_level"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["agent_skill_category"]
          created_at?: string
          description?: string | null
          enabled?: boolean
          handler: string
          id?: string
          instructions?: string | null
          mcp_exposed?: boolean | null
          name: string
          origin?: Database["public"]["Enums"]["skill_origin"]
          requires?: Json | null
          requires_staging?: boolean
          scope?: Database["public"]["Enums"]["agent_scope"]
          tool_definition?: Json
          trust_level?: Database["public"]["Enums"]["skill_trust_level"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["agent_skill_category"]
          created_at?: string
          description?: string | null
          enabled?: boolean
          handler?: string
          id?: string
          instructions?: string | null
          mcp_exposed?: boolean | null
          name?: string
          origin?: Database["public"]["Enums"]["skill_origin"]
          requires?: Json | null
          requires_staging?: boolean
          scope?: Database["public"]["Enums"]["agent_scope"]
          tool_definition?: Json
          trust_level?: Database["public"]["Enums"]["skill_trust_level"]
          updated_at?: string
        }
        Relationships: []
      }
      agent_workflows: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          last_error: string | null
          last_run_at: string | null
          name: string
          run_count: number
          steps: Json
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name: string
          run_count?: number
          steps?: Json
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name?: string
          run_count?: number
          steps?: Json
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          completion_tokens: number
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          metadata: Json
          model: string | null
          prompt_tokens: number
          provider: string | null
          request_id: string | null
          source: string
          status: string
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          prompt_tokens?: number
          provider?: string | null
          request_id?: string | null
          source: string
          status?: string
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          prompt_tokens?: number
          provider?: string | null
          request_id?: string | null
          source?: string
          status?: string
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      analytic_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytic_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "analytic_account_balances"
            referencedColumns: ["analytic_account_id"]
          },
          {
            foreignKeyName: "analytic_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "analytic_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytic_accounts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analytic_lines: {
        Row: {
          account_code: string | null
          amount_cents: number
          analytic_account_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          entry_date: string
          id: string
          journal_entry_id: string | null
          journal_entry_line_id: string | null
        }
        Insert: {
          account_code?: string | null
          amount_cents: number
          analytic_account_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          entry_date: string
          id?: string
          journal_entry_id?: string | null
          journal_entry_line_id?: string | null
        }
        Update: {
          account_code?: string | null
          amount_cents?: number
          analytic_account_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          entry_date?: string
          id?: string
          journal_entry_id?: string | null
          journal_entry_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytic_lines_analytic_account_id_fkey"
            columns: ["analytic_account_id"]
            isOneToOne: false
            referencedRelation: "analytic_account_balances"
            referencedColumns: ["analytic_account_id"]
          },
          {
            foreignKeyName: "analytic_lines_analytic_account_id_fkey"
            columns: ["analytic_account_id"]
            isOneToOne: false
            referencedRelation: "analytic_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytic_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytic_lines_journal_entry_line_id_fkey"
            columns: ["journal_entry_line_id"]
            isOneToOne: false
            referencedRelation: "journal_entry_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          key_raw: string | null
          last_used_at: string | null
          name: string
          scopes: string[] | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          key_raw?: string | null
          last_used_at?: string | null
          name: string
          scopes?: string[] | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          key_raw?: string | null
          last_used_at?: string | null
          name?: string
          scopes?: string[] | null
        }
        Relationships: []
      }
      application_stages: {
        Row: {
          application_id: string
          changed_by: string | null
          comment: string | null
          created_at: string
          from_stage: Database["public"]["Enums"]["application_stage"] | null
          id: string
          to_stage: Database["public"]["Enums"]["application_stage"]
        }
        Insert: {
          application_id: string
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["application_stage"] | null
          id?: string
          to_stage: Database["public"]["Enums"]["application_stage"]
        }
        Update: {
          application_id?: string
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["application_stage"] | null
          id?: string
          to_stage?: Database["public"]["Enums"]["application_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "application_stages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          ai_reasoning: string | null
          ai_score: number | null
          ai_summary: string | null
          assigned_recruiter_id: string | null
          candidate_email: string
          candidate_name: string
          candidate_phone: string | null
          confidence_level: string | null
          cover_letter: string | null
          created_at: string
          detected_skills: string[] | null
          employee_id: string | null
          hired_at: string | null
          id: string
          job_posting_id: string
          linkedin_url: string | null
          match_breakdown: Json
          matching_skills: string[] | null
          meta: Json
          missing_skills: string[] | null
          parsed_resume: Json
          recommendation: string | null
          rejected_reason: string | null
          resume_url: string | null
          source: string
          stage: Database["public"]["Enums"]["application_stage"]
          updated_at: string
        }
        Insert: {
          ai_reasoning?: string | null
          ai_score?: number | null
          ai_summary?: string | null
          assigned_recruiter_id?: string | null
          candidate_email: string
          candidate_name: string
          candidate_phone?: string | null
          confidence_level?: string | null
          cover_letter?: string | null
          created_at?: string
          detected_skills?: string[] | null
          employee_id?: string | null
          hired_at?: string | null
          id?: string
          job_posting_id: string
          linkedin_url?: string | null
          match_breakdown?: Json
          matching_skills?: string[] | null
          meta?: Json
          missing_skills?: string[] | null
          parsed_resume?: Json
          recommendation?: string | null
          rejected_reason?: string | null
          resume_url?: string | null
          source?: string
          stage?: Database["public"]["Enums"]["application_stage"]
          updated_at?: string
        }
        Update: {
          ai_reasoning?: string | null
          ai_score?: number | null
          ai_summary?: string | null
          assigned_recruiter_id?: string | null
          candidate_email?: string
          candidate_name?: string
          candidate_phone?: string | null
          confidence_level?: string | null
          cover_letter?: string | null
          created_at?: string
          detected_skills?: string[] | null
          employee_id?: string | null
          hired_at?: string | null
          id?: string
          job_posting_id?: string
          linkedin_url?: string | null
          match_breakdown?: Json
          matching_skills?: string[] | null
          meta?: Json
          missing_skills?: string[] | null
          parsed_resume?: Json
          recommendation?: string | null
          rejected_reason?: string | null
          resume_url?: string | null
          source?: string
          stage?: Database["public"]["Enums"]["application_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_assigned_recruiter_id_fkey"
            columns: ["assigned_recruiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_assigned_recruiter_id_fkey"
            columns: ["assigned_recruiter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_chains: {
        Row: {
          created_at: string
          entity_type: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      approval_decisions: {
        Row: {
          comment: string | null
          created_at: string
          decided_by: string
          decided_role: Database["public"]["Enums"]["app_role"]
          decision: Database["public"]["Enums"]["approval_decision_kind"]
          id: string
          request_id: string
          step_sort_order: number | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decided_by: string
          decided_role: Database["public"]["Enums"]["app_role"]
          decision: Database["public"]["Enums"]["approval_decision_kind"]
          id?: string
          request_id: string
          step_sort_order?: number | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          decided_by?: string
          decided_role?: Database["public"]["Enums"]["app_role"]
          decision?: Database["public"]["Enums"]["approval_decision_kind"]
          id?: string
          request_id?: string
          step_sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_group_members: {
        Row: {
          group_id: string
          user_id: string
        }
        Insert: {
          group_id: string
          user_id: string
        }
        Update: {
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "approval_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          amount_cents: number | null
          chain_id: string | null
          context: Json | null
          created_at: string
          currency: string
          current_step: number | null
          entity_id: string
          entity_type: string
          id: string
          reason: string | null
          requested_by: string | null
          required_role: Database["public"]["Enums"]["app_role"]
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          chain_id?: string | null
          context?: Json | null
          created_at?: string
          currency?: string
          current_step?: number | null
          entity_id: string
          entity_type: string
          id?: string
          reason?: string | null
          requested_by?: string | null
          required_role?: Database["public"]["Enums"]["app_role"]
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          chain_id?: string | null
          context?: Json | null
          created_at?: string
          currency?: string
          current_step?: number | null
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string | null
          requested_by?: string | null
          required_role?: Database["public"]["Enums"]["app_role"]
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "approval_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "approval_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_rules: {
        Row: {
          amount_threshold_cents: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          entity_type: string
          id: string
          is_active: boolean
          name: string
          priority: number
          required_role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          amount_threshold_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          entity_type: string
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          required_role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          amount_threshold_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          required_role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      approval_steps: {
        Row: {
          chain_id: string
          created_at: string
          group_id: string | null
          id: string
          min_approvals: number
          required_role: Database["public"]["Enums"]["app_role"] | null
          sort_order: number
        }
        Insert: {
          chain_id: string
          created_at?: string
          group_id?: string | null
          id?: string
          min_approvals?: number
          required_role?: Database["public"]["Enums"]["app_role"] | null
          sort_order: number
        }
        Update: {
          chain_id?: string
          created_at?: string
          group_id?: string | null
          id?: string
          min_approvals?: number
          required_role?: Database["public"]["Enums"]["app_role"] | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "approval_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "approval_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_entries: {
        Row: {
          break_minutes: number
          clock_in: string
          clock_out: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          source: string
          total_minutes: number | null
          updated_at: string
        }
        Insert: {
          break_minutes?: number
          clock_in: string
          clock_out?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          source?: string
          total_minutes?: number | null
          updated_at?: string
        }
        Update: {
          break_minutes?: number
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          source?: string
          total_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_events: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          email: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          email?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          email?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      autonomy_test_runs: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          l9_accuracy: number | null
          layers: number[]
          results: Json
          summary: Json
          triggered_by: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          id?: string
          l9_accuracy?: number | null
          layers?: number[]
          results?: Json
          summary?: Json
          triggered_by?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          l9_accuracy?: number | null
          layers?: number[]
          results?: Json
          summary?: Json
          triggered_by?: string
        }
        Relationships: []
      }
      back_in_stock_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          notified_at: string | null
          product_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notified_at?: string | null
          product_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notified_at?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "back_in_stock_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          archived: boolean
          created_at: string
          currency: string
          gl_account: string
          id: string
          is_default: boolean
          name: string
          notes: string | null
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          archived?: boolean
          created_at?: string
          currency?: string
          gl_account?: string
          id?: string
          is_default?: boolean
          name: string
          notes?: string | null
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          archived?: boolean
          created_at?: string
          currency?: string
          gl_account?: string
          id?: string
          is_default?: boolean
          name?: string
          notes?: string | null
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          error_count: number
          error_message: string | null
          file_name: string | null
          id: string
          imported_count: number
          metadata: Json
          skipped_count: number
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_count?: number
          error_message?: string | null
          file_name?: string | null
          id?: string
          imported_count?: number
          metadata?: Json
          skipped_count?: number
          source: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_count?: number
          error_message?: string | null
          file_name?: string | null
          id?: string
          imported_count?: number
          metadata?: Json
          skipped_count?: number
          source?: string
          status?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount_cents: number
          bank_account_id: string | null
          batch_id: string | null
          counterparty: string | null
          created_at: string
          currency: string
          description: string | null
          external_id: string | null
          id: string
          matched_amount_cents: number
          raw_data: Json
          reference: string | null
          source: string
          status: string
          transaction_date: string
          updated_at: string
          value_date: string | null
        }
        Insert: {
          amount_cents: number
          bank_account_id?: string | null
          batch_id?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          matched_amount_cents?: number
          raw_data?: Json
          reference?: string | null
          source: string
          status?: string
          transaction_date: string
          updated_at?: string
          value_date?: string | null
        }
        Update: {
          amount_cents?: number
          bank_account_id?: string | null
          batch_id?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          matched_amount_cents?: number
          raw_data?: Json
          reference?: string | null
          source?: string
          status?: string
          transaction_date?: string
          updated_at?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "bank_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_test_exchanges: {
        Row: {
          content: string
          created_at: string
          direction: string
          id: string
          message_type: string
          payload: Json | null
          session_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          direction: string
          id?: string
          message_type?: string
          payload?: Json | null
          session_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          direction?: string
          id?: string
          message_type?: string
          payload?: Json | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_test_exchanges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "beta_test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_test_findings: {
        Row: {
          context: Json | null
          created_at: string
          description: string | null
          id: string
          reported_by: string | null
          resolved_at: string | null
          screenshot_url: string | null
          session_id: string | null
          severity: string
          title: string
          type: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          reported_by?: string | null
          resolved_at?: string | null
          screenshot_url?: string | null
          session_id?: string | null
          severity?: string
          title: string
          type: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          reported_by?: string | null
          resolved_at?: string | null
          screenshot_url?: string | null
          session_id?: string | null
          severity?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_test_findings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "beta_test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_test_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          id: string
          metadata: Json | null
          peer_id: string | null
          peer_name: string
          scenario: string
          started_at: string
          status: string
          summary: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          metadata?: Json | null
          peer_id?: string | null
          peer_name?: string
          scenario: string
          started_at?: string
          status?: string
          summary?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          metadata?: Json | null
          peer_id?: string | null
          peer_name?: string
          scenario?: string
          started_at?: string
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_test_sessions_peer_id_fkey"
            columns: ["peer_id"]
            isOneToOne: false
            referencedRelation: "a2a_peers"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_categories: {
        Row: {
          category_id: string
          post_id: string
        }
        Insert: {
          category_id: string
          post_id: string
        }
        Update: {
          category_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_categories_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "blog_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          content_json: Json | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          featured_image: string | null
          featured_image_alt: string | null
          id: string
          is_featured: boolean | null
          meta_json: Json | null
          published_at: string | null
          reading_time_minutes: number | null
          reviewed_at: string | null
          reviewer_id: string | null
          scheduled_at: string | null
          slug: string
          status: Database["public"]["Enums"]["page_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          author_id?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          featured_image?: string | null
          featured_image_alt?: string | null
          id?: string
          is_featured?: boolean | null
          meta_json?: Json | null
          published_at?: string | null
          reading_time_minutes?: number | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          scheduled_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["page_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          author_id?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          featured_image?: string | null
          featured_image_alt?: string | null
          id?: string
          is_featured?: boolean | null
          meta_json?: Json | null
          published_at?: string | null
          reading_time_minutes?: number | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          scheduled_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["page_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      bom_headers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          product_id: string
          quantity_produced: number
          routing_notes: string | null
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          quantity_produced?: number
          routing_notes?: string | null
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          product_id?: string
          quantity_produced?: number
          routing_notes?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_headers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_lines: {
        Row: {
          bom_id: string
          component_product_id: string
          created_at: string
          id: string
          position: number
          quantity: number
          scrap_pct: number
          unit: string | null
        }
        Insert: {
          bom_id: string
          component_product_id: string
          created_at?: string
          id?: string
          position?: number
          quantity: number
          scrap_pct?: number
          unit?: string | null
        }
        Update: {
          bom_id?: string
          component_product_id?: string
          created_at?: string
          id?: string
          position?: number
          quantity?: number
          scrap_pct?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          service_id: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          service_id?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          service_id?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_availability_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "booking_services"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_blocked_dates: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          end_time: string | null
          id: string
          is_all_day: boolean
          reason: string | null
          start_time: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          end_time?: string | null
          id?: string
          is_all_day?: boolean
          reason?: string | null
          start_time?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          end_time?: string | null
          id?: string
          is_all_day?: boolean
          reason?: string | null
          start_time?: string | null
        }
        Relationships: []
      }
      booking_services: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price_cents: number | null
          product_id: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number | null
          product_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number | null
          product_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_services_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          confirmation_sent_at: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          end_time: string
          id: string
          internal_notes: string | null
          metadata: Json | null
          notes: string | null
          reminder_sent_at: string | null
          service_id: string | null
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          end_time: string
          id?: string
          internal_notes?: string | null
          metadata?: Json | null
          notes?: string | null
          reminder_sent_at?: string | null
          service_id?: string | null
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          end_time?: string
          id?: string
          internal_notes?: string | null
          metadata?: Json | null
          notes?: string | null
          reminder_sent_at?: string | null
          service_id?: string | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "booking_services"
            referencedColumns: ["id"]
          },
        ]
      }
      bootstrap_runs: {
        Row: {
          config_hash: string | null
          created_at: string
          duration_ms: number | null
          errors: Json
          id: string
          module_id: string
          seeded_automations: number
          seeded_skills: number
          status: string
          triggered_by: string | null
        }
        Insert: {
          config_hash?: string | null
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          id?: string
          module_id: string
          seeded_automations?: number
          seeded_skills?: number
          status: string
          triggered_by?: string | null
        }
        Update: {
          config_hash?: string | null
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          id?: string
          module_id?: string
          seeded_automations?: number
          seeded_skills?: number
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      candidate_notes: {
        Row: {
          application_id: string
          author_id: string | null
          body: string
          created_at: string
          id: string
          rating: number | null
        }
        Insert: {
          application_id: string
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          rating?: number | null
        }
        Update: {
          application_id?: string
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          api_credentials_secret_ref: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          tracking_url_template: string | null
        }
        Insert: {
          api_credentials_secret_ref?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tracking_url_template?: string | null
        }
        Update: {
          api_credentials_secret_ref?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tracking_url_template?: string | null
        }
        Relationships: []
      }
      certifications: {
        Row: {
          certificate_number: string | null
          created_at: string
          document_url: string | null
          employee_id: string
          expires_at: string | null
          id: string
          issued_date: string | null
          issuer: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          certificate_number?: string | null
          created_at?: string
          document_url?: string | null
          employee_id: string
          expires_at?: string | null
          id?: string
          issued_date?: string | null
          issuer?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          certificate_number?: string | null
          created_at?: string
          document_url?: string | null
          employee_id?: string
          expires_at?: string | null
          id?: string
          issued_date?: string | null
          issuer?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_category: string
          account_code: string
          account_name: string
          account_type: string
          created_at: string
          id: string
          is_active: boolean
          locale: string
          normal_balance: string
          updated_at: string
        }
        Insert: {
          account_category: string
          account_code: string
          account_name: string
          account_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          locale?: string
          normal_balance: string
          updated_at?: string
        }
        Update: {
          account_category?: string
          account_code?: string
          account_name?: string
          account_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          locale?: string
          normal_balance?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          assigned_agent_id: string | null
          channel: string
          channel_thread_id: string | null
          conversation_status: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          escalated_at: string | null
          escalation_reason: string | null
          id: string
          priority: string | null
          scope: string
          sentiment_score: number | null
          session_id: string | null
          title: string | null
          updated_at: string
          user_id: string | null
          visitor_profile: Json | null
        }
        Insert: {
          assigned_agent_id?: string | null
          channel?: string
          channel_thread_id?: string | null
          conversation_status?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          id?: string
          priority?: string | null
          scope?: string
          sentiment_score?: number | null
          session_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          visitor_profile?: Json | null
        }
        Update: {
          assigned_agent_id?: string | null
          channel?: string
          channel_thread_id?: string | null
          conversation_status?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          id?: string
          priority?: string | null
          scope?: string
          sentiment_score?: number | null
          session_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          visitor_profile?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "support_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_feedback: {
        Row: {
          ai_response: string | null
          context_kb_articles: string[] | null
          context_pages: string[] | null
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string | null
          rating: string
          session_id: string | null
          user_id: string | null
          user_question: string | null
        }
        Insert: {
          ai_response?: string | null
          context_kb_articles?: string[] | null
          context_pages?: string[] | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          rating: string
          session_id?: string | null
          user_id?: string | null
          user_question?: string | null
        }
        Update: {
          ai_response?: string | null
          context_kb_articles?: string[] | null
          context_pages?: string[] | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          rating?: string
          session_id?: string | null
          user_id?: string | null
          user_question?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          action_payload: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          source: string
        }
        Insert: {
          action_payload?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          source?: string
        }
        Update: {
          action_payload?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      clawable_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          response_id: string | null
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          response_id?: string | null
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          response_id?: string | null
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clawable_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "clawable_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      clawable_sessions: {
        Row: {
          agent_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_response_id: string | null
          model: string
          peer_id: string | null
          thread_key: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_response_id?: string | null
          model?: string
          peer_id?: string | null
          thread_key?: string
          title?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_response_id?: string | null
          model?: string
          peer_id?: string | null
          thread_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clawable_sessions_peer_id_fkey"
            columns: ["peer_id"]
            isOneToOne: false
            referencedRelation: "a2a_peers"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          customer_since: string | null
          domain: string | null
          enriched_at: string | null
          id: string
          industry: string | null
          lifecycle_stage: Database["public"]["Enums"]["company_lifecycle_stage"]
          name: string
          notes: string | null
          phone: string | null
          size: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          customer_since?: string | null
          domain?: string | null
          enriched_at?: string | null
          id?: string
          industry?: string | null
          lifecycle_stage?: Database["public"]["Enums"]["company_lifecycle_stage"]
          name: string
          notes?: string | null
          phone?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          customer_since?: string | null
          domain?: string | null
          enriched_at?: string | null
          id?: string
          industry?: string | null
          lifecycle_stage?: Database["public"]["Enums"]["company_lifecycle_stage"]
          name?: string
          notes?: string | null
          phone?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      consultant_profiles: {
        Row: {
          availability: string | null
          avatar_url: string | null
          bio: string | null
          certifications: string[] | null
          created_at: string
          created_by: string | null
          currency: string
          education: Json | null
          email: string | null
          embedded_at: string | null
          embedding: string | null
          embedding_model: string | null
          embedding_status: string
          experience_json: Json | null
          experience_years: number | null
          hourly_rate_cents: number | null
          id: string
          is_active: boolean
          languages: string[] | null
          linkedin_url: string | null
          name: string
          phone: string | null
          portfolio_url: string | null
          search_tsv: unknown
          skills: string[]
          summary: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string
          created_by?: string | null
          currency?: string
          education?: Json | null
          email?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_status?: string
          experience_json?: Json | null
          experience_years?: number | null
          hourly_rate_cents?: number | null
          id?: string
          is_active?: boolean
          languages?: string[] | null
          linkedin_url?: string | null
          name: string
          phone?: string | null
          portfolio_url?: string | null
          search_tsv?: unknown
          skills?: string[]
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string
          created_by?: string | null
          currency?: string
          education?: Json | null
          email?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_status?: string
          experience_json?: Json | null
          experience_years?: number | null
          hourly_rate_cents?: number | null
          id?: string
          is_active?: boolean
          languages?: string[] | null
          linkedin_url?: string | null
          name?: string
          phone?: string | null
          portfolio_url?: string | null
          search_tsv?: unknown
          skills?: string[]
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      content_proposals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          channel_variants: Json | null
          created_at: string
          created_by: string | null
          featured_image: string | null
          id: string
          pillar_content: string | null
          published_channels: string[] | null
          scheduled_for: string | null
          source_research: Json | null
          status: string
          topic: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          channel_variants?: Json | null
          created_at?: string
          created_by?: string | null
          featured_image?: string | null
          id?: string
          pillar_content?: string | null
          published_channels?: string[] | null
          scheduled_for?: string | null
          source_research?: Json | null
          status?: string
          topic: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          channel_variants?: Json | null
          created_at?: string
          created_by?: string | null
          featured_image?: string | null
          id?: string
          pillar_content?: string | null
          published_channels?: string[] | null
          scheduled_for?: string | null
          source_research?: Json | null
          status?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_research: {
        Row: {
          ai_provider: string | null
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          research_data: Json
          target_audience: string | null
          target_channels: string[] | null
          topic: string
          updated_at: string
        }
        Insert: {
          ai_provider?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          research_data: Json
          target_audience?: string | null
          target_channels?: string[] | null
          topic: string
          updated_at?: string
        }
        Update: {
          ai_provider?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          research_data?: Json
          target_audience?: string | null
          target_channels?: string[] | null
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_documents: {
        Row: {
          contract_id: string
          created_at: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          action: string
          comment: string | null
          contract_id: string
          created_at: string
          id: string
          ip_address: string | null
          signature_data: string | null
          signer_email: string | null
          signer_name: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          comment?: string | null
          contract_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          signature_data?: string | null
          signer_email?: string | null
          signer_name?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          comment?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          signature_data?: string | null
          signer_email?: string | null
          signer_name?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          body_markdown: string
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          created_by: string | null
          default_currency: string
          default_renewal_notice_days: number | null
          default_renewal_type: Database["public"]["Enums"]["renewal_type"]
          default_value_cents: number | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          language: string
          name: string
          updated_at: string
        }
        Insert: {
          body_markdown: string
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_renewal_notice_days?: number | null
          default_renewal_type?: Database["public"]["Enums"]["renewal_type"]
          default_value_cents?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          language?: string
          name: string
          updated_at?: string
        }
        Update: {
          body_markdown?: string
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_renewal_notice_days?: number | null
          default_renewal_type?: Database["public"]["Enums"]["renewal_type"]
          default_value_cents?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          language?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_versions: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          snapshot: Json
          version_number: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          snapshot: Json
          version_number: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          accept_token: string | null
          body_markdown: string | null
          body_updated_at: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          counterparty_email: string | null
          counterparty_name: string
          created_at: string
          created_by: string | null
          currency: string
          end_date: string | null
          file_url: string | null
          id: string
          notes: string | null
          renewal_notice_days: number | null
          renewal_type: Database["public"]["Enums"]["renewal_type"]
          sent_at: string | null
          signed_at: string | null
          signer_email: string | null
          signer_ip: string | null
          signer_name: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          template_id: string | null
          terminated_at: string | null
          title: string
          updated_at: string
          value_cents: number | null
          version: number
          viewed_at: string | null
        }
        Insert: {
          accept_token?: string | null
          body_markdown?: string | null
          body_updated_at?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          counterparty_email?: string | null
          counterparty_name: string
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          renewal_notice_days?: number | null
          renewal_type?: Database["public"]["Enums"]["renewal_type"]
          sent_at?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_id?: string | null
          terminated_at?: string | null
          title: string
          updated_at?: string
          value_cents?: number | null
          version?: number
          viewed_at?: string | null
        }
        Update: {
          accept_token?: string | null
          body_markdown?: string | null
          body_updated_at?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          counterparty_email?: string | null
          counterparty_name?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          renewal_notice_days?: number | null
          renewal_type?: Database["public"]["Enums"]["renewal_type"]
          sent_at?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_id?: string | null
          terminated_at?: string | null
          title?: string
          updated_at?: string
          value_cents?: number | null
          version?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          priority: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          decimals: number
          enabled: boolean
          is_base: boolean
          name: string
          symbol: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          decimals?: number
          enabled?: boolean
          is_base?: boolean
          name: string
          symbol?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          decimals?: number
          enabled?: boolean
          is_base?: boolean
          name?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          label: string
          phone: string | null
          postal_code: string
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          country?: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean
          label?: string
          phone?: string | null
          postal_code: string
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          phone?: string | null
          postal_code?: string
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
          id: string
          metadata: Json | null
          scheduled_at: string | null
          title: string | null
          type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string | null
          id?: string
          metadata?: Json | null
          scheduled_at?: string | null
          title?: string | null
          type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          scheduled_at?: string | null
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          expected_close: string | null
          id: string
          lead_id: string
          notes: string | null
          product_id: string | null
          stage: Database["public"]["Enums"]["deal_stage"]
          stage_id: string | null
          updated_at: string
          value_cents: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          product_id?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_id?: string | null
          updated_at?: string
          value_cents?: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          product_id?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_id?: string | null
          updated_at?: string
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_run_items: {
        Row: {
          created_at: string
          id: number
          row_id: string
          run_id: string
          table_name: string
        }
        Insert: {
          created_at?: string
          id?: number
          row_id: string
          run_id: string
          table_name: string
        }
        Update: {
          created_at?: string
          id?: number
          row_id?: string
          run_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "demo_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_runs: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          module: string
          notes: string | null
          result: Json | null
          scenario: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          module: string
          notes?: string | null
          result?: Json | null
          scenario?: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          module?: string
          notes?: string | null
          result?: Json | null
          scenario?: string
          status?: string
        }
        Relationships: []
      }
      depreciation_entries: {
        Row: {
          amount_cents: number
          asset_id: string
          created_at: string
          id: string
          journal_entry_id: string | null
          period_date: string
        }
        Insert: {
          amount_cents: number
          asset_id: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_date: string
        }
        Update: {
          amount_cents?: number
          asset_id?: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      docs_pages: {
        Row: {
          category: string
          content: string
          created_at: string
          file_path: string
          frontmatter: Json
          id: string
          repo_name: string
          repo_owner: string
          sha: string
          slug: string
          sort_order: number
          synced_at: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          file_path: string
          frontmatter?: Json
          id?: string
          repo_name: string
          repo_owner: string
          sha?: string
          slug?: string
          sort_order?: number
          synced_at?: string
          title?: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          file_path?: string
          frontmatter?: Json
          id?: string
          repo_name?: string
          repo_owner?: string
          sha?: string
          slug?: string
          sort_order?: number
          synced_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: string
          content_extracted_at: string | null
          content_md: string | null
          created_at: string
          description: string | null
          extraction_error: string | null
          extraction_status: string
          file_name: string
          file_size_bytes: number | null
          file_type: string | null
          file_url: string
          folder: string | null
          id: string
          related_entity_id: string | null
          related_entity_type: string | null
          source: string
          tags: string[] | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          content_extracted_at?: string | null
          content_md?: string | null
          created_at?: string
          description?: string | null
          extraction_error?: string | null
          extraction_status?: string
          file_name: string
          file_size_bytes?: number | null
          file_type?: string | null
          file_url: string
          folder?: string | null
          id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          source?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          content_extracted_at?: string | null
          content_md?: string | null
          created_at?: string
          description?: string | null
          extraction_error?: string | null
          extraction_status?: string
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string
          folder?: string | null
          id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          source?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      dunning_actions: {
        Row: {
          action_type: string
          created_at: string
          email_message_id: string | null
          email_template: string | null
          error_message: string | null
          id: string
          metadata: Json
          recipient_email: string | null
          sequence_id: string
          step_number: number
          triggered_by: string
        }
        Insert: {
          action_type: string
          created_at?: string
          email_message_id?: string | null
          email_template?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          recipient_email?: string | null
          sequence_id: string
          step_number: number
          triggered_by?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          email_message_id?: string | null
          email_template?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          recipient_email?: string | null
          sequence_id?: string
          step_number?: number
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "dunning_actions_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "dunning_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_sequences: {
        Row: {
          attempt_count: number
          cancelled_at: string | null
          created_at: string
          currency: string
          current_step: number
          failure_code: string | null
          failure_reason: string | null
          id: string
          metadata: Json
          mrr_at_risk_cents: number
          next_action_at: string | null
          paused_reason: string | null
          paused_until: string | null
          provider_invoice_id: string | null
          recovered_at: string | null
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_step?: number
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          mrr_at_risk_cents?: number
          next_action_at?: string | null
          paused_reason?: string | null
          paused_until?: string | null
          provider_invoice_id?: string | null
          recovered_at?: string | null
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_step?: number
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          mrr_at_risk_cents?: number
          next_action_at?: string | null
          paused_reason?: string | null
          paused_until?: string | null
          provider_invoice_id?: string | null
          recovered_at?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dunning_sequences_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          category: string
          created_at: string
          employee_id: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          employee_id: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          employee_id?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_skills: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          proficiency_level: number | null
          skill_id: string
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          proficiency_level?: number | null
          skill_id: string
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          proficiency_level?: number | null
          skill_id?: string
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_skills_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          created_by: string | null
          department: string | null
          email: string | null
          emergency_contact: Json | null
          employment_type: string
          end_date: string | null
          id: string
          manager_id: string | null
          monthly_salary_cents: number
          name: string
          notes: string | null
          personal_number: string | null
          phone: string | null
          start_date: string | null
          status: string
          tax_rate_pct: number
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          emergency_contact?: Json | null
          employment_type?: string
          end_date?: string | null
          id?: string
          manager_id?: string | null
          monthly_salary_cents?: number
          name: string
          notes?: string | null
          personal_number?: string | null
          phone?: string | null
          start_date?: string | null
          status?: string
          tax_rate_pct?: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          emergency_contact?: Json | null
          employment_type?: string
          end_date?: string | null
          id?: string
          manager_id?: string | null
          monthly_salary_cents?: number
          name?: string
          notes?: string | null
          personal_number?: string | null
          phone?: string | null
          start_date?: string | null
          status?: string
          tax_rate_pct?: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_contract_templates: {
        Row: {
          body_markdown: string
          created_at: string
          created_by: string | null
          default_notice_period_days: number | null
          default_probation_months: number | null
          description: string | null
          employment_type: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          body_markdown?: string
          created_at?: string
          created_by?: string | null
          default_notice_period_days?: number | null
          default_probation_months?: number | null
          description?: string | null
          employment_type?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          body_markdown?: string
          created_at?: string
          created_by?: string | null
          default_notice_period_days?: number | null
          default_probation_months?: number | null
          description?: string | null
          employment_type?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      employment_contracts: {
        Row: {
          body_markdown: string
          created_at: string
          created_by: string | null
          currency: string
          employee_id: string
          employment_type: string
          end_date: string | null
          hourly_rate_cents: number | null
          id: string
          metadata: Json
          monthly_salary_cents: number | null
          notice_period_days: number | null
          probation_end_date: string | null
          sent_at: string | null
          signed_at: string | null
          signed_by_employee_at: string | null
          signed_by_employer_at: string | null
          start_date: string
          status: string
          template_id: string | null
          terminated_at: string | null
          termination_reason: string | null
          title: string
          updated_at: string
          weekly_hours: number | null
        }
        Insert: {
          body_markdown?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          employee_id: string
          employment_type?: string
          end_date?: string | null
          hourly_rate_cents?: number | null
          id?: string
          metadata?: Json
          monthly_salary_cents?: number | null
          notice_period_days?: number | null
          probation_end_date?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_by_employee_at?: string | null
          signed_by_employer_at?: string | null
          start_date: string
          status?: string
          template_id?: string | null
          terminated_at?: string | null
          termination_reason?: string | null
          title: string
          updated_at?: string
          weekly_hours?: number | null
        }
        Update: {
          body_markdown?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          employee_id?: string
          employment_type?: string
          end_date?: string | null
          hourly_rate_cents?: number | null
          id?: string
          metadata?: Json
          monthly_salary_cents?: number | null
          notice_period_days?: number | null
          probation_end_date?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_by_employee_at?: string | null
          signed_by_employer_at?: string | null
          start_date?: string
          status?: string
          template_id?: string | null
          terminated_at?: string | null
          termination_reason?: string | null
          title?: string
          updated_at?: string
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employment_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "employment_contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_followers: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      entity_tags: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_currency: string
          created_at: string
          id: string
          quote_currency: string
          rate: number
          rate_date: string
          source: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          id?: string
          quote_currency: string
          rate: number
          rate_date?: string
          source?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          id?: string
          quote_currency?: string
          rate?: number
          rate_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exchange_rates_quote_currency_fkey"
            columns: ["quote_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      expense_attachments: {
        Row: {
          created_at: string
          expense_id: string
          file_name: string | null
          file_size_bytes: number | null
          file_type: string | null
          file_url: string
          id: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url: string
          id?: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_attachments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          journal_entry_id: string | null
          method: string
          notes: string | null
          paid_at: string
          recorded_by: string | null
          reference: string | null
          report_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          report_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          report_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "expense_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          currency: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          period: string
          status: string
          submitted_at: string | null
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          period: string
          status?: string
          submitted_at?: string | null
          total_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          period?: string
          status?: string
          submitted_at?: string | null
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_reports_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_code: string | null
          amount_cents: number
          attendees: Json | null
          category: string
          created_at: string
          currency: string
          description: string
          exchange_rate: number
          expense_date: string
          id: string
          is_representation: boolean
          payroll_export_id: string | null
          receipt_analyzed: boolean
          receipt_data: Json | null
          receipt_url: string | null
          report_id: string | null
          status: string
          updated_at: string
          user_id: string
          vat_cents: number
          vendor: string | null
        }
        Insert: {
          account_code?: string | null
          amount_cents?: number
          attendees?: Json | null
          category?: string
          created_at?: string
          currency?: string
          description?: string
          exchange_rate?: number
          expense_date?: string
          id?: string
          is_representation?: boolean
          payroll_export_id?: string | null
          receipt_analyzed?: boolean
          receipt_data?: Json | null
          receipt_url?: string | null
          report_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vat_cents?: number
          vendor?: string | null
        }
        Update: {
          account_code?: string | null
          amount_cents?: number
          attendees?: Json | null
          category?: string
          created_at?: string
          currency?: string
          description?: string
          exchange_rate?: number
          expense_date?: string
          id?: string
          is_representation?: boolean
          payroll_export_id?: string | null
          receipt_analyzed?: boolean
          receipt_data?: Json | null
          receipt_url?: string | null
          report_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vat_cents?: number
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_payroll_export_id_fkey"
            columns: ["payroll_export_id"]
            isOneToOne: false
            referencedRelation: "payroll_exports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "expense_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      federation_connections: {
        Row: {
          api_key_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["connection_direction"]
          endpoint_url: string | null
          id: string
          last_activity_at: string | null
          metadata: Json
          outbound_token: string | null
          peer_id: string
          request_count: number
          status: string
          transport: Database["public"]["Enums"]["connection_transport"]
          updated_at: string
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["connection_direction"]
          endpoint_url?: string | null
          id?: string
          last_activity_at?: string | null
          metadata?: Json
          outbound_token?: string | null
          peer_id: string
          request_count?: number
          status?: string
          transport: Database["public"]["Enums"]["connection_transport"]
          updated_at?: string
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["connection_direction"]
          endpoint_url?: string | null
          id?: string
          last_activity_at?: string | null
          metadata?: Json
          outbound_token?: string | null
          peer_id?: string
          request_count?: number
          status?: string
          transport?: Database["public"]["Enums"]["connection_transport"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "federation_connections_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "federation_connections_peer_id_fkey"
            columns: ["peer_id"]
            isOneToOne: false
            referencedRelation: "a2a_peers"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          comments: string | null
          created_at: string
          feedback_type: string
          giver_id: string | null
          giver_user_id: string | null
          id: string
          improvements: string | null
          is_anonymous: boolean
          rating: number | null
          receiver_id: string
          related_review_id: string | null
          strengths: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          feedback_type?: string
          giver_id?: string | null
          giver_user_id?: string | null
          id?: string
          improvements?: string | null
          is_anonymous?: boolean
          rating?: number | null
          receiver_id: string
          related_review_id?: string | null
          strengths?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          feedback_type?: string
          giver_id?: string | null
          giver_user_id?: string | null
          id?: string
          improvements?: string | null
          is_anonymous?: boolean
          rating?: number | null
          receiver_id?: string
          related_review_id?: string | null
          strengths?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_giver_id_fkey"
            columns: ["giver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          accumulated_account: string
          accumulated_cents: number
          asset_account: string
          cost_cents: number
          created_at: string
          declining_rate: number | null
          depreciation_account: string
          depreciation_method: string
          description: string | null
          disposed_amount_cents: number | null
          disposed_at: string | null
          id: string
          in_service_date: string
          name: string
          purchase_date: string
          salvage_cents: number
          status: string
          updated_at: string
          useful_life_months: number
        }
        Insert: {
          accumulated_account?: string
          accumulated_cents?: number
          asset_account?: string
          cost_cents: number
          created_at?: string
          declining_rate?: number | null
          depreciation_account?: string
          depreciation_method?: string
          description?: string | null
          disposed_amount_cents?: number | null
          disposed_at?: string | null
          id?: string
          in_service_date?: string
          name: string
          purchase_date?: string
          salvage_cents?: number
          status?: string
          updated_at?: string
          useful_life_months: number
        }
        Update: {
          accumulated_account?: string
          accumulated_cents?: number
          asset_account?: string
          cost_cents?: number
          created_at?: string
          declining_rate?: number | null
          depreciation_account?: string
          depreciation_method?: string
          description?: string | null
          disposed_amount_cents?: number | null
          disposed_at?: string | null
          id?: string
          in_service_date?: string
          name?: string
          purchase_date?: string
          salvage_cents?: number
          status?: string
          updated_at?: string
          useful_life_months?: number
        }
        Relationships: []
      }
      flowpilot_briefings: {
        Row: {
          action_items: Json
          created_at: string
          emailed_at: string | null
          id: string
          metrics: Json
          read_at: string | null
          sections: Json
          summary: string
          title: string
          type: string
        }
        Insert: {
          action_items?: Json
          created_at?: string
          emailed_at?: string | null
          id?: string
          metrics?: Json
          read_at?: string | null
          sections?: Json
          summary: string
          title: string
          type?: string
        }
        Update: {
          action_items?: Json
          created_at?: string
          emailed_at?: string | null
          id?: string
          metrics?: Json
          read_at?: string | null
          sections?: Json
          summary?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          block_id: string
          created_at: string
          data: Json
          form_name: string | null
          id: string
          metadata: Json | null
          page_id: string | null
        }
        Insert: {
          block_id: string
          created_at?: string
          data?: Json
          form_name?: string | null
          id?: string
          metadata?: Json | null
          page_id?: string | null
        }
        Update: {
          block_id?: string
          created_at?: string
          data?: Json
          form_name?: string | null
          id?: string
          metadata?: Json | null
          page_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      global_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          is_active: boolean
          slot: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          slot: string
          type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          slot?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      goods_receipt_lines: {
        Row: {
          created_at: string
          goods_receipt_id: string
          id: string
          po_line_id: string
          quantity_received: number
        }
        Insert: {
          created_at?: string
          goods_receipt_id: string
          id?: string
          po_line_id: string
          quantity_received?: number
        }
        Update: {
          created_at?: string
          goods_receipt_id?: string
          id?: string
          po_line_id?: string
          quantity_received?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_lines_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          purchase_order_id: string
          received_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_order_id: string
          received_date?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_order_id?: string
          received_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      handbook_chapters: {
        Row: {
          content: string
          created_at: string
          file_path: string
          frontmatter: Json
          id: string
          repo_name: string
          repo_owner: string
          sha: string
          slug: string
          sort_order: number
          synced_at: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          file_path: string
          frontmatter?: Json
          id?: string
          repo_name: string
          repo_owner: string
          sha?: string
          slug?: string
          sort_order?: number
          synced_at?: string
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          file_path?: string
          frontmatter?: Json
          id?: string
          repo_name?: string
          repo_owner?: string
          sha?: string
          slug?: string
          sort_order?: number
          synced_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      installed_template: {
        Row: {
          id: string
          installed_at: string
          manifest: Json
          template_id: string
          template_name: string
        }
        Insert: {
          id?: string
          installed_at?: string
          manifest?: Json
          template_id: string
          template_name: string
        }
        Update: {
          id?: string
          installed_at?: string
          manifest?: Json
          template_id?: string
          template_name?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          deal_id: string | null
          due_date: string | null
          exchange_rate: number
          id: string
          invoice_number: string
          issue_date: string
          lead_id: string | null
          line_items: Json
          notes: string | null
          paid_amount_cents: number
          paid_at: string | null
          payment_terms: string | null
          payment_url: string | null
          project_id: string | null
          public_token: string | null
          reconciliation_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          deal_id?: string | null
          due_date?: string | null
          exchange_rate?: number
          id?: string
          invoice_number: string
          issue_date?: string
          lead_id?: string | null
          line_items?: Json
          notes?: string | null
          paid_amount_cents?: number
          paid_at?: string | null
          payment_terms?: string | null
          payment_url?: string | null
          project_id?: string | null
          public_token?: string | null
          reconciliation_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          tax_cents?: number
          tax_rate?: number
          total_cents?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          deal_id?: string | null
          due_date?: string | null
          exchange_rate?: number
          id?: string
          invoice_number?: string
          issue_date?: string
          lead_id?: string | null
          line_items?: Json
          notes?: string | null
          paid_amount_cents?: number
          paid_at?: string | null
          payment_terms?: string | null
          payment_url?: string | null
          project_id?: string | null
          public_token?: string | null
          reconciliation_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          tax_cents?: number
          tax_rate?: number
          total_cents?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "payment_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          department: string | null
          description: string | null
          employment_type: Database["public"]["Enums"]["employment_kind"]
          external_apply_url: string | null
          hero_image_url: string | null
          hiring_manager_id: string | null
          id: string
          location: string | null
          meta: Json
          nice_to_have_skills: string[] | null
          perks: string[] | null
          published_at: string | null
          remote_policy: string | null
          required_skills: string[] | null
          requirements: string | null
          responsibilities: string | null
          salary_max_cents: number | null
          salary_min_cents: number | null
          slug: string
          status: Database["public"]["Enums"]["job_posting_status"]
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          department?: string | null
          description?: string | null
          employment_type?: Database["public"]["Enums"]["employment_kind"]
          external_apply_url?: string | null
          hero_image_url?: string | null
          hiring_manager_id?: string | null
          id?: string
          location?: string | null
          meta?: Json
          nice_to_have_skills?: string[] | null
          perks?: string[] | null
          published_at?: string | null
          remote_policy?: string | null
          required_skills?: string[] | null
          requirements?: string | null
          responsibilities?: string | null
          salary_max_cents?: number | null
          salary_min_cents?: number | null
          slug: string
          status?: Database["public"]["Enums"]["job_posting_status"]
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          department?: string | null
          description?: string | null
          employment_type?: Database["public"]["Enums"]["employment_kind"]
          external_apply_url?: string | null
          hero_image_url?: string | null
          hiring_manager_id?: string | null
          id?: string
          location?: string | null
          meta?: Json
          nice_to_have_skills?: string[] | null
          perks?: string[] | null
          published_at?: string | null
          remote_policy?: string | null
          required_skills?: string[] | null
          requirements?: string | null
          responsibilities?: string | null
          salary_max_cents?: number | null
          salary_min_cents?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["job_posting_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          id: string
          invoice_id: string | null
          journal_id: string | null
          reference_number: string | null
          source: string
          status: string
          template_id: string | null
          updated_at: string
          vendor_id: string | null
          voucher_number: number | null
          voucher_series: string | null
          voucher_year: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          id?: string
          invoice_id?: string | null
          journal_id?: string | null
          reference_number?: string | null
          source?: string
          status?: string
          template_id?: string | null
          updated_at?: string
          vendor_id?: string | null
          voucher_number?: number | null
          voucher_series?: string | null
          voucher_year?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          id?: string
          invoice_id?: string | null
          journal_id?: string | null
          reference_number?: string | null
          source?: string
          status?: string
          template_id?: string | null
          updated_at?: string
          vendor_id?: string | null
          voucher_number?: number | null
          voucher_series?: string | null
          voucher_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "accounting_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_line_taxes: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          journal_entry_line_id: string
          tax_code_id: string
          tax_grid_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          journal_entry_line_id: string
          tax_code_id: string
          tax_grid_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          journal_entry_line_id?: string
          tax_code_id?: string
          tax_grid_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_line_taxes_journal_entry_line_id_fkey"
            columns: ["journal_entry_line_id"]
            isOneToOne: false
            referencedRelation: "journal_entry_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_line_taxes_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_line_taxes_tax_grid_id_fkey"
            columns: ["tax_grid_id"]
            isOneToOne: false
            referencedRelation: "tax_grids"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_code: string
          account_name: string
          created_at: string
          credit_cents: number
          debit_cents: number
          description: string | null
          id: string
          journal_entry_id: string
          tax_amount_cents: number | null
          tax_base_cents: number | null
          tax_code_id: string | null
        }
        Insert: {
          account_code: string
          account_name: string
          created_at?: string
          credit_cents?: number
          debit_cents?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          tax_amount_cents?: number | null
          tax_base_cents?: number | null
          tax_code_id?: string | null
        }
        Update: {
          account_code?: string
          account_name?: string
          created_at?: string
          credit_cents?: number
          debit_cents?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          tax_amount_cents?: number | null
          tax_base_cents?: number | null
          tax_code_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      journals: {
        Row: {
          code: string
          created_at: string
          currency: string
          default_account_code: string | null
          description: string | null
          id: string
          is_active: boolean
          journal_type: string
          name: string
          sequence_prefix: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          default_account_code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          journal_type: string
          name: string
          sequence_prefix?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          default_account_code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          journal_type?: string
          name?: string
          sequence_prefix?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kb_articles: {
        Row: {
          answer_json: Json | null
          answer_text: string | null
          category_id: string
          created_at: string
          created_by: string | null
          helpful_count: number | null
          id: string
          include_in_chat: boolean | null
          is_featured: boolean | null
          is_published: boolean | null
          meta_json: Json | null
          needs_improvement: boolean | null
          negative_feedback_count: number | null
          not_helpful_count: number | null
          positive_feedback_count: number | null
          question: string
          slug: string
          sort_order: number | null
          title: string
          updated_at: string
          updated_by: string | null
          views_count: number | null
        }
        Insert: {
          answer_json?: Json | null
          answer_text?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          helpful_count?: number | null
          id?: string
          include_in_chat?: boolean | null
          is_featured?: boolean | null
          is_published?: boolean | null
          meta_json?: Json | null
          needs_improvement?: boolean | null
          negative_feedback_count?: number | null
          not_helpful_count?: number | null
          positive_feedback_count?: number | null
          question: string
          slug: string
          sort_order?: number | null
          title: string
          updated_at?: string
          updated_by?: string | null
          views_count?: number | null
        }
        Update: {
          answer_json?: Json | null
          answer_text?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          helpful_count?: number | null
          id?: string
          include_in_chat?: boolean | null
          is_featured?: boolean | null
          is_published?: boolean | null
          meta_json?: Json | null
          needs_improvement?: boolean | null
          negative_feedback_count?: number | null
          not_helpful_count?: number | null
          positive_feedback_count?: number | null
          question?: string
          slug?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          metadata: Json | null
          points: number | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          metadata?: Json | null
          points?: number | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          points?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ai_qualified_at: string | null
          ai_summary: string | null
          assigned_to: string | null
          company_id: string | null
          converted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          name: string | null
          needs_review: boolean | null
          phone: string | null
          score: number | null
          source: string
          source_id: string | null
          stage_id: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          ai_qualified_at?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          company_id?: string | null
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          name?: string | null
          needs_review?: boolean | null
          phone?: string | null
          score?: number | null
          source?: string
          source_id?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          ai_qualified_at?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          company_id?: string | null
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          name?: string | null
          needs_review?: boolean | null
          phone?: string | null
          score?: number | null
          source?: string
          source_id?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_allocations: {
        Row: {
          allocated_days: number
          carried_over_days: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          leave_type: string
          notes: string | null
          updated_at: string
          year: number
        }
        Insert: {
          allocated_days?: number
          carried_over_days?: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          leave_type: string
          notes?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          allocated_days?: number
          carried_over_days?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          leave_type?: string
          notes?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_allocations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          notes: string | null
          payroll_export_id: string | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days?: number
          employee_id: string
          end_date: string
          id?: string
          leave_type?: string
          notes?: string | null
          payroll_export_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          notes?: string | null
          payroll_export_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_payroll_export_id_fkey"
            columns: ["payroll_export_id"]
            isOneToOne: false
            referencedRelation: "payroll_exports"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturing_orders: {
        Row: {
          bom_id: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          mo_number: string
          notes: string | null
          product_id: string
          quantity: number
          source_id: string | null
          source_type: string
          started_at: string | null
          status: Database["public"]["Enums"]["mo_status"]
          updated_at: string
        }
        Insert: {
          bom_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          mo_number: string
          notes?: string | null
          product_id: string
          quantity: number
          source_id?: string | null
          source_type?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["mo_status"]
          updated_at?: string
        }
        Update: {
          bom_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          mo_number?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          source_id?: string | null
          source_type?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["mo_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_components: {
        Row: {
          availability: string
          component_product_id: string
          created_at: string
          id: string
          mo_id: string
          qty_consumed: number
          qty_required: number
        }
        Insert: {
          availability?: string
          component_product_id: string
          created_at?: string
          id?: string
          mo_id: string
          qty_consumed?: number
          qty_required: number
        }
        Update: {
          availability?: string
          component_product_id?: string
          created_at?: string
          id?: string
          mo_id?: string
          qty_consumed?: number
          qty_required?: number
        }
        Relationships: [
          {
            foreignKeyName: "mo_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_components_mo_id_fkey"
            columns: ["mo_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_email_opens: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          newsletter_id: string
          opened_at: string | null
          opens_count: number
          recipient_email: string
          tracking_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          newsletter_id: string
          opened_at?: string | null
          opens_count?: number
          recipient_email: string
          tracking_id?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          newsletter_id?: string
          opened_at?: string | null
          opens_count?: number
          recipient_email?: string
          tracking_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_email_opens_newsletter_id_fkey"
            columns: ["newsletter_id"]
            isOneToOne: false
            referencedRelation: "newsletters"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_link_clicks: {
        Row: {
          click_count: number
          clicked_at: string | null
          created_at: string
          id: string
          ip_address: string | null
          link_id: string
          newsletter_id: string
          original_url: string
          recipient_email: string
          user_agent: string | null
        }
        Insert: {
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          link_id?: string
          newsletter_id: string
          original_url: string
          recipient_email: string
          user_agent?: string | null
        }
        Update: {
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          link_id?: string
          newsletter_id?: string
          original_url?: string
          recipient_email?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_link_clicks_newsletter_id_fkey"
            columns: ["newsletter_id"]
            isOneToOne: false
            referencedRelation: "newsletters"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string
          email: string
          id: string
          metadata: Json | null
          name: string | null
          preferences: Json | null
          status: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          name?: string | null
          preferences?: Json | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          name?: string | null
          preferences?: Json | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      newsletters: {
        Row: {
          click_count: number | null
          content_html: string | null
          content_json: Json | null
          created_at: string
          created_by: string | null
          id: string
          open_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number | null
          status: string
          subject: string
          unique_clicks: number | null
          unique_opens: number | null
          updated_at: string
        }
        Insert: {
          click_count?: number | null
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          open_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          subject: string
          unique_clicks?: number | null
          unique_opens?: number | null
          updated_at?: string
        }
        Update: {
          click_count?: number | null
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          open_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          subject?: string
          unique_clicks?: number | null
          unique_opens?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_checklists: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          items: Json
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          items?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          items?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklists_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          employment_type: string | null
          id: string
          is_active: boolean
          is_default: boolean
          items: Json
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          employment_type?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          items?: Json
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          employment_type?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          items?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      one_on_ones: {
        Row: {
          action_items: Json
          agenda: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number
          employee_id: string
          employee_mood: string | null
          id: string
          manager_id: string
          notes: string | null
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          action_items?: Json
          agenda?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          employee_id: string
          employee_mood?: string | null
          id?: string
          manager_id: string
          notes?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_items?: Json
          agenda?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          employee_id?: string
          employee_mood?: string | null
          id?: string
          manager_id?: string
          notes?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_on_ones_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "one_on_ones_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_balances: {
        Row: {
          account_code: string
          account_name: string
          amount_cents: number
          balance_type: string
          created_at: string
          fiscal_year: number
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          account_code: string
          account_name: string
          amount_cents?: number
          balance_type?: string
          created_at?: string
          fiscal_year?: number
          id?: string
          locale?: string
          updated_at?: string
        }
        Update: {
          account_code?: string
          account_name?: string
          amount_cents?: number
          balance_type?: string
          created_at?: string
          fiscal_year?: number
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price_cents: number
          product_id: string | null
          product_name: string
          qty_fulfilled: number
          quantity: number
          tax_rate_pct: number | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price_cents: number
          product_id?: string | null
          product_name: string
          qty_fulfilled?: number
          quantity?: number
          tax_rate_pct?: number | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price_cents?: number
          product_id?: string | null
          product_name?: string
          qty_fulfilled?: number
          quantity?: number
          tax_rate_pct?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          company_id: string | null
          confirmation_sent_at: string | null
          created_at: string
          currency: string
          customer_email: string
          customer_name: string | null
          delivered_at: string | null
          exchange_rate: number
          fulfillment_notes: string | null
          fulfillment_status: string
          id: string
          metadata: Json | null
          packed_at: string | null
          picked_at: string | null
          shipped_at: string | null
          status: string
          stripe_checkout_id: string | null
          stripe_payment_intent: string | null
          total_cents: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          currency?: string
          customer_email: string
          customer_name?: string | null
          delivered_at?: string | null
          exchange_rate?: number
          fulfillment_notes?: string | null
          fulfillment_status?: string
          id?: string
          metadata?: Json | null
          packed_at?: string | null
          picked_at?: string | null
          shipped_at?: string | null
          status?: string
          stripe_checkout_id?: string | null
          stripe_payment_intent?: string | null
          total_cents: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          currency?: string
          customer_email?: string
          customer_name?: string | null
          delivered_at?: string | null
          exchange_rate?: number
          fulfillment_notes?: string | null
          fulfillment_status?: string
          id?: string
          metadata?: Json | null
          packed_at?: string | null
          picked_at?: string | null
          shipped_at?: string | null
          status?: string
          stripe_checkout_id?: string | null
          stripe_payment_intent?: string | null
          total_cents?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      page_versions: {
        Row: {
          content_json: Json
          created_at: string
          created_by: string | null
          id: string
          meta_json: Json | null
          page_id: string
          title: string
        }
        Insert: {
          content_json: Json
          created_at?: string
          created_by?: string | null
          id?: string
          meta_json?: Json | null
          page_id: string
          title: string
        }
        Update: {
          content_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          meta_json?: Json | null
          page_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_versions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          id: string
          ip_address: string | null
          page_id: string | null
          page_slug: string
          page_title: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          visitor_id: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          page_id?: string | null
          page_slug: string
          page_title?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          visitor_id?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          page_id?: string | null
          page_slug?: string
          page_title?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_views_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          content_json: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          menu_order: number
          meta_json: Json | null
          scheduled_at: string | null
          show_in_menu: boolean
          slug: string
          status: Database["public"]["Enums"]["page_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          menu_order?: number
          meta_json?: Json | null
          scheduled_at?: string | null
          show_in_menu?: boolean
          slug: string
          status?: Database["public"]["Enums"]["page_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          menu_order?: number
          meta_json?: Json | null
          scheduled_at?: string | null
          show_in_menu?: boolean
          slug?: string
          status?: Database["public"]["Enums"]["page_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payment_reconciliations: {
        Row: {
          created_at: string
          currency: string
          id: string
          invoice_id: string
          invoice_total_cents: number
          journal_entry_id: string | null
          notes: string | null
          reconciled_amount_cents: number
          reconciled_at: string
          reconciled_by: string | null
          reversal_journal_entry_id: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          invoice_id: string
          invoice_total_cents: number
          journal_entry_id?: string | null
          notes?: string | null
          reconciled_amount_cents?: number
          reconciled_at?: string
          reconciled_by?: string | null
          reversal_journal_entry_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string
          invoice_total_cents?: number
          journal_entry_id?: string | null
          notes?: string | null
          reconciled_amount_cents?: number
          reconciled_at?: string
          reconciled_by?: string | null
          reversal_journal_entry_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reconciliations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reconciliations_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reconciliations_reversal_journal_entry_id_fkey"
            columns: ["reversal_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_components: {
        Row: {
          active: boolean
          amount_cents: number
          component_type: string
          created_at: string
          employee_id: string
          id: string
          label: string
          recurring: boolean
          taxable: boolean
        }
        Insert: {
          active?: boolean
          amount_cents?: number
          component_type: string
          created_at?: string
          employee_id: string
          id?: string
          label: string
          recurring?: boolean
          taxable?: boolean
        }
        Update: {
          active?: boolean
          amount_cents?: number
          component_type?: string
          created_at?: string
          employee_id?: string
          id?: string
          label?: string
          recurring?: boolean
          taxable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payroll_components_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_export_lines: {
        Row: {
          created_at: string
          employee_email: string | null
          employee_id: string
          employee_name: string
          expense_count: number
          expense_ids: string[]
          expense_reimbursement_cents: number
          export_id: string
          id: string
          leave_request_ids: string[]
          other_leave_days: number
          parental_days: number
          personal_number: string | null
          representation_cents: number
          sick_days: number
          vacation_days: number
        }
        Insert: {
          created_at?: string
          employee_email?: string | null
          employee_id: string
          employee_name: string
          expense_count?: number
          expense_ids?: string[]
          expense_reimbursement_cents?: number
          export_id: string
          id?: string
          leave_request_ids?: string[]
          other_leave_days?: number
          parental_days?: number
          personal_number?: string | null
          representation_cents?: number
          sick_days?: number
          vacation_days?: number
        }
        Update: {
          created_at?: string
          employee_email?: string | null
          employee_id?: string
          employee_name?: string
          expense_count?: number
          expense_ids?: string[]
          expense_reimbursement_cents?: number
          export_id?: string
          id?: string
          leave_request_ids?: string[]
          other_leave_days?: number
          parental_days?: number
          personal_number?: string | null
          representation_cents?: number
          sick_days?: number
          vacation_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_export_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_lines_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "payroll_exports"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_exports: {
        Row: {
          created_at: string
          csv_content: string | null
          currency: string
          format: string
          generated_at: string | null
          generated_by: string | null
          id: string
          locked_at: string | null
          notes: string | null
          paxml_content: string | null
          period_month: number
          period_year: number
          status: string
          total_employees: number
          total_expense_cents: number
          total_leave_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          csv_content?: string | null
          currency?: string
          format?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          paxml_content?: string | null
          period_month: number
          period_year: number
          status?: string
          total_employees?: number
          total_expense_cents?: number
          total_leave_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          csv_content?: string | null
          currency?: string
          format?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          paxml_content?: string | null
          period_month?: number
          period_year?: number
          status?: string
          total_employees?: number
          total_expense_cents?: number
          total_leave_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      payroll_lines: {
        Row: {
          benefits_cents: number
          components: Json
          created_at: string
          deductions_cents: number
          employee_id: string
          gross_cents: number
          id: string
          net_cents: number
          run_id: string
          social_fee_cents: number
          tax_cents: number
          taxable_cents: number
        }
        Insert: {
          benefits_cents?: number
          components?: Json
          created_at?: string
          deductions_cents?: number
          employee_id: string
          gross_cents?: number
          id?: string
          net_cents?: number
          run_id: string
          social_fee_cents?: number
          tax_cents?: number
          taxable_cents?: number
        }
        Update: {
          benefits_cents?: number
          components?: Json
          created_at?: string
          deductions_cents?: number
          employee_id?: string
          gross_cents?: number
          id?: string
          net_cents?: number
          run_id?: string
          social_fee_cents?: number
          tax_cents?: number
          taxable_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approval_journal_id: string | null
          approved_at: string | null
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_journal_id: string | null
          period_date: string
          status: string
          total_gross_cents: number
          total_net_cents: number
          total_social_fee_cents: number
          total_tax_cents: number
        }
        Insert: {
          approval_journal_id?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_journal_id?: string | null
          period_date: string
          status?: string
          total_gross_cents?: number
          total_net_cents?: number
          total_social_fee_cents?: number
          total_tax_cents?: number
        }
        Update: {
          approval_journal_id?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_journal_id?: string | null
          period_date?: string
          status?: string
          total_gross_cents?: number
          total_net_cents?: number
          total_social_fee_cents?: number
          total_tax_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_approval_journal_id_fkey"
            columns: ["approval_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_payment_journal_id_fkey"
            columns: ["payment_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_invitations: {
        Row: {
          created_at: string
          id: string
          invitee_name: string
          invitee_peer_id: string
          invitee_url: string | null
          inviter_peer_id: string | null
          metadata: Json
          reason: string | null
          toolset_groups: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_name: string
          invitee_peer_id: string
          invitee_url?: string | null
          inviter_peer_id?: string | null
          metadata?: Json
          reason?: string | null
          toolset_groups?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          invitee_name?: string
          invitee_peer_id?: string
          invitee_url?: string | null
          inviter_peer_id?: string | null
          metadata?: Json
          reason?: string | null
          toolset_groups?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "peer_invitations_invitee_peer_id_fkey"
            columns: ["invitee_peer_id"]
            isOneToOne: false
            referencedRelation: "a2a_peers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_invitations_inviter_peer_id_fkey"
            columns: ["inviter_peer_id"]
            isOneToOne: false
            referencedRelation: "a2a_peers"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_operations: {
        Row: {
          args: Json
          conversation_id: string | null
          created_at: string
          created_by_agent: string | null
          created_by_user_id: string | null
          executed_at: string | null
          execution_result: Json | null
          expires_at: string
          id: string
          period_status: string | null
          preview: Json
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string
          skill_id: string | null
          skill_name: string
          status: string
          updated_at: string
        }
        Insert: {
          args?: Json
          conversation_id?: string | null
          created_at?: string
          created_by_agent?: string | null
          created_by_user_id?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          period_status?: string | null
          preview?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          skill_id?: string | null
          skill_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          args?: Json
          conversation_id?: string | null
          created_at?: string
          created_by_agent?: string | null
          created_by_user_id?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          period_status?: string | null
          preview?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          skill_id?: string | null
          skill_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_operations_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_goals: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string
          id: string
          progress_pct: number
          status: string
          target_date: string | null
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id: string
          id?: string
          progress_pct?: number
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          progress_pct?: number
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          achievements: string | null
          acknowledged_at: string | null
          areas_of_improvement: string | null
          created_at: string
          employee_comments: string | null
          employee_id: string
          goals_next_period: string | null
          id: string
          manager_comments: string | null
          overall_rating: number | null
          period_end: string
          period_start: string
          period_type: string
          promotion_recommended: boolean
          reviewer_id: string | null
          salary_adjustment_pct: number | null
          status: string
          updated_at: string
        }
        Insert: {
          achievements?: string | null
          acknowledged_at?: string | null
          areas_of_improvement?: string | null
          created_at?: string
          employee_comments?: string | null
          employee_id: string
          goals_next_period?: string | null
          id?: string
          manager_comments?: string | null
          overall_rating?: number | null
          period_end: string
          period_start: string
          period_type?: string
          promotion_recommended?: boolean
          reviewer_id?: string | null
          salary_adjustment_pct?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          achievements?: string | null
          acknowledged_at?: string | null
          areas_of_improvement?: string | null
          created_at?: string
          employee_comments?: string | null
          employee_id?: string
          goals_next_period?: string | null
          id?: string
          manager_comments?: string | null
          overall_rating?: number | null
          period_end?: string
          period_start?: string
          period_type?: string
          promotion_recommended?: boolean
          reviewer_id?: string | null
          salary_adjustment_pct?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_lines: {
        Row: {
          created_at: string
          id: string
          lot_id: string | null
          notes: string | null
          picked_at: string | null
          picked_by: string | null
          picking_order_id: string
          product_id: string | null
          product_name: string
          product_sku: string | null
          qty_picked: number
          qty_requested: number
          reservation_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lot_id?: string | null
          notes?: string | null
          picked_at?: string | null
          picked_by?: string | null
          picking_order_id: string
          product_id?: string | null
          product_name: string
          product_sku?: string | null
          qty_picked?: number
          qty_requested: number
          reservation_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lot_id?: string | null
          notes?: string | null
          picked_at?: string | null
          picked_by?: string | null
          picking_order_id?: string
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          qty_picked?: number
          qty_requested?: number
          reservation_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_lines_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_lines_picking_order_id_fkey"
            columns: ["picking_order_id"]
            isOneToOne: false
            referencedRelation: "picking_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_lines_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "stock_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_orders: {
        Row: {
          allocated_at: string | null
          assigned_to: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          carrier: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_id: string | null
          picked_at: string | null
          picking_number: string
          ship_to_address: Json | null
          ship_to_name: string | null
          shipped_at: string | null
          source_location_id: string | null
          status: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          allocated_at?: string | null
          assigned_to?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          picked_at?: string | null
          picking_number?: string
          ship_to_address?: Json | null
          ship_to_name?: string | null
          shipped_at?: string | null
          source_location_id?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          allocated_at?: string | null
          assigned_to?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          picked_at?: string | null
          picking_number?: string
          ship_to_address?: Json | null
          ship_to_name?: string | null
          shipped_at?: string | null
          source_location_id?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_orders_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string
          entity_type: string
          fold: boolean
          id: string
          is_active: boolean
          is_lost: boolean
          is_won: boolean
          key: string
          name: string
          probability: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          fold?: boolean
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          key: string
          name: string
          probability?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          fold?: boolean
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          key?: string
          name?: string
          probability?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_test_runs: {
        Row: {
          category: string | null
          created_at: string
          duration_ms: number
          error: string | null
          failed: number
          id: string
          module: string | null
          passed: number
          results: Json | null
          run_by: string | null
          scope: string
          skipped: number
          started_at: string
          status: string
          suite_id: string
          suite_title: string | null
          total: number
          triggered_by: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          failed?: number
          id?: string
          module?: string | null
          passed?: number
          results?: Json | null
          run_by?: string | null
          scope: string
          skipped?: number
          started_at?: string
          status: string
          suite_id: string
          suite_title?: string | null
          total?: number
          triggered_by?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          failed?: number
          id?: string
          module?: string | null
          passed?: number
          results?: Json | null
          run_by?: string | null
          scope?: string
          skipped?: number
          started_at?: string
          status?: string
          suite_id?: string
          suite_title?: string | null
          total?: number
          triggered_by?: string
        }
        Relationships: []
      }
      pos_payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          metadata: Json
          method: string
          reference: string | null
          sale_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          metadata?: Json
          method: string
          reference?: string | null
          sale_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          metadata?: Json
          method?: string
          reference?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_registers: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          default_tax_rate: number | null
          id: string
          location: string | null
          metadata: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          default_tax_rate?: number | null
          id?: string
          location?: string | null
          metadata?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          default_tax_rate?: number | null
          id?: string
          location?: string | null
          metadata?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pos_sale_lines: {
        Row: {
          created_at: string
          discount_cents: number
          id: string
          line_total_cents: number
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          sku: string | null
          tax_rate: number | null
          unit_price_cents: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          discount_cents?: number
          id?: string
          line_total_cents?: number
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          sku?: string | null
          tax_rate?: number | null
          unit_price_cents?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          discount_cents?: number
          id?: string
          line_total_cents?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          sku?: string | null
          tax_rate?: number | null
          unit_price_cents?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          cashier_id: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_id: string | null
          discount_cents: number
          id: string
          metadata: Json | null
          payment_details: Json | null
          payment_method: string
          receipt_number: string | null
          refund_of: string | null
          register_id: string
          session_id: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          total_cents: number
        }
        Insert: {
          cashier_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          discount_cents?: number
          id?: string
          metadata?: Json | null
          payment_details?: Json | null
          payment_method?: string
          receipt_number?: string | null
          refund_of?: string | null
          register_id: string
          session_id?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
        }
        Update: {
          cashier_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          discount_cents?: number
          id?: string
          metadata?: Json | null
          payment_details?: Json | null
          payment_method?: string
          receipt_number?: string | null
          refund_of?: string | null
          register_id?: string
          session_id?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_refund_of_fkey"
            columns: ["refund_of"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "pos_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          cash_variance_cents: number | null
          cashier_id: string | null
          cashier_name: string | null
          closed_at: string | null
          closing_cash_cents: number | null
          expected_cash_cents: number | null
          id: string
          metadata: Json
          notes: string | null
          opened_at: string
          opening_cash_cents: number
          register_id: string
          sales_count: number
          status: string
          total_sales_cents: number
        }
        Insert: {
          cash_variance_cents?: number | null
          cashier_id?: string | null
          cashier_name?: string | null
          closed_at?: string | null
          closing_cash_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          opened_at?: string
          opening_cash_cents?: number
          register_id: string
          sales_count?: number
          status?: string
          total_sales_cents?: number
        }
        Update: {
          cash_variance_cents?: number | null
          cashier_id?: string | null
          cashier_name?: string | null
          closed_at?: string | null
          closing_cash_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          opened_at?: string
          opening_cash_cents?: number
          register_id?: string
          sales_count?: number
          status?: string
          total_sales_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "pos_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      pricelist_items: {
        Row: {
          created_at: string
          discount_pct: number | null
          fixed_price_cents: number | null
          id: string
          min_quantity: number
          notes: string | null
          pricelist_id: string
          product_id: string | null
        }
        Insert: {
          created_at?: string
          discount_pct?: number | null
          fixed_price_cents?: number | null
          id?: string
          min_quantity?: number
          notes?: string | null
          pricelist_id: string
          product_id?: string | null
        }
        Update: {
          created_at?: string
          discount_pct?: number | null
          fixed_price_cents?: number | null
          id?: string
          min_quantity?: number
          notes?: string | null
          pricelist_id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricelist_items_pricelist_id_fkey"
            columns: ["pricelist_id"]
            isOneToOne: false
            referencedRelation: "pricelists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pricelists: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          lead_id: string | null
          name: string
          priority: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          lead_id?: string | null
          name: string
          priority?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          lead_id?: string | null
          name?: string
          priority?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricelists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelists_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_suggestions: {
        Row: {
          created_at: string
          id: string
          location_id: string
          materialized_ref_id: string | null
          materialized_ref_type: string | null
          needed_by: string | null
          preferred_vendor_id: string | null
          procurement_method: string
          product_id: string
          reasoning: Json | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: string
          suggested_qty: number
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          materialized_ref_id?: string | null
          materialized_ref_type?: string | null
          needed_by?: string | null
          preferred_vendor_id?: string | null
          procurement_method: string
          product_id: string
          reasoning?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          suggested_qty: number
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          materialized_ref_id?: string | null
          materialized_ref_type?: string | null
          needed_by?: string | null
          preferred_vendor_id?: string | null
          procurement_method?: string
          product_id?: string
          reasoning?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          suggested_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_suggestions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_suggestions_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_id: string
          created_at: string
          id: string
          sort_order: number
          value: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          id?: string
          sort_order?: number
          value: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          created_at: string
          display_type: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_type?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_type?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      product_stock: {
        Row: {
          auto_reorder: boolean
          created_at: string
          id: string
          last_counted_at: string | null
          product_id: string
          quantity_on_hand: number
          quantity_reserved: number
          reorder_point: number
          reorder_quantity: number | null
          updated_at: string
        }
        Insert: {
          auto_reorder?: boolean
          created_at?: string
          id?: string
          last_counted_at?: string | null
          product_id: string
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_point?: number
          reorder_quantity?: number | null
          updated_at?: string
        }
        Update: {
          auto_reorder?: boolean
          created_at?: string
          id?: string
          last_counted_at?: string | null
          product_id?: string
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_point?: number
          reorder_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_values: {
        Row: {
          attribute_value_id: string
          variant_id: string
        }
        Insert: {
          attribute_value_id: string
          variant_id: string
        }
        Update: {
          attribute_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_values_attribute_value_id_fkey"
            columns: ["attribute_value_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          price_delta_cents: number
          product_id: string
          sku: string | null
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          price_delta_cents?: number
          product_id: string
          sku?: string | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          price_delta_cents?: number
          product_id?: string
          sku?: string | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allow_backorder: boolean
          available_in_pos: boolean
          barcode: string | null
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          low_stock_threshold: number
          name: string
          pos_category_id: string | null
          price_cents: number
          sales_uom_id: string | null
          sort_order: number | null
          stock_quantity: number | null
          stripe_price_id: string | null
          track_inventory: boolean
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          allow_backorder?: boolean
          available_in_pos?: boolean
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name: string
          pos_category_id?: string | null
          price_cents?: number
          sales_uom_id?: string | null
          sort_order?: number | null
          stock_quantity?: number | null
          stripe_price_id?: string | null
          track_inventory?: boolean
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          allow_backorder?: boolean
          available_in_pos?: boolean
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name?: string
          pos_category_id?: string | null
          price_cents?: number
          sales_uom_id?: string | null
          sort_order?: number | null
          stock_quantity?: number | null
          stripe_price_id?: string | null
          track_inventory?: boolean
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_pos_category_id_fkey"
            columns: ["pos_category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_sales_uom_id_fkey"
            columns: ["sales_uom_id"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          show_as_author: boolean | null
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          show_as_author?: boolean | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          show_as_author?: boolean | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          hourly_rate_override_cents: number | null
          id: string
          project_id: string
          role: string
          tracks_time: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          hourly_rate_override_cents?: number | null
          id?: string
          project_id: string
          role?: string
          tracks_time?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          hourly_rate_override_cents?: number | null
          id?: string
          project_id?: string
          role?: string
          tracks_time?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          priority: Database["public"]["Enums"]["project_task_priority"]
          project_id: string
          sort_order: number
          status: Database["public"]["Enums"]["project_task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          priority?: Database["public"]["Enums"]["project_task_priority"]
          project_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["project_task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          priority?: Database["public"]["Enums"]["project_task_priority"]
          project_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["project_task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget_hours: number | null
          client_name: string | null
          color: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deadline: string | null
          description: string | null
          hourly_rate_cents: number | null
          id: string
          is_active: boolean | null
          is_billable: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          budget_hours?: number | null
          client_name?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deadline?: string | null
          description?: string | null
          hourly_rate_cents?: number | null
          id?: string
          is_active?: boolean | null
          is_billable?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          budget_hours?: number | null
          client_name?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deadline?: string | null
          description?: string | null
          hourly_rate_cents?: number | null
          id?: string
          is_active?: boolean | null
          is_billable?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          product_id: string | null
          purchase_order_id: string
          quantity: number
          received_quantity: number
          tax_rate: number
          total_cents: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          product_id?: string | null
          purchase_order_id: string
          quantity?: number
          received_quantity?: number
          tax_rate?: number
          total_cents?: number
          unit_price_cents?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          product_id?: string | null
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          tax_rate?: number
          total_cents?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          exchange_rate: number
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          po_number: string
          status: Database["public"]["Enums"]["purchase_order_status"]
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number: string
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number?: string
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          id: string
          is_optional: boolean
          line_subtotal_cents: number
          line_tax_cents: number
          line_total_cents: number
          position: number
          product_id: string | null
          quantity: number
          quote_id: string
          selected_by_customer: boolean
          tax_rate_pct: number
          unit: string | null
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          discount_pct?: number
          id?: string
          is_optional?: boolean
          line_subtotal_cents?: number
          line_tax_cents?: number
          line_total_cents?: number
          position?: number
          product_id?: string | null
          quantity?: number
          quote_id: string
          selected_by_customer?: boolean
          tax_rate_pct?: number
          unit?: string | null
          unit_price_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          is_optional?: boolean
          line_subtotal_cents?: number
          line_tax_cents?: number
          line_total_cents?: number
          position?: number
          product_id?: string | null
          quantity?: number
          quote_id?: string
          selected_by_customer?: boolean
          tax_rate_pct?: number
          unit?: string | null
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_signatures: {
        Row: {
          action: string
          comment: string | null
          created_at: string
          id: string
          ip_address: string | null
          quote_id: string
          signature_data: string | null
          signer_email: string | null
          signer_name: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          comment?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          quote_id: string
          signature_data?: string | null
          signer_email?: string | null
          signer_name?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          comment?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          quote_id?: string
          signature_data?: string | null
          signer_email?: string | null
          signer_name?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_signatures_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_templates: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          default_valid_days: number | null
          description: string | null
          id: string
          intro_text: string | null
          is_active: boolean
          items: Json
          name: string
          terms_text: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          default_valid_days?: number | null
          description?: string | null
          id?: string
          intro_text?: string | null
          is_active?: boolean
          items?: Json
          name: string
          terms_text?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          default_valid_days?: number | null
          description?: string | null
          id?: string
          intro_text?: string | null
          is_active?: boolean
          items?: Json
          name?: string
          terms_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quote_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          quote_id: string
          reason: string | null
          snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id: string
          reason?: string | null
          snapshot: Json
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id?: string
          reason?: string | null
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_versions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accept_token: string | null
          accepted_at: string | null
          approval_request_id: string | null
          company_id: string | null
          converted_at: string | null
          converted_to_invoice_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_address: string | null
          customer_company: string | null
          customer_email: string | null
          customer_name: string | null
          deal_id: string | null
          discount_cents: number
          exchange_rate: number
          id: string
          intro_text: string | null
          invoice_id: string | null
          lead_id: string | null
          line_items: Json
          notes: string | null
          quote_number: string
          rejected_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          template_id: string | null
          terms_text: string | null
          title: string | null
          total_cents: number
          updated_at: string
          valid_until: string | null
          version: number
          viewed_at: string | null
        }
        Insert: {
          accept_token?: string | null
          accepted_at?: string | null
          approval_request_id?: string | null
          company_id?: string | null
          converted_at?: string | null
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string | null
          deal_id?: string | null
          discount_cents?: number
          exchange_rate?: number
          id?: string
          intro_text?: string | null
          invoice_id?: string | null
          lead_id?: string | null
          line_items?: Json
          notes?: string | null
          quote_number: string
          rejected_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_cents?: number
          tax_cents?: number
          tax_rate?: number
          template_id?: string | null
          terms_text?: string | null
          title?: string | null
          total_cents?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
          viewed_at?: string | null
        }
        Update: {
          accept_token?: string | null
          accepted_at?: string | null
          approval_request_id?: string | null
          company_id?: string | null
          converted_at?: string | null
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string | null
          deal_id?: string | null
          discount_cents?: number
          exchange_rate?: number
          id?: string
          intro_text?: string | null
          invoice_id?: string | null
          lead_id?: string | null
          line_items?: Json
          notes?: string | null
          quote_number?: string
          rejected_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_cents?: number
          tax_cents?: number
          tax_rate?: number
          template_id?: string | null
          terms_text?: string | null
          title?: string | null
          total_cents?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_matches: {
        Row: {
          amount_cents: number
          bank_transaction_id: string
          confidence: number | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string
          id: string
          match_type: string
          notes: string | null
          reconciliation_id: string | null
        }
        Insert: {
          amount_cents: number
          bank_transaction_id: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          match_type?: string
          notes?: string | null
          reconciliation_id?: string | null
        }
        Update: {
          amount_cents?: number
          bank_transaction_id?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          match_type?: string
          notes?: string | null
          reconciliation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_matches_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "payment_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          lead_time_days: number
          location_id: string
          max_qty: number
          min_qty: number
          preferred_vendor_id: string | null
          procurement_method: string
          product_id: string
          reorder_qty: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_time_days?: number
          location_id: string
          max_qty?: number
          min_qty?: number
          preferred_vendor_id?: string | null
          procurement_method?: string
          product_id: string
          reorder_qty?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_time_days?: number
          location_id?: string
          max_qty?: number
          min_qty?: number
          preferred_vendor_id?: string | null
          procurement_method?: string
          product_id?: string
          reorder_qty?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_rules_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          notes: string | null
          order_item_id: string | null
          product_id: string | null
          quantity: number
          restock: boolean
          return_id: string
          unit_refund_cents: number | null
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_item_id?: string | null
          product_id?: string | null
          quantity?: number
          restock?: boolean
          return_id: string
          unit_refund_cents?: number | null
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_item_id?: string | null
          product_id?: string | null
          quantity?: number
          restock?: boolean
          return_id?: string
          unit_refund_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          customer_notes: string | null
          id: string
          internal_notes: string | null
          order_id: string
          reason: string | null
          received_at: string | null
          refund_amount_cents: number | null
          refund_currency: string | null
          refund_method: string | null
          refund_processed_at: string | null
          return_carrier_code: string | null
          return_label_url: string | null
          return_tracking_number: string | null
          rma_number: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_notes?: string | null
          id?: string
          internal_notes?: string | null
          order_id: string
          reason?: string | null
          received_at?: string | null
          refund_amount_cents?: number | null
          refund_currency?: string | null
          refund_method?: string | null
          refund_processed_at?: string | null
          return_carrier_code?: string | null
          return_label_url?: string | null
          return_tracking_number?: string | null
          rma_number: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_notes?: string | null
          id?: string
          internal_notes?: string | null
          order_id?: string
          reason?: string | null
          received_at?: string | null
          refund_amount_cents?: number | null
          refund_currency?: string | null
          refund_method?: string | null
          refund_processed_at?: string | null
          return_carrier_code?: string | null
          return_label_url?: string | null
          return_tracking_number?: string | null
          rma_number?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_bids: {
        Row: {
          created_at: string
          id: string
          invited_at: string
          lead_time_days: number | null
          line_offers: Json
          notes: string | null
          payment_terms: string | null
          rfq_id: string
          status: Database["public"]["Enums"]["rfq_bid_status"]
          submitted_at: string | null
          total_cents: number
          updated_at: string
          validity_days: number | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string
          lead_time_days?: number | null
          line_offers?: Json
          notes?: string | null
          payment_terms?: string | null
          rfq_id: string
          status?: Database["public"]["Enums"]["rfq_bid_status"]
          submitted_at?: string | null
          total_cents?: number
          updated_at?: string
          validity_days?: number | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string
          lead_time_days?: number | null
          line_offers?: Json
          notes?: string | null
          payment_terms?: string | null
          rfq_id?: string
          status?: Database["public"]["Enums"]["rfq_bid_status"]
          submitted_at?: string | null
          total_cents?: number
          updated_at?: string
          validity_days?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_bids_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_bids_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          notes: string | null
          position: number
          product_id: string | null
          quantity: number
          rfq_id: string
          target_unit_price_cents: number | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          position?: number
          product_id?: string | null
          quantity?: number
          rfq_id: string
          target_unit_price_cents?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          position?: number
          product_id?: string | null
          quantity?: number
          rfq_id?: string
          target_unit_price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_lines_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          awarded_po_id: string | null
          awarded_vendor_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          expected_delivery: string | null
          id: string
          issue_date: string
          notes: string | null
          response_deadline: string | null
          rfq_number: string
          status: Database["public"]["Enums"]["rfq_status"]
          title: string
          updated_at: string
        }
        Insert: {
          awarded_po_id?: string | null
          awarded_vendor_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          expected_delivery?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          response_deadline?: string | null
          rfq_number: string
          status?: Database["public"]["Enums"]["rfq_status"]
          title: string
          updated_at?: string
        }
        Update: {
          awarded_po_id?: string | null
          awarded_vendor_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          expected_delivery?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          response_deadline?: string | null
          rfq_number?: string
          status?: Database["public"]["Enums"]["rfq_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_awarded_po_id_fkey"
            columns: ["awarded_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_awarded_vendor_id_fkey"
            columns: ["awarded_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      river_posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          media_urls: Json
          parent_id: string | null
          pinned: boolean
          reaction_count: number
          reply_count: number
          updated_at: string
        }
        Insert: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          media_urls?: Json
          parent_id?: string | null
          pinned?: boolean
          reaction_count?: number
          reply_count?: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          media_urls?: Json
          parent_id?: string | null
          pinned?: boolean
          reaction_count?: number
          reply_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "river_posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "river_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      river_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "river_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "river_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      role_module_access: {
        Row: {
          created_at: string
          id: string
          module_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          module_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      role_module_access_defaults: {
        Row: {
          module_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          module_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          module_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      sales_intelligence_profiles: {
        Row: {
          created_at: string
          data: Json
          id: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_default: boolean
          is_shared: boolean
          name: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      service_order_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: string
          position: number | null
          product_id: string | null
          quantity: number
          service_order_id: string
          total: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kind?: string
          position?: number | null
          product_id?: string | null
          quantity?: number
          service_order_id: string
          total?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: string
          position?: number | null
          product_id?: string | null
          quantity?: number
          service_order_id?: string
          total?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_lines_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          deal_id: string | null
          description: string | null
          id: string
          invoice_id: string | null
          metadata: Json | null
          notes: string | null
          order_number: string | null
          priority: string
          project_id: string | null
          requested_date: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          service_address: string | null
          status: string
          title: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          order_number?: string | null
          priority?: string
          project_id?: string | null
          requested_date?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_address?: string | null
          status?: string
          title: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          order_number?: string | null
          priority?: string
          project_id?: string | null
          requested_date?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_address?: string | null
          status?: string
          title?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      service_visits: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          calendar_event_id: string | null
          created_at: string
          id: string
          scheduled_end: string
          scheduled_start: string
          service_order_id: string
          signature_url: string | null
          signed_at: string | null
          status: string
          technician_id: string | null
          technician_notes: string | null
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          calendar_event_id?: string | null
          created_at?: string
          id?: string
          scheduled_end: string
          scheduled_start: string
          service_order_id: string
          signature_url?: string | null
          signed_at?: string | null
          status?: string
          technician_id?: string | null
          technician_notes?: string | null
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          calendar_event_id?: string | null
          created_at?: string
          id?: string
          scheduled_end?: string
          scheduled_start?: string
          service_order_id?: string
          signature_url?: string | null
          signed_at?: string | null
          status?: string
          technician_id?: string | null
          technician_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_visits_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier_code: string | null
          carrier_id: string | null
          cost_cents: number | null
          created_at: string
          delivered_at: string | null
          id: string
          label_url: string | null
          metadata: Json | null
          order_id: string
          shipped_at: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          carrier_code?: string | null
          carrier_id?: string | null
          cost_cents?: number | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          label_url?: string | null
          metadata?: Json | null
          order_id: string
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          carrier_code?: string | null
          carrier_id?: string | null
          cost_cents?: number | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          label_url?: string | null
          metadata?: Json | null
          order_id?: string
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      skills_catalog: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      sla_policies: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          entity_type: string
          id: string
          metric: string
          name: string
          priority: string | null
          threshold_minutes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          entity_type: string
          id?: string
          metric: string
          name: string
          priority?: string | null
          threshold_minutes: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          entity_type?: string
          id?: string
          metric?: string
          name?: string
          priority?: string | null
          threshold_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      sla_violations: {
        Row: {
          actual_minutes: number
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metric: string
          notes: string | null
          policy_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          threshold_minutes: number
        }
        Insert: {
          actual_minutes: number
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metric: string
          notes?: string | null
          policy_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          threshold_minutes: number
        }
        Update: {
          actual_minutes?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metric?: string
          notes?: string | null
          policy_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          threshold_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_violations_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          location_type: string
          name: string
          notes: string | null
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_type?: string
          name: string
          notes?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_type?: string
          name?: string
          notes?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lots: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          lot_number: string
          lot_type: string
          manufactured_at: string | null
          notes: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number: string
          lot_type?: string
          manufactured_at?: string | null
          notes?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number?: string
          lot_type?: string
          manufactured_at?: string | null
          notes?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_moves: {
        Row: {
          created_at: string
          created_by: string | null
          from_location_id: string | null
          id: string
          lot_id: string | null
          mo_id: string | null
          move_type: string
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          state: string
          to_location_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_location_id?: string | null
          id?: string
          lot_id?: string | null
          mo_id?: string | null
          move_type?: string
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          state?: string
          to_location_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_location_id?: string | null
          id?: string
          lot_id?: string | null
          mo_id?: string | null
          move_type?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          state?: string
          to_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_moves_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_mo_id_fkey"
            columns: ["mo_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_quants: {
        Row: {
          id: string
          location_id: string
          lot_id: string | null
          product_id: string
          quantity: number
          reserved_quantity: number
          updated_at: string
        }
        Insert: {
          id?: string
          location_id: string
          lot_id?: string | null
          product_id: string
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
        }
        Update: {
          id?: string
          location_id?: string
          lot_id?: string | null
          product_id?: string
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_quants_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_quants_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_quants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservations: {
        Row: {
          cancelled_at: string | null
          consumed_at: string | null
          id: string
          location_id: string
          lot_id: string | null
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          reserved_at: string
          reserved_by: string | null
          state: string
        }
        Insert: {
          cancelled_at?: string | null
          consumed_at?: string | null
          id?: string
          location_id: string
          lot_id?: string | null
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          reserved_at?: string
          reserved_by?: string | null
          state?: string
        }
        Update: {
          cancelled_at?: string | null
          consumed_at?: string | null
          id?: string
          location_id?: string
          lot_id?: string | null
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          reserved_at?: string
          reserved_by?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_churn_reasons: {
        Row: {
          created_at: string
          customer_email: string | null
          feedback: string | null
          id: string
          metadata: Json | null
          nps_score: number | null
          reason: Database["public"]["Enums"]["churn_reason_category"]
          subscription_id: string | null
          would_return: boolean | null
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          feedback?: string | null
          id?: string
          metadata?: Json | null
          nps_score?: number | null
          reason?: Database["public"]["Enums"]["churn_reason_category"]
          subscription_id?: string | null
          would_return?: boolean | null
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          feedback?: string | null
          id?: string
          metadata?: Json | null
          nps_score?: number | null
          reason?: Database["public"]["Enums"]["churn_reason_category"]
          subscription_id?: string | null
          would_return?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_churn_reasons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          created_at: string
          data: Json
          event_type: string
          id: string
          provider: string
          provider_event_id: string | null
          subscription_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          event_type: string
          id?: string
          provider?: string
          provider_event_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          event_type?: string
          id?: string
          provider?: string
          provider_event_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_winback_campaigns: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          cta_url: string | null
          description: string | null
          discount_duration_months: number | null
          discount_percent: number | null
          email_body: string | null
          email_subject: string | null
          id: string
          name: string
          offer_type: string
          target_segment: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          cta_url?: string | null
          description?: string | null
          discount_duration_months?: number | null
          discount_percent?: number | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          name: string
          offer_type?: string
          target_segment?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          cta_url?: string | null
          description?: string | null
          discount_duration_months?: number | null
          discount_percent?: number | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          name?: string
          offer_type?: string
          target_segment?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_winback_sends: {
        Row: {
          campaign_id: string | null
          channel: string
          converted_at: string | null
          created_at: string
          customer_email: string
          id: string
          metadata: Json | null
          opened_at: string | null
          sent_at: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          channel?: string
          converted_at?: string | null
          created_at?: string
          customer_email: string
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          channel?: string
          converted_at?: string | null
          created_at?: string
          customer_email?: string
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_winback_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "subscription_winback_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_winback_sends_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          at_risk: boolean
          at_risk_reason: string | null
          auto_finalize: boolean
          billing_contact_email: string | null
          billing_interval: string | null
          billing_interval_count: number
          cancel_at: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          customer_email: string | null
          customer_name: string | null
          ended_at: string | null
          health_score: number | null
          id: string
          last_invoice_id: string | null
          metadata: Json
          next_invoice_date: string | null
          payment_terms: string
          po_number: string | null
          product_id: string | null
          product_name: string | null
          provider: string
          provider_customer_id: string | null
          provider_price_id: string | null
          provider_subscription_id: string | null
          quantity: number
          renewal_reminder_sent_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_end: string | null
          trial_start: string | null
          unit_amount_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          at_risk?: boolean
          at_risk_reason?: string | null
          auto_finalize?: boolean
          billing_contact_email?: string | null
          billing_interval?: string | null
          billing_interval_count?: number
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_email?: string | null
          customer_name?: string | null
          ended_at?: string | null
          health_score?: number | null
          id?: string
          last_invoice_id?: string | null
          metadata?: Json
          next_invoice_date?: string | null
          payment_terms?: string
          po_number?: string | null
          product_id?: string | null
          product_name?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_price_id?: string | null
          provider_subscription_id?: string | null
          quantity?: number
          renewal_reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_end?: string | null
          trial_start?: string | null
          unit_amount_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          at_risk?: boolean
          at_risk_reason?: string | null
          auto_finalize?: boolean
          billing_contact_email?: string | null
          billing_interval?: string | null
          billing_interval_count?: number
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_email?: string | null
          customer_name?: string | null
          ended_at?: string | null
          health_score?: number | null
          id?: string
          last_invoice_id?: string | null
          metadata?: Json
          next_invoice_date?: string | null
          payment_terms?: string
          po_number?: string | null
          product_id?: string | null
          product_name?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_price_id?: string | null
          provider_subscription_id?: string | null
          quantity?: number
          renewal_reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_end?: string | null
          trial_start?: string | null
          unit_amount_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_last_invoice_id_fkey"
            columns: ["last_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      support_agents: {
        Row: {
          created_at: string
          current_conversations: number
          id: string
          last_seen_at: string
          max_conversations: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_conversations?: number
          id?: string
          last_seen_at?: string
          max_conversations?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_conversations?: number
          id?: string
          last_seen_at?: string
          max_conversations?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      support_escalations: {
        Row: {
          ai_summary: string | null
          conversation_id: string
          created_at: string
          form_submission_id: string | null
          id: string
          priority: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          ai_summary?: string | null
          conversation_id: string
          created_at?: string
          form_submission_id?: string | null
          id?: string
          priority?: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          ai_summary?: string | null
          conversation_id?: string
          created_at?: string
          form_submission_id?: string | null
          id?: string
          priority?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_escalations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_escalations_form_submission_id_fkey"
            columns: ["form_submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_campaigns: {
        Row: {
          created_at: string
          delay_hours: number
          email_intro: string
          email_subject: string
          id: string
          is_active: boolean
          name: string
          template_id: string
          trigger: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delay_hours?: number
          email_intro?: string
          email_subject?: string
          id?: string
          is_active?: boolean
          name: string
          template_id: string
          trigger?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delay_hours?: number
          email_intro?: string
          email_subject?: string
          id?: string
          is_active?: boolean
          name?: string
          template_id?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          answers: Json
          campaign_id: string
          category: string | null
          comment: string | null
          created_at: string
          flowpilot_processed_at: string | null
          id: string
          lead_id: string | null
          recipient_email: string
          score: number | null
          send_id: string
          template_id: string
        }
        Insert: {
          answers?: Json
          campaign_id: string
          category?: string | null
          comment?: string | null
          created_at?: string
          flowpilot_processed_at?: string | null
          id?: string
          lead_id?: string | null
          recipient_email: string
          score?: number | null
          send_id: string
          template_id: string
        }
        Update: {
          answers?: Json
          campaign_id?: string
          category?: string | null
          comment?: string | null
          created_at?: string
          flowpilot_processed_at?: string | null
          id?: string
          lead_id?: string | null
          recipient_email?: string
          score?: number | null
          send_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "survey_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "survey_nps_stats"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "survey_responses_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "survey_sends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_sends: {
        Row: {
          campaign_id: string
          created_at: string
          expires_at: string
          id: string
          lead_id: string | null
          opened_at: string | null
          recipient_email: string
          recipient_name: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          responded_at: string | null
          sent_at: string | null
          token: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          expires_at?: string
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          recipient_email: string
          recipient_name?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          responded_at?: string | null
          sent_at?: string | null
          token?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          recipient_email?: string
          recipient_name?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          responded_at?: string | null
          sent_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "survey_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "survey_nps_stats"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      survey_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          questions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          questions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          questions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          scope: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          scope?: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          scope?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_code_grids: {
        Row: {
          applies_to: string
          id: string
          sign: number
          tax_code_id: string
          tax_grid_id: string
        }
        Insert: {
          applies_to?: string
          id?: string
          sign?: number
          tax_code_id: string
          tax_grid_id: string
        }
        Update: {
          applies_to?: string
          id?: string
          sign?: number
          tax_code_id?: string
          tax_grid_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_code_grids_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_code_grids_tax_grid_id_fkey"
            columns: ["tax_grid_id"]
            isOneToOne: false
            referencedRelation: "tax_grids"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_codes: {
        Row: {
          code: string
          computation: string
          created_at: string
          description: string | null
          id: string
          input_account_code: string | null
          is_active: boolean
          is_eu: boolean
          is_reverse_charge: boolean
          locale: string
          name: string
          output_account_code: string | null
          price_include: boolean
          rate_pct: number
          sequence: number
          tax_type: string
          updated_at: string
        }
        Insert: {
          code: string
          computation?: string
          created_at?: string
          description?: string | null
          id?: string
          input_account_code?: string | null
          is_active?: boolean
          is_eu?: boolean
          is_reverse_charge?: boolean
          locale?: string
          name: string
          output_account_code?: string | null
          price_include?: boolean
          rate_pct?: number
          sequence?: number
          tax_type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          computation?: string
          created_at?: string
          description?: string | null
          id?: string
          input_account_code?: string | null
          is_active?: boolean
          is_eu?: boolean
          is_reverse_charge?: boolean
          locale?: string
          name?: string
          output_account_code?: string | null
          price_include?: boolean
          rate_pct?: number
          sequence?: number
          tax_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_grids: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          locale: string
          name: string
          sequence: number
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          name: string
          sequence?: number
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          name?: string
          sequence?: number
        }
        Relationships: []
      }
      ticket_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          author_type: string
          content: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          author_type?: string
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          author_type?: string
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          closed_at: string | null
          company_id: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          csat_survey_sent_at: string | null
          description: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          sla_deadline: string | null
          source: string
          source_id: string | null
          stage_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          suggested_kb_article_ids: string[]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          closed_at?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          csat_survey_sent_at?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          sla_deadline?: string | null
          source?: string
          source_id?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          suggested_kb_article_ids?: string[]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          closed_at?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          csat_survey_sent_at?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          sla_deadline?: string | null
          source?: string
          source_id?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          suggested_kb_article_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          description: string | null
          employee_id: string | null
          entry_date: string
          hours: number
          id: string
          invoice_id: string | null
          is_billable: boolean | null
          is_invoiced: boolean | null
          project_id: string
          task_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          employee_id?: string | null
          entry_date?: string
          hours?: number
          id?: string
          invoice_id?: string | null
          is_billable?: boolean | null
          is_invoiced?: boolean | null
          project_id: string
          task_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          employee_id?: string | null
          entry_date?: string
          hours?: number
          id?: string
          invoice_id?: string | null
          is_billable?: boolean | null
          is_invoiced?: boolean | null
          project_id?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_period_locks: {
        Row: {
          fiscal_year: number
          id: string
          locked_at: string
          locked_by: string | null
          notes: string | null
          period_month: number
        }
        Insert: {
          fiscal_year: number
          id?: string
          locked_at?: string
          locked_by?: string | null
          notes?: string | null
          period_month: number
        }
        Update: {
          fiscal_year?: number
          id?: string
          locked_at?: string
          locked_by?: string | null
          notes?: string | null
          period_month?: number
        }
        Relationships: []
      }
      tolerance_policies: {
        Row: {
          created_at: string
          currency: string
          entity_type: string
          id: string
          is_active: boolean
          max_absolute_variance_cents: number | null
          max_price_variance_pct: number
          max_qty_variance_pct: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          entity_type?: string
          id?: string
          is_active?: boolean
          max_absolute_variance_cents?: number | null
          max_price_variance_pct?: number
          max_qty_variance_pct?: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          entity_type?: string
          id?: string
          is_active?: boolean
          max_absolute_variance_cents?: number | null
          max_price_variance_pct?: number
          max_qty_variance_pct?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      uom_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      uoms: {
        Row: {
          category_id: string
          code: string | null
          created_at: string
          factor: number
          id: string
          is_active: boolean
          is_reference: boolean
          name: string
        }
        Insert: {
          category_id: string
          code?: string | null
          created_at?: string
          factor?: number
          id?: string
          is_active?: boolean
          is_reference?: boolean
          name: string
        }
        Update: {
          category_id?: string
          code?: string | null
          created_at?: string
          factor?: number
          id?: string
          is_active?: boolean
          is_reference?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "uoms_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "uom_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vacation_policies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_carry_over_days: number
          min_age: number
          min_tenure_years: number
          name: string
          priority: number
          updated_at: string
          vacation_days: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_carry_over_days?: number
          min_age?: number
          min_tenure_years?: number
          name: string
          priority?: number
          updated_at?: string
          vacation_days: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_carry_over_days?: number
          min_age?: number
          min_tenure_years?: number
          name?: string
          priority?: number
          updated_at?: string
          vacation_days?: number
        }
        Relationships: []
      }
      vendor_invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          match_status: string
          notes: string | null
          paid_at: string | null
          purchase_order_id: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          variance_cents: number
          variance_notes: string | null
          vendor_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          match_status?: string
          notes?: string | null
          paid_at?: string | null
          purchase_order_id?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          variance_cents?: number
          variance_notes?: string | null
          vendor_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          match_status?: string
          notes?: string | null
          paid_at?: string | null
          purchase_order_id?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          variance_cents?: number
          variance_notes?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_products: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_preferred: boolean
          lead_time_days: number | null
          min_order_quantity: number | null
          notes: string | null
          price_tier_min_qty: number
          product_id: string
          unit_price_cents: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          vendor_id: string
          vendor_sku: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          min_order_quantity?: number | null
          notes?: string | null
          price_tier_min_qty?: number
          product_id: string
          unit_price_cents?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          vendor_id: string
          vendor_sku?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          min_order_quantity?: number | null
          notes?: string | null
          price_tier_min_qty?: number
          product_id?: string
          unit_price_cents?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          vendor_id?: string
          vendor_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          currency: string
          default_account_code: string | null
          default_description: string | null
          default_vat_code: string | null
          email: string | null
          id: string
          is_active: boolean
          last_used_template_id: string | null
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_account_code?: string | null
          default_description?: string | null
          default_vat_code?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_used_template_id?: string | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_account_code?: string | null
          default_description?: string | null
          default_vat_code?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_used_template_id?: string | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_last_used_template_id_fkey"
            columns: ["last_used_template_id"]
            isOneToOne: false
            referencedRelation: "accounting_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event: Database["public"]["Enums"]["webhook_event"]
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          success: boolean
          webhook_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event: Database["public"]["Enums"]["webhook_event"]
          id?: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event?: Database["public"]["Enums"]["webhook_event"]
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          created_by: string | null
          events: Database["public"]["Enums"]["webhook_event"][]
          failure_count: number | null
          headers: Json | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          secret: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          events?: Database["public"]["Enums"]["webhook_event"][]
          failure_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          secret?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          events?: Database["public"]["Enums"]["webhook_event"][]
          failure_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          secret?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      webinar_registrations: {
        Row: {
          attended: boolean
          email: string
          follow_up_sent: boolean
          id: string
          lead_id: string | null
          name: string
          phone: string | null
          registered_at: string
          reminder_confirm_sent_at: string | null
          reminder_post_sent_at: string | null
          reminder_t1_sent_at: string | null
          reminder_t24_sent_at: string | null
          webinar_id: string
        }
        Insert: {
          attended?: boolean
          email: string
          follow_up_sent?: boolean
          id?: string
          lead_id?: string | null
          name: string
          phone?: string | null
          registered_at?: string
          reminder_confirm_sent_at?: string | null
          reminder_post_sent_at?: string | null
          reminder_t1_sent_at?: string | null
          reminder_t24_sent_at?: string | null
          webinar_id: string
        }
        Update: {
          attended?: boolean
          email?: string
          follow_up_sent?: boolean
          id?: string
          lead_id?: string | null
          name?: string
          phone?: string | null
          registered_at?: string
          reminder_confirm_sent_at?: string | null
          reminder_post_sent_at?: string | null
          reminder_t1_sent_at?: string | null
          reminder_t24_sent_at?: string | null
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_registrations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_registrations_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinars: {
        Row: {
          agenda: string | null
          cover_image: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          duration_minutes: number
          id: string
          max_attendees: number | null
          meeting_url: string | null
          platform: string
          recording_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          duration_minutes?: number
          id?: string
          max_attendees?: number | null
          meeting_url?: string | null
          platform?: string
          recording_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          max_attendees?: number | null
          meeting_url?: string | null
          platform?: string
          recording_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      wiki_pages: {
        Row: {
          content_md: string
          created_at: string
          created_by: string | null
          slug: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_md?: string
          created_at?: string
          created_by?: string | null
          slug: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_md?: string
          created_at?: string
          created_by?: string | null
          slug?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      analytic_account_balances: {
        Row: {
          account_type: string | null
          analytic_account_id: string | null
          balance_cents: number | null
          code: string | null
          first_entry: string | null
          last_entry: string | null
          line_count: number | null
          name: string | null
          project_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytic_accounts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_invitation_tree: {
        Row: {
          created_at: string | null
          depth: number | null
          id: string | null
          invited_by_peer_id: string | null
          name: string | null
          path: string[] | null
          status: string | null
          toolset_groups: string[] | null
        }
        Relationships: []
      }
      platform_test_runs_latest: {
        Row: {
          category: string | null
          duration_ms: number | null
          error: string | null
          failed: number | null
          module: string | null
          passed: number | null
          scope: string | null
          skipped: number | null
          started_at: string | null
          status: string | null
          suite_id: string | null
          suite_title: string | null
          total: number | null
          triggered_by: string | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          show_as_author: boolean | null
          title: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          show_as_author?: boolean | null
          title?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          show_as_author?: boolean | null
          title?: string | null
        }
        Relationships: []
      }
      survey_nps_stats: {
        Row: {
          avg_score: number | null
          campaign_id: string | null
          campaign_name: string | null
          detractors: number | null
          nps_score: number | null
          passives: number | null
          promoters: number | null
          total_responses: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _demo_register_row: {
        Args: { p_row_id: string; p_run_id: string; p_table_name: string }
        Returns: undefined
      }
      _ensure_manual_journal: { Args: never; Returns: string }
      _flatten_skill_schema: { Args: { td: Json }; Returns: Json }
      _global_search_internal: {
        Args: { result_limit?: number; search_query: string }
        Returns: {
          entity_id: string
          entity_type: string
          rank: number
          subtitle: string
          title: string
          url: string
        }[]
      }
      _upsert_quant: {
        Args: {
          _delta: number
          _location_id: string
          _lot_id: string
          _product_id: string
        }
        Returns: undefined
      }
      adjust_quant: {
        Args: {
          p_location_id: string
          p_lot_id?: string
          p_product_id: string
          p_qty_delta: number
          p_reason?: string
        }
        Returns: string
      }
      advance_approval_step: {
        Args: {
          p_comment?: string
          p_decided_by?: string
          p_decided_role?: Database["public"]["Enums"]["app_role"]
          p_decision: Database["public"]["Enums"]["approval_decision_kind"]
          p_request_id: string
        }
        Returns: Json
      }
      advance_billing_date: {
        Args: { _count: number; _from: string; _interval: string }
        Returns: string
      }
      allocate_picking: {
        Args: { p_order_id: string; p_source_location_id?: string }
        Returns: Json
      }
      apply_onboarding_template: {
        Args: { p_employee_id: string; p_template_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          items: Json
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "onboarding_checklists"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_stock_movement_event: {
        Args: { p_payload: Json }
        Returns: undefined
      }
      approve_expense_report: { Args: { p_report_id: string }; Returns: Json }
      approve_payroll_run: { Args: { p_run_id: string }; Returns: Json }
      approve_pending_operation: { Args: { p_id: string }; Returns: Json }
      approve_procurement_suggestion: { Args: { p_id: string }; Returns: Json }
      approve_return: {
        Args: { p_notes?: string; p_return_id: string }
        Returns: Json
      }
      audit_logs_retention_status: { Args: never; Returns: Json }
      auto_allocate_vacation: {
        Args: { p_dry_run?: boolean; p_year: number }
        Returns: {
          action: string
          allocated_days: number
          carried_over_days: number
          employee_id: string
          employee_name: string
        }[]
      }
      auto_approve_vendor_invoice: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      auto_generate_purchase_orders: {
        Args: { p_dry_run?: boolean }
        Returns: {
          line_count: number
          po_id: string
          po_number: string
          status: string
          total_cents: number
          vendor_id: string
          vendor_name: string
        }[]
      }
      award_rfq: { Args: { _bid_id: string; _rfq_id: string }; Returns: string }
      book_expense_report: {
        Args: {
          p_entry_date?: string
          p_expense_account?: string
          p_liability_account?: string
          p_report_id: string
          p_vat_account?: string
        }
        Returns: Json
      }
      bulk_invoice_from_timesheets: {
        Args: {
          p_due_days?: number
          p_end_date: string
          p_group_by?: string
          p_project_id: string
          p_start_date: string
        }
        Returns: {
          hours_billed: number
          invoice_id: string
          invoice_number: string
          line_count: number
          total_cents: number
        }[]
      }
      bump_kb_article_feedback: {
        Args: { p_rating: string; p_slugs: string[] }
        Returns: Json
      }
      calculate_vacation_days: {
        Args: { p_employee_id: string; p_year: number }
        Returns: number
      }
      calculate_vat_report: {
        Args: { p_end_month?: number; p_start_month: number; p_year: number }
        Returns: {
          amount_cents: number
          category: string
          grid_code: string
          grid_name: string
        }[]
      }
      cancel_manual_subscription: {
        Args: {
          _effective_date?: string
          _reason?: string
          _subscription_id: string
        }
        Returns: Json
      }
      cancel_mo: { Args: { p_mo_id: string; p_reason?: string }; Returns: Json }
      cancel_picking: {
        Args: { p_picking_order_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_reservation: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      cancel_webinar: {
        Args: { p_reason?: string; p_webinar_id: string }
        Returns: Json
      }
      check_mo_availability: { Args: { p_mo_id: string }; Returns: Json }
      checkout_objective: {
        Args: { p_locked_by?: string; p_objective_id: string }
        Returns: boolean
      }
      clock_in: {
        Args: { p_employee_id?: string }
        Returns: {
          break_minutes: number
          clock_in: string
          clock_out: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          source: string
          total_minutes: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clock_out: {
        Args: {
          p_break_minutes?: number
          p_employee_id?: string
          p_notes?: string
        }
        Returns: {
          break_minutes: number
          clock_in: string
          clock_out: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          source: string
          total_minutes: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_accounting_period: {
        Args: { p_month: number; p_notes?: string; p_year: number }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          entry_count: number | null
          fiscal_year: number
          id: string
          notes: string | null
          period_month: number
          reopened_at: string | null
          reopened_by: string | null
          status: Database["public"]["Enums"]["accounting_period_status"]
          total_credit_cents: number | null
          total_debit_cents: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "accounting_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_pos_session: {
        Args: { p_closing_cash_cents: number; p_session_id: string }
        Returns: Json
      }
      close_pos_session_v2: {
        Args: {
          p_closing_cash_cents: number
          p_notes?: string
          p_session_id: string
        }
        Returns: Json
      }
      complete_mo: {
        Args: { p_actual_qty?: number; p_mo_id: string }
        Returns: Json
      }
      complete_service_order: {
        Args: { _completion_notes?: string; _order_id: string }
        Returns: {
          assigned_to: string | null
          completed_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          deal_id: string | null
          description: string | null
          id: string
          invoice_id: string | null
          metadata: Json | null
          notes: string | null
          order_number: string | null
          priority: string
          project_id: string | null
          requested_date: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          service_address: string | null
          status: string
          title: string
          total_amount: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_webinar: {
        Args: { p_recording_url?: string; p_webinar_id: string }
        Returns: Json
      }
      compute_monthly_depreciation: {
        Args: { p_asset: Database["public"]["Tables"]["fixed_assets"]["Row"] }
        Returns: number
      }
      confirm_mo: { Args: { p_mo_id: string }; Returns: Json }
      confirm_newsletter_subscription: {
        Args: { p_token: string }
        Returns: boolean
      }
      confirm_pick: {
        Args: { p_line_id: string; p_lot_id?: string; p_qty_picked: number }
        Returns: Json
      }
      consume_reservation: {
        Args: { p_reservation_id: string; p_to_location_code?: string }
        Returns: string
      }
      convert_uom: {
        Args: { p_from_uom: string; p_qty: number; p_to_uom: string }
        Returns: number
      }
      create_agent_document: {
        Args: {
          p_category?: string
          p_content_md?: string
          p_description?: string
          p_extraction_error?: string
          p_extraction_status?: string
          p_file_name: string
          p_file_size_bytes?: number
          p_file_type?: string
          p_file_url?: string
          p_peer_name: string
          p_tags?: string[]
          p_title: string
          p_uploaded_by: string
        }
        Returns: string
      }
      create_bom: {
        Args: {
          p_activate?: boolean
          p_lines: Json
          p_product_id: string
          p_quantity_produced?: number
          p_routing_notes?: string
          p_version?: string
        }
        Returns: Json
      }
      create_contract_from_template: {
        Args: {
          p_counterparty_email?: string
          p_counterparty_name: string
          p_overrides?: Json
          p_template_id: string
        }
        Returns: {
          contract_id: string
          status: Database["public"]["Enums"]["contract_status"]
          title: string
        }[]
      }
      create_cowork_document: {
        Args: {
          p_category?: string
          p_description?: string
          p_file_name: string
          p_file_size_bytes?: number
          p_file_type?: string
          p_file_url: string
          p_tags?: string[]
          p_title: string
        }
        Returns: string
      }
      create_manual_subscription: {
        Args: {
          _auto_finalize?: boolean
          _billing_contact_email?: string
          _billing_interval?: string
          _billing_interval_count?: number
          _currency?: string
          _customer_email: string
          _customer_name: string
          _payment_terms?: string
          _po_number?: string
          _product_id?: string
          _product_name: string
          _quantity?: number
          _start_date?: string
          _unit_amount_cents: number
        }
        Returns: Json
      }
      create_payroll_run: { Args: { p_period_date: string }; Returns: Json }
      current_employee_id: { Args: never; Returns: string }
      dispatch_automation_event: {
        Args: {
          entity_id?: string
          entity_type?: string
          event_name: string
          payload: Json
          signal_name: string
        }
        Returns: undefined
      }
      dispose_fixed_asset: {
        Args: {
          p_asset_id: string
          p_disposal_date?: string
          p_gain_account?: string
          p_loss_account?: string
          p_proceeds_account?: string
          p_sale_amount_cents?: number
        }
        Returns: Json
      }
      emit_platform_event: {
        Args: { _event_name: string; _payload?: Json; _source?: string }
        Returns: string
      }
      evaluate_approval_required: {
        Args: {
          p_amount_cents?: number
          p_currency?: string
          p_entity_type: string
        }
        Returns: {
          required_role: Database["public"]["Enums"]["app_role"]
          rule_id: string
          rule_name: string
        }[]
      }
      explain_voucher_gap: {
        Args: { p_series: string; p_voucher_number: number; p_year: number }
        Returns: Json
      }
      flag_at_risk_subscriptions: { Args: never; Returns: Json }
      fulfill_order_line: {
        Args: { p_line_id: string; p_qty?: number }
        Returns: Json
      }
      generate_monthly_expense_report: {
        Args: { p_period?: string; p_user_id?: string }
        Returns: Json
      }
      generate_payroll_export: {
        Args: { p_month: number; p_year: number }
        Returns: string
      }
      generate_pos_receipt_number: { Args: never; Returns: string }
      generate_rma_number: { Args: never; Returns: string }
      generate_subscription_invoice: {
        Args: {
          _due_in_days?: number
          _subscription_id: string
          _tax_rate?: number
        }
        Returns: Json
      }
      get_bootstrap_health: {
        Args: { _module_id: string }
        Returns: {
          failure_streak: number
          is_degraded: boolean
          last_hash: string
          last_run_at: string
          last_status: string
        }[]
      }
      get_contract_by_token: {
        Args: { p_token: string }
        Returns: {
          accept_token: string | null
          body_markdown: string | null
          body_updated_at: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          counterparty_email: string | null
          counterparty_name: string
          created_at: string
          created_by: string | null
          currency: string
          end_date: string | null
          file_url: string | null
          id: string
          notes: string | null
          renewal_notice_days: number | null
          renewal_type: Database["public"]["Enums"]["renewal_type"]
          sent_at: string | null
          signed_at: string | null
          signer_email: string | null
          signer_ip: string | null
          signer_name: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          template_id: string | null
          terminated_at: string | null
          title: string
          updated_at: string
          value_cents: number | null
          version: number
          viewed_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "contracts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_conversation_token_estimate: {
        Args: { p_conversation_id: string }
        Returns: number
      }
      get_employee_leave_balances: {
        Args: { p_employee_id: string; p_year?: number }
        Returns: {
          allocated_days: number
          carried_over_days: number
          leave_type: string
          pending_days: number
          remaining_days: number
          used_days: number
          year: number
        }[]
      }
      get_exchange_rate: {
        Args: { p_base: string; p_date?: string; p_quote: string }
        Returns: number
      }
      get_invoice_by_token: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          created_by: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          deal_id: string | null
          due_date: string | null
          exchange_rate: number
          id: string
          invoice_number: string
          issue_date: string
          lead_id: string | null
          line_items: Json
          notes: string | null
          paid_amount_cents: number
          paid_at: string | null
          payment_terms: string | null
          payment_url: string | null
          project_id: string | null
          public_token: string | null
          reconciliation_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at: string
          viewed_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_leave_balance: {
        Args: { p_employee_id: string; p_leave_type: string; p_year?: number }
        Returns: {
          allocated_days: number
          carried_over_days: number
          employee_id: string
          leave_type: string
          pending_days: number
          remaining_days: number
          used_days: number
          year: number
        }[]
      }
      get_order_status: {
        Args: { p_email?: string; p_id: string }
        Returns: Json
      }
      get_quote_by_token: {
        Args: { p_token: string }
        Returns: {
          accept_token: string | null
          accepted_at: string | null
          approval_request_id: string | null
          company_id: string | null
          converted_at: string | null
          converted_to_invoice_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_address: string | null
          customer_company: string | null
          customer_email: string | null
          customer_name: string | null
          deal_id: string | null
          discount_cents: number
          exchange_rate: number
          id: string
          intro_text: string | null
          invoice_id: string | null
          lead_id: string | null
          line_items: Json
          notes: string | null
          quote_number: string
          rejected_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          template_id: string | null
          terms_text: string | null
          title: string | null
          total_cents: number
          updated_at: string
          valid_until: string | null
          version: number
          viewed_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_support_agent_user_id: {
        Args: { p_agent_id: string }
        Returns: string
      }
      get_survey_by_token: { Args: { _token: string }; Returns: Json }
      get_team_member_ids: {
        Args: { _manager_user_id: string }
        Returns: {
          employee_id: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      global_search: {
        Args: { result_limit?: number; search_query: string }
        Returns: {
          entity_id: string
          entity_type: string
          rank: number
          subtitle: string
          title: string
          url: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hire_application: {
        Args: {
          p_application_id: string
          p_contract_template_id?: string
          p_department?: string
          p_manager_id?: string
          p_monthly_salary_cents?: number
          p_onboarding_template_id?: string
          p_start_date?: string
        }
        Returns: {
          application_id: string
          contract_status: string
          employee_id: string
          employment_contract_id: string
          onboarding_checklist_id: string
        }[]
      }
      hire_candidate_from_application: {
        Args: {
          p_application_id: string
          p_department?: string
          p_employment_type?: string
          p_start_date?: string
        }
        Returns: Json
      }
      invoice_outstanding: { Args: { p_invoice_id: string }; Returns: number }
      is_manager_of: {
        Args: { _employee_id: string; _manager_user_id: string }
        Returns: boolean
      }
      is_period_closed: { Args: { p_date: string }; Returns: boolean }
      link_employee_to_auth_user: {
        Args: { p_employee_id: string }
        Returns: string
      }
      lint_get_not_null_columns: {
        Args: never
        Returns: {
          column_name: string
          table_name: string
        }[]
      }
      lint_get_rpc_signatures: {
        Args: never
        Returns: {
          args: string[]
          proname: string
        }[]
      }
      list_payroll_lines: { Args: { p_run_id: string }; Returns: Json }
      list_payroll_runs: { Args: { p_limit?: number }; Returns: Json }
      list_reorder_candidates: {
        Args: never
        Returns: {
          estimated_cost_cents: number
          lead_time_days: number
          min_order_quantity: number
          product_id: string
          product_name: string
          quantity_on_hand: number
          reorder_point: number
          reorder_quantity: number
          unit_price_cents: number
          vendor_id: string
          vendor_name: string
        }[]
      }
      list_voucher_gaps: {
        Args: { p_series?: string; p_year?: number }
        Returns: {
          expected_number: number
          fiscal_year: number
          gap_size: number
          last_seen_date: string
          next_existing_number: number
          series: string
        }[]
      }
      lock_accounting_period: {
        Args: { p_month: number; p_year: number }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          entry_count: number | null
          fiscal_year: number
          id: string
          notes: string | null
          period_month: number
          reopened_at: string | null
          reopened_by: string | null
          status: Database["public"]["Enums"]["accounting_period_status"]
          total_credit_cents: number | null
          total_debit_cents: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "accounting_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lock_payroll_export: {
        Args: { p_export_id: string }
        Returns: {
          created_at: string
          csv_content: string | null
          currency: string
          format: string
          generated_at: string | null
          generated_by: string | null
          id: string
          locked_at: string | null
          notes: string | null
          paxml_content: string | null
          period_month: number
          period_year: number
          status: string
          total_employees: number
          total_expense_cents: number
          total_leave_days: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payroll_exports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lock_timesheet_period: {
        Args: {
          p_fiscal_year: number
          p_notes?: string
          p_period_month: number
        }
        Returns: Json
      }
      log_ai_usage: {
        Args: {
          p_completion_tokens?: number
          p_conversation_id?: string
          p_error?: string
          p_latency_ms?: number
          p_metadata?: Json
          p_model?: string
          p_prompt_tokens?: number
          p_provider?: string
          p_request_id?: string
          p_source: string
          p_status?: string
          p_total_tokens?: number
          p_user_id?: string
        }
        Returns: string
      }
      log_cache_invalidation: {
        Args: { p_all?: boolean; p_slug?: string }
        Returns: Json
      }
      manage_approval_chain: {
        Args: {
          p_action: string
          p_chain_id?: string
          p_entity_type?: string
          p_group_id?: string
          p_name?: string
          p_steps?: Json
          p_user_ids?: string[]
        }
        Returns: Json
      }
      manage_pipeline_stage: {
        Args: {
          p_action: string
          p_entity_type?: string
          p_fold?: boolean
          p_is_lost?: boolean
          p_is_won?: boolean
          p_key?: string
          p_name?: string
          p_probability?: number
          p_sort_order?: number
          p_stage_id?: string
        }
        Returns: Json
      }
      manage_product_variant: {
        Args: {
          p_action: string
          p_attribute_value_ids?: string[]
          p_attributes?: Json
          p_barcode?: string
          p_is_active?: boolean
          p_price_delta_cents?: number
          p_product_id?: string
          p_sku?: string
          p_stock_quantity?: number
          p_variant_id?: string
        }
        Returns: Json
      }
      mark_expense_report_paid: {
        Args: {
          p_bank_account?: string
          p_liability_account?: string
          p_method?: string
          p_notes?: string
          p_paid_at?: string
          p_reference?: string
          p_report_id: string
        }
        Returns: Json
      }
      mark_invoice_viewed_by_token: {
        Args: { p_token: string }
        Returns: undefined
      }
      mark_payroll_paid: {
        Args: { p_payment_date?: string; p_run_id: string }
        Returns: Json
      }
      mark_webinar_attendance: {
        Args: { p_attended?: boolean; p_registration_id: string }
        Returns: Json
      }
      match_invoice_to_receipt: {
        Args: { p_invoice_id: string; p_tolerance_pct?: number }
        Returns: Json
      }
      match_po_to_invoice: {
        Args: { p_invoice_id: string; p_variance_tolerance_pct?: number }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          match_status: string
          notes: string | null
          paid_at: string | null
          purchase_order_id: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          variance_cents: number
          variance_notes: string | null
          vendor_id: string
        }
        SetofOptions: {
          from: "*"
          to: "vendor_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mcp_approve_payroll_run: { Args: { args: Json }; Returns: Json }
      mcp_create_payroll_run: { Args: { args: Json }; Returns: Json }
      mcp_dispose_fixed_asset: { Args: { args: Json }; Returns: Json }
      mcp_global_search: {
        Args: { p_result_limit?: number; p_search_query: string }
        Returns: {
          entity_id: string
          entity_type: string
          rank: number
          subtitle: string
          title: string
          url: string
        }[]
      }
      mcp_list_payroll_lines: { Args: { args: Json }; Returns: Json }
      mcp_list_payroll_runs: { Args: { args: Json }; Returns: Json }
      mcp_mark_payroll_paid: { Args: { args: Json }; Returns: Json }
      mcp_register_fixed_asset: { Args: { args: Json }; Returns: Json }
      mcp_revalue_open_balances: { Args: { args: Json }; Returns: Json }
      mcp_run_monthly_depreciation: { Args: { args: Json }; Returns: Json }
      mcp_set_exchange_rate: { Args: { args: Json }; Returns: Json }
      next_mo_number: { Args: never; Returns: string }
      open_pos_session: {
        Args: {
          p_cashier_name?: string
          p_opening_cash_cents?: number
          p_register_id: string
        }
        Returns: string
      }
      preview_payroll_period: {
        Args: { p_month: number; p_year: number }
        Returns: {
          employee_email: string
          employee_id: string
          employee_name: string
          expense_count: number
          expense_ids: string[]
          expense_reimbursement_cents: number
          leave_request_ids: string[]
          other_leave_days: number
          parental_days: number
          personal_number: string
          representation_cents: number
          sick_days: number
          vacation_days: number
        }[]
      }
      procurement_run: {
        Args: never
        Returns: {
          rules_evaluated: number
          suggestions_created: number
        }[]
      }
      propose_accruals: { Args: { p_year: number }; Returns: Json }
      propose_annual_depreciation: { Args: { p_year: number }; Returns: Json }
      publish_scheduled_pages: { Args: never; Returns: Json }
      publish_webinar: { Args: { p_webinar_id: string }; Returns: Json }
      purge_audit_logs_past_retention: { Args: never; Returns: Json }
      receive_purchase_order: {
        Args: {
          p_lines: Json
          p_notes?: string
          p_purchase_order_id: string
          p_received_date?: string
          p_to_location_id?: string
        }
        Returns: Json
      }
      receive_return: { Args: { p_return_id: string }; Returns: Json }
      reconcile_invoice_payments:
        | {
            Args: {
              p_bank_transaction_ids: string[]
              p_invoice_id: string
              p_notes?: string
            }
            Returns: {
              created_at: string
              currency: string
              id: string
              invoice_id: string
              invoice_total_cents: number
              journal_entry_id: string | null
              notes: string | null
              reconciled_amount_cents: number
              reconciled_at: string
              reconciled_by: string | null
              reversal_journal_entry_id: string | null
              reversal_reason: string | null
              reversed_at: string | null
              reversed_by: string | null
              status: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "payment_reconciliations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_bank_transaction_ids: string[]
              p_invoice_id: string
              p_notes?: string
              p_skip_auth?: boolean
            }
            Returns: {
              created_at: string
              currency: string
              id: string
              invoice_id: string
              invoice_total_cents: number
              journal_entry_id: string | null
              notes: string | null
              reconciled_amount_cents: number
              reconciled_at: string
              reconciled_by: string | null
              reversal_journal_entry_id: string | null
              reversal_reason: string | null
              reversed_at: string | null
              reversed_by: string | null
              status: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "payment_reconciliations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      record_churn_reason: {
        Args: {
          p_feedback?: string
          p_nps_score?: number
          p_reason: Database["public"]["Enums"]["churn_reason_category"]
          p_subscription_id: string
          p_would_return?: boolean
        }
        Returns: string
      }
      record_pos_sale: {
        Args: {
          p_customer_email?: string
          p_discount_cents?: number
          p_lines: Json
          p_payment_method?: string
          p_register_id: string
          p_session_id: string
        }
        Returns: Json
      }
      record_pos_sale_v2: {
        Args: {
          p_customer_email?: string
          p_customer_id?: string
          p_discount_cents?: number
          p_lines: Json
          p_metadata?: Json
          p_payments: Json
          p_register_id: string
          p_session_id: string
        }
        Returns: Json
      }
      refund_return: {
        Args: { p_method?: string; p_refund_cents: number; p_return_id: string }
        Returns: Json
      }
      register_fixed_asset: {
        Args: {
          p_accumulated_account?: string
          p_asset_account?: string
          p_cost_cents: number
          p_create_journal_entry?: boolean
          p_credit_account?: string
          p_declining_rate?: number
          p_depreciation_account?: string
          p_description?: string
          p_in_service_date?: string
          p_method?: string
          p_name: string
          p_purchase_date?: string
          p_salvage_cents?: number
          p_useful_life_months: number
        }
        Returns: {
          accumulated_account: string
          accumulated_cents: number
          asset_account: string
          cost_cents: number
          created_at: string
          declining_rate: number | null
          depreciation_account: string
          depreciation_method: string
          description: string | null
          disposed_amount_cents: number | null
          disposed_at: string | null
          id: string
          in_service_date: string
          name: string
          purchase_date: string
          salvage_cents: number
          status: string
          updated_at: string
          useful_life_months: number
        }
        SetofOptions: {
          from: "*"
          to: "fixed_assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_flowpilot_cron: {
        Args: { p_anon_key: string; p_supabase_url: string }
        Returns: Json
      }
      register_for_webinar: {
        Args: {
          p_email: string
          p_name: string
          p_phone?: string
          p_webinar_id: string
        }
        Returns: Json
      }
      reject_pending_operation: {
        Args: { p_id: string; p_reason?: string }
        Returns: Json
      }
      reject_procurement_suggestion: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      release_agent_conversations: {
        Args: { p_user_id: string }
        Returns: {
          channel: string
          channel_thread_id: string
          conversation_id: string
          customer_name: string
        }[]
      }
      release_agent_lock: { Args: { p_lane: string }; Returns: undefined }
      reopen_accounting_period: {
        Args: { p_month: number; p_reason?: string; p_year: number }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          entry_count: number | null
          fiscal_year: number
          id: string
          notes: string | null
          period_month: number
          reopened_at: string | null
          reopened_by: string | null
          status: Database["public"]["Enums"]["accounting_period_status"]
          total_credit_cents: number | null
          total_debit_cents: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "accounting_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_skill_approval: {
        Args: {
          p_activity_id: string
          p_agent?: string
          p_amount_cents?: number
          p_args: Json
          p_conversation_id?: string
          p_currency?: string
          p_reason?: string
          p_skill_id: string
          p_skill_name: string
        }
        Returns: string
      }
      reserve_stock: {
        Args: {
          p_location_id: string
          p_lot_id?: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_reference_id?: string
          p_reference_type?: string
        }
        Returns: string
      }
      reset_all_role_module_access: { Args: never; Returns: undefined }
      reset_module_data: {
        Args: { p_dry_run?: boolean; p_module: string; p_run_id?: string }
        Returns: Json
      }
      reset_role_module_access: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: undefined
      }
      resolve_approval: {
        Args: {
          p_comment?: string
          p_decision: Database["public"]["Enums"]["approval_decision_kind"]
          p_request_id: string
        }
        Returns: {
          amount_cents: number | null
          chain_id: string | null
          context: Json | null
          created_at: string
          currency: string
          current_step: number | null
          entity_id: string
          entity_type: string
          id: string
          reason: string | null
          requested_by: string | null
          required_role: Database["public"]["Enums"]["app_role"]
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_pricelist_price: {
        Args: {
          p_at?: string
          p_company_id?: string
          p_currency?: string
          p_lead_id?: string
          p_product_id: string
          p_quantity?: number
        }
        Returns: {
          price_cents: number
          pricelist_id: string
          pricelist_name: string
          source: string
        }[]
      }
      revalue_open_balances: {
        Args: {
          p_ap_account?: string
          p_ar_account?: string
          p_fx_gain_account?: string
          p_fx_loss_account?: string
          p_revaluation_date?: string
        }
        Returns: Json
      }
      run_monthly_depreciation: {
        Args: { p_period_date?: string }
        Returns: Json
      }
      run_period_lock_tests: {
        Args: never
        Returns: {
          detail: string
          passed: boolean
          test_name: string
        }[]
      }
      run_reconciliation_tests: {
        Args: never
        Returns: {
          detail: string
          passed: boolean
          test_name: string
        }[]
      }
      run_year_end: {
        Args: { p_confirm?: boolean; p_year: number }
        Returns: Json
      }
      schedule_cron_job: {
        Args: {
          p_body: string
          p_headers: string
          p_jobname: string
          p_schedule: string
          p_url: string
        }
        Returns: boolean
      }
      search_memories_hybrid: {
        Args: {
          filter_category?: Database["public"]["Enums"]["agent_memory_category"]
          match_count?: number
          match_threshold?: number
          query_embedding?: string
          query_text: string
        }
        Returns: {
          category: Database["public"]["Enums"]["agent_memory_category"]
          id: string
          key: string
          search_type: string
          similarity: number
          value: Json
        }[]
      }
      search_memories_semantic: {
        Args: {
          filter_category?: Database["public"]["Enums"]["agent_memory_category"]
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: Database["public"]["Enums"]["agent_memory_category"]
          id: string
          key: string
          similarity: number
          value: Json
        }[]
      }
      seed_demo_accounting: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_approvals: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_blog: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_bookings: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_companies: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_consultants: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_contracts: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_crm: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_deals: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_documents: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_ecommerce: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_expenses: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_hr: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_inventory: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_invoices: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_kb: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_newsletter: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_pos: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_pricelists: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_projects: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_quotes: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_reconciliation: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_recruitment: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_sla: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_subscriptions: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_surveys: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_tickets: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_timesheets: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_vendors: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_demo_webinars: {
        Args: { p_run_id: string; p_scenario?: string }
        Returns: Json
      }
      seed_module_demo: {
        Args: { p_module: string; p_scenario?: string }
        Returns: Json
      }
      send_dunning_reminders: {
        Args: { p_dry_run?: boolean }
        Returns: {
          customer_email: string
          days_overdue: number
          dunning_step: string
          invoice_id: string
          invoice_number: string
          total_cents: number
        }[]
      }
      set_exchange_rate: {
        Args: {
          p_base: string
          p_quote: string
          p_rate: number
          p_rate_date?: string
          p_source?: string
        }
        Returns: {
          base_currency: string
          created_at: string
          id: string
          quote_currency: string
          rate: number
          rate_date: string
          source: string
        }
        SetofOptions: {
          from: "*"
          to: "exchange_rates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_quote_item_selection: {
        Args: { _accept_token: string; _item_id: string; _selected: boolean }
        Returns: Json
      }
      ship_picking: {
        Args: {
          p_carrier?: string
          p_picking_order_id: string
          p_tracking_number?: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sign_contract_by_token: {
        Args: {
          p_signature_data?: string
          p_signer_email: string
          p_signer_ip?: string
          p_signer_name: string
          p_token: string
          p_user_agent?: string
        }
        Returns: {
          action: string
          comment: string | null
          contract_id: string
          created_at: string
          id: string
          ip_address: string | null
          signature_data: string | null
          signer_email: string | null
          signer_name: string | null
          user_agent: string | null
        }
        SetofOptions: {
          from: "*"
          to: "contract_signatures"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sign_employment_contract: {
        Args: { p_contract_id: string; p_side?: string }
        Returns: {
          body_markdown: string
          created_at: string
          created_by: string | null
          currency: string
          employee_id: string
          employment_type: string
          end_date: string | null
          hourly_rate_cents: number | null
          id: string
          metadata: Json
          monthly_salary_cents: number | null
          notice_period_days: number | null
          probation_end_date: string | null
          sent_at: string | null
          signed_at: string | null
          signed_by_employee_at: string | null
          signed_by_employer_at: string | null
          start_date: string
          status: string
          template_id: string | null
          terminated_at: string | null
          termination_reason: string | null
          title: string
          updated_at: string
          weekly_hours: number | null
        }
        SetofOptions: {
          from: "*"
          to: "employment_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_mo: { Args: { p_mo_id: string }; Returns: Json }
      start_webinar: { Args: { p_webinar_id: string }; Returns: Json }
      submit_expense_report: { Args: { p_report_id: string }; Returns: Json }
      submit_survey_response: {
        Args: {
          _answers?: Json
          _comment?: string
          _score?: number
          _token: string
        }
        Returns: Json
      }
      transfer_stock: {
        Args: {
          p_from_location_id: string
          p_lot_id?: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_to_location_id: string
        }
        Returns: string
      }
      trigger_procurement_for_mo: { Args: { p_mo_id: string }; Returns: Json }
      try_acquire_agent_lock: {
        Args: { p_lane: string; p_locked_by?: string; p_ttl_seconds?: number }
        Returns: boolean
      }
      unreconcile_payment:
        | {
            Args: { p_reason?: string; p_reconciliation_id: string }
            Returns: {
              created_at: string
              currency: string
              id: string
              invoice_id: string
              invoice_total_cents: number
              journal_entry_id: string | null
              notes: string | null
              reconciled_amount_cents: number
              reconciled_at: string
              reconciled_by: string | null
              reversal_journal_entry_id: string | null
              reversal_reason: string | null
              reversed_at: string | null
              reversed_by: string | null
              status: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "payment_reconciliations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_reason?: string
              p_reconciliation_id: string
              p_skip_auth?: boolean
            }
            Returns: {
              created_at: string
              currency: string
              id: string
              invoice_id: string
              invoice_total_cents: number
              journal_entry_id: string | null
              notes: string | null
              reconciled_amount_cents: number
              reconciled_at: string
              reconciled_by: string | null
              reversal_journal_entry_id: string | null
              reversal_reason: string | null
              reversed_at: string | null
              reversed_by: string | null
              status: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "payment_reconciliations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      unschedule_cron_job: { Args: { p_jobname: string }; Returns: boolean }
      unsubscribe_newsletter: { Args: { p_token: string }; Returns: boolean }
      unsubscribe_newsletter_by_email: {
        Args: { p_email: string }
        Returns: boolean
      }
      upcoming_renewals: {
        Args: { p_days_ahead?: number }
        Returns: {
          cancel_at_period_end: boolean
          currency: string
          current_period_end: string
          customer_email: string
          customer_name: string
          days_until_renewal: number
          id: string
          product_name: string
          status: string
          unit_amount_cents: number
        }[]
      }
      update_cowork_document_extraction: {
        Args: {
          p_content_md?: string
          p_document_id: string
          p_error?: string
          p_status: string
        }
        Returns: undefined
      }
      webinar_reminder_tick: { Args: never; Returns: Json }
      webinar_tick: { Args: never; Returns: Json }
      year_end_readiness: { Args: { p_year?: number }; Returns: Json }
    }
    Enums: {
      a2a_activity_status: "success" | "error" | "pending" | "dispatched"
      a2a_direction: "inbound" | "outbound"
      a2a_peer_status: "active" | "paused" | "revoked"
      accounting_period_status: "open" | "closed" | "locked"
      activity_outcome_status:
        | "pending"
        | "success"
        | "partial"
        | "no_effect"
        | "negative"
        | "neutral"
        | "too_early"
      agent_activity_status:
        | "success"
        | "failed"
        | "pending_approval"
        | "approved"
        | "rejected"
      agent_memory_category:
        | "preference"
        | "context"
        | "fact"
        | "config"
        | "snapshot"
      agent_objective_status: "active" | "completed" | "paused" | "failed"
      agent_scope: "internal" | "external" | "both"
      agent_skill_category:
        | "content"
        | "crm"
        | "communication"
        | "automation"
        | "search"
        | "analytics"
        | "system"
        | "commerce"
        | "growth"
        | "testing"
        | "subscriptions"
      agent_type:
        | "flowpilot"
        | "chat"
        | "mcp"
        | "cron"
        | "automation"
        | "system"
      app_role:
        | "writer"
        | "approver"
        | "admin"
        | "customer"
        | "employee"
        | "sales"
        | "hr"
        | "accounting"
        | "support"
        | "warehouse"
        | "marketing"
        | "purchasing"
        | "projects"
      application_stage:
        | "applied"
        | "screened"
        | "interview_scheduled"
        | "interviewed"
        | "offer_sent"
        | "hired"
        | "rejected"
        | "withdrawn"
      approval_decision_kind: "approve" | "reject"
      approval_status: "pending" | "approved" | "rejected" | "cancelled"
      automation_trigger_type: "cron" | "event" | "signal"
      churn_reason_category:
        | "too_expensive"
        | "missing_feature"
        | "switched_competitor"
        | "no_longer_needed"
        | "poor_support"
        | "technical_issues"
        | "temporary_pause"
        | "other"
      company_lifecycle_stage: "prospect" | "customer" | "churned"
      connection_direction: "outbound" | "inbound" | "bidirectional"
      connection_transport: "a2a" | "openresponses" | "mcp"
      contract_status:
        | "draft"
        | "pending_signature"
        | "active"
        | "expired"
        | "terminated"
      contract_type: "service" | "nda" | "employment" | "lease" | "other"
      deal_stage:
        | "lead"
        | "prospecting"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "closed_won"
        | "closed_lost"
      employment_kind:
        | "full_time"
        | "part_time"
        | "contract"
        | "internship"
        | "temporary"
      invoice_status: "draft" | "sent" | "paid" | "cancelled" | "overdue"
      job_posting_status: "draft" | "published" | "closed" | "archived"
      lead_status: "lead" | "opportunity" | "customer" | "lost"
      mo_status:
        | "draft"
        | "planned"
        | "confirmed"
        | "in_progress"
        | "done"
        | "cancelled"
      page_status: "draft" | "reviewing" | "published" | "archived"
      peer_transport: "a2a" | "openresponses" | "mcp_inbound"
      product_type: "one_time" | "recurring"
      project_task_priority: "low" | "medium" | "high" | "urgent"
      project_task_status: "todo" | "in_progress" | "review" | "done"
      purchase_order_status:
        | "draft"
        | "sent"
        | "confirmed"
        | "partially_received"
        | "received"
        | "cancelled"
      quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "pending_approval"
        | "viewed"
        | "cancelled"
      renewal_type: "none" | "auto" | "manual"
      rfq_bid_status:
        | "pending"
        | "submitted"
        | "awarded"
        | "rejected"
        | "withdrawn"
      rfq_status:
        | "draft"
        | "sent"
        | "bidding"
        | "closed"
        | "awarded"
        | "cancelled"
      skill_origin: "bundled" | "managed" | "agent" | "user" | "a2a"
      skill_trust_level: "auto" | "notify" | "approve"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "paused"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
      ticket_category: "bug" | "feature" | "question" | "billing" | "other"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status:
        | "new"
        | "open"
        | "in_progress"
        | "waiting"
        | "resolved"
        | "closed"
      webhook_event:
        | "page.published"
        | "page.updated"
        | "page.deleted"
        | "blog_post.published"
        | "blog_post.updated"
        | "blog_post.deleted"
        | "form.submitted"
        | "newsletter.subscribed"
        | "newsletter.unsubscribed"
        | "booking.submitted"
        | "order.created"
        | "order.paid"
        | "order.cancelled"
        | "order.refunded"
        | "product.created"
        | "product.updated"
        | "product.deleted"
        | "booking.confirmed"
        | "booking.cancelled"
        | "deal.created"
        | "deal.updated"
        | "deal.stage_changed"
        | "deal.won"
        | "deal.lost"
        | "company.created"
        | "company.updated"
        | "media.uploaded"
        | "media.deleted"
        | "global_block.updated"
        | "kb_article.published"
        | "kb_article.updated"
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
  public: {
    Enums: {
      a2a_activity_status: ["success", "error", "pending", "dispatched"],
      a2a_direction: ["inbound", "outbound"],
      a2a_peer_status: ["active", "paused", "revoked"],
      accounting_period_status: ["open", "closed", "locked"],
      activity_outcome_status: [
        "pending",
        "success",
        "partial",
        "no_effect",
        "negative",
        "neutral",
        "too_early",
      ],
      agent_activity_status: [
        "success",
        "failed",
        "pending_approval",
        "approved",
        "rejected",
      ],
      agent_memory_category: [
        "preference",
        "context",
        "fact",
        "config",
        "snapshot",
      ],
      agent_objective_status: ["active", "completed", "paused", "failed"],
      agent_scope: ["internal", "external", "both"],
      agent_skill_category: [
        "content",
        "crm",
        "communication",
        "automation",
        "search",
        "analytics",
        "system",
        "commerce",
        "growth",
        "testing",
        "subscriptions",
      ],
      agent_type: ["flowpilot", "chat", "mcp", "cron", "automation", "system"],
      app_role: [
        "writer",
        "approver",
        "admin",
        "customer",
        "employee",
        "sales",
        "hr",
        "accounting",
        "support",
        "warehouse",
        "marketing",
        "purchasing",
        "projects",
      ],
      application_stage: [
        "applied",
        "screened",
        "interview_scheduled",
        "interviewed",
        "offer_sent",
        "hired",
        "rejected",
        "withdrawn",
      ],
      approval_decision_kind: ["approve", "reject"],
      approval_status: ["pending", "approved", "rejected", "cancelled"],
      automation_trigger_type: ["cron", "event", "signal"],
      churn_reason_category: [
        "too_expensive",
        "missing_feature",
        "switched_competitor",
        "no_longer_needed",
        "poor_support",
        "technical_issues",
        "temporary_pause",
        "other",
      ],
      company_lifecycle_stage: ["prospect", "customer", "churned"],
      connection_direction: ["outbound", "inbound", "bidirectional"],
      connection_transport: ["a2a", "openresponses", "mcp"],
      contract_status: [
        "draft",
        "pending_signature",
        "active",
        "expired",
        "terminated",
      ],
      contract_type: ["service", "nda", "employment", "lease", "other"],
      deal_stage: [
        "lead",
        "prospecting",
        "qualified",
        "proposal",
        "negotiation",
        "closed_won",
        "closed_lost",
      ],
      employment_kind: [
        "full_time",
        "part_time",
        "contract",
        "internship",
        "temporary",
      ],
      invoice_status: ["draft", "sent", "paid", "cancelled", "overdue"],
      job_posting_status: ["draft", "published", "closed", "archived"],
      lead_status: ["lead", "opportunity", "customer", "lost"],
      mo_status: [
        "draft",
        "planned",
        "confirmed",
        "in_progress",
        "done",
        "cancelled",
      ],
      page_status: ["draft", "reviewing", "published", "archived"],
      peer_transport: ["a2a", "openresponses", "mcp_inbound"],
      product_type: ["one_time", "recurring"],
      project_task_priority: ["low", "medium", "high", "urgent"],
      project_task_status: ["todo", "in_progress", "review", "done"],
      purchase_order_status: [
        "draft",
        "sent",
        "confirmed",
        "partially_received",
        "received",
        "cancelled",
      ],
      quote_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "pending_approval",
        "viewed",
        "cancelled",
      ],
      renewal_type: ["none", "auto", "manual"],
      rfq_bid_status: [
        "pending",
        "submitted",
        "awarded",
        "rejected",
        "withdrawn",
      ],
      rfq_status: [
        "draft",
        "sent",
        "bidding",
        "closed",
        "awarded",
        "cancelled",
      ],
      skill_origin: ["bundled", "managed", "agent", "user", "a2a"],
      skill_trust_level: ["auto", "notify", "approve"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "paused",
        "incomplete",
        "incomplete_expired",
        "unpaid",
      ],
      ticket_category: ["bug", "feature", "question", "billing", "other"],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: [
        "new",
        "open",
        "in_progress",
        "waiting",
        "resolved",
        "closed",
      ],
      webhook_event: [
        "page.published",
        "page.updated",
        "page.deleted",
        "blog_post.published",
        "blog_post.updated",
        "blog_post.deleted",
        "form.submitted",
        "newsletter.subscribed",
        "newsletter.unsubscribed",
        "booking.submitted",
        "order.created",
        "order.paid",
        "order.cancelled",
        "order.refunded",
        "product.created",
        "product.updated",
        "product.deleted",
        "booking.confirmed",
        "booking.cancelled",
        "deal.created",
        "deal.updated",
        "deal.stage_changed",
        "deal.won",
        "deal.lost",
        "company.created",
        "company.updated",
        "media.uploaded",
        "media.deleted",
        "global_block.updated",
        "kb_article.published",
        "kb_article.updated",
      ],
    },
  },
} as const
