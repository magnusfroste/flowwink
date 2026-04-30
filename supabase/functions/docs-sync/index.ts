// Recursively syncs markdown from a GitHub repo path into public.docs_pages.
// Auto-derives "category" from the first subfolder under the root path.
// Public access — no JWT required (admin gating happens client-side via UI).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GitHubEntry {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  download_url: string | null;
}

interface Frontmatter {
  title?: string;
  order?: number;
  description?: string;
  category?: string;
  [k: string]: unknown;
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; content: string } {
  // Normalize CRLF → LF so GitHub-fetched files parse the same as local.
  const normalized = raw.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  const m = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, content: normalized };
  const fm: Frontmatter = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) {
      let v: unknown = kv[2].replace(/^["']|["']$/g, "").trim();
      if (!isNaN(Number(v)) && v !== "") v = Number(v);
      fm[kv[1]] = v;
    }
  }
  return { frontmatter: fm, content: m[2] };
}

function slugify(name: string) {
  return name.replace(/\.md$/i, "").replace(/^\d+[-_]/, "").toLowerCase();
}

async function walk(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  out: GitHubEntry[],
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "FlowWink-Docs" },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  const items: GitHubEntry[] = await res.json();
  for (const item of items) {
    if (item.type === "dir") {
      await walk(owner, repo, item.path, branch, out);
    } else if (item.type === "file" && /\.md$/i.test(item.name)) {
      out.push(item);
    }
  }
}

async function runSync(
  repo_owner: string,
  repo_name: string,
  path: string,
  branch: string,
) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const files: GitHubEntry[] = [];
  await walk(repo_owner, repo_name, path, branch, files);

  const { data: existing } = await supabase
    .from("docs_pages")
    .select("file_path, sha")
    .eq("repo_owner", repo_owner)
    .eq("repo_name", repo_name);
  const existingMap = new Map((existing ?? []).map((e) => [e.file_path, e.sha]));

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const file of files) {
    if (existingMap.get(file.path) === file.sha) {
      skipped++;
      continue;
    }
    if (!file.download_url) continue;
    try {
      const r = await fetch(file.download_url);
      if (!r.ok) {
        errors.push(`fetch ${file.path}: ${r.status}`);
        continue;
      }
      const raw = await r.text();
      const { frontmatter, content } = parseFrontmatter(raw);

      const rel = file.path.startsWith(path + "/") ? file.path.slice(path.length + 1) : file.path;
      const segments = rel.split("/");
      const category = (frontmatter.category as string) ||
        (segments.length > 1 ? segments[0] : "general");

      const title = (frontmatter.title as string) ||
        file.name.replace(/\.md$/i, "").replace(/[-_]/g, " ");
      const slug = slugify(file.name);
      const sortOrder =
        typeof frontmatter.order === "number" ? frontmatter.order : 999;

      const { error } = await supabase.from("docs_pages").upsert(
        {
          repo_owner,
          repo_name,
          file_path: file.path,
          category,
          title,
          slug,
          sort_order: sortOrder,
          frontmatter,
          content,
          sha: file.sha,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "repo_owner,repo_name,file_path" },
      );
      if (error) errors.push(`upsert ${file.path}: ${error.message}`);
      else synced++;
    } catch (err) {
      errors.push(`${file.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const currentPaths = new Set(files.map((f) => f.path));
  const toDelete = [...existingMap.keys()].filter((p) => !currentPaths.has(p));
  if (toDelete.length > 0) {
    await supabase
      .from("docs_pages")
      .delete()
      .eq("repo_owner", repo_owner)
      .eq("repo_name", repo_name)
      .in("file_path", toDelete);
  }

  console.log(
    `[docs-sync] done — synced=${synced} skipped=${skipped} deleted=${toDelete.length} errors=${errors.length}`,
  );
  if (errors.length) console.error("[docs-sync] errors:", errors.slice(0, 10));
  return { synced, skipped, deleted: toDelete.length, total: files.length, errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      repo_owner = "magnusfroste",
      repo_name = "flowwink",
      path = "docs",
      branch = "main",
      wait = false, // when true, block and return full result (used by curl/CI). UI uses default fire-and-forget.
    } = await req.json().catch(() => ({}));

    if (wait) {
      const result = await runSync(repo_owner, repo_name, path, branch);
      return new Response(
        JSON.stringify({ success: true, ...result, errors: result.errors.length ? result.errors : undefined }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fire-and-forget: return 202 immediately, run sync in background.
    // Avoids 60s edge-function timeout for large repos / cold cache.
    // @ts-ignore - EdgeRuntime is available in Supabase Deno runtime
    EdgeRuntime.waitUntil(
      runSync(repo_owner, repo_name, path, branch).catch((e) =>
        console.error("[docs-sync] background failure:", e),
      ),
    );

    return new Response(
      JSON.stringify({
        success: true,
        accepted: true,
        message: "Sync started in background. Refresh in ~30s to see results.",
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[docs-sync] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
