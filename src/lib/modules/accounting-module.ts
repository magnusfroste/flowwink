import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import { getActivePack } from '@/lib/locale-packs';

const accountingInputSchema = z.object({
  action: z.enum(['create_entry', 'list_entries', 'balance_sheet', 'profit_loss']),
  entry_date: z.string().optional(),
  description: z.string().optional(),
  reference_number: z.string().optional(),
  lines: z.array(z.object({
    account_code: z.string(),
    account_name: z.string(),
    debit_cents: z.number().int(),
    credit_cents: z.number().int(),
    description: z.string().optional(),
  })).optional(),
});

const accountingOutputSchema = z.object({
  success: z.boolean(),
  entry_id: z.string().optional(),
  message: z.string().optional(),
});

type AccountingInput = z.infer<typeof accountingInputSchema>;
type AccountingOutput = z.infer<typeof accountingOutputSchema>;

// ── Skill Seeds ──

const ACCOUNTING_SKILLS: SkillSeed[] = [
  {
    name: 'prepare_vat_return',
    description: 'Prepare a full Swedish momsdeklaration (SKV 4700) for a period: all boxes (05,10,11,12,20,21,22,30,31,32,35,39,41,48,49) mapped from posted ledger via the active locale pack. Use when: closing a VAT period. NOT for: booking the VAT payment (manage_journal_entry) or full financial reports (accounting_reports).',
    category: 'system',
    handler: 'internal:prepare_vat_return',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"prepare_vat_return","description":"Swedish VAT return (SKV 4700) for a period: all boxes mapped from posted ledger. A PERIOD IS REQUIRED — pass exactly one of: {from,to} (YYYY-MM-DD), {year,quarter}, or {year,month}. Calling with no period fails with \"Provide {from,to} or {year,month|quarter}\".","parameters":{"type":"object","properties":{"from":{"type":"string","description":"Period start YYYY-MM-DD (use together with `to`)"},"to":{"type":"string","description":"Period end YYYY-MM-DD (use together with `from`)"},"year":{"type":"integer","description":"Fiscal year — REQUIRED together with `quarter` or `month`, e.g. 2026"},"month":{"type":"integer","description":"Month 1-12 (use together with `year`)"},"quarter":{"type":"integer","description":"Quarter 1-4 (use together with `year`)"}},"anyOf":[{"required":["from","to"]},{"required":["year","quarter"]},{"required":["year","month"]}]}}} as SkillSeed['tool_definition'],
    instructions: 'Read-only. A PERIOD IS MANDATORY: pass exactly one of {from,to} (YYYY-MM-DD), {year,quarter}, or {year,month} — an empty call fails with "Provide {from,to} or {year,month|quarter}". If the caller did not name a period, default to the most recent COMPLETE quarter (e.g. today 2026-07-19 → {year:2026, quarter:2}) and say which period you used. Returns { boxes: [{code,label,amount_cents}], net_to_pay_cents, verification }. Box 49 > 0 = pay Skatteverket. Verify against the 2650 control account before filing; then book the payment via manage_journal_entry (template "Momsredovisning (betalning)").',
  },
  {
    name: 'list_voucher_gaps',
    description: 'Detect gaps in voucher-number sequences per series and fiscal year. Use when: closing a period, verifying audit integrity. NOT for: listing all entries (manage_journal_entry action=list) or explaining a specific gap (explain_voucher_gap).',
    category: 'system',
    handler: 'rpc:list_voucher_gaps',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"list_voucher_gaps","parameters":{"type":"object","properties":{"p_year":{"type":"integer"},"p_series":{"type":["string","null"]}}},"description":"Detect gaps in voucher-number sequences per series and fiscal year."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'explain_voucher_gap',
    description: 'Look up audit_logs for clues about a missing voucher number. Use when: list_voucher_gaps returned a gap and root cause is needed. NOT for: detecting gaps (list_voucher_gaps) or posting corrections (record_accounting_correction).',
    category: 'system',
    handler: 'rpc:explain_voucher_gap',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"explain_voucher_gap","parameters":{"type":"object","required":["p_series","p_year","p_voucher_number"],"properties":{"p_year":{"type":"integer"},"p_series":{"type":"string"},"p_voucher_number":{"type":"integer"}}},"description":"Look up audit_logs for clues about a missing voucher number."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'year_end_readiness',
    description: 'Year-end checklist: periods closed, no drafts, no voucher gaps, reconciliations done, invoices/expenses settled. Use when: preparing annual close. NOT for: running the close (run_year_end) or closing a single month (close_accounting_period).',
    category: 'system',
    handler: 'rpc:year_end_readiness',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"year_end_readiness","parameters":{"type":"object","properties":{"p_year":{"type":"integer","description":"Defaults to previous calendar year"}}},"description":"Year-end checklist: periods closed, no drafts, no voucher gaps, reconciliations done, invoices/expenses settled."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'run_year_end',
    description: 'Orchestrate year-end close: runs year_end_readiness + propose_accruals + propose_annual_depreciation and returns a consolidated report with next-step instructions. Read-only; actual posting requires follow-up staged calls to manage_journal_entry. Use when: starting bokslut for a fiscal year. NOT for: posting entries directly (manage_journal_entry).',
    category: 'commerce',
    handler: 'rpc:run_year_end',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"run_year_end","parameters":{"type":"object","required":["p_year"],"properties":{"p_year":{"type":"integer","description":"Fiscal year, e.g. 2025"},"p_confirm":{"type":"boolean","default":false,"description":"Reserved for future use"}}},"description":"Orchestrate year-end close: runs year_end_readiness + propose_accruals + propose_annual_depreciation and returns a consolidated report."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'propose_accruals',
    description: 'Scan for unpaid invoices and approved-but-unpaid expense reports that may need year-end accrual entries. Returns proposals with suggested_action (defer_revenue, accrue_receivable, accrue_payable). Use when: closing a fiscal year and need periodiseringar. NOT for: posting accruals — call manage_journal_entry per proposal.',
    category: 'commerce',
    handler: 'rpc:propose_accruals',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"propose_accruals","parameters":{"type":"object","required":["p_year"],"properties":{"p_year":{"type":"integer","description":"Fiscal year, e.g. 2025"}}},"description":"Scan for unpaid invoices and approved-but-unpaid expense reports that may need year-end accrual entries."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'manage_journal_entry',
    description: 'Create, list, or reverse double-entry journal entries (verifikat). action=void does NOT erase: a booked verification is never unbooked. It keeps the original posted and books a mirror entry dated today, so the two net to zero and the correction is auditable — which also means a period you have already declared stays as declared and the correction lands in the current one. Use when: admin asks to book/record a transaction, invoice is paid and needs journal entry, salary/rent/VAT or other recurring transactions, heartbeat detects unbooked invoices. NOT for: reading reports (use accounting_reports), managing templates (use manage_accounting_template). MANDATORY WORKFLOW for create: (1) if a vendor is involved, look up the vendor and prefer its `default_account_code` and `last_used_template_id`; (2) otherwise call manage_accounting_template action=list and rank by keyword overlap × usage_count; (3) only invent accounts if no vendor default and no template scores ≥0.6 — and in that case also call suggest_accounting_template to register the new pattern; (4) ALWAYS pass `template_id` (when matched) and `vendor_id` (when known) so the system can learn.',
    category: 'commerce',
    handler: 'db:journal_entries',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_journal_entry',
        description: 'Create or list double-entry journal entries. For create, prefer vendor.default_account_code → matching template → suggest new template last.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'void', 'delete'] },
            description: { type: 'string' },
            entry_date: { type: 'string' },
            documents: { type: 'array', description: 'create only — the documents this verification rests on (BFL 5:7). Each: {kind: "file"|"document", label, file_url + file_name for a file, document_id for a row already in the archive}. Attach the receipt, invoice or statement you booked FROM — you are the one who just read it.', items: { type: 'object', properties: { kind: { type: 'string', enum: ['file','document'] }, label: { type: 'string' }, file_url: { type: 'string' }, file_name: { type: 'string' }, document_id: { type: 'string' } } } },
            entry_id: { type: 'string', description: 'Journal entry id — required for action=void and action=delete. Reversing an already-reversed entry is refused and tells you its reversal_id: book a new entry instead of reversing twice.' },
            lines: { type: 'array', items: { type: 'object', properties: { account_code: { type: 'string' }, account_name: { type: 'string' }, debit_cents: { type: 'number' }, credit_cents: { type: 'number' } } } },
            amount_cents: { type: 'number', description: 'NET base amount in cents/öre for percentage-based templates — the template lines (debit_pct/credit_pct) are expanded from this. E.g. a 25%-VAT sale with amount_cents=100000 books 125000/100000/25000. Required for one-call template booking.' },
            invoice_id: { type: 'string' },
            vendor_id: { type: 'string', description: 'Link to vendor — required when booking a supplier transaction so vendor learning fires.' },
            template_id: { type: 'string', description: 'Book directly from this accounting_template: its percentage lines are expanded using amount_cents (usage_count auto-increments). Preferred one-call flow: {action:create, template_id, amount_cents, description}.' },
            reference_number: { type: 'string' },

          },
          required: ['action'],
          'x-action-required': {
            create: ['description'],
          },
        },
      },
    },
    instructions: `Double-entry bookkeeping. lines = [{account_code, account_name, debit_cents, credit_cents}] (integer cents); total debits MUST equal total credits.
PREFERRED ONE-CALL FLOW (templates): find the template via manage_accounting_template action=list (or let matching pick one from description), then call {action:'create', template_id, amount_cents: <NET amount in öre/cents>, description, auto_confirm:true}. Percentage lines (debit_pct/credit_pct) expand from amount_cents — a 25%-VAT sale with amount_cents=100000 books 1510:125000 / 3010:100000 / 2610:25000. Zero-amount entries are rejected.
BANK EVENTS: when booking a bank transaction (from propose_bookkeeping / list_unmatched_transactions / an imported feed), ALWAYS pass bank_transaction_id in the create payload. It links the entry to the event (removes it from the "events to book" queue, audit trail) AND is the idempotency key — re-booking an already-linked event is refused with {already_booked:true} instead of creating a duplicate. Booking bank events WITHOUT bank_transaction_id leaves them in the queue and risks double-booking.
STAGED OPERATION: create returns {staged:true, operation_id, ...} for review — this is NOT a failure and NOT a permission error. To execute: (1) call approve_pending_operation with {p_id: <operation_id>}, then (2) re-invoke manage_journal_entry with the SAME args plus _approved_operation_id: <operation_id>. The entry is only booked after step 2.
CORRECTING A MISTAKE (action=void): it does not delete and it does not hide. The original stays posted and keeps counting; a mirror entry dated TODAY cancels it, and the response gives you both ids. Two consequences to plan around: (1) a June entry reversed in August leaves June's VAT return exactly as it was filed and puts the correction in August's — that is correct, not a bug, and you should say so rather than trying to backdate; (2) reversing twice is refused, because the second reversal would put the books off by the same amount in the other direction — if the correction itself was wrong, book a NEW entry. Entries still in draft can be deleted outright; posted ones never can.
Routing rules in order: (1) vendor.default_account_code wins; (2) keyword-match against accounting_templates ordered by usage_count DESC; (3) only fall back to manual account selection if no template scores ≥0.6 and the vendor has no default. Always include template_id and vendor_id in the create payload when known. Locale-specific guidance: ${getActivePack().ai_instructions.journal_entry}`,
  },
  {
    name: 'accounting_reports',
    description: 'Generate financial reports: balance sheet, income statement, general ledger, trial balance, or check for unbooked invoices. Use when: admin asks for financial overview, month-end closing, reconciliation checks. NOT for: creating entries (use manage_journal_entry).',
    category: 'commerce',
    handler: 'db:journal_entries',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'accounting_reports',
        parameters: { type: 'object', properties: { type: { type: 'string', enum: ['balance_sheet', 'income_statement', 'general_ledger', 'trial_balance', 'unbooked_invoices'] }, from_date: { type: 'string' }, to_date: { type: 'string' } }, required: ['type'] },
      },
    },
    instructions:
      'Read-only. income_statement returns the annual-report shape: total_income_cents − total_expenses_cents = result_before_tax_cents, minus tax_cents = net_result_cents. ' +
      'total_expenses_cents EXCLUDES tax (its own `tax` block) and excludes the account the closing entry carries the result on — that account is named per locale in account_statement_sections/section=year_result, never assumed. ' +
      'Check result_carrier.source: "unmapped" means no carrier is mapped, so if this chart closes the year onto a P&L account the net result will read as zero — say so rather than reporting the zero. ' +
      'result_carrier.agrees_with_net_result=false means the closing entry does not hold the result the ledger computes (partial closing, or an account classified wrongly) — investigate before quoting the figure. ' +
      'balance_sheet returns current_year_result_cents as the part of the result NOT yet closed to equity; after a closing entry it is 0 because equity already holds it.',
  },
  {
    name: 'manage_accounting_template',
    description: 'Create, list, or update ONE reusable accounting template at a time. Templates have keyword matching for AI auto-selection. Use when: admin wants to add or tweak a single template, or list what exists. NOT for: actual bookkeeping (use manage_journal_entry), authoring a SET of templates with structural verification against the chart (use propose_posting_templates — it balance-checks every template and corrects account names from the chart).',
    category: 'commerce',
    handler: 'db:accounting_templates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_accounting_template',
        description: 'CRUD for reusable percentage-based booking templates. template_lines use debit_pct/credit_pct (percent of the NET base=100); one-call booking via manage_journal_entry {template_id, amount_cents} expands them to öre.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update'] },
            id: { type: 'string', description: 'Template UUID — required for update.' },
            template_name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string', enum: ['revenue', 'expense', 'payment', 'tax', 'payroll', 'asset', 'adjustment', 'general'] },
            keywords: { type: 'array', items: { type: 'string' }, description: 'Match terms for AI auto-selection (Swedish + English).' },
            template_lines: {
              type: 'array',
              description: 'Double-entry lines as percentages of the NET amount (base = 100). Each line uses debit_pct OR credit_pct (the other = 0). Σ debit_pct MUST equal Σ credit_pct. Ex (25% VAT sale): [{account_code:"1510",account_name:"Kundfordringar",debit_pct:125,credit_pct:0},{account_code:"3010",account_name:"Försäljning",debit_pct:0,credit_pct:100},{account_code:"2610",account_name:"Utgående moms 25%",debit_pct:0,credit_pct:25}].',
              items: {
                type: 'object',
                properties: {
                  account_code: { type: 'string', description: 'BAS account, e.g. "1930"' },
                  account_name: { type: 'string' },
                  debit_pct: { type: 'number', description: 'Percent of net base on the debit side (0 if credit line). Can exceed 100 (e.g. 125 for receivable incl. VAT).' },
                  credit_pct: { type: 'number', description: 'Percent of net base on the credit side (0 if debit line).' },
                },
                required: ['account_code', 'debit_pct', 'credit_pct'],
              },
            },
          },
          required: ['action'],
          'x-action-required': {
            create: ['template_name', 'template_lines'],
            update: ['id'],
          },
        },
      },
    },
    instructions:
      'template_lines are PERCENTAGES of the net transaction amount (base = 100), not fixed amounts — booking expands them via manage_journal_entry {template_id, amount_cents}. Each line uses debit_pct OR credit_pct (other = 0); Σ debit_pct must equal Σ credit_pct or the booked verifikat will not balance. The receivable/payable line is typically 100 + VAT (e.g. 125 for 25% moms), the revenue/cost line 100, the VAT line 25. Use only account_codes that exist in the chart of accounts.',
  },
  {
    name: 'manage_account_tax_boxes',
    description:
      "See and change which VAT-return box each account reports into — the classification half of the role layer (account_roles decides where to POST, this decides how a posted amount is REPORTED). action=list shows the current map with account names; action=add points an account at a box; action=remove takes it out. Seeded verbatim from the locale pack, so a standard chart needs no work at all. Use when: a company migrated from another system and books VAT to its own accounts, when prepare_vat_return reports accounts under coverage.unmapped_but_reportable, or after adding a VAT account to the chart. NOT for: changing where postings land (manage_account_roles), adding accounts (manage_chart_of_accounts), preparing or filing the return (prepare_vat_return). An account that belongs to no box is not an error anywhere — its amount is simply absent from the filing, which is why this exists.",
    category: 'commerce',
    handler: 'rpc:manage_account_tax_boxes',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_account_tax_boxes',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'add', 'remove'] },
            locale: { type: 'string', description: "Defaults to the instance's active accounting_locale." },
            account_code: { type: 'string', description: 'add/remove only — must already exist in the chart of accounts.' },
            box_code: { type: 'string', description: "add/remove only — the box on the return, e.g. '10' for output VAT 25%, '48' for input VAT. Run action=list to see which boxes this locale has." },
          },
          required: ['action'],
          'x-action-required': { add: ['account_code', 'box_code'], remove: ['account_code', 'box_code'] },
        },
      },
    },
    instructions: `## The failure this prevents
The return sums accounts. An account it has never been told about contributes
nothing — and nothing is not an error. The filing comes out looking complete,
the control account disagrees, and the difference is found by the tax authority
or not at all.

## How you will normally reach this
Run prepare_vat_return first. Its \`coverage\` block lists every account that
carried money in the period and belongs to no box. That list IS the work: each
entry is one add. An empty list means there is nothing to do here.

## Which box
Match by MEANING, not by number. 2611 and 2614 are one digit apart and belong to
different boxes (domestic output VAT vs reverse charge), which is exactly the
kind of neighbourly-looking guess that produces a wrong but plausible filing.
Read the account NAME from action=list, and when the meaning is not obvious from
the name, ask rather than pick.

## What it does not do
It changes reporting, not history. Amounts already posted are included from the
next time the return is prepared — the map is read at report time. And nothing
here moves money or changes where future entries land; that is
manage_account_roles.`,
  },
  {
    name: 'manage_journal_entry_document',
    description:
      "See, attach or remove the documents a verification rests on — the receipt, supplier invoice, bank statement or SIE file it was booked from. Swedish bookkeeping law (BFL 5:7) requires a verification to identify its underlying documents, and a verification that carries none is not wrong in any amount but is incomplete as a record. action=list shows what a verification holds and says plainly when it holds nothing; action=attach adds one (kind=file with file_url for an uploaded artifact, kind=document with document_id to reference something already in the archive so one document can underlie several verifications without being copied); action=remove unlinks it — for kind=document that removes the LINK only, never the archived document. Use when: booking from a receipt or statement you have read, filling in evidence on entries booked earlier, checking what a verification rests on before a review or audit. NOT for: changing amounts or accounts (manage_journal_entry), uploading a file to the archive in the first place (upload_document), contract appendices (manage_contract_appendix). Attaching never changes a figure.",
    category: 'commerce',
    handler: 'rpc:manage_journal_entry_document',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_journal_entry_document',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'attach', 'remove'] },
            entry_id: { type: 'string', description: 'The verification. Required for list and attach.' },
            kind: { type: 'string', enum: ['file', 'document'], description: "attach only — 'file' is an uploaded artifact (needs file_url), 'document' references a row in the documents archive (needs document_id)." },
            label: { type: 'string', description: 'attach only — what a reader calls it: "Kvitto", "Kontoutdrag SEB", "Årsredovisning 2023".' },
            file_url: { type: 'string', description: 'attach, kind=file — a URL this instance can reach. Upload with upload_document first if you only have bytes.' },
            file_name: { type: 'string', description: 'attach, kind=file — the original file name.' },
            document_id: { type: 'string', description: 'attach, kind=document — id of a row in the documents archive.' },
            attachment_id: { type: 'string', description: 'remove only — the attachment to unlink.' },
          },
          required: ['action'],
          'x-action-required': { list: ['entry_id'], attach: ['entry_id'], remove: ['attachment_id'] },
        },
      },
    },
    instructions: `## Why a verification without underlying documents is incomplete
The amounts can be perfect and the entry still fails its purpose: BFL 5:7 says a
verification shall identify the documents that underlie it. An auditor asked to
believe a 12 500 kr sale wants to see the invoice, not the bookkeeper's word.

## Attach in the same call when you can
manage_journal_entry takes a \`documents\` array on create. If you have just read
a receipt or a bank statement, attach it there — a second call is a second
chance to forget. This skill is for the entries that already exist.

## file or document
- **file** — an artifact that belongs to this verification and nothing else: a
  receipt, a supplier invoice PDF. Needs file_url; upload_document first if all
  you have is bytes.
- **document** — something already in the archive that underlies SEVERAL
  verifications: an annual report, a bank statement covering a whole year, a
  board minute. Reference it by document_id so it is stored once. Removing the
  link never removes the archived document.

## The label is what a human reads
"Kvitto" tells nobody which one. "Kvitto Circle K 2024-03-11" or "Kontoutdrag
SEB 2024" lets a reviewer match the paper to the entry without opening it. Write
the label as the person checking the books would say it out loud.

## What it does not do
It changes no amount, no account and no date. Attaching evidence to an entry
that is wrong does not make it right — fix the entry with manage_journal_entry
(which reverses rather than rewrites) and attach the evidence to the correction.`,
  },
  {
    name: 'manage_account_roles',
    description:
      "See and change which account each platform ROLE posts to — bank, accounts_receivable, sales_revenue, vat_output and ~20 others. The engine never names an account number: it resolves account_for(role), so this is the one place that decides where every future invoice, payment and VAT line lands. action=list shows the current mapping; action=propose takes the accounts a company ACTUALLY uses (from read_sie_file) and reports, per role, whether they post where we do — it never picks for you, because a prefix is not a meaning and an auto-picked account that sounds right is how input VAT ends up on an output VAT account; action=set changes one role, refusing any account the chart does not have. Use when: onboarding a company migrating from Bokio/Fortnox/Dooer, after import_accounting_standard for a new country, or when postings are landing on the wrong account. NOT for: adding accounts to the chart (manage_chart_of_accounts), loading a national standard (import_accounting_standard), booking anything (manage_journal_entry).",
    category: 'commerce',
    handler: 'rpc:manage_account_roles',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_account_roles',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'propose', 'set'] },
            locale: { type: 'string', description: "Defaults to the instance's active accounting_locale." },
            accounts: {
              type: 'array',
              description: "propose only — the company's own accounts as [{code, name, in_use, has_movement}]. Send only the ones IN USE: a Bokio export carries ~1200 accounts of which a real company touches about 30, and the unused ones are noise that hides the decisions. has_movement (posted to this year) outranks a mere balance as evidence.",
              items: { type: 'object', properties: {
                code: { type: 'string' }, name: { type: 'string' },
                in_use: { type: 'boolean' }, has_movement: { type: 'boolean' },
              }, required: ['code'] },
            },
            role: { type: 'string', description: 'set only — the platform role, e.g. sales_revenue. An unknown name errors with the full valid list.' },
            account_code: { type: 'string', description: 'set only — the account this role should resolve to. Must already exist in the chart.' },
            reason: { type: 'string', description: 'set only — why, stored on the role. e.g. "LiteIT has booked service revenue here since 2018".' },
          },
          required: ['action'],
          'x-action-required': { propose: ['accounts'], set: ['role', 'account_code'] },
        },
      },
    },
    instructions: `## Why this is ~20 decisions and not 1200
A company arriving from another system brings its whole chart — a real Bokio
export had 1 243 accounts. Mapping those against ours would be a week nobody
finishes. But FlowWink posts to ROLES, not account numbers, and there are ~23 of
them. In that same file exactly 29 accounts had any balance or movement at all;
the other 1 214 were the standard chart shipped whether you use it or not.

So: run read_sie_file, keep the accounts with a balance or movement, send those.

## Read the answer, do not skim it
- **exact** — they already post where we do. Nothing to do.
- **candidates** — they post somewhere else in that group, and the accounts are
  listed. THIS is the migration. Their history decides what their books mean: a
  company that has booked revenue to 3011 for five years must keep doing so, or
  every FlowWink entry lands on a different account than their own past and any
  parallel comparison diverges from the first invoice.
  One candidate is usually the answer. Several, or none that fit, means the role
  has no counterpart in their books — say so instead of forcing one.
- **no_evidence** — nothing in that account group moved. Leave it. An untouched
  role is not a problem to solve.

## The list you will actually feel
\`accounts_missing_from_chart\` is the accounts they post to that this instance
has never heard of. Moving between systems is mostly this list — the same reason
a Bokio→Dooer move forces re-mapping: the new system simply does not have the
accounts the old one gave you. Add the ones that carry real activity with
manage_chart_of_accounts BEFORE pointing a role at them; \`set\` refuses an
account that does not exist, on purpose, because the alternative is a posting
failure mid-invoice.

## What set does, and the entry it hands back
It changes where FUTURE postings land. Entries already booked keep the account
code they were written with — bookkeeping is not retroactively rewritten.

That alone is honest and leaves the customer with the same figure reported on two
accounts. So when the old account still carries a balance, the response includes
\`suggested_transfer\`: a balanced, dated, self-describing entry that moves it.
BOOK IT with manage_journal_entry — it is deliberately not booked here, because a
role change may not quietly write a verification and manage_journal_entry owns
the staging and approval rail.

This is what a real system does. When LiteIT moved from Bokio to Dooer, Dooer
booked "Change to Dooer kontoplan" on the closing date, moving 4 000 kr from 3011
to 3001 and 764,40 from 6230 to 6200. The migration became auditable instead of
invisible — and that is the whole difference between a chart change and a hole in
the accounts.`,
  },
  {
    name: 'read_sie_file',
    description:
      "Read a SIE 4 file (the export every Swedish accounting system produces — Bokio, Fortnox, Visma) and report what is in it. READ THE FILE AS BYTES AND SEND content_base64 — never as text: SIE 4 is specified as IBM CP437, and a text read decodes it as UTF-8, destroying every å ä ö before the file reaches this skill, irrecoverably. Returns an OBSERVATION and writes nothing: the encoding it detected versus what the file declared, how many characters were already destroyed before it arrived, the company and fiscal years, and counts of accounts, opening balances and verifications. One SIE file carries three things that belong in three different places — a chart, balances, and a year of journal entries — so you pick, then call the skill named under each section. Use when: onboarding a company that is moving from another accounting system, reading last year's history to derive posting templates, taking over opening balances. NOT for: importing a published national standard (import_accounting_standard), treating an SIE file as a bank statement (import_bank_file does that narrowly, for 19xx lines only).",
    category: 'commerce',
    handler: 'internal:read_sie_file',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'read_sie_file',
        parameters: {
          type: 'object',
          properties: {
            content_base64: {
              type: 'string',
              description: 'The file as base64-encoded BYTES. Read it in binary mode. If your file tool returns a string, it has already decoded — and if the file was CP437 the Swedish characters are gone. A data: prefix is stripped automatically.',
            },
            file_name: { type: 'string', description: 'Original file name, for the report.' },
            include: {
              type: 'array',
              items: { type: 'string', enum: ['accounts', 'balances', 'verifications'] },
              description: 'Full lists instead of the first 5 rows. A real file has ~1200 accounts, so ask only for the section you are about to act on.',
            },
          },
          required: ['content_base64'],
        },
      },
    },
    instructions: `## Read it as bytes
This is the one rule that cannot be recovered from later. SIE 4 is IBM CP437;
Bokio still writes it that way (a real 2023 export encodes ö as the single byte
0x94). Every ordinary file-reading tool decodes UTF-8, 0x94 is not valid UTF-8,
and the character becomes U+FFFD. No skill can undo that. Read binary,
base64-encode, send.

## What comes back, and why each part matters
- **encoding**: what the file DECLARED (\`#FORMAT\`) versus what its bytes
  actually are. They disagree when a file has been opened and re-saved. The
  bytes win — decoding by the declaration would corrupt it a second time.
- **integrity.replacement_chars**: characters already destroyed before the file
  reached us. Non-zero means: go find the original export from the accounting
  system. The import will still work, but every Swedish letter in names is lost,
  and it was not FlowWink that lost it.
- **contains**: counts per section, plus \`unbalanced_verifications\` — a
  verification whose lines do not sum to zero is a defect in the source file.

## The three destinations
A SIE file is not one import. It is three, and the customer may want any subset:

1. **accounts** — the customer's EXISTING chart (~1200 rows). This is NOT a
   published standard: do not send it to import_accounting_standard. Matching it
   against FlowWink's locale pack is a mapping job with a human in it.
2. **opening_balances** — \`#IB\` rows, one fiscal year at a time, into
   manage_opening_balances. \`#IB 0\` is the year in \`#RAR 0\`; -1 is the year
   before.
3. **verifications** — what the company ACTUALLY books. Group the recurring
   patterns and send them to propose_posting_templates. This is the section
   FlowWink can never guess on its own, and the reason to read the file at all.

## Size
Full lists are opt-in through \`include\` because a real chart is ~1200 rows and
would flood a context for a caller who only wanted the balances.`,
  },
  {
    name: 'import_accounting_standard',
    description:
      "Set up a country's chart of accounts from the OFFICIAL standard file — you read the file (xlsx/csv from the publisher: BAS, DATEV/SKR, PCG…), send structured rows, and the platform validates, stores, and wires the role layer so the engine can post. FAIL CLOSED on provenance: source_url + sha256 of the file are REQUIRED, because an unsourced chart cannot be verified later — a hand-written 'BAS 2024' shipped 166 wrong names before anyone could compare. Take account names VERBATIM from the file, never paraphrase or translate. Use when: activating a new country/standard on this instance, refreshing a chart from a new edition of the standard (replace=true). NOT for: authoring posting templates (propose_posting_templates), adding a single account (manage_chart_of_accounts), importing a customer's legacy chart from SIE — that is a mapping problem, not a standard.",
    category: 'commerce',
    handler: 'rpc:import_accounting_standard',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'import_accounting_standard',
        parameters: {
          type: 'object',
          properties: {
            locale: { type: 'string', description: "Stable id: ISO country + standard, e.g. 'de-skr03', 'fr-pcg'. Lowercase." },
            label: { type: 'string', description: "Human label, e.g. 'Germany — SKR03 2024'." },
            source_url: { type: 'string', description: "The PUBLISHER's own URL for the file you parsed (bas.se, datev.de…). Required — this is what lets anyone re-verify the import." },
            source_sha256: { type: 'string', description: 'Lowercase hex sha256 of the downloaded file. You have the file — hash it. Required.' },
            accounts: {
              type: 'array',
              description: 'Every account, VERBATIM from the file: {code: "8400", name: "Erlöse 19 % USt", type: asset|liability|equity|revenue|expense, category?, normal_balance?}. Minimum 40 — fewer is a parsing failure, not a chart.',
              items: { type: 'object', properties: {
                code: { type: 'string' }, name: { type: 'string' },
                type: { type: 'string', enum: ['asset', 'liability', 'equity', 'revenue', 'expense'] },
                category: { type: 'string' }, normal_balance: { type: 'string', enum: ['debit', 'credit'] },
              }, required: ['code', 'name', 'type'] },
            },
            roles: {
              type: 'object',
              description: 'Platform role → account code, e.g. {"bank":"1200","accounts_receivable":"1400","sales_revenue":"8400","vat_output":"1776","vat_input":"1576","accounts_payable":"1600"}. The six named are REQUIRED — the engine posts through roles, never through hardcoded numbers, and without them the locale is inert.',
            },
            replace: { type: 'boolean', description: 'Required to touch a locale that already has a chart. Existing accounts are renamed to the delivered names, missing inserted, none deleted — posted-to accounts always survive.' },
          },
          required: ['locale', 'label', 'source_url', 'source_sha256', 'accounts', 'roles'],
        },
      },
    },
    instructions: `## The job
You are loading a STANDARD, not designing one. Fetch the official file from the
publisher (BAS for Sweden, DATEV for German SKR, the authority for the country),
parse it yourself, and deliver rows verbatim.

## The three rules, each learned the hard way on this platform
1. **Names verbatim.** Never paraphrase, translate or "improve" an account name.
   Our own chart once carried 2614's name on 2611 — ordinary VAT went down a
   reverse-charge path in four templates, and the label misled the person who
   tried to fix it.
2. **Provenance or nothing.** source_url must be the publisher's own address and
   source_sha256 the hash of the exact file you parsed. The call REFUSES without
   them: an unsourced chart is unverifiable forever.
3. **Roles make it live.** The engine resolves bank/accounts_receivable/
   accounts_payable/sales_revenue/vat_output/vat_input through account_roles —
   map them to the codes the standard prescribes for those functions. Wrong role
   mapping = every invoice posts to the wrong account, with a perfectly valid
   chart.

## Refusals are complete
A refused import returns EVERY error at once (bad codes, duplicates, missing
roles, unknown types) — fix them all and resubmit once. Nothing is written on
refusal.

## After import
The response tells you: the locale can now post. What it cannot know is what
THIS company books — follow with propose_posting_templates.`,
  },
  {
    name: 'propose_posting_templates',
    description:
      "Author a SET of posting templates for a locale and have every one structurally verified before it is stored: lines must balance (Σ debit_pct = Σ credit_pct), every account must exist in the locale's chart, and account names are corrected FROM the chart (the chart is the single truth for names). Posting templates are published nowhere — they describe what a specific company actually books, which the platform cannot foresee. If you hold the company's transaction history, derive the templates from it: the recurring patterns in last year's transactions ARE the template set this company needs. Rejected templates come back with reasons and are NOT stored; accepted ones are operator-owned (is_system=false). Use when: setting up a new locale after import_accounting_standard, onboarding a company whose transaction history you can read, codifying recurring booking patterns. NOT for: editing one existing template (manage_accounting_template), booking a transaction (manage_journal_entry), registering a one-off pattern mid-booking (suggest_accounting_template).",
    category: 'commerce',
    handler: 'rpc:propose_posting_templates',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'propose_posting_templates',
        parameters: {
          type: 'object',
          properties: {
            locale: { type: 'string', description: "The locale whose chart the templates are verified against, e.g. 'se-bas2024', 'de-skr03'. Must already have a chart." },
            templates: {
              type: 'array',
              description: 'Each: {template_name, description?, category: revenue|expense|payment|payroll|tax|adjustment|asset, keywords: [..], template_lines: [{account_code, debit_pct, credit_pct}]}. Percentages of the NET amount (base=100): a 19% VAT sale is receivable 119 / revenue 100 / VAT 19. account_name may be omitted — it is taken from the chart.',
              items: { type: 'object', properties: {
                template_name: { type: 'string' }, description: { type: 'string' },
                category: { type: 'string', enum: ['revenue', 'expense', 'payment', 'payroll', 'tax', 'asset', 'adjustment'] },
                keywords: { type: 'array', items: { type: 'string' } },
                template_lines: { type: 'array', items: { type: 'object', properties: {
                  account_code: { type: 'string' }, debit_pct: { type: 'number' }, credit_pct: { type: 'number' },
                }, required: ['account_code', 'debit_pct', 'credit_pct'] } },
              }, required: ['template_name', 'category', 'keywords', 'template_lines'] },
            },
          },
          required: ['locale', 'templates'],
        },
      },
    },
    instructions: `## Where templates come from
The chart says which accounts EXIST. It says nothing about what this company
DOES. If you have access to the company's transaction history (a ledger export,
last year's bank feed, an SIE file), mine it: group the recurring transactions —
rent, the SaaS subscriptions, fuel, the two kinds of sales, payroll — and write
one template per recurring pattern. Aim for the patterns that cover ~90% of
transaction volume; a company rarely needs more than 30–50 to start. Without
history, author the standard set for the country instead (domestic sale per VAT
rate, EU purchase, payroll run, VAT settlement, bank fees…).

## The verification you are writing against
- **Balance**: Σ debit_pct = Σ credit_pct, both > 0. Percentages of the NET
  amount (base=100). Example DE 19%: 1400 debit 119 / 8400 credit 100 /
  1776 credit 19.
- **Accounts must exist** in the locale's chart — run import_accounting_standard
  first, and never invent a code.
- **Names are the chart's.** Any account_name you send is REPLACED by the
  chart's name and reported under name_corrections. Templates carrying their own
  wording is how four VAT templates kept a wrong account for months.
- **Keywords matter**: they are what the matching engine uses to find the
  template from a transaction description. Use the words that appear in this
  company's actual bank descriptions, in the local language.

## Partial success is the contract
accepted / rejected / skipped come back per template. Rejected ones were NOT
stored — fix the reasons and resubmit ONLY those. Do not report the batch as
done while rejected is non-empty.`,
  },
  {
    name: 'manage_opening_balances',
    description: 'Create, list, update, or delete opening balances (IB) for a fiscal year. Use when: admin wants to set initial account balances, migrating from another system, starting a new fiscal year. NOT for: journal entries (use manage_journal_entry), reports (use accounting_reports).',
    category: 'commerce',
    handler: 'db:opening_balances',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_opening_balances',
        description: 'CRUD for opening balances per fiscal year',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'set', 'delete'] },
            fiscal_year: { type: 'number', description: 'Fiscal year, e.g. 2024' },
            account_code: { type: 'string', description: 'Required for set/delete — e.g. "1930"' },
            account_name: { type: 'string', description: 'Required for action=set — human-readable name, e.g. "Bankkonto"' },
            amount_cents: { type: 'number' },
            balance_type: { type: 'string', enum: ['debit', 'credit'] },
            locale: { type: 'string', description: 'Chart locale, e.g. se-bas2024' },
          },
          required: ['action'],
          'x-action-required': {
            set: ['account_code', 'account_name', 'amount_cents'],
          },
        },
      },
    },
    instructions: 'Opening balances must balance (total debit = total credit). Each account should have only one IB per fiscal year. Use the chart_of_accounts to validate account codes.',
  },
  {
    name: 'manage_chart_of_accounts',
    description: 'List, add, update, or deactivate accounts in the chart of accounts. Supports multiple locales (se-bas2024, ifrs, us-gaap). `add` is NOT an upsert: a code that is already taken in that locale is refused, and the refusal names the account sitting there — because 4010 meaning "Inköp material" and 4010 meaning "Försäljning" are two different sets of books, and a silent success over the wrong one sends every later posting to an account that means something else. Rename the existing account with action="update" instead, or pick a free code. Use when: admin asks about available accounts, needs to add a custom account, or deactivate unused accounts. NOT for: journal entries (use manage_journal_entry), opening balances (use manage_opening_balances).',
    category: 'commerce',
    handler: 'db:chart_of_accounts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_chart_of_accounts',
        description: 'CRUD for chart of accounts across locales',
        parameters: {
          type: 'object',
          properties: { action: { type: 'string', enum: ['list', 'add', 'update', 'deactivate'] }, locale: { type: 'string' }, account_code: { type: 'string' }, account_name: { type: 'string' }, account_type: { type: 'string', enum: ['asset', 'liability', 'equity', 'revenue', 'expense'] }, account_category: { type: 'string' }, normal_balance: { type: 'string', enum: ['debit', 'credit'] }, search: { type: 'string' } },
          required: ['action'],
          'x-action-required': {
            add: ['account_code', 'account_name', 'account_type', 'account_category', 'normal_balance'],
          },
        },
      },
    },
    instructions: 'When listing, group by account_type for clarity. BAS 2024 uses 4-digit codes (1xxx=assets, 2xxx=liabilities, 3xxx=income, 4-7xxx=expenses, 8xxx=financial). IFRS and US GAAP use similar groupings. Custom accounts should follow the locale convention.',
  },
  {
    name: 'suggest_accounting_template',
    description: 'Analyze recent journal entries to identify recurring transaction patterns and suggest new reusable templates. Use when: heartbeat detects repeated similar bookings, admin asks FlowPilot to learn from past transactions, or after importing historical data. NOT for: creating entries (use manage_journal_entry), managing existing templates (use manage_accounting_template).',
    category: 'commerce',
    handler: 'db:journal_entries',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'suggest_accounting_template',
        description: 'Analyze journal entries and suggest reusable templates',
        parameters: { type: 'object', properties: { min_occurrences: { type: 'number' }, since_date: { type: 'string' }, locale: { type: 'string' } } },
      },
    },
    instructions: 'Group journal entries by their account_code combinations. If the same set of accounts appears 3+ times, suggest it as a template. Include common descriptions as keywords.',
  },
  {
    name: 'close_accounting_period',
    description: 'Close an accounting period (month) — locks all journal entries with dates in that period against further changes and snapshots totals. Use when: month-end close after all entries are posted and reconciled. NOT for: permanent archival (use lock_accounting_period after audit).',
    category: 'commerce',
    handler: 'rpc:close_accounting_period',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'close_accounting_period',
        description: 'Close a month so no further bookings can be made. Refuses if any draft entries remain.',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'number', description: 'Fiscal year, e.g. 2026' },
            month: { type: 'number', description: 'Month 1-12' },
            notes: { type: 'string', description: 'Optional close note (auditor reference, etc.)' },
          },
          required: ['year', 'month'],
        },
      },
    },
    instructions: 'Always run accounting_reports for unbooked_invoices first to ensure nothing is missing. Confirm with admin before closing. Once closed, only reopen_accounting_period (admin-only) can revert it — and only if not permanently locked.',
  },
  {
    name: 'reopen_accounting_period',
    description: 'Reopen a previously closed accounting period to allow corrections. Fails if the period was permanently locked. Use when: late-arriving correction needs to be booked, auditor requests adjustment. NOT for: locked periods (those are immutable).',
    category: 'commerce',
    handler: 'rpc:reopen_accounting_period',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'reopen_accounting_period',
        description: 'Reopen a closed period for corrections',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'number' },
            month: { type: 'number' },
            reason: { type: 'string', description: 'Why the period is being reopened (audit trail)' },
          },
          required: ['year', 'month', 'reason'],
        },
      },
    },
    instructions: 'Always require an explicit reason for the audit log. Notify the responsible accountant after reopening.',
  },
  {
    name: 'list_accounting_periods',
    description: 'List accounting periods with their status (open/closed/locked) and snapshot totals. Use when: admin asks "is March closed?", before attempting to close a new month, or for the month-end dashboard.',
    category: 'commerce',
    handler: 'db:accounting_periods',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_accounting_periods',
        description: 'List accounting periods and their status',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'number' },
            status: { type: 'string', enum: ['open', 'closed', 'locked'] },
          },
        },
      },
    },
  },
  {
    name: 'list_fiscal_years',
    description: 'List the fiscal years this company actually has, derived from the ledger — entry count, drafts, months closed, and whether each year is open, closed or upcoming. Use when: orienting in a new instance, choosing which year to report on, asking "which years are bookkept here?" or "is 2024 closed?". NOT for: month-level closing status (use list_accounting_periods) — and note that list_accounting_periods returns nothing for a year nobody has closed, so it can never tell you which years exist.',
    category: 'commerce',
    handler: 'rpc:list_fiscal_years',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_fiscal_years',
        description: 'The fiscal years this company has, with status and entry counts.',
        parameters: { type: 'object', properties: {} },
      },
    },
    instructions: 'Takes no arguments. status=upcoming means the year has not started; a year holding entries is never upcoming. Read this BEFORE assuming a company has no history — the closing register (accounting_periods) is empty until someone closes a month, which is normal for a company that has not reached a year-end.',
  },
  {
    name: 'manage_analytic_account',
    description: 'Create, list, update, or archive analytic accounts (cost centers, projects, departments, campaigns) used to tag journal entries for profitability and per-project reporting. Use when: admin asks to track costs/revenue per project or cost center, set up department budgeting, or analyze campaign ROI. NOT for: actual bookkeeping (use manage_journal_entry), tagging existing entries (use tag_journal_entry_analytics).',
    category: 'commerce',
    handler: 'db:analytic_accounts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_analytic_account',
        description: 'CRUD for analytic accounts (cost centers / projects / departments / campaigns)',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] },
            id: { type: 'string', description: 'Required for get/update/delete' },
            code: { type: 'string', description: 'Unique short code, e.g. CC-001' },
            name: { type: 'string' },
            account_type: { type: 'string', enum: ['cost_center', 'project', 'department', 'campaign', 'other'] },
            parent_id: { type: 'string', description: 'Optional parent analytic account for hierarchy' },
            project_id: { type: 'string', description: 'Optional link to a real project' },
            description: { type: 'string' },
            is_active: { type: 'boolean' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['code', 'name'],
          },
        },
      },
    },
    instructions: 'Use cost_center for departments/teams, project for revenue-bearing engagements, campaign for marketing initiatives. Codes should be short and stable (CC-001, PRJ-2026-A). After creating, journal entries can be tagged via tag_journal_entry_analytics.',
  },
  {
    name: 'tag_journal_entry_analytics',
    description: 'Tag an existing journal entry line with one or more analytic accounts to attribute the cost/revenue to projects, cost centers, departments or campaigns. Supports splitting (e.g. 60% Project A / 40% Project B). Use when: a posted entry needs project attribution, monthly cost allocation across departments, retroactive tagging of historical entries. NOT for: creating entries (use manage_journal_entry), creating analytic accounts (use manage_analytic_account).',
    category: 'commerce',
    handler: 'db:analytic_lines',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'tag_journal_entry_analytics',
        description: 'Create analytic_lines that tag a journal_entry_line to one or more analytic accounts',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'create', 'delete'] },
            analytic_account_id: { type: 'string', description: 'Target cost center / project / etc.' },
            journal_entry_id: { type: 'string' },
            journal_entry_line_id: { type: 'string' },
            entry_date: { type: 'string', description: 'YYYY-MM-DD' },
            account_code: { type: 'string', description: 'Source GL account code, e.g. 5910' },
            description: { type: 'string' },
            amount_cents: { type: 'number', description: 'Signed: positive = expense/debit, negative = revenue/credit' },
            currency: { type: 'string', description: 'ISO code, default SEK' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['analytic_account_id', 'entry_date', 'amount_cents'],
          },
        },
      },
    },
    instructions: 'For a single 100% tag, create one analytic_line whose amount_cents matches the original JE line (debit positive, credit negative). For splits, create multiple lines that sum to the original amount. Always supply entry_date and account_code from the source JE for accurate reporting.',
  },
  {
    name: 'manage_vendor_defaults',
    description: 'Read or update a vendor\'s auto-coding defaults — `default_account_code` (e.g. 6540 for IT services), `default_vat_code`, `default_description`, `last_used_template_id`. Use when: agent has just booked a vendor invoice and wants to remember the choice for next time, admin onboards a new supplier, OR before booking a vendor invoice (read defaults first). NOT for: actual bookkeeping (use manage_journal_entry).',
    category: 'commerce',
    handler: 'db:vendors',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_vendor_defaults',
        description: 'Get or update a vendor\'s default bookkeeping settings (Visma-style autokontering).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get', 'update'] },
            id: { type: 'string', description: 'Vendor id (required).' },
            default_account_code: { type: 'string' },
            default_vat_code: { type: 'string' },
            default_description: { type: 'string' },
            last_used_template_id: { type: 'string' },
          },
          required: ['action', 'id'],
        },
      },
    },
    instructions: 'When you book a vendor invoice for the first time without an existing default, ALWAYS call this with action=update afterwards so future invoices auto-route correctly. When you start to book a vendor invoice, call action=get first to see if a default already exists.',
  },
  {
    name: 'record_accounting_correction',
    description: 'Record that a manually-corrected journal entry differed from what was originally booked (auto or by template). This is the learning signal — every call makes the agent smarter for similar future transactions. Use when: a user edits an account_code on an existing JE line, OR the agent itself notices its previous booking was wrong and re-books. NOT for: original bookings (use manage_journal_entry).',
    category: 'commerce',
    handler: 'db:accounting_corrections',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_accounting_correction',
        description: 'Append a correction row so the agent can learn from past mistakes.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list'] },
            journal_entry_id: { type: 'string' },
            vendor_id: { type: 'string' },
            description_pattern: { type: 'string' },
            original_account_code: { type: 'string' },
            corrected_account_code: { type: 'string' },
            original_vat_code: { type: 'string' },
            corrected_vat_code: { type: 'string' },
            reason: { type: 'string' },
            agent_source: { type: 'string', enum: ['openclaw', 'flowpilot', 'manual', 'template'] },
          },
          required: ['action'],
          'x-action-required': {
            create: ['original_account_code', 'corrected_account_code'],
          },
        },
      },
    },
    instructions: 'Before booking a similar transaction (same vendor or similar description), call action=list with vendor_id or description_pattern to fetch prior corrections — these override template defaults.',
  },
  {
    name: 'manage_budget',
    description: 'Set and list per-account budgets (annual or per-month). Use when: planning a fiscal year, setting a cost-centre budget. NOT for: comparing to actuals (budget_vs_actual) or posting entries (manage_journal_entry).',
    category: 'commerce',
    handler: 'rpc:manage_budget',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_budget',
        description: 'List/upsert/delete account budget rows. period_month NULL = annual budget; 1–12 = that month. Upsert is keyed on (account_code, fiscal_year, period_month).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'upsert', 'delete'] },
            p_budget_id: { type: 'string', format: 'uuid' },
            p_account_code: { type: 'string' },
            p_fiscal_year: { type: 'number' },
            p_period_month: { type: 'number', description: '1–12, or omit for an annual budget' },
            p_amount_cents: { type: 'number' },
            p_currency: { type: 'string' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Budgets are per account_code per fiscal_year, either annual (omit period_month) or monthly (1–12). upsert overwrites the matching row. Pair with budget_vs_actual to report variance.',
  },
  {
    name: 'budget_vs_actual',
    description: 'Budget vs actual variance report per account for a fiscal year (or a single month). Use when: reviewing spend against plan, month-end/year-end variance analysis. NOT for: editing budgets (manage_budget).',
    category: 'commerce',
    handler: 'rpc:budget_vs_actual',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'budget_vs_actual',
        description: 'Per account_code: budget_cents vs actual net movement (Σ debit−credit, non-draft entries) and variance. period_month NULL = full-year against annual budgets.',
        parameters: {
          type: 'object',
          required: ['p_fiscal_year'],
          properties: {
            p_fiscal_year: { type: 'number' },
            p_period_month: { type: 'number', description: '1–12; omit for the annual view' },
          },
        },
      },
    },
    instructions: 'Annual view (omit p_period_month) compares annual budget rows to the whole year; passing a month compares that month\'s budget rows to that month\'s actuals. Actuals exclude draft journal entries. variance_cents = budget − actual.',
  },
];

