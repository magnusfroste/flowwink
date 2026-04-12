import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  type: string;
  download_url: string | null;
}

interface Frontmatter {
  title?: string;
  order?: number;
  description?: string;
  [key: string]: unknown;
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content: raw };

  const yamlBlock = match[1];
  const content = match[2];
  const frontmatter: Frontmatter = {};

  for (const line of yamlBlock.split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) {
      const key = kv[1];
      let val: unknown = kv[2].replace(/^["']|["']$/g, "");
      if (!isNaN(Number(val))) val = Number(val);
      frontmatter[key] = val;
    }
  }

  return { frontmatter, content };
}

function slugFromFilename(filename: string): string {
  return filename.replace(/\.md$/, "").replace(/^\d+-/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { repo_owner, repo_name, path = "content/chapters", branch = "main" } =
      await req.json();

    if (!repo_owner || !repo_name) {
      return new Response(
        JSON.stringify({ error: "repo_owner and repo_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch directory listing from GitHub API (public repos, no token needed)
    const listUrl = `https://api.github.com/repos/${repo_owner}/${repo_name}/contents/${path}?ref=${branch}`;
    const listRes = await fetch(listUrl, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "FlowWink" },
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      return new Response(
        JSON.stringify({ error: `GitHub API error: ${listRes.status}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const files: GitHubFile[] = await listRes.json();
    const mdFiles = files.filter((f) => f.type === "file" && f.name.endsWith(".md"));

    // Init Supabase admin client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get existing chapters for this repo to detect changes via SHA
    const { data: existing } = await supabase
      .from("handbook_chapters")
      .select("file_path, sha")
      .eq("repo_owner", repo_owner)
      .eq("repo_name", repo_name);

    const existingMap = new Map((existing || []).map((e) => [e.file_path, e.sha]));

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const file of mdFiles) {
      // Skip if SHA hasn't changed
      if (existingMap.get(file.path) === file.sha) {
        skipped++;
        continue;
      }

      // Fetch file content
      if (!file.download_url) continue;
      const contentRes = await fetch(file.download_url);
      if (!contentRes.ok) {
        errors.push(`Failed to fetch ${file.path}`);
        continue;
      }

      const raw = await contentRes.text();
      const { frontmatter, content } = parseFrontmatter(raw);

      const title = (frontmatter.title as string) || file.name.replace(/\.md$/, "");
      const slug = slugFromFilename(file.name);
      const sortOrder = typeof frontmatter.order === "number" ? frontmatter.order : 999;

      const { error: upsertError } = await supabase.from("handbook_chapters").upsert(
        {
          repo_owner,
          repo_name,
          file_path: file.path,
          title,
          slug,
          sort_order: sortOrder,
          frontmatter,
          content,
          sha: file.sha,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "repo_owner,repo_name,file_path" }
      );

      if (upsertError) {
        errors.push(`Upsert ${file.path}: ${upsertError.message}`);
      } else {
        synced++;
      }
    }

    // Remove chapters that no longer exist in the repo
    const currentPaths = new Set(mdFiles.map((f) => f.path));
    const toDelete = [...existingMap.keys()].filter((p) => !currentPaths.has(p));
    if (toDelete.length > 0) {
      await supabase
        .from("handbook_chapters")
        .delete()
        .eq("repo_owner", repo_owner)
        .eq("repo_name", repo_name)
        .in("file_path", toDelete);
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        skipped,
        deleted: toDelete.length,
        total: mdFiles.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("github-content-sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
