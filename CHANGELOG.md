# Changelog

All notable changes to FlowWink will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release process: [docs/operators/release-process.md](docs/operators/release-process.md).

## [Unreleased]

### Added

- **A paid order gets its receipt by itself.** The receipt is the order's paid
  invoice, sent by the new automation `Receipt on paid order` in the language the
  customer ordered in (`order_receipt` template, en + sv). It can be switched off
  per instance, and it needs the Invoicing module. The public invoice page is
  translatable and calls a paid invoice a receipt. The PDF is still in English.

### Fixed

- **Three inbound endpoints verify their caller; River's media is not
  listable by anyone; what stays open is written down.** `signal-ingest`
  accepted the publishable key (it ships in the site's JavaScript), so anyone
  could create blog drafts, memories and AI work — now the service key, a
  member of staff or the instance's own `signal_ingest_token`. `voice-recording`
  played a voicemail for anyone holding the call id — staff only, the panel
  fetches it with the session. `voice-ingest` takes the provider's URL secret
  on call webhooks, and an opt-in `VOICE_STREAM_SECRET` on the AI stream.
  `river-media` let anon LIST every file the team posted — images still open
  by URL, listing is staff's. `npm run qa:open-access` (nightly) lists every
  table policy, storage policy and public bucket open to an anonymous visitor
  from the database and requires a written reason for each. Known-ungated 12 → 9.
- **UB becomes IB for agents too.** The agent report read stored opening balances
  per year, so a later year opened at zero and an agent booked the previous closing
  balance as a voucher. Every reader now derives it, and only the bridge of the
  first fiscal year can be stored (`IB_IS_DERIVED`).
- **An order is invoiced at what the customer paid.** Gross lines were read as net
  and VAT added again, and a paid order's invoice asked to be paid. It is now split
  per rate and born paid. A cancelled invoice is no longer reused for its order, so
  the order can be invoiced again.
- **An issued invoice cannot be deleted in the admin view.** Only a draft can: the
  link in the customer's mail stopped answering when the invoice went.
- **Internal order markers no longer reach the customer** in a new invoice's notes.

- **An alarm means something is wrong now.** The bell was amber every day on every
  instance, because any agent run on notify trust painted it; it is amber now for
  a person being needed or something still broken, and a healed integration stops
  warning. A read is no longer "an agent acted on its own". An automation is
  `stale` against its own schedule, not after 48 hours (a monthly job was dead 29
  days of 30), and warns while its own newest run failed, not for a week after.
- **The feedback board and the daily ping write again.** #922 took anon's write
  policies and its EXECUTE on `feedback_record_ping` on the belief that content-api
  writes as the service role; it wrote with the anon client under the name `admin`,
  so every instance's ping answered 500 from 2026-11-08. It now is the service
  client, and a guard scans every edge function for an anon client calling an RPC
  anon has lost.
- **Panels of a module that is off leave the pages they are mounted on.**
  FlowBox shows no chat, ticket, form or call item and no Calls tab for a
  module that is off; Flowwork's document panel saves to the wiki only with
  Wiki on; deal and company pages carry reports only with Reports on; the
  Receiving tab in Inventory needs Purchasing; a lead's process flow shows
  only the steps (deal, quote, contract, invoice) whose module is on, and its
  open quotes need Quotes. `foreign-module-panels-ask` now reads the legacy
  dependency edges and ignores shared reference tables (people, currencies,
  the activity timeline): 24 findings → 8.
- **A module that is off is quiet on Observability, the bell, the dashboard
  and analytics.** Automations, failed skill runs, MCP failures, staged writes,
  notify runs and pg_cron jobs of a module the operator switched off kept
  raising warnings and counts. They are now judged by the module that owns
  them (`src/lib/module-visibility.ts`, the server's `skillModuleOn`); cron
  jobs carry their module (`CRON_JOB_MODULE`) and are never red, never
  required and never "drifted" while it is off. Analytics no longer offers
  "Enable <module>" prompts, Pipeline/Marketing tabs or goal kinds for modules
  that are off. New guards: `off-modules-stay-quiet`, `foreign-module-panels-ask`.
- **Meeting polls says when it is off, and has a place in the sidebar.** The
  Meeting polls tab under Bookings rendered its full desk with the module off
  (the default) — `/poll/<token>` answered 404 and every poll skill was
  refused, so the feature looked present and failed, or was never found. The
  tab now says it is switched off, with a door to Modules for an admin; the
  sidebar carries **Meeting polls** (`/admin/bookings/polls`) under its own
  module, so it appears when the module is on and the route gate agrees with
  it. A role that may use Bookings may use its meeting polls
  (`20261108200000`, insert-if-absent).
- **One service client per isolate.** `getServiceClient()` in
  `_shared/supabase-clients.ts` memoises the service-role client instead of
  running `createClient` on each of its 118 call sites (some inside per-row
  loops; PR #926 counted 648 constructions in one gateway owner filter). Safe
  because no edge code mutates a service client's auth state; `getUserClient`
  stays per-request since it carries the caller's JWT. Measured: 1000
  constructions ≈ 26 ms (bun, supabase-js 2.119) — small per call, paid on
  every hot path.
- **A recurring price says its own period — on the site and at checkout
  (#941).** `products.billing_interval` (month | year) was set in admin and
  read by quotes, but every visitor surface printed "/mo" or "/month" for every
  recurring product, and Stripe checkout created every recurring price with
  interval `month`. A service contract at 14 900 kr per year read
  "14 900 kr/mo" on the site and, bought online, was charged 14 900 kr every
  month. Now one rule (`src/lib/price-period.ts`, `usePricePeriodText`) serves
  the shop page, the products block, the featured product, the product page and
  its related products, the pricing page and two admin previews, with `/year` and `/yr`
  visitor texts beside `/month` and `/mo`; checkout bills on the product's
  period (`stripeInterval`) and replaces a stored Stripe price whose interval
  does not match instead of reusing it (subscriptions already on the old price
  keep it). Guard `price-period-from-the-product` scans every file for the
  shape `type === 'recurring'` beside a hard-coded month.
### Security

- **react-router 7.** `react-router-dom` 6.30 → 7.18 closes the two
  moderate react-router advisories (open redirect via a backslash in `<Link>` /
  `useNavigate`, constructor injection via `deserializeErrors`). The app runs
  one data router (`createBrowserRouter` in `App.tsx`) with absolute paths only
  — no splat routes, no relative links — so v7's one behavioural change
  (relative paths inside splat routes) has nothing to move. `npm audit
  --omit=dev`: 2 moderate left, both satori under `@vercel/og`.

- **zod 4.** The last high advisory in the production tree (zod `<4.6.6`:
  memory exhaustion validating oversized constrained collections) is gone:
  `zod` 3.25 → 4.6, `@hookform/resolvers` 3 → 5, and the edge `ai-task`
  schemas from esm.sh 3.23 → 4.6. What zod 4 changed, applied: `z.record`
  takes its key schema (22 sites), `ZodError.errors` is `.issues` (5), a form
  whose schema carries defaults types its input and output apart. And one
  change no test would have caught: zod 4's `.uuid()` checks the RFC version
  bits and refuses ids the baseline seeds into every database
  (`aaaaaaa1-0000-0000-0000-000000000001`, `11111111-…`, `…00c0de`) — all 70
  id checks use `z.guid()`, zod 3's rule exactly, and the guard
  `ids-are-guids` keeps the strict form out. `npm audit --omit=dev`: 4
  moderate left (react-router 7, satori under @vercel/og).

- **Production dependencies without a known high or critical advisory but two.**
  `npm audit --omit=dev` went from 18 (1 critical, 7 high) to 5 (1 high, 4
  moderate). `vitest` and `jsdom` were in `dependencies` and dragged the whole
  vite / esbuild / rollup tool chain into the production tree — they are
  `devDependencies` now, and the critical one left with them. `pdfjs-dist` 5 → 6
  (arbitrary JavaScript on opening a malicious PDF; the chat attachment reader,
  text extraction proved on a two-page PDF), `react-router-dom` 6.30.6, and
  patched copies of `lodash`, `ws`, `yaml`, `picomatch`, `fflate` and
  `postcss-selector-parser` pinned through `overrides`. Left, each its own
  change: `zod` 4 (high; 62 files), `react-router` 7 (moderate; a router major),
  and `satori` under `@vercel/og` — 1.0.3 requires `fs` in its edge build, which
  the edge runtime does not have, so the OG cards stay on 0.6.8 until a release
  that runs there.

- **The method that should have caught it, repaired.** The weekly security
  scan had been red since its first run (2026-10-26) on `npm audit`, before the
  guardrails step ever ran, and nothing watched the workflow; the five tool
  functions sat in the public-functions guard's known-debt list for 40 days
  with a green badge beside them. Now the scan is two jobs (advisories and
  guardrails — one never hides the other), the guardrails job runs EVERY
  guardrail test instead of a hand list of nine (40 security-shaped guards were
  outside it), and each job that fails opens or updates one issue (label
  `security-red`) and closes it when green. The known-debt list carries a
  clock: a name may stay `KNOWN_UNGATED` for 60 days, then the guard is red with
  the two ways out named — gate it or prove it visitor-facing by design. A
  CodeQL workflow (javascript-typescript, security-extended) runs on every PR
  and weekly; it is one more reader, not the method — Deno's request sources
  are not modelled there, which is why the repo's own guards exist.
- **Outbound URLs are judged before they are fetched (SSRF, CWE-918).** An
  independent researcher (Riddhish Lichade) reported that `extract-pdf-text`,
  `web-scrape` and `browser-fetch` were reachable without a caller check and
  fetched a caller-supplied URL as given, returning the body — and an edge
  function runs inside the project's network, where `SUPABASE_URL` is the
  internal gateway on a self-hosted instance. Confirmed on a local stack: the
  runtime fetched `http://kong:8000/rest/v1/` with a 200. Now one rule,
  `_shared/net/outbound-url.ts`: http(s) only, no credentials, no single-label
  or local hostname, every resolved address outside the private, loopback,
  link-local, CGNAT, multicast and reserved ranges (IPv4 and IPv6, mapped forms
  included), redirects followed by hand and re-judged, at most five; a name that
  cannot be resolved is refused (`URL_NOT_ALLOWED`). Applied at every
  content-URL sink: the web layer's reader (so Firecrawl and Jina never read a
  private target on our behalf either), web-scrape's sitemap and site detection,
  extract-pdf-text, browser-fetch, process-image, the image and résumé
  handlers, media import from URL, site-scrape and migrate-page. The five tool
  functions on paid keys (`web-scrape`, `browser-fetch`, `web-search`,
  `extract-pdf-text`, `process-image`) now verify their caller
  (`requireServiceOrStaff`: the service key or a staff session) and left the
  public-functions ratchet. An admin's own configured endpoints (webhooks, A2A
  peers, a local STT server) are not judged — they are the operator's network by
  design; `OUTBOUND_FETCH_ALLOW_PRIVATE=true` lifts the address check for an
  intranet deployment. Guard `outbound-urls-are-public` holds the rule and scans
  every `fetch` of a caller-URL identifier. `SECURITY.md` is new.
### Changed

- **agent-execute's pipeline is importable.** The 20 500-line executor moved
  from `agent-execute/index.ts` to `_shared/execute/core.ts` as
  `handleAgentExecute(req)`, byte-identical but for the import prefixes and the
  wrapper; `index.ts` is the HTTP door, `serve(handleAgentExecute)`. Nothing
  behaves differently. It is the first step toward running a skill in-process
  from the ReAct loop, the gateway and the dispatchers instead of over an HTTP
  hop inside the same project (one invocation per tool call, not two; one auth
  gate, not two). The 169 guards, scripts and docs that read the pipeline's
  source read the new path; the edge type-check baseline carries the file under
  its new name.
- **The executor runs in-process for FlowPilot and the gateway.** The step
  after the move: the core answers `executeSkillRequest(body, auth)` →
  `{ status, body }` instead of `handleAgentExecute(req)` → `Response`, and
  the HTTP door keeps only what the wire needs (the auth header, CORS, the
  `async: true` handoff). The request contract is `_shared/execute/types.ts`
  (no imports). The MCP
  gateway's `executeSkill` calls it directly, and the ReAct loop runs it
  through `ReasonConfig.runSkill`, which the heartbeat, workspace-chat and
  agent-operate pass, instead of `fetch(.../functions/v1/agent-execute)`:
  one fewer edge invocation per tool call (a heartbeat with ten tool calls
  was eleven invocations on a 500K/month budget), no second auth gate, the
  JSON once. Measured on a local stack (`browse_blog`, n=40): through the
  gateway p50 68 ms before, 59 ms after — the hop's ~10 ms gone; direct
  unchanged at ~20 ms; what remains above direct is the gateway's own
  per-call work (key lookup, catalog). Behaviour is a move,
  not a change — the request still takes one JSON round trip at the door, so
  a handler never mutates the caller's own arguments. The dispatchers that
  rely on `async: true` and the other HTTP callers are unchanged. The 165
  guards that read the executor as text read the core.

### Fixed

- **The gateway pays for its own work once.** `/rest/execute` measured 220 ms
  where native `tools/call` measured 32 ms for the same skill on a local stack,
  and the database explained ten of those milliseconds: every REST call and
  every dispatch tool (`search_skills`, `read_skill`, `execute_skill`) re-read
  the whole exposed register (650 rows with schemas) to find one name, and the
  owner filter built a Supabase client per skill — 648 `createClient` calls —
  before asking whether the owner is an admin. The exposed list is remembered a
  minute per (groups, peer ceiling) — the same minute the native handler cache
  gives, and the run is still judged by agent-execute's own gate on every call;
  one service client per isolate; the admin verdict first and once per filter;
  a non-admin owner's module verdicts remembered a minute (`gateway-pays-once`
  guard).
- **The executor pays for its own statements once.** Measured on a local
  stack with pg_stat_statements: of a skill call's 5–8 SQL statements, 4–6 were
  agent-execute's own — the lookup of the whole skill row (`instructions`
  included), the modules row, FlowPilot's trust RPC, an objectives select on
  every call though 9 in 10 skills have no objective keywords, and the journal
  insert; the handler was the minority. Now the lookup names its eight
  columns, the modules row is read once per call and started beside the lookup,
  the trust RPC overlaps the module gate, and objective tracking asks the map
  before the database. One statement fewer on most calls, two serial round
  trips overlapped; locally −17 % p50 on an RPC read (`executor-round-trips`
  guard).
