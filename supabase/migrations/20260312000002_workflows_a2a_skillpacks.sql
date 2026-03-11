
-- ─── Workflow DAGs ────────────────────────────────────────────────────────────
-- Multi-step automation chains with conditional branching and output passing

CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,
  description   text,
  -- Array of WorkflowStep: [{id, skill_name, skill_args, condition?, on_failure?}]
  steps         jsonb       NOT NULL DEFAULT '[]',
  trigger_type  text        NOT NULL DEFAULT 'manual',  -- manual | cron | event | signal
  trigger_config jsonb      DEFAULT '{}',
  enabled       boolean     NOT NULL DEFAULT true,
  run_count     int         NOT NULL DEFAULT 0,
  last_run_at   timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflows"
  ON public.agent_workflows FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can manage workflows"
  ON public.agent_workflows FOR ALL TO public
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_agent_workflows_updated_at
  BEFORE UPDATE ON public.agent_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── Skill Packs ─────────────────────────────────────────────────────────────
-- Template-bundled skill sets installable with one command

CREATE TABLE IF NOT EXISTS public.agent_skill_packs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL UNIQUE,
  description  text,
  version      text        NOT NULL DEFAULT '1.0.0',
  -- Array of skill records to upsert on install
  skills       jsonb       NOT NULL DEFAULT '[]',
  installed    boolean     NOT NULL DEFAULT false,
  installed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_skill_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage skill packs"
  ON public.agent_skill_packs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can manage skill packs"
  ON public.agent_skill_packs FOR ALL TO public
  USING (true) WITH CHECK (true);


-- ─── Seed Skill Packs ─────────────────────────────────────────────────────────

