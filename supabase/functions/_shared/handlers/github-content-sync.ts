import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getServiceClient } from '../supabase-clients.ts';
import { chapterAddress, chapterSortOrder, isChapterFile, parseFrontmatter } from '../handbook/chapter-path.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TreeEntry {
  path: string;
  sha: string;
  type: string;
}

// Moved VERBATIM from supabase/functions/github-content-sync/index.ts (edge-surface B1b).
// Kept as a Request→Response handler; agent-execute adapts args↔Request via
// callResponseHandler — zero body changes.
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { repo_owner, repo_name, path: rawPath = "src/content", branch = "main" } =
      await req.json();
    const path = String(rawPath ?? "").replace(/^\/+|\/+$/g, "");

    if (!repo_owner || !repo_name) {
      return new Response(
        JSON.stringify({ error: "repo_owner and repo_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The whole tree in ONE call (public repos, no token): the folder is read
    // recursively — a subfolder is a section (clawable-handbook keeps
    // src/content/builder and src/content/business). The contents API listed
    // one level, so a handbook in sections synced nothing.
    const treeUrl = `https://api.github.com/repos/${repo_owner}/${repo_name}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const treeRes = await fetch(treeUrl, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "FlowWink" },
    });

    if (!treeRes.ok) {
      const errText = await treeRes.text();
      const hint = treeRes.status === 404 || treeRes.status === 403
        ? `Check that github.com/${repo_owner}/${repo_name} exists, is PUBLIC and has the branch "${branch}" — private repos cannot be synced.`
        : undefined;
      return new Response(
        JSON.stringify({ error: `GitHub API error: ${treeRes.status}`, hint, details: errText.slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tree = (await treeRes.json()) as { tree?: TreeEntry[]; truncated?: boolean };
    const mdFiles = (tree.tree ?? []).filter((f) =>
      f.type === "blob" && (path === "" || f.path.startsWith(`${path}/`)) && isChapterFile(f.path)
    );
    if (mdFiles.length === 0) {
      return new Response(
        JSON.stringify({
          error: `No markdown chapters under "${path || "/"}" in ${repo_owner}/${repo_name}@${branch}.`,
          hint: "Point path at the folder that holds the .md chapter files (subfolders become sections).",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const sections = mdFiles.map((f) => chapterAddress(f.path, path).section).filter(Boolean);

    // Init Supabase admin client
    const supabase = getServiceClient();

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

      // Fetch file content (raw host: not counted against the API rate limit)
      const rawUrl = `https://raw.githubusercontent.com/${repo_owner}/${repo_name}/${encodeURIComponent(branch)}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
      const contentRes = await fetch(rawUrl);
      if (!contentRes.ok) {
        errors.push(`Failed to fetch ${file.path}`);
        continue;
      }

      const raw = await contentRes.text();
      const { frontmatter, content } = parseFrontmatter(raw);
      const { section, slug } = chapterAddress(file.path, path);
      if (section) frontmatter.section = section;

      const fileName = file.path.split("/").pop() ?? file.path;
      const title = (frontmatter.title as string) || fileName.replace(/\.mdx?$/i, "");
      const sortOrder = chapterSortOrder(section, sections, frontmatter.order);

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
        sections: [...new Set(sections)].sort(),
        errors: errors.length > 0 ? errors : undefined,
        warning: tree.truncated ? "GitHub truncated the repository tree — some chapters may be missing; point path at a smaller folder." : undefined,
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
}
