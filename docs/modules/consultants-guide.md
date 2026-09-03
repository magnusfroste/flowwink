---
title: "Consultants — profiles and matching"
description: The consultant profile sheet (summary, skills, experience timeline, markdown bio, education, certifications) and how semantic matching keeps its embeddings fresh before every search.
category: modules
---

# Consultants — profiles and matching

> Companion to the generated [Consultants module page](./consultants.md). Hand-maintained. Reworked 2026-09-02.

The Consultants module (`/admin/consultants`, menu **Sales → Consultants**) holds the consultant pool — profiles, assignments, rate cards — and matches profiles against a job description with a hybrid text + semantic score.

---

## The page

| Tab | What it holds |
|---|---|
| **Profiles** | The pool. Click a name to open the profile sheet; the edit form is separate. |
| **Assignments** | Who works for which client, allocation %, rate, period, linked contract. |
| **Rates** | Per-skill hourly-rate matrix on top of each profile's default rate. |

## The profile sheet

A profile carries far more than the table shows — `parse-resume`, the check-in interview (`consultant_checkin_update`) and `manage_consultant_profile` all write into it. The sheet is the read view of that depth:

| Section | Source field |
|---|---|
| Header | name, title, availability, years of experience |
| **Summary** | `summary` — the prose that is embedded for matching, together with the bio |
| **Skills** | `skills` |
| **Experience** | `experience_json` — assignments as a timeline (client, role, period) |
| **Profile** | `bio` — rendered as markdown with the same renderer the Wiki uses |
| **Education** | `education` |
| **Certifications** | `certifications` |
| languages, links | badges |

Shapes are read tolerantly; the sheet writes nothing.

## Matching

`match_consultant` (edge function `consultant-match`) embeds the job description and calls the `match_consultants` RPC, which ranks by full-text score plus cosine similarity when an embedding exists. With no embedding provider configured the match runs on text alone — Law 4, it degrades rather than gates.

**Stale profiles are swept before the search.** A profile whose text changed is marked `embedding_status = 'stale'` by a trigger. Before the RPC, the match action re-embeds up to ten stale profiles with the same `embedProfiles()` the `reindex_consultants` skill uses — so the first search after a profile change already sees it, whether or not the scheduled reindex has run. The sweep is bounded and non-fatal.

The scheduled path still exists: the automation `consultant_reindex_stale` runs `reindex_consultants` every ten minutes. It is seeded when the module is bootstrapped — and since 2026-09-02 a template install bootstraps every module it enables, so an instance born from a template no longer sits with stale profiles and a keyword-only score.

## Demo data

`seed_module_demo` for `consultants` seeds ten profiles across ten competence areas with real profile prose, markdown bios, three assignments each, education, certifications and varied rates, languages and availability states (available / partially / unavailable / inactive).

---

## Files

| Purpose | Path |
|---|---|
| Page | `src/pages/admin/ConsultantProfilesPage.tsx` |
| Profile sheet | `src/components/admin/consultants/ConsultantProfileSheet.tsx` |
| Matching, sweep, reindex | `supabase/functions/consultant-match/index.ts` |
| Module, skills, automations | `src/lib/modules/consultants-module.ts` |

## See also

- [Consultants (generated)](./consultants.md) — skills and contract
- [Conversation and retrieval](../architecture/conversation-and-retrieval.md) — the embedding provider chain the matcher shares