- **Open doors without visitors (security pass).** With the advisor's own
  questions against a local database: the public feedback board's anon write
  policies (the board writes through content-api; the DELETE policy's `true`
  let anyone delete every vote), a SECURITY DEFINER view of RMAs readable by
  anon, three definer views that handed staff data to any signed-in portal
  customer, and a definer RPC content-api calls as the service role but anon
  could call too. Migration `20261107130000` drops the policies, makes the
  views read as their caller, revokes anon, and gives the ping RPC to the
  service role. Everything else the lints raised is the architecture (public
  intake inserts, token-based public reads, service-role-only tables).
- **The read surface knows nine more of its reads.** The local skill sweep
  (648 exposed skills called read-only through agent-execute; every read
  passed, every write was refused as designed) found reads whose names carry
  no read prefix — `read_partner`, `validate_address`, `estimate_delivery_date`,
  the `export_*` reports, `summarize_candidate_pipeline`, `read_sie_file`,
  `verify_document_integrity` — so FlowWork and a read-only key refused them.
  Each handler verified (selects only, writes nothing); they are `READ_EXTRAS`
  now. `fetch_ecb_rates` (writes rates) and `inspect_rendered_page` (drives a
  browser) stay staged.
- **A module states a need by capability, not by product.** Site migration
  required Firecrawl by name and warned on a site that read the web fine
  through Jina or the built-in reader; the newsletter required Resend on a
  site that mails through SMTP. `requiredCapabilities` (`email`, `web:read`,
  `web:search`) is satisfied by any provider of it (`CAPABILITY_PROVIDERS`,
  the built-in reader always counts), the module card says "Needs an email
  provider (Resend, SMTP or Composio)" instead of "Missing: resend", and a
  guard refuses a requiredIntegration that has alternatives.
