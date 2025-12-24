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
            foreignKeyName: "blog_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "blog_posts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          session_id: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          session_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
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
      pages: {
        Row: {
          content_json: Json | null
          created_at: string
          created_by: string | null
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
      products: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_cents: number
          sort_order: number | null
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number
          sort_order?: number | null
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          sort_order?: number | null
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
    }
    Enums: {
      app_role: "writer" | "approver" | "admin"
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
      app_role: ["writer", "approver", "admin"],
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
      ],
    },
  },
} as const
