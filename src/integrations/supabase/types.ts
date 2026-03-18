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
          capabilities: Json
          created_at: string
          created_by: string | null
          id: string
          inbound_token_hash: string | null
          last_seen_at: string | null
          name: string
          outbound_token: string
          request_count: number
          status: Database["public"]["Enums"]["a2a_peer_status"]
          updated_at: string
          url: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          inbound_token_hash?: string | null
          last_seen_at?: string | null
          name: string
          outbound_token?: string
          request_count?: number
          status?: Database["public"]["Enums"]["a2a_peer_status"]
          updated_at?: string
          url: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          inbound_token_hash?: string | null
          last_seen_at?: string | null
          name?: string
          outbound_token?: string
          request_count?: number
          status?: Database["public"]["Enums"]["a2a_peer_status"]
          updated_at?: string
          url?: string
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
      agent_activity: {
        Row: {
          agent: Database["public"]["Enums"]["agent_type"]
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input: Json | null
          output: Json | null
          skill_id: string | null
          skill_name: string | null
          status: Database["public"]["Enums"]["agent_activity_status"]
          token_usage: Json | null
        }
        Insert: {
          agent?: Database["public"]["Enums"]["agent_type"]
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          skill_id?: string | null
          skill_name?: string | null
          status?: Database["public"]["Enums"]["agent_activity_status"]
          token_usage?: Json | null
        }
        Update: {
          agent?: Database["public"]["Enums"]["agent_type"]
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          skill_id?: string | null
          skill_name?: string | null
          status?: Database["public"]["Enums"]["agent_activity_status"]
          token_usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_automations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
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
          name: string
          requires_approval: boolean
          scope: Database["public"]["Enums"]["agent_scope"]
          tool_definition: Json
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
          name: string
          requires_approval?: boolean
          scope?: Database["public"]["Enums"]["agent_scope"]
          tool_definition?: Json
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
          name?: string
          requires_approval?: boolean
          scope?: Database["public"]["Enums"]["agent_scope"]
          tool_definition?: Json
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
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
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
      chat_conversations: {
        Row: {
          assigned_agent_id: string | null
          conversation_status: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          escalated_at: string | null
          escalation_reason: string | null
          id: string
          priority: string | null
          sentiment_score: number | null
          session_id: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          conversation_status?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          id?: string
          priority?: string | null
          sentiment_score?: number | null
          session_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          conversation_status?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          id?: string
          priority?: string | null
          sentiment_score?: number | null
          session_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
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
      companies: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          domain: string | null
          enriched_at: string | null
          id: string
          industry: string | null
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
          domain?: string | null
          enriched_at?: string | null
          id?: string
          industry?: string | null
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
          domain?: string | null
          enriched_at?: string | null
          id?: string
          industry?: string | null
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
        ]
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
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price_cents: number
          product_id: string | null
          product_name: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price_cents: number
          product_id?: string | null
          product_name: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price_cents?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
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
        ]
      }
      orders: {
        Row: {
          confirmation_sent_at: string | null
          created_at: string
          currency: string
          customer_email: string
          customer_name: string | null
          id: string
          metadata: Json | null
          status: string
          stripe_checkout_id: string | null
          stripe_payment_intent: string | null
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          confirmation_sent_at?: string | null
          created_at?: string
          currency?: string
          customer_email: string
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          stripe_checkout_id?: string | null
          stripe_payment_intent?: string | null
          total_cents: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          confirmation_sent_at?: string | null
          created_at?: string
          currency?: string
          customer_email?: string
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          stripe_checkout_id?: string | null
          stripe_payment_intent?: string | null
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      products: {
        Row: {
          allow_backorder: boolean
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          low_stock_threshold: number
          name: string
          price_cents: number
          sort_order: number | null
          stock_quantity: number | null
          stripe_price_id: string | null
          track_inventory: boolean
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          allow_backorder?: boolean
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name: string
          price_cents?: number
          sort_order?: number | null
          stock_quantity?: number | null
          stripe_price_id?: string | null
          track_inventory?: boolean
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          allow_backorder?: boolean
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name?: string
          price_cents?: number
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
    }
    Functions: {
      checkout_objective: {
        Args: { p_locked_by?: string; p_objective_id: string }
        Returns: boolean
      }
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
      get_conversation_token_estimate: {
        Args: { p_conversation_id: string }
        Returns: number
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
    }
    Enums: {
      a2a_activity_status: "success" | "error" | "pending"
      a2a_direction: "inbound" | "outbound"
      a2a_peer_status: "active" | "paused" | "revoked"
      agent_activity_status:
        | "success"
        | "failed"
        | "pending_approval"
        | "approved"
        | "rejected"
      agent_memory_category: "preference" | "context" | "fact"
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
      agent_type: "flowpilot" | "chat"
      app_role: "writer" | "approver" | "admin" | "customer"
      automation_trigger_type: "cron" | "event" | "signal"
      deal_stage: "proposal" | "negotiation" | "closed_won" | "closed_lost"
      lead_status: "lead" | "opportunity" | "customer" | "lost"
      page_status: "draft" | "reviewing" | "published" | "archived"
      product_type: "one_time" | "recurring"
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
      a2a_activity_status: ["success", "error", "pending"],
      a2a_direction: ["inbound", "outbound"],
      a2a_peer_status: ["active", "paused", "revoked"],
      agent_activity_status: [
        "success",
        "failed",
        "pending_approval",
        "approved",
        "rejected",
      ],
      agent_memory_category: ["preference", "context", "fact"],
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
      ],
      agent_type: ["flowpilot", "chat"],
      app_role: ["writer", "approver", "admin", "customer"],
      automation_trigger_type: ["cron", "event", "signal"],
      deal_stage: ["proposal", "negotiation", "closed_won", "closed_lost"],
      lead_status: ["lead", "opportunity", "customer", "lost"],
      page_status: ["draft", "reviewing", "published", "archived"],
      product_type: ["one_time", "recurring"],
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