const ACCOUNTING_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Invoice Reconciliation',
    description: 'Daily check for sent invoices without matching journal entries. FlowPilot reviews and books them autonomously using the correct accounting template.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 8 * * *', expression: '0 8 * * *' },
    skill_name: 'accounting_reports',
    skill_arguments: { type: 'unbooked_invoices' },
  },
];

/** Seed chart of accounts from the active locale pack if not already present */
async function seedChartOfAccounts() {
  const pack = getActivePack();
  const { count } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('locale', pack.id);

  if ((count ?? 0) > 0) {
    logger.log(`[accounting] ${pack.label} chart already populated, skipping`);
    return;
  }

  const accounts = pack.chart.map((a) => ({ ...a, locale: pack.id }));
  for (let i = 0; i < accounts.length; i += 50) {
    const batch = accounts.slice(i, i + 50);
    const { error } = await supabase.from('chart_of_accounts').insert(batch);
    if (error) throw error;
  }
  logger.log(`[accounting] Seeded ${accounts.length} ${pack.label} accounts`);
}

/** Seed default accounting templates from the active locale pack */
async function seedAccountingTemplates() {
  const pack = getActivePack();
  const { count } = await supabase
    .from('accounting_templates')
    .select('id', { count: 'exact', head: true })
    .eq('locale', pack.id);

  if ((count ?? 0) > 0) {
    logger.log(`[accounting] ${pack.label} templates already populated, skipping`);
    return;
  }

  const templates = pack.templates.map((t) => ({
    ...t,
    locale: pack.id,
    is_system: t.is_system ?? true,
    template_lines: t.template_lines as any,
  })) as any[];
  for (let i = 0; i < templates.length; i += 20) {
    const batch = templates.slice(i, i + 20);
    const { error } = await supabase.from('accounting_templates').insert(batch);
    if (error) throw error;
  }
  logger.log(`[accounting] Seeded ${templates.length} ${pack.label} templates`);
}

