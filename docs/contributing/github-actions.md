---
title: "GitHub Actions — what runs, what it costs, what it is for"
description: Every workflow in .github/workflows, its trigger, its monthly volume, what it proves and what it would cost if the repository were private; how to measure it again.
category: contributing
---

# GitHub Actions — what runs, what it costs, what it is for

Inventory of 2026-11-21, measured over the 30 days before it (2 462 runs in
this repository). Re-measure before you trust the numbers below; the method is
at the end.

## What it costs

**Nothing.** `magnusfroste/flowwink` is public, and every job runs on
`ubuntu-latest`: standard runners on a public repository are free. The
billing page still prints a gross amount for it (≈ 49 USD of Linux minutes in
November) and then takes all of it off as "Free usage". The seven fleet forks
are public too, and their copies of the fleet-only workflows are skipped
(`if: github.repository == 'magnusfroste/flowwink'`).

What the account *does* pay for is a different thing: the plan's **included
compute for PRIVATE repositories** (12 USD a month ≈ 2 000 Linux minutes),
then the Actions budget (10 USD), then private runs stop. In November that
quota was used up by a private repository outside FlowWink, not by anything
here. If "GitHub is eating credits", look at private repositories first:
Settings → Billing and licensing → Usage, group by *Repositories*.

The minutes still matter when they are free: they are queue time (an account
runs 20 jobs at once), CI waiting before a merge, and noise in the run list.

## The workflows

Monthly figures are runs × billable minutes per run (job time, each job
rounded up to the minute), sampled 2026-11-21.

| Workflow | Trigger | Runs / 30 d | ≈ min / 30 d | What it is for | Value |
|---|---|---|---|---|---|
| `ci.yml` — CI | every PR push; every push to main | 871 (533 PR, 338 main) | 7 000 | Type check, correctness lint, the ESLint ratchet, ~3 900 unit and guardrail tests (6.5 min), build (1.6 min). | **Essential.** The main runs are what `main-red-alert` reads. |
| `codeql.yml` — CodeQL | push to main (not docs-only); Tuesdays 04:17 | 351 before the trim, ~130 after | 1 500 → ~560 | Taint analysis of the web app, results under Security → Code scanning. | Medium. One more reader; the repo's own guards catch what it cannot model (Deno request sources). |
| `fresh-install-nightly.yml` | daily (lands ~10 UTC); called by the fork sync and by the PR battery | 38 own | 510 | A site built from nothing: every migration, the template, the process battery, view sweep, skill smoke, MCP regression. Commits the battery stamp. | **Essential.** The proof a deploy waits for. Its own schedule is the day's second look at main. |
| `pr-process-battery.yml` | PR that touches migrations, edge functions, the battery, a module's skills or a template | 137 | 470 | The fresh install at `scope: battery` on the PR's merge ref. | High. A newer push cancels the older run. |
| `nightly-fork-sync.yml` | daily 20:53 (lands ~01:30 UTC); by hand | 59 | 350 | gate → proof (the fresh install) → merge-upstream on the seven forks. That is the fleet's production deploy. | **Essential.** |
| `main-red-alert.yml` | after every CI run; every 15 min | 474 | 520 | Opens one issue when main stays red past the grace window. The cron exists because scheduled runs arrive up to an hour late (see the file). | Medium; cheap (1 min a run). |
| `refresh-generated-artifacts.yml` | push to main | 338 | 340 | Rebuilds and commits the eight generated artifacts after every merge. A PR must never carry them. | Required by the artifact rule. |
| `mcp-regression.yml` | push to main touching the gateway; daily 06:00 | 137 | 220 | Live MCP handshake + `tools/list` diff against `MCP_REGRESSION_URL`; the sites in `MCP_PROBE_SITES` at `/mcp`. | Medium. |
| `proof-alert.yml` | after the sync; every 6 h | 32 | 6 | One issue (`proof-red`) when the latest sync did not go through or none succeeded in 36 h. | Cheap insurance. |
| `security-scan.yml` | Mondays 05:41; by hand | 7 | 16 | Every guardrail test + `npm audit` of the production tree; opens `security-red`. | High per run; weekly. |
| `release.yml`, `docker-image.yml`, `release-pulse.yml` | a `v*` tag (pulse also weekly) | a few | ~30 | The GitHub release, the self-hosted frontend image, the release cadence check. | On release only. |
| Dependabot (`dynamic`) | GitHub's own | a handful | ~10 | Dependency update PRs. | — |

## Trimmed 2026-11-21

- **CodeQL no longer runs on pull requests**, and a docs-only push to main is
  not analysed. It was 218 of 351 runs. With one committer, a PR is on main
  within the hour, and main's run puts the finding under Code scanning all the
  same.
- **CI: a newer push to a pull request cancels the older run.** main's runs
  never cancel each other, because `main-red-alert` reads every one of them.

Left as it is, on purpose:

- **The main push run of CI**, which repeats the PR's run (~2 700 min). It is
  the signal `main-red-alert` reads, and the only run that checks the result of
  two PRs merged in a row.
- **The fresh install's own daily schedule** (~420 min). The run inside the
  sync proves what is deployed; the daytime run looks at what was merged since.

## Measure it again

```bash
# Runs per workflow, one day at a time (the runs search caps at 1 000).
gh api --paginate "repos/magnusfroste/flowwink/actions/runs?created=2026-11-20&per_page=100" \
  --jq '.workflow_runs[] | [.name,.event,.conclusion] | @tsv' | sort | uniq -c | sort -rn
```

```bash
# Billable job minutes of one run (each job rounded up to a minute).
gh api "repos/magnusfroste/flowwink/actions/runs/<run-id>/jobs" \
  --jq '.jobs[] | [.name,.started_at,.completed_at] | @tsv'
```

The `/timing` endpoint answers 0 under the current billing model; read the
job times instead. The money is only on the billing page (the API needs the
`user` scope): Settings → Billing and licensing → Usage, grouped by
*Repositories* or *SKUs*. Overview → *Current included usage → More details*
shows how much of the private quota is spent.
