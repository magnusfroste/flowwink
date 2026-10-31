---
title: "The handbook: connect yours or start one"
description: The Handbook module mirrors a public GitHub folder of markdown chapters — the Agentic AI Handbook behind clawable.org by default, or a company's own handbook.
category: operators
---

# The handbook: connect yours or start one

The Handbook module mirrors **a folder of markdown files in a public GitHub
repo** into the instance. People read it under Admin → Handbook and in the
Handbook block on a page; FlowPilot and connected agents read it through
`handbook_search`. GitHub stays the master: you edit there, the instance pulls.

Out of the box it points at the **Agentic AI Handbook** behind
[clawable.org](https://www.clawable.org):

| Field | Default |
|---|---|
| Owner | `magnusfroste` |
| Repository | `clawable-handbook` |
| Path | src/content (two editions: builder/ and business/) |
| Branch | `main` |

Before 2026-10-31 the default named `magnusfroste/clawable` and the path
src/content/chapters. That repo is no longer reachable on GitHub and the
chapters moved, so a sync found nothing. An instance that saved the old values
keeps them: open Config → **Use the clawable.org handbook** → Save → Sync.

## Connect your company's own handbook

1. Admin → Handbook → **Config**.
2. **Owner** and **Repository** from `github.com/<owner>/<repo>`.
3. **Path** — the folder that holds the chapters. It is read recursively.
4. **Branch** — usually `main`.
5. Save config → **Sync**. The answer says how many chapters were synced,
   unchanged and removed, and which sections it found.

The repo must be **public**: the sync reads GitHub without a token. A
private repo answers 404 and the sync says so.

## Start one

Create a public repo (for example `your-org/handbook`) with:

```
handbook/
  01-welcome.md
  02-how-we-work.md
  03-tools-and-access.md
  sales/
    01-pricing.md
    02-quotes.md
```

Set Path to `handbook` and Sync. Each file is one chapter:

```markdown
---
title: "How we work"
order: 2
description: "Hours, meetings, and who decides what."
---

The chapter body, in markdown.
```

## The rules the sync follows

- **One `.md` file per chapter.** `.mdx` is read as markdown too.
- **Frontmatter is optional**:
  - `title` (else the file name);
  - `order` (decimals work: `5.5` sits between 5 and 6);
  - `description`.
- **A number prefix orders files and is dropped from the address**:
  `01-welcome.md` → `welcome`.
- **A subfolder is a section.** Its chapters are addressed `<section>/<slug>`,
  for example `sales/pricing`, the same shape clawable.org uses for its
  `business/` edition. Sections sort alphabetically, and chapters within a
  section by `order`. Admin and the block show a heading per section.
- **All-caps files are skipped**: `README.md`, `SOURCES.md`, `CHANGELOG.md`.
  They describe the repo, not the handbook.
- **Links between chapters** open the chapter in the reader. These all work:
  - `02-how-we-work.md`;
  - `../sales/pricing.md`;
  - `/sales/pricing`.
- **Syncing is incremental.** An unchanged file (same blob sha) is skipped.
  A file removed from the repo is removed here, but its revision history
  keeps it (`handbook_chapter_history`).

## For agents

`handbook_search()` lists every chapter with its slug, `query` searches titles
and bodies, and `slug` reads one chapter. A bare slug such as `foreword` works
when only one section has it. When several sections have it, the answer names
the full slugs to choose from. `sync_handbook_from_github(repo_owner,
repo_name, path, branch)` is the same sync the admin button runs.