export const accountingModule = defineModule<AccountingInput, AccountingOutput>({
  id: 'accounting',
  name: 'Accounting',
  version: '1.0.0',
  processes: ['quote-to-cash', 'procure-to-pay', 'record-to-report'],
  maturity: 'L3',
  description: 'Double-entry bookkeeping with pluggable locale packs (chart of accounts, VAT rules, payroll, bank import). Default: BAS 2024 (Sweden); also supports IFRS-generic. Add new market packs in src/lib/locale-packs/.',
  capabilities: ['data:write', 'data:read'],
  tier: 'standard',
  inputSchema: accountingInputSchema,
  outputSchema: accountingOutputSchema,

  skills: [
    'manage_journal_entry',
    'accounting_reports',
    'prepare_vat_return',
    'manage_accounting_template',
    'manage_opening_balances',
    'manage_chart_of_accounts',
    'suggest_accounting_template',
    'close_accounting_period',
    'reopen_accounting_period',
    'list_accounting_periods',
    'list_fiscal_years',
    'manage_analytic_account',
    'tag_journal_entry_analytics',
    'manage_vendor_defaults',
    'record_accounting_correction',
    'year_end_readiness',
    'run_year_end',
    'list_voucher_gaps',
    'explain_voucher_gap',
    'propose_accruals',
    'manage_budget',
    'budget_vs_actual',
  ],

  data: {
    tables: [
      'journal_entry_line_taxes',
      'journal_entry_lines',
      'journal_entries',
      'analytic_lines',
      'analytic_accounts',
      'accounting_corrections',
      'accounting_templates',
      'accounting_periods',
      'opening_balances',
      'tax_code_grids',
      'tax_codes',
      'tax_grids',
      'journals',
      'chart_of_accounts',
    ],
  },
  skillSeeds: ACCOUNTING_SKILLS,
  automations: ACCOUNTING_AUTOMATIONS,

  seedData: async () => {
    await seedChartOfAccounts();
    await seedAccountingTemplates();
  },

  async publish(input: AccountingInput): Promise<AccountingOutput> {
    const validated = accountingInputSchema.parse(input);

    if (validated.action === 'create_entry') {
      if (!validated.lines || validated.lines.length === 0) {
        return { success: false, message: 'lines are required' };
      }

      const totalDebit = validated.lines.reduce((s, l) => s + l.debit_cents, 0);
      const totalCredit = validated.lines.reduce((s, l) => s + l.credit_cents, 0);
      if (totalDebit !== totalCredit) {
        return { success: false, message: `Unbalanced: debit ${totalDebit} ≠ credit ${totalCredit}` };
      }

      const { data, error } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: validated.entry_date || new Date().toISOString().split('T')[0],
          description: validated.description || '',
          reference_number: validated.reference_number || null,
          status: 'posted',
          source: 'flowpilot',
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[accounting] create entry failed', error);
        return { success: false, message: error.message };
      }

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(
          validated.lines.map((l) => ({
            journal_entry_id: data.id,
            account_code: l.account_code,
            account_name: l.account_name,
            debit_cents: l.debit_cents,
            credit_cents: l.credit_cents,
            description: l.description || null,
          }))
        );

      if (linesError) {
        logger.error('[accounting] create lines failed', linesError);
        return { success: false, message: linesError.message };
      }

      return { success: true, entry_id: data.id, message: 'Journal entry created' };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
