import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CheckResult {
  id: string;
  category: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: string[];
  fixable?: boolean;
  fixAction?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const results: CheckResult[] = [];

    // ═══════════════════════════════════════════
    // 1. SKILL COMPLETENESS
    // ═══════════════════════════════════════════
    const { data: skills } = await sb
      .from("agent_skills")
      .select("id, name, enabled, instructions, tool_definition, handler, requires, category, description");

    const enabledSkills = (skills || []).filter((s: any) => s.enabled);

    // 1a. Skills without instructions
    const noInstructions = enabledSkills.filter(
      (s: any) => !s.instructions || s.instructions.trim() === ""
    );
    results.push({
      id: "skill-instructions",
      category: "Skills",
      label: "Skill instructions completeness",
      status: noInstructions.length === 0 ? "pass" : "fail",
      message:
        noInstructions.length === 0
          ? `All ${enabledSkills.length} enabled skills have instructions`
          : `${noInstructions.length} skills missing instructions (agent can't use them effectively)`,
      details: noInstructions.map((s: any) => s.name),
    });

    // 1b. Skills without description
    const noDesc = enabledSkills.filter(
      (s: any) => !s.description || s.description.trim() === ""
    );
    results.push({
      id: "skill-descriptions",
      category: "Skills",
      label: "Skill descriptions",
      status: noDesc.length === 0 ? "pass" : noDesc.length <= 3 ? "warn" : "fail",
      message:
        noDesc.length === 0
          ? "All skills have descriptions"
          : `${noDesc.length} skills missing descriptions`,
      details: noDesc.map((s: any) => s.name),
    });

    // 1c. Skills with empty/invalid tool_definition
    const badToolDef = enabledSkills.filter((s: any) => {
      if (!s.tool_definition) return true;
      const td = typeof s.tool_definition === "string" 
        ? JSON.parse(s.tool_definition) 
        : s.tool_definition;
      return !td?.function?.name || !td?.function?.parameters;
    });
    results.push({
      id: "skill-tool-definitions",
      category: "Skills",
      label: "Tool definition validity",
      status: badToolDef.length === 0 ? "pass" : "fail",
      message:
        badToolDef.length === 0
          ? "All tool definitions are valid"
          : `${badToolDef.length} skills have invalid tool definitions`,
      details: badToolDef.map((s: any) => s.name),
    });

    // 1d. Duplicate skill names
    const nameCount: Record<string, number> = {};
    for (const s of enabledSkills) {
      nameCount[s.name] = (nameCount[s.name] || 0) + 1;
    }
    const duplicates = Object.entries(nameCount)
      .filter(([_, c]) => c > 1)
      .map(([n, c]) => `${n} (×${c})`);
    results.push({
      id: "skill-duplicates",
      category: "Skills",
      label: "No duplicate skill names",
      status: duplicates.length === 0 ? "pass" : "warn",
      message:
        duplicates.length === 0
          ? "No duplicate skill names"
          : `${duplicates.length} duplicate skill names found`,
      details: duplicates,
    });

    // ═══════════════════════════════════════════
    // 2. HANDLER INTEGRITY
    // ═══════════════════════════════════════════
    const knownEdgeFunctions = new Set([
      "chat-completion", "agent-operate", "agent-execute", "agent-reason",
      "flowpilot-heartbeat", "flowpilot-briefing", "flowpilot-learn",
      "setup-flowpilot", "get-page", "copilot-action", "research-content",
      "generate-content-proposal", "newsletter-send", "send-webhook",
      "qualify-lead", "enrich-company", "prospect-research", "prospect-fit-analysis",
      "gmail-inbox-scan", "signal-ingest", "signal-dispatcher", "automation-dispatcher",
      "publish-scheduled-pages", "business-digest", "ad-campaign-create",
      "ad-creative-generate", "ad-optimize", "ad-performance-check",
      "run-autonomy-tests", "system-integrity-check", "ai-text-assist",
      "manage-cron-schedules", "stripe-webhook", "customer-signup",
    ]);

    const knownModules = new Set([
      "blog", "crm", "booking", "orders", "newsletter", "automations",
      "objectives", "analytics", "chat", "ecommerce", "kb",
    ]);

    const knownTables = new Set([
      "agent_memory", "agent_skills", "agent_activity", "agent_objectives",
      "agent_automations", "agent_workflows", "chat_conversations",
      "chat_messages", "chat_feedback", "leads", "deals", "companies",
      "crm_tasks", "bookings", "orders", "pages", "blog_posts",
      "products", "kb_articles", "kb_categories", "profiles", "site_settings",
      "form_submissions", "page_views", "ad_campaigns", "ad_creatives",
      "content_proposals", "content_research", "consultant_profiles",
      "booking_services", "booking_availability",
    ]);

    const edgeSkills = enabledSkills.filter((s: any) => s.handler?.startsWith("edge:"));
    const unknownEdge = edgeSkills.filter(
      (s: any) => !knownEdgeFunctions.has(s.handler.replace("edge:", ""))
    );
    results.push({
      id: "handler-edge",
      category: "Handlers",
      label: "Edge function handlers valid",
      status: unknownEdge.length === 0 ? "pass" : "warn",
      message:
        unknownEdge.length === 0
          ? `All ${edgeSkills.length} edge handlers reference known functions`
          : `${unknownEdge.length} skills reference unknown edge functions`,
      details: unknownEdge.map((s: any) => `${s.name} → ${s.handler}`),
    });

    const moduleSkills = enabledSkills.filter((s: any) => s.handler?.startsWith("module:"));
    const unknownModule = moduleSkills.filter(
      (s: any) => !knownModules.has(s.handler.replace("module:", ""))
    );
    results.push({
      id: "handler-module",
      category: "Handlers",
      label: "Module handlers valid",
      status: unknownModule.length === 0 ? "pass" : "warn",
      message:
        unknownModule.length === 0
          ? `All ${moduleSkills.length} module handlers reference known modules`
          : `${unknownModule.length} skills reference unknown modules`,
      details: unknownModule.map((s: any) => `${s.name} → ${s.handler}`),
    });

    const dbSkills = enabledSkills.filter((s: any) => s.handler?.startsWith("db:"));
    const unknownDb = dbSkills.filter(
      (s: any) => !knownTables.has(s.handler.replace("db:", ""))
    );
    results.push({
      id: "handler-db",
      category: "Handlers",
      label: "Database handlers valid",
      status: unknownDb.length === 0 ? "pass" : "warn",
      message:
        unknownDb.length === 0
          ? `All ${dbSkills.length} database handlers reference known tables`
          : `${unknownDb.length} skills reference unknown tables`,
      details: unknownDb.map((s: any) => `${s.name} → ${s.handler}`),
    });

    // ═══════════════════════════════════════════
    // 3. MEMORY INTEGRITY
    // ═══════════════════════════════════════════
    const criticalKeys = ["soul", "identity", "agents"];
    const { data: memoryKeys } = await sb
      .from("agent_memory")
      .select("key")
      .in("key", criticalKeys);

    const foundKeys = new Set((memoryKeys || []).map((m: any) => m.key));
    const missingKeys = criticalKeys.filter((k) => !foundKeys.has(k));
    results.push({
      id: "memory-critical-keys",
      category: "Memory",
      label: "Critical memory keys present",
      status: missingKeys.length === 0 ? "pass" : "fail",
      message:
        missingKeys.length === 0
          ? "Soul, Identity, and Agents keys all present"
          : `Missing critical memory keys — agent may lack personality/rules`,
      details: missingKeys.map((k) => `Missing: ${k}`),
    });

    // Check heartbeat protocol
    const { data: hbProto } = await sb
      .from("agent_memory")
      .select("key")
      .eq("key", "heartbeat_protocol")
      .maybeSingle();
    results.push({
      id: "memory-heartbeat-protocol",
      category: "Memory",
      label: "Heartbeat protocol configured",
      status: hbProto ? "pass" : "warn",
      message: hbProto
        ? "Custom heartbeat protocol found"
        : "No heartbeat protocol in memory — using hardcoded default",
    });

    // ═══════════════════════════════════════════
    // 4. AUTOMATION WIRING
    // ═══════════════════════════════════════════
    const { data: automations } = await sb
      .from("agent_automations")
      .select("id, name, enabled, skill_name, skill_id");

    const enabledAutos = (automations || []).filter((a: any) => a.enabled);
    const skillNames = new Set(enabledSkills.map((s: any) => s.name));
    
    const brokenAutos = enabledAutos.filter(
      (a: any) => a.skill_name && !skillNames.has(a.skill_name)
    );
    results.push({
      id: "automation-skill-wiring",
      category: "Automations",
      label: "Automations reference valid skills",
      status: brokenAutos.length === 0 ? "pass" : "fail",
      message:
        brokenAutos.length === 0
          ? `All ${enabledAutos.length} enabled automations reference valid skills`
          : `${brokenAutos.length} automations reference missing/disabled skills`,
      details: brokenAutos.map((a: any) => `${a.name} → skill "${a.skill_name}" not found`),
    });

    // ═══════════════════════════════════════════
    // 5. OBJECTIVE HYGIENE
    // ═══════════════════════════════════════════
    const { data: objectives } = await sb
      .from("agent_objectives")
      .select("id, goal, status, locked_at, locked_by, success_criteria, constraints")
      .in("status", ["active", "in_progress"]);

    const activeObj = objectives || [];

    // Zombie locks (locked > 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const zombieLocks = activeObj.filter(
      (o: any) => o.locked_at && o.locked_at < oneHourAgo
    );
    results.push({
      id: "objective-zombie-locks",
      category: "Objectives",
      label: "No zombie objective locks",
      status: zombieLocks.length === 0 ? "pass" : "warn",
      message:
        zombieLocks.length === 0
          ? "No stale objective locks"
          : `${zombieLocks.length} objectives locked for >1 hour`,
      details: zombieLocks.map(
        (o: any) => `"${o.goal.substring(0, 50)}" locked by ${o.locked_by} since ${o.locked_at}`
      ),
    });

    // Objectives without success criteria
    const noSuccessCriteria = activeObj.filter((o: any) => {
      if (!o.success_criteria) return true;
      const sc = typeof o.success_criteria === "string"
        ? JSON.parse(o.success_criteria)
        : o.success_criteria;
      return !sc || Object.keys(sc).length === 0;
    });
    results.push({
      id: "objective-success-criteria",
      category: "Objectives",
      label: "Objectives have success criteria",
      status:
        noSuccessCriteria.length === 0
          ? "pass"
          : noSuccessCriteria.length <= 2
          ? "warn"
          : "fail",
      message:
        noSuccessCriteria.length === 0
          ? `All ${activeObj.length} active objectives have success criteria`
          : `${noSuccessCriteria.length} objectives lack measurable success criteria`,
      details: noSuccessCriteria.map(
        (o: any) => `"${o.goal.substring(0, 60)}"`
      ),
    });

    // ═══════════════════════════════════════════
    // 6. GATING CONSISTENCY
    // ═══════════════════════════════════════════
    const gatedSkills = enabledSkills.filter(
      (s: any) => s.requires && Array.isArray(s.requires) && s.requires.length > 0
    );

    const { data: siteSettingsRows } = await sb
      .from("site_settings")
      .select("key, value")
      .in("key", ["modules", "integrations"]);

    let activeModules: string[] = [];
    let activeIntegrations: string[] = [];
    for (const row of siteSettingsRows || []) {
      if (row.key === "modules") {
        const mods = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        activeModules = Object.entries(mods || {})
          .filter(([_, v]: any) => v === true || v?.enabled === true)
          .map(([k]) => k);
      }
      if (row.key === "integrations") {
        const ints = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        activeIntegrations = Object.entries(ints || {})
          .filter(([_, v]: any) => v && (typeof v === "object" ? v.enabled !== false : true))
          .map(([k]) => k);
      }
    }

    const unmetGating: string[] = [];
    for (const s of gatedSkills) {
      const reqs = s.requires as any[];
      for (const req of reqs) {
        if (req.type === "module" && !activeModules.includes(req.id || req.name)) {
          unmetGating.push(`${s.name}: requires module "${req.id || req.name}"`);
        }
        if (req.type === "integration" && !activeIntegrations.includes(req.key || req.name)) {
          unmetGating.push(`${s.name}: requires integration "${req.key || req.name}"`);
        }
        if (req.type === "skill") {
          const reqName = req.name;
          if (!skillNames.has(reqName)) {
            unmetGating.push(`${s.name}: requires skill "${reqName}"`);
          }
        }
      }
    }
    results.push({
      id: "skill-gating",
      category: "Skills",
      label: "Skill gating prerequisites met",
      status: unmetGating.length === 0 ? "pass" : "warn",
      message:
        unmetGating.length === 0
          ? `All ${gatedSkills.length} gated skills have prerequisites met`
          : `${unmetGating.length} unmet prerequisites`,
      details: unmetGating,
    });

    // ═══════════════════════════════════════════
    // 7. SECRETS CHECK
    // ═══════════════════════════════════════════
    const criticalSecrets = ["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"];
    const optionalSecrets = [
      { name: "RESEND_API_KEY", usage: "Newsletter, email sending" },
      { name: "GEMINI_API_KEY", usage: "Gemini AI provider" },
      { name: "JINA_API_KEY", usage: "Web scraping, content research" },
      { name: "HUNTER_API_KEY", usage: "Lead enrichment, prospect research" },
      { name: "STRIPE_SECRET_KEY", usage: "Payment processing" },
    ];

    const missingCritical: string[] = [];
    for (const s of criticalSecrets) {
      if (!Deno.env.get(s)) missingCritical.push(s);
    }
    results.push({
      id: "secrets-critical",
      category: "Secrets",
      label: "Critical API keys configured",
      status: missingCritical.length === 0 ? "pass" : "fail",
      message:
        missingCritical.length === 0
          ? "All critical secrets are set"
          : `${missingCritical.length} critical secrets missing`,
      details: missingCritical,
    });

    const missingOptional: string[] = [];
    for (const s of optionalSecrets) {
      if (!Deno.env.get(s.name)) missingOptional.push(`${s.name} (${s.usage})`);
    }
    results.push({
      id: "secrets-optional",
      category: "Secrets",
      label: "Optional integration keys",
      status: missingOptional.length === 0 ? "pass" : "warn",
      message:
        missingOptional.length === 0
          ? "All optional secrets configured"
          : `${missingOptional.length} optional secrets not set`,
      details: missingOptional,
    });

    // ═══════════════════════════════════════════
    // 8. WORKFLOW INTEGRITY
    // ═══════════════════════════════════════════
    const { data: workflows } = await sb
      .from("agent_workflows")
      .select("id, name, enabled, steps")
      .eq("enabled", true);

    const brokenWorkflows: string[] = [];
    for (const wf of workflows || []) {
      const steps = typeof wf.steps === "string" ? JSON.parse(wf.steps) : wf.steps;
      if (!Array.isArray(steps) || steps.length === 0) {
        brokenWorkflows.push(`${wf.name}: no steps defined`);
        continue;
      }
      for (const step of steps) {
        if (step.skill_name && !skillNames.has(step.skill_name)) {
          brokenWorkflows.push(`${wf.name}: step references unknown skill "${step.skill_name}"`);
        }
      }
    }
    results.push({
      id: "workflow-integrity",
      category: "Workflows",
      label: "Workflow steps reference valid skills",
      status: brokenWorkflows.length === 0 ? "pass" : "warn",
      message:
        brokenWorkflows.length === 0
          ? `All ${(workflows || []).length} enabled workflows are valid`
          : `${brokenWorkflows.length} workflow issues found`,
      details: brokenWorkflows,
    });

    // ═══════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════
    const passCount = results.filter((r) => r.status === "pass").length;
    const warnCount = results.filter((r) => r.status === "warn").length;
    const failCount = results.filter((r) => r.status === "fail").length;

    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
          total: results.length,
          pass: passCount,
          warn: warnCount,
          fail: failCount,
          score: Math.round((passCount / results.length) * 100),
        },
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