INSERT INTO public.agent_skill_packs (name, description, version, skills) VALUES
(
  'E-Commerce Pack',
  'Skills for product promotion, order management, and customer retention',
  '1.0.0',
  '[
    {
      "name": "product_promoter",
      "description": "Creates a promotional blog post highlighting a product''s features and benefits with SEO-friendly content",
      "handler": "module:blog",
      "category": "content",
      "scope": "internal",
      "requires_approval": false,
      "enabled": true,
      "instructions": "# product_promoter\nUse this to create a blog post promoting a specific product.\n\nParameters:\n- action: always \"create\"\n- title: e.g. \"Why [Product] is the Best Choice for [Audience]\"\n- content_brief: describe the product, key benefits, target audience\n- status: \"draft\" to review before publishing\n\nTip: Combine with search_web to research competitor positioning first.",
      "tool_definition": {
        "type": "function",
        "function": {
          "name": "product_promoter",
          "description": "Create a promotional blog post for a product with SEO-friendly content",
          "parameters": {
            "type": "object",
            "properties": {
              "product_name": {"type": "string"},
              "key_benefits": {"type": "array", "items": {"type": "string"}},
              "target_audience": {"type": "string"},
              "publish": {"type": "boolean", "description": "true to publish immediately, false for draft"}
            },
            "required": ["product_name", "key_benefits"]
          }
        }
      }
    },
    {
      "name": "cart_recovery_check",
      "description": "Lists recent orders with abandoned or incomplete status and drafts a recovery email campaign",
      "handler": "module:orders",
      "category": "crm",
      "scope": "internal",
      "requires_approval": true,
      "enabled": true,
      "instructions": "# cart_recovery_check\nUse to identify orders that need follow-up.\n\nParameters:\n- action: \"list\"\n- status_filter: \"abandoned\" or \"pending\"\n\nAfter listing, use send_newsletter or write_blog_post to create a recovery campaign targeting these customers.",
      "tool_definition": {
        "type": "function",
        "function": {
          "name": "cart_recovery_check",
          "description": "List incomplete or abandoned orders to identify cart recovery opportunities",
          "parameters": {
            "type": "object",
            "properties": {
              "days_back": {"type": "number", "description": "How many days back to look (default: 7)"},
              "limit": {"type": "number"}
            }
          }
        }
      }
    },
    {
      "name": "inventory_report",
      "description": "Generates a product inventory status report showing stock levels and suggests restocking or promotions",
      "handler": "module:products",
      "category": "analytics",
      "scope": "internal",
      "requires_approval": false,
      "enabled": true,
      "instructions": "# inventory_report\nUse to get a snapshot of product catalog and stock.\n\nParameters:\n- action: \"list\"\n- include_inactive: false (only active products)\n\nOutput includes product names, prices, and any stock fields. Use to identify which products to promote or flag for restocking.",
      "tool_definition": {
        "type": "function",
        "function": {
          "name": "inventory_report",
          "description": "Generate a product inventory status report with stock levels and promotion suggestions",
          "parameters": {
            "type": "object",
            "properties": {
              "low_stock_threshold": {"type": "number"},
              "category_filter": {"type": "string"}
            }
          }
        }
      }
    }
  ]'::jsonb
),
(
  'Content Marketing Pack',
  'Skills for content calendar management, SEO briefs, and social media amplification',
  '1.0.0',
  '[
    {
      "name": "content_calendar_view",
      "description": "Lists all scheduled and draft blog posts, identifies content gaps, and suggests a publishing cadence",
      "handler": "module:blog",
      "category": "content",
      "scope": "internal",
      "requires_approval": false,
      "enabled": true,
      "instructions": "# content_calendar_view\nUse to audit the content pipeline.\n\nParameters:\n- action: \"list\"\n- status: \"draft\" or \"scheduled\"\n\nAfter listing, analyze gaps: topics not covered, publishing frequency, SEO keyword coverage. Use propose_objective to create content goals.",
      "tool_definition": {
        "type": "function",
        "function": {
          "name": "content_calendar_view",
          "description": "View scheduled and draft content, identify gaps in the content calendar",
          "parameters": {
            "type": "object",
            "properties": {
              "look_ahead_days": {"type": "number", "description": "Days to look ahead for scheduled posts"},
              "include_drafts": {"type": "boolean"}
            }
          }
        }
      }
    },
    {
      "name": "seo_content_brief",
      "description": "Generates a detailed SEO content brief for a topic including target keywords, outline, and competitor analysis",
      "handler": "edge:research-content",
      "category": "content",
      "scope": "internal",
      "requires_approval": false,
      "enabled": true,
      "instructions": "# seo_content_brief\nUse before writing any SEO-targeted content.\n\nParameters:\n- topic: the subject to research\n- target_audience: who will read this\n\nReturns: keyword suggestions, related questions, competitor coverage gaps, recommended outline. Use the output to inform write_blog_post.",
      "tool_definition": {
        "type": "function",
        "function": {
          "name": "seo_content_brief",
          "description": "Generate an SEO content brief with keywords, outline, and competitor analysis for a topic",
          "parameters": {
            "type": "object",
            "properties": {
              "topic": {"type": "string"},
              "target_audience": {"type": "string"},
              "content_type": {"type": "string", "enum": ["blog_post", "landing_page", "kb_article"]}
            },
            "required": ["topic"]
          }
        }
      }
    },
    {
      "name": "social_post_batch",
      "description": "Creates social media posts (LinkedIn, X, Instagram) for recent published blog posts to amplify reach",
      "handler": "edge:generate-social-post",
      "category": "content",
      "scope": "internal",
      "requires_approval": true,
      "enabled": true,
      "instructions": "# social_post_batch\nUse after publishing blog content to create social variants.\n\nParameters:\n- blog_post_id or content: source content\n- platforms: [\"linkedin\", \"x\", \"instagram\"]\n- tone: \"professional\", \"casual\", \"inspirational\"\n\nRequires approval before posting. Creates drafts for admin review.",
      "tool_definition": {
        "type": "function",
        "function": {
          "name": "social_post_batch",
          "description": "Generate social media posts for multiple platforms from a blog post",
          "parameters": {
            "type": "object",
            "properties": {
              "blog_post_id": {"type": "string"},
              "platforms": {"type": "array", "items": {"type": "string", "enum": ["linkedin", "x", "instagram"]}},
              "tone": {"type": "string", "enum": ["professional", "casual", "inspirational"]}
            },
            "required": ["blog_post_id"]
          }
        }
      }
    }
  ]'::jsonb
),
(
  'CRM Nurture Pack',
  'Skills for lead pipeline review, deal acceleration, and customer health tracking',
  '1.0.0',
  '[
    {
      "name": "lead_pipeline_review",
      "description": "Reviews leads by status and score, identifies hot prospects, and suggests personalized follow-up actions",
      "handler": "module:crm",
      "category": "crm",
      "scope": "internal",
      "requires_approval": false,
      "enabled": true,
      "instructions": "# lead_pipeline_review\nUse to audit the lead pipeline regularly.\n\nParameters:\n- action: \"list\"\n- status: \"new\" or \"contacted\" to find leads needing action\n- limit: 20\n\nAfter listing, use prospect_research to enrich hot leads. Use qualify_lead to score them. Suggest follow-up actions based on lead source and data.",
      "tool_definition": {
        "type": "function",
        "function": {
          "name": "lead_pipeline_review",
          "description": "Review the lead pipeline, identify hot prospects, and suggest follow-up actions",
          "parameters": {
            "type": "object",
            "properties": {
              "status_filter": {"type": "string", "enum": ["new", "contacted", "qualified", "all"]},
              "days_since_contact": {"type": "number", "description": "Only show leads not contacted in N days"},
              "limit": {"type": "number"}
            }
          }
        }
      }
    },
    {
      "name": "deal_stale_check",
      "description": "Identifies deals without recent activity and generates personalized nudge messages to re-engage prospects",
      "handler": "module:deals",
      "category": "crm",
      "scope": "internal",
      "requires_approval": true,
      "enabled": true,
      "instructions": "# deal_stale_check\nUse weekly to prevent deals from going cold.\n\nParameters:\n- action: \"list\"\n- stage_filter: exclude \"closed_won\" and \"closed_lost\"\n\nFor stale deals (no update >7 days), draft a personalized re-engagement message. Use the deal value and contact name for personalization. Requires approval before sending.",
      "tool_definition": {
        "type": "function",
        "function": {
          "name": "deal_stale_check",
          "description": "Find stale deals and generate re-engagement messages for prospects",
          "parameters": {
            "type": "object",
            "properties": {
              "stale_days": {"type": "number", "description": "Consider stale if no update in N days (default: 7)"},
              "min_deal_value": {"type": "number"}
            }
          }
        }
      }
    },
    {
      "name": "customer_health_digest",
      "description": "Generates a weekly customer health report combining order history, support interactions, and engagement metrics",
      "handler": "module:orders",
      "category": "analytics",
      "scope": "internal",
      "requires_approval": false,
      "enabled": true,
      "instructions": "# customer_health_digest\nUse weekly or on-demand for customer success monitoring.\n\nParameters:\n- action: \"list\"\n- time_window: \"30d\" or \"7d\"\n\nCombine with CRM data to identify: at-risk customers (no purchases in 60+ days), champions (repeat buyers), and upsell candidates. Auto-save insights to memory.",
      "tool_definition": {
        "type": "function",
        "function": {
          "name": "customer_health_digest",
          "description": "Generate a customer health report with order patterns, engagement, and risk signals",
          "parameters": {
            "type": "object",
            "properties": {
              "time_window_days": {"type": "number", "description": "Analysis window in days (default: 30)"},
              "segment": {"type": "string", "enum": ["all", "at_risk", "champions", "new"]}
            }
          }
        }
      }
    }
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;