- **A module that is off is off for visitors too.** Only the Knowledge Base
  page and the navigation asked the modules row; `/feedback` took posts with
  the feedback module off, `/shop` listed products with e-commerce off,
  `/jobs` took applications with recruitment off. `PublicModuleGate` in the
  router's root layout answers the site's own 404 for a public route of a
  module that is off (`public-route-modules.ts`, with or without a language
  prefix), waits for the row on a mapped route instead of serving the page,
  and a guard reads every public route out of `App.tsx` so a new page is
  mapped or declared module-less.
- **The view sweep judges a denied page's late answers as warnings too.**
  A response whose body could not be read because the page had already
  navigated to Access Denied landed after the denied-page downgrade and kept
  its `error` — one false red per sweep. Findings are now judged on a snapshot
  when the visit ends. And the report header's badges sit in a `div`, not a
  `p` (React's nesting warning on `/admin/reports/:slug`).
- **A module that is off is off for the browser too.** The sidebar hid a
  disabled module's pages, but the route gate asked only the role matrix, so
  an admin who typed `/admin/webinars` with Webinars off was served the page
  — and the first write there woke the module behind the operator's back.
  `moduleOffForRoute` reads the modules row exactly as the sidebar does; both
  gates (`AdminLayout`, `AdminRouteGate`) answer with the module's name and,
  for an admin, a door to Modules that opens that module's sheet.

### Added

- **`npm run qa:quiet`** — a fresh stack must be quiet: the heartbeat
  answers `skipped`, the briefing answers `quiet` and writes its row without
  a report version, a chat message or a mail. The nightly fresh install runs
  it before anything is seeded, the one place a virgin instance exists. Its
  first run found two things that alarmed a newborn: every daily job was
  "unhealthy" because its hour had not come (`enrichCronHealth` now gives
  "never ran" a day's grace by pg_cron's own history, the pulse profile), and
  the language proof of `20261026080000` left a "Proof" lead in every
  instance's CRM — the migration cleans it now, and
  `20261107120001_bevisordern-lamnar-ingen-lead` removes the one already there.

### Changed

- **`internal:` handlers are a registry, not a chain.** The executor's 77
  `else if (handler === 'internal:…')` arms (`_shared/execute/core.ts`) are one typed `INTERNAL_HANDLERS`
  map (`InternalCtx` names what a handler may read of the request) and one
  dispatch line; the four long arms (`read_sie_file`, `comment_on_task`,
  `set_performance_mode`, `set_skill_trust`) are named functions. A guard
  now discovers every `internal:` handler in the seeds and requires a registry
  entry (or a response adapter, or the reconciliation prefix) — the 19 guards
  that each pinned one arm by name read the registry key instead.
- **Developer has three doors, Skills one page.** `/admin/developer` is
  MCP Keys · Content API · Webhooks, each introduced by who it is for; the
  Content API explorer runs as the signed-in person (so "requires auth"
  endpoints answer) and its docs link exists. Skill control (enable, MCP
  exposure, definition) moved from Developer to `/admin/skills` → **Manage**
  beside **Browse**, with a sidebar entry under System beside Modules; `?tab=mcp-skills`
  redirects. Removed: the mock "Dev Tools" tab, the n8n template brochure,
  the explorer's third copy of the MCP client config (the wizard has it).

### Fixed

- **A read-only key is read-only over REST too.** `/rest/execute` ran
  outside the gateway's request context, so the `read_only` scope was never
  seen there and such a key could write over REST; the context is now opened
  in the auth middleware for every route. The verdict is the platform's own
  read rule (`_shared/skills/read-surface.ts`), not the tools/list verb
  heuristic, which did not know `browse_` / `query_` / `count_` and refused a
  read-only key `browse_blog`. A `manage_*` call with a read action passes.
- **Quiet when there is nothing to say.** A fresh instance was alarmed every
  morning. The daily briefing now asks which modules are on before every
  section and action item, has no health score without a signal (no more
  yellow 50/100 on an empty week), and on a day with no action item and no
  figure writes its row and sends nothing — no report version, no chat
  message, no mail. `check_operations` judges an area only when its module
  is on (automations always) and answers `areas`; `check_books` accuses
  nothing before `books_started_on()` (the earliest of the first declared
  fiscal year and the first posted journal entry) and says so. The "Set up
  weekly digest" starter objective is gone (completed where it exists): the
  digest is an automation, and the always-active objective was what kept the
  heartbeat's idle short-circuit from ever firing on a fresh instance.
- **One module switch.** Switching a module on or off is four writes that
  must agree — the row, the skills (both flags, one write), the automations
  that run them, the decision record — and there were two implementations and
  three more writers of the row alone. `_shared/modules/module-switch.ts` is
  now the one implementation: `manage_modules`, the Modules page (single and
  bulk toggles, awaited, refusals shown), `manage_site_settings key=modules`
  and `install_template` all run it. A module switched off in the admin and
  on again gets its automations back (the record carries their ids); an
  automation that runs the module's skill stops whatever group seeded it; a
  template's enable takes the parents along; the browser template installer runs
  the same switch, the last writer outside it.
- **A module that is off is off for agents.** Skills were gated by
  category (open when any of a category's modules was on; `commerce` lists
  24), so a module that was off but whose rows had leaked stayed visible and
  ran. The gate is now the skill's owning module (`_shared/skills/module-gate.ts`):
  the MCP gateway and FlowPilot hide its skills, and agent-execute refuses
  one with `MODULE_DISABLED` — a refusal that names the module and the way
  on, where a hidden row used to answer "Skill not found". The skill sync
  heals leaked rows for every off module, not only the ones with a teardown
  record; the wake-on-write of an untouched module (Law 4) remains for a row
  that is still enabled, which the heal ends — in practice a module is
  switched on under Modules or with `manage_modules`.
- **The native MCP transport answers for the caller.** The McpServer was
  built outside the request context and cached per `?groups=` alone for five
  minutes, so every key saw the same `tools/list` — whatever its peer
  ceiling, its owner's reach or the modules switched off meanwhile — and a
  native `tools/call` skipped the key-scope and ceiling checks REST ran. The
  handler is now built and run under one store, the list is the owner's
  reach and the key's scope, the cache is keyed by the caller's reach and
  lives a minute, and every native tool handler runs the same three checks
  as REST.
- **One skill description reaches every surface, and `?groups=<module>`
  works.** `search_skills` ranked by the row description ("Use when: / NOT
  for:") while native `tools/list`, `/rest/tools` and FlowPilot's pre-narrow
  sent the function description, which lacked the markers in 555 of 657
  exposed skills; all three now send the rankable one, and a ratchet keeps
  every exposed skill marked and under 2000 characters (the baseline may only
  shrink). A `?groups=<module>` token narrows through the owner map — it used
  to resolve through a ten-module name heuristic, so `?groups=leads`, `blog`
  or `hr` returned nothing.

### Added

**Reports — what an agent worked out, as a page**
- Scheduled reports: the daily briefing, the weekly digest and the month
  close are published as versioned pages (`daily-briefing`, `weekly-digest`,
  `month-close-<y>-<m>`); the briefing's chat message and mail link to them.
- "Mine" on Reports — the shared ownership lens over the first requester;
  `list_reports mine: true` over MCP. Reports stay shared within the role
  matrix; the module is the wall, the lens a filter.
- The Reports module: `publish_report` turns an agent's result into a versioned
  page under `/admin/reports/<slug>` — markdown with KPI tiles, bar / stacked /
  line / pie charts, notes, details, or a sandboxed HTML page. Every publish is
  a version, identical content adds none, `expected_version` refuses a stale
  write. The platform stamps who published (FlowPilot, Flowwork, the MCP key's
  agent) and who asked; archive, restore and rename are a person's.
- Live blocks: figures fetched when the report is opened, as the reader, reads
  only — a report of live blocks is a dashboard. "The state of things" /
  "Läget just nu" is the standard one, published by FlowPilot in the site's
  language and kept present by a daily automation.
- A report about a company, a deal or a project is shown on that page; the
  accounting workspace lists the reports written for the books.

**Workspaces**
- Accounting, HR, Sales and Support get their own left menu; the FlowWink
  sidebar folds to a rail and the person's gesture is remembered — no setting.
  Employees reach their own pages (expenses, timesheets, leave, payslips) under
  My account.

**Users and the platform**
- The agent's day: **Activity** per connected agent on the Agents page (calls,
  outcomes, skills, reports, steps — an admin's or the owner's read) and
  `agent_day_report` over MCP. The activity log carries the agent's key id as
  a column now, set on every logged call and backfilled.
- The MCP door is judged on its body: the admin's address probe, the
  Connect-agent wizard's **Test the connection** and the nightly MCP regression
  (`MCP_PROBE_SITES`, every site's `/mcp`) all make a real `initialize` and
  read the decoded answer — a header probe had passed a `/mcp` that answered
  plain JSON labelled gzip for a week.
- Last sign-in and last activity on the Users table, and in `users_list`.
- Module automations follow the edge deploy: the first admin visit inserts the
  ones a module is missing, by name, once — a retuned schedule or a deleted
  automation is left alone.

### Fixed
- The nightly view sweep no longer goes red on a role refusal whose body the
  browser could not read: a refusal by the role matrix is a warning by its
  shape, an unreadable body is retried and named.
- Reports published before #891 with a capitalised subject ("Company") are
  normalised, so they show on their company, deal or project page.
- The scheduled reports and the overview dashboard are stamped "FlowWink",
  not "FlowPilot", when the platform's automation publishes them; the
  agent-day lookup escapes % and _ in an agent's name; users_list's role
  filter is capped.
- Three pages that failed for the role they are for (newsletter and docs
  RPC grants, the web layer's state, `propose_bookkeeping` gating); HR can use
  Shifts, Compensation, Training and Disciplinary.
- An admin save of the modules page writes its change, not its tab's copy.

## [4.0.0] - 2026-10-28

The "operated in production" release. v3.0.0 made the platform agent-operable;
since then nine instances have run it for real (Nordbrygg, optic, www, the forks),
with Hermes, OpenClaw and Claude as operators, and almost everything below was
found by an operator or a process battery, not by a plan. Three architecture arcs
land here — the partner spine, the language overlay model and the agent
envelope — and one transport is removed, which is why this is a major.

**Upgrading:** a fork or a self-hosted instance takes the four layers in the usual
order (schema → edge functions → skills → frontend). Migrations are idempotent
and forward-dated. Federation peers that used the A2A transport must move to the
MCP gateway (`mcp-server`, `?mode=dispatch`); nothing else is breaking.

### Added

**Partners — the customer spine (Odoo's res.partner, not our own form)**
- One `partners` register behind leads, companies, customers, vendors and our
  own company: a lead gets a party, the document chain (quote → order → invoice)
  carries one, the ledger books on the commercial party, bank accounts belong to
  the legal person, "invoice A, deliver to B".
- Commercial terms are inherited from the company; the party's language is not.
  Jurisdiction on the party, rules in the locale package. A party is archived,
  never deleted.
- Customer 360 and the partner directory read the same register.

**Language — the overlay model (pages, blog, products, UI text, mail)**
- A page, a post or a product is written ONCE in its source language; every
  other language is a published overlay in `content_translations`, filled by
  `translate_page` / `translate_content`, kept per translation unit so an edit
  only re-translates what changed. `convert_translation_groups` migrates the old
  sibling-row model with a dry run.
- Products and categories in every language, variant labels (attribute names
  and values) as site-wide overlays, category slugs per language, block links
  that follow the page's language.
- `/<lang>/` addresses, hreflang, paired sitemap entries, a language switcher
  that shows only when needed, the visitor's language carried into customer
  mail, chat answers and the footer. A site declares its languages and can
  change its default; adding a language copies the site.
- The visitor-text catalogue (`ui_text`) with an editor, and a scanner that
  ratchets hard-coded English down — the number may only shrink.
- Company locale: where the company is (three list choices, one truth), the
  company's clock, calendar, currency and amount decimals written the same way
  in the database, the agent, checkout and every admin page.

**The agent envelope and the operations reads**
- Every skill answer carries `{ error, code, retryable, hint }` on failure, a
  refusal that is not a failure (`status: refused`), and `risk` / `reversible`
  / `reversal` declared on writes; the MCP gateway exposes them as annotations.
- `check_books` (what needs attention in the books, each finding with its fix),
  `check_operations` (sales, receivables, contracts, support, field service,
  automations, chat), `statutory_deadlines` and the register of filed
  declarations, `month_close_checklist`, `agent_context` on every finance
  answer, `manage_automations list` with a `state` judged against each job's own
  schedule.
- A read-only API key, `set_skill_trust`, `invite_colleague` (trust `approve`),
  `list_objectives` / `manage_objective` (closed on evidence only), `search_skills`
  / `read_skill` / `execute_skill` dispatch mode on both MCP and REST.
- My agents: connect your own agent with one key, one owner; it acts as its
  owner. Claude connects through Connectors with `X-API-Key`.

**Accounting**
- Broken fiscal years, the seven-year archive (document hash, retention lock),
  voucher approval, cash forecast, consolidation, the rule loop for bank events
  (a rule is proposed after the decision), sales and purchases booked in the
  company's currency, orders and POS day-ends reaching the ledger.
- UBL 2.1 / Peppol BIS 3.0 e-invoices: export, validate, dispatch — never
  pretends sent.

**FlowBox — one queue**
- Mail, chat, tickets, forms, callbacks and voicemail in one inbox; FlowPilot
  drafts first and the draft waits in the queue; Routing as its own page; the
  mailbox as a mail client with an AI responder behind the trust dial. Live
  Support is retired into it.

**WebMeet and presence**
- Video calls that get through the firewall, a waiting room, screen share, "here
  now" presence with one tap to video, calls started from River and FlowWork.

**Modules and surfaces**
- Meeting polls (invite on several times, a rule takes the first that works),
  newsletter mailing lists and segments with bounces reaching the ledger,
  purchasing blanket agreements and call-offs, per-staff booking calendars and
  video-meeting links, HR performance reviews and the salary revision round,
  expense advances and receipt currency, project task cards with brief,
  checklist, dependencies across projects and one thread for people and agents,
  wiki grouped by tag, Odoo import (`import_from_odoo`, CRM over the API,
  re-runnable) with an Odoo lens on the CRM.
- The feedback module, on by default: boards bug / feature / template /
  question, votes, comments; an instance sends feedback and a daily usage ping
  (instance id, site URL, skills sha, schema head, enabled modules — nothing
  else) to its endpoint, `www.flowwink.com` unless repointed; the receiving
  instance has the public board at `/feedback` and the fleet under
  Admin → Feedback. One switch turns the ping off (`FEEDBACK_SHARE_USAGE=false`
  or Admin → Feedback); `docs/operators/telemetry.md` says what is sent.
- Design dials an agent can see: surface, theme, heading colour per surface,
  the inverse band, the pixel gradient, image treatments, a section divider, a
  3D model block, the footer's surface, the automatic band alternation — all
  branding settings, no stylesheet in `custom_scripts`. One HTML document for
  every reader (`api/html.ts` fills the head per page view, no User-Agent list).
- Site export carries the knowledge too (wiki, documents, media); templates
  install consultants, souls and objectives; FlowPilot has a soul wherever it is
  on.
- Admin: search and filters on contacts, automations and the icon picker;
  twelve pinned pages in the header; the collapsed rail; footer link columns
  that say where they come from; Pages is the editor's, Branding the admin's.

### Changed
- **Process battery and nightly fresh install.** Every business process in
  `docs/processes/` runs end to end against a stack built from zero every night
  (migrations, template, battery, smoke, MCP regression, view sweep); a green run
  stamps the pulse and a stale stamp turns every PR red. Parity scorecards are
  re-scored against it.
- **Generated artifacts are the bot's.** Skill, automation and locale bundles,
  the instance manifest and the skill→module map are rebuilt by CI and
  committed on main after every merge; a PR that carries them fails.
- The skills layer follows the edge deploy: `sync_skills_from_code` runs on
  every admin page load against the bundled artifact.
- Migrations are forward-dated by a command (`npm run migrations:redate`);
  edge functions type-check in CI; the edge-function count is budgeted at 90.
- Guards discover instead of enumerate: hard-coded visitor text, hard-coded
  shapes, hand-rolled role policies, swallowed reads, unconditional public
  inserts, ghost block fields, stale block schemas — each a scanner with a
  ratchet.
- ESLint runs as a ratchet (findings may only shrink); fork syncs run once a
  night; the Docker image builds on release tags only.

### Fixed
- Money follows the order: returns capped, POS discount and drawer, VAT on
  credit notes, one reservation per order, pick before ship, stock movements
  carrying their reference, manufacturing seeing the inventory, depreciation
  counting months, reports reading the whole ledger (the 1 000-row cap cut
  every report).
- Bookings: rules on the table (opening hours, blocks, past dates, overlap
  under lock, state machine, time zone), confirmation born on, reminder born at
  all, one reader for free slots.
- Contracts: the signed document is final and the signature creates the
  service; appendices render; an agreement is sent only when finished.
- CRM: prospect is not lead, triage outside the owner lens, the editable
  ledger, research on the company, prospects pruned after 24 months, leads say
  their company, a deal starts at its first stage.
- Chat: no more 150 s death on its own receipt, a throwing tool does not end
  the answer, sources under the answer, tables as tables, markdown links as
  links, the answer in the visitor's language on every channel.
- Pages and blocks: dozens of block fixes (panel radius and status tokens
  everywhere, hero on iPhone, true parallax, typewriter descenders, gallery
  lightbox, article grid, CTA, forms, contact), stale chunk after deploy
  reloads instead of 404, the overlay header announces its height, the cookie
  banner off the mobile menu.
- Install: a fresh instance is born with its currency, its language declared,
  the first page as start page, role defaults seeded, FlowPilot on and silent
  until it has objectives; the heartbeat skips without an AI provider instead
  of failing; the cadence quota holds at the call site.
- The agent surface: skills that could never run (wrong parameter names,
  missing branches, a comma that emptied a module's skill list), the staged
  approval envelope naming the order that works, PGRST202 self-correction on
  the generic CRUD path, `manage_page` honouring menu fields, `manage_product`
  answering delete, task ids that self-correct.
- Operator rounds on optic and Nordbrygg: FlowWork answers carry their
  receipt, slugs keep å/ä/ö, the renewal cron's lost clock, a paused run that
  rang for a month, invoice due dates from the terms, currencies upper-cased
  and defaulting to the business currency.

### Security
- 30 unguarded staff RPCs closed to anonymous callers; anonymous reads of
  equipment, maintenance, budgets and delegations closed; the role request
  comes from `app_metadata` and "authenticated" is not staff; the admin guard
  fails closed; orders are not born anonymously.
- The CMS's raw-HTML and href surfaces closed: sandboxed embeds, one href
  rule, a serializer that never interpolates stored HTML.
- Inbound provider webhooks carry a secret; 46elks credentials travel only to
  46elks; `send-webhook` is the platform's to call; a public edge function that
  carries the service key verifies its caller (guard with ratchet).
- Browser-hardening headers on Vercel, the chat lead oracle closed,
  DOMPurify / Tiptap / PostCSS patched, a weekly dependency security scan;
  agent API keys never at rest in clear text; invitation links survive email
  scanners (our page, a hashed token).
- The quote signature hashed an empty line list and called it proof — fixed.
- Customer-scoped RLS mirrored to `authenticated` where the visitor could see
  more than the signed-in customer.

### Removed
- **The A2A federation transport.** MCP stays and is the one way in for an
  external agent. Peers on A2A must reconnect through `mcp-server`.
- Portal (customer self-service) skills leave the MCP surface — they are
  reached through the customer portal's own identity, never a gateway key.
- Live Support as a separate module (folded into FlowBox); the `contact.showForm`
  and `chat.showSidebar` block fields nothing ever read; the Lovable-managed dev
  instance and the old Agent Bridge.

## [3.0.0] - 2026-07-19

The "agent-operated business" release. Since 1.3.0 the platform has completed the
turn from AI-assisted CMS to a Business Operating System run by agents — internal
(FlowPilot) and external (any MCP operator) — with the safety architecture to match:
identity-scoped customer self-service, evidence-bound autonomy, and a hardened fleet.
(Version note: this release supersedes both the stale `v2.0.0` git tag from the
early CMS era and the 1.x changelog line — the two numbering tracks merge here.)

### Added

**Identity ladder — customers talk to the business, safely**
- Customer portal assistant (`/account/assistant`): signed-in customers get an
  AI assistant scoped to their OWN account (rung 2) — orders, invoices, returns —
  with identity server-injected from the verified JWT, never from a body claim.
- Customer-scoped self-service returns: `request_return` resolves the order only
  among the caller's own orders; ownership enforced by construction.
- **B2B company scope (rung 3)**: `company_contacts` membership table, server-injected
  company identity, and eight company-scoped skills — reads (orders, invoices),
  writes (`request_company_return`, `reorder_company_order`, `request_company_quote`),
  commitment (`approve_company_quote`) and admin (`manage_company_contacts` with
  invite-on-signup) — role-gated viewer < buyer < approver < admin, enforced in the
  handler. Cross-company isolation proven adversarially: a contact of company A can
  never see or act on company B's data. Staff "Company Contacts" admin surface included.
- Pay-your-own-invoice via the payment rail: the assistant resolves the company's
  invoice and hands out the secure payment page — it never moves money.
- Company context dial: the assistant sees the active company's open items alongside
  the personal account, with explicit disambiguation between the two.

**FlowPilot 2.0 — the Hermes arc**
- Follow-through: staged and multi-step operations are resumed, not forgotten
  (`flowpilot-followthrough` sweep).
- Pipeline-collapse composites for chained flows, with dial inheritance — a composite
  never bypasses a stricter inner-skill gate.
- Skill Curator learning loop: evidence-driven proposals that improve skill
  instructions over time.
- Cost dials: heartbeat cadence and reasoning tier are per-instance configuration.
- **Evidence-bound objectives**: progress notes are stamped with machine-derived
  evidence (real skill outcomes from the activity log), and an objective can only be
  completed when its plan's work is actually evidenced — the agent's say-so is not proof.

**Agentic accounting (BR1)**
- Bank ingest → `propose_bookkeeping` → human review queue ("Händelser att bokföra"):
  the agent proposes, staged postings await approval, money never moves on its own.
- Opening balances (IB) management and Swedish VAT return preparation
  (SKV 4700 box mapping) via `prepare_vat_return`.

**Platform & operations**
- Outward MCP gateway connection profiles: `?groups=` specialist surfaces and
  `?mode=dispatch` (2-tool `search_skills`/`execute_skill`) for external operators,
  plus the `/rest/*` compatibility layer with distributed locking.
- Skill Relevance Engine as a platform primitive (shared by FlowPilot and the
  gateway), with IDF-weighted name matching.
- Self-hosted distribution: prebuilt multi-arch frontend image on ghcr
  (`flowwink-frontend`), Easypanel-ready. **Releases now publish pinnable
  `:vX.Y.Z` and `:stable` image tags; `:dev` remains bleeding edge.**
- Edge-function tier model (core vs optional) with core-verify, and the align-down
  rule: the skill surface always mirrors what is actually deployed per instance.
- Observability: `cron_health_report` makes silent scheduled-job failures loud;
  pg_net response codes as the source of truth for cron health.

### Fixed
- Automation cron parser: monthly expressions (`0 5 1 * *`) no longer silently fall
  back to hourly runs; weekday ranges (`1-5`) no longer run Mondays-only; the
  unsupported-expression fallback now logs.
- `newsletter-dispatch-scheduled` self-references its own instance (was hardcoded
  to the dev project fleet-wide); `publish-scheduled-pages` calls the DB function
  directly instead of a nonexistent edge function.
- Automation executor semantics (`flowpilot` executor requires the module on) and
  the `isModuleEnabled` site-settings gate.
- `prepare_vat_return` declares its period as required (`anyOf` in the tool schema)
  so agents pass it correctly.
- Visitor-intent lead trigger self-heals to its own instance.

### Security
- Fleet hardening sweep: RLS on all tables, `SECURITY DEFINER` functions pinned
  with `search_path`, the `agent_automations` permissive-UPDATE control-plane hole
  closed, service-role guards for agent-callable admin functions.
- Trust architecture: staged operations (`approve_pending_operation` handshake),
  per-skill trust levels that survive resyncs, and role/scope gates enforced
  server-side — never by the model.

## [1.3.0] - 2026-05-28

### Added
- **Demo Data Platform**: Safe module reset & simulation data seeding (`seed_module_demo`, `reset_module_data`) with `demo_runs`/`demo_run_items` tracking
- **Order Tracking**: Public `/track/:id` page + admin fulfillment view with full event audit log
- **Platform Tests**: Unified `/admin/platform-tests` replacing smoke tests with module-aware suites, CI guardrails, and instance health dashboard
- **User Role Guardrails**: Automated test suite preventing role assignment regressions in `handle_new_user` trigger and edge functions
- **Demo Mode**: Toggle in `/admin/settings/general` controlling hourly `demo-cycle` reset job; demo login banner on auth page
- **Workspace Chat**: Internal RAG-powered chat over documents/contracts/knowledge base with citations
- **Expense Procure-to-Pay Loop**: Full lifecycle (draft→submitted→approved→booked→paid) with BAS 2024 defaults
- **OCR Bank Statement Import**: Vision-based preview→commit flow via `reconciliation-import-image` edge function
- **POS v2**: Barcode support, split tender payments, session-based batch journal on close
- **Stock Event Listener**: Automatic inventory movement on POS sales via `stock.movement` platform events
- **Invoice-driven Subscriptions**: Manual subscription billing with daily cron invoice generation
- **Staged Operations Envelope**: Human-in-the-loop approval for sensitive skills (journal entries, expense booking, period close)
- **Voucher Integrity**: Auto-assigned voucher numbers with gap detection and explanation tools
- **Year-End Readiness**: 6-point checklist RPC for accounting period closure
- **Contract Templates**: 4 seeded templates + `create_contract_from_template` with anti-hallucination guards
- **Unified Sales Lead Loop**: Firecrawl-enriched lead scoring with normalized status aliases
- **Agent Document Upload**: MCP-exposed skill for peers to upload text/PDF to the document vault
- **Document Shadow Markdown**: Extracted text shadow for full-text search in workspace chat
- **Marketing Claw Department Pattern**: Composite MCP groups for external marketing agent operation
- **Federation Directional Connections**: Multi-channel peer architecture (MCP, A2A, /v1/responses)
- **HR Auto-Contract Loop**: `hire_application` RPC — application→employee + draft contract + onboarding checklist in one transaction
- **Timesheet Period Lock**: Accounting period close also locks time entries
- **HR Vacation Auto-Allocation**: Yearly vacation day allocation with audit logging
- **Unsplash Config Hint**: Admin alert when image API key is missing during block editing
- **Integration Status Truth**: `resolveIntegrationStatus` single source of truth; backend verification errors surfaced in UI

### Changed
- **Removed Clawable module**: Simplified architecture — single FlowWink instance, no multi-agent chat surface
- **Federation cleanup**: Reduced operator missions to 5 core categories aligned with external-agent-as-operator pivot
- **Smoke tests**: Skip disabled modules instead of false failures
- **Database migrations**: Consolidated baseline for cleaner fresh installs
- **Trust levels**: Outbound communication skills now require `approve` instead of `auto`

### Fixed
- **check-secrets edge function**: 403 errors for multi-role users resolved by explicit `admin` role filtering
- **handle_new_user trigger**: No longer assigns redundant `writer` role when `signup_type: "admin"` is specified
- **Demo template**: Fixed demo email credential display (`demo@flowwink.com`)
- **Fresh install UX**: Default modules disabled by default (opt-in); fewer confusing empty states
- **Edge function timeouts**: Fire-and-forget pattern for long-running operations bypassing 60s limits
- **CI**: `skill-linter` exits gracefully without DB URL on GitHub Actions

## [1.2.0] - 2026-02-20

### Added
- **Live Agent Chat Avatars**: Agent profile photos now display in chat widget for personalized support experience
- **Sentiment Detection**: Real-time AI-powered sentiment analysis during conversations
  - Automatic frustration detection (caps, repeated questions, negative words)
  - Configurable threshold (1-10 scale) for human handoff triggers
  - Visual sentiment indicator on Live Support page (green/yellow/red)
- **Human Handoff Improvements**: Enhanced escalation with explicit "speak to human" detection
- **Live Support Dashboard Widget**: New admin dashboard widget showing:
  - Active and waiting conversations
  - Online agent count
  - Average sentiment metrics
  - Quick access to support queue

### Changed
- Support agents table now has public read access for chat widget avatar display
- Improved agent presence detection in chat conversations

### Fixed
- Agent avatars now correctly display for anonymous chat visitors (RLS policy update)
- Profile avatar URL properly fetched from profiles_public view

## [1.1.0] - 2026-01-16

### Added
- **Self-Hosting Setup Script**: Complete CLI-driven setup (`./scripts/setup-supabase.sh`)
  - Automatic Supabase login with interactive prompts
  - Project selection with numbered list
  - Deploy all 33 edge functions automatically
  - Run database migrations
  - Create admin user with proper role assignment
  - Output environment variables for deployment
  - `--fresh` flag for agencies setting up multiple sites
  - `--env` flag to only display environment variables
- **Secrets Configuration Script**: Interactive secrets setup (`./scripts/configure-secrets.sh`)
  - Resend (email)
  - Stripe (payments)
  - OpenAI (AI features)
  - Google Gemini (AI alternative)
  - Firecrawl (web scraping)
  - Unsplash (stock photos)
  - Local LLM (self-hosted AI)
  - N8N (workflow automation)

### Changed
- Auth page branding updated to FlowWink
- Setup documentation rewritten for CLI-first workflow
- Improved error handling in setup scripts

### Fixed
- Environment variables now fetched via `supabase projects api-keys`
- Admin user creation uses Supabase Admin API directly
- Project selection handles deleted projects gracefully

## [1.0.0] - 2026-01-09

### Added

#### Core CMS
- Block-based page builder with 20+ block types
- Visual drag-and-drop block reordering
- Block animation controls and spacing settings
- Page versioning with restore functionality
- SEO meta settings per page
- Scheduled publishing
- Global header and footer blocks
- Menu ordering system

#### Blog Module
- Full blog engine with posts, categories, and tags
- Featured posts support
- Author profiles with avatars
- Reading time calculation
- RSS feed generation
- SEO-optimized blog pages

#### Newsletter Module
- Subscriber management with GDPR compliance
- Email campaigns with tracking (opens, clicks)
- Double opt-in support
- Export functionality
- Unsubscribe handling

#### CRM Modules
- **Leads**: Lead capture, scoring, AI qualification, status tracking
- **Deals**: Kanban board, pipeline stages, activity tracking
- **Companies**: Company profiles, domain enrichment, lead association
- **Products**: Product catalog with pricing (one-time and recurring)
- CSV import/export for leads and companies

#### Knowledge Base
- Hierarchical categories with icons
- FAQ-style articles
- AI Chat integration with context
- Helpful/not helpful voting
- Featured articles

#### Integrations
- Webhook system with event triggers
- N8N workflow templates
- Unsplash image picker
- AI text generation (expand, improve, translate, summarize)
- Brand guide analyzer

#### User Management
- Role-based access control (Writer, Approver, Admin)
- User profiles with avatars
- Activity logging

#### Public Website
- Responsive design with dark/light mode
- Cookie consent banner
- Contact forms with submissions
- Booking forms (Cal.com integration ready)
- Chat widget

### Security
- Row Level Security (RLS) on all tables
- Secure authentication flow
- GDPR-compliant data handling

---

## Upgrade Instructions

See [docs/UPGRADING.md](docs/UPGRADING.md) for detailed upgrade instructions.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for contribution guidelines.
