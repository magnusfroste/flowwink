// Docs — unified docs chat + GitHub sync
// Actions: chat, sync
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function tokenize(s: string): string[] { return (s.toLowerCase().match(/[a-z0-9åäö]+/gi) ?? []).filter((t) => t.length > 2); }
function score(text: string, qt: string[]): number { const lc = text.toLowerCase(); let s = 0; for (const t of qt) { const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"); const m = lc.match(re); if (m) s += m.length; } return s; }
function slugify(name: string) { return name.replace(/\.md$/i, "").replace(/^\d+[-_]/, "").toLowerCase(); }
function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const n = raw.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  const m = n.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, content: n };
  const fm: Record<string, unknown> = {};
  for (const line of m[1].split("\n")) { const kv = line.match(/^(\w[\w-]*):\s*(.+)$/); if (kv) { let v: unknown = kv[2].replace(/^["']|["']$/g, "").trim(); if (!isNaN(Number(v)) && v !== "") v = Number(v); fm[kv[1]] = v; } }
  return { frontmatter: fm, content: m[2] };
}

// ─── Action: chat ────────────────────────────────────────────────────────────
async function handleChat(req: Request): Promise<Response> {
  const { messages = [] } = await req.json();
  if (!messages.length) return new Response(JSON.stringify({ error: "messages required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const lastUser = [...messages].reverse().find((m: any) => m.role === "user")?.content ?? "";
  const qt = tokenize(lastUser);
  const supabase = getServiceClient();
  const { data: pages } = await supabase.from("docs_pages").select("category, slug, title, content, frontmatter").limit(500);

  const ranked = (pages ?? []).map((p: any) => ({ ...p, _score: score(p.title, qt) * 5 + score(p.content.slice(0, 4000), qt) })).filter((p: any) => p._score > 0).sort((a: any, b: any) => b._score - a._score).slice(0, 5);
  const context = ranked.map((p: any, i: number) => `[Doc ${i + 1}] ${p.title} (/docs/${p.category}/${p.slug})\n${p.content.slice(0, 2500)}`).join("\n\n---\n\n");

  const systemPrompt = `You are the Flowwink docs assistant. Answer ONLY from the provided docs. Cite sources with /docs/{category}/{slug} links. Be concise, prefer bullet points.\n\n${context || "(no relevant docs found)"}`;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "AI gateway not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", stream: true, messages: [{ role: "system", content: systemPrompt }, ...messages] }),
  });

  if (!aiRes.ok) {
    const t = await aiRes.text();
    return new Response(JSON.stringify({ error: "AI gateway error", details: t }), { status: aiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return new Response(aiRes.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
}

// ─── Action: sync ────────────────────────────────────────────────────────────
interface GHEntry { name: string; path: string; sha: string; type: string; download_url: string | null; }
async function walk(owner: string, repo: string, path: string, branch: string, out: GHEntry[]): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "FlowWink-Docs" } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const items: GHEntry[] = await res.json();
  for (const item of items) { if (item.type === "dir") await walk(owner, repo, item.path, branch, out); else if (item.type === "file" && /\.md$/i.test(item.name)) out.push(item); }
}

async function runSync(ro: string, rn: string, path: string, branch: string) {
  const supabase = getServiceClient();
  const files: GHEntry[] = []; await walk(ro, rn, path, branch, files);
  const { data: existing } = await supabase.from("docs_pages").select("file_path, sha").eq("repo_owner", ro).eq("repo_name", rn);
  const existingMap = new Map((existing ?? []).map((e: any) => [e.file_path, e.sha]));
  let synced = 0, skipped = 0; const errors: string[] = [];
  for (const file of files) {
    if (existingMap.get(file.path) === file.sha) { skipped++; continue; }
    if (!file.download_url) continue;
    try {
      const r = await fetch(file.download_url); if (!r.ok) { errors.push(`fetch ${file.path}: ${r.status}`); continue; }
      const { frontmatter, content } = parseFrontmatter(await r.text());
      const rel = file.path.startsWith(path + "/") ? file.path.slice(path.length + 1) : file.path;
      const segments = rel.split("/");
      const category = (frontmatter.category as string) || (segments.length > 1 ? segments[0] : "general");
      const title = (frontmatter.title as string) || file.name.replace(/\.md$/i, "").replace(/[-_]/g, " ");
      const { error } = await supabase.from("docs_pages").upsert({ repo_owner: ro, repo_name: rn, file_path: file.path, category, title, slug: slugify(file.name), sort_order: typeof frontmatter.order === "number" ? frontmatter.order : 999, frontmatter, content, sha: file.sha, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "repo_owner,repo_name,file_path" });
      if (error) errors.push(`upsert ${file.path}: ${error.message}`); else synced++;
    } catch (err) { errors.push(`${file.path}: ${err instanceof Error ? err.message : String(err)}`); }
  }
  const currentPaths = new Set(files.map((f) => f.path));
  const toDelete = [...existingMap.keys()].filter((p) => !currentPaths.has(p));
  if (toDelete.length > 0) await supabase.from("docs_pages").delete().eq("repo_owner", ro).eq("repo_name", rn).in("file_path", toDelete);
  return { synced, skipped, deleted: toDelete.length, total: files.length, errors };
}

async function handleSync(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { repo_owner = "magnusfroste", repo_name = "flowwink", path = "docs", branch = "main", wait = false } = body;
  if (wait) { const result = await runSync(repo_owner, repo_name, path, branch); return new Response(JSON.stringify({ success: true, ...result }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
  // @ts-ignore
  EdgeRuntime.waitUntil(runSync(repo_owner, repo_name, path, branch).catch((e) => console.error("[docs] sync error:", e)));
  return new Response(JSON.stringify({ success: true, accepted: true, message: "Sync started in background" }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── Router ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    if (!action) { try { action = (await req.json()).action; } catch { /* */ } }
    switch (action) {
      case "chat": return await handleChat(req);
      case "sync": return await handleSync(req);
      default: return new Response(JSON.stringify({ error: "Unknown action. Use: chat, sync" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) { return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
