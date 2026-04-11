/**
 * Contracts Module Bootstrap
 * 
 * Seeds:
 * - Skills: manage_contract, contract_renewal_check
 * - Automation: Contract Renewal Alert (daily)
 */

import { registerBootstrap, type SkillSeed, type AutomationSeed } from '@/lib/module-bootstrap';

const CONTRACT_SKILLS: SkillSeed[] = [
  {
    name: 'manage_contract',
    description: 'Create, list, update, or search contracts. Use when: admin wants to create an agreement, find a contract by counterparty, change status, or update terms. NOT for: invoicing (use manage_invoice), project management (use manage_projects).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_contract',
        description: 'CRUD for contracts and agreements',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'search'] },
            contract_id: { type: 'string' },
            title: { type: 'string' },
            contract_type: { type: 'string', enum: ['service', 'nda', 'employment', 'lease', 'other'] },
            status: { type: 'string', enum: ['draft', 'pending_signature', 'active', 'expired', 'terminated'] },
            counterparty_name: { type: 'string' },
            counterparty_email: { type: 'string' },
            start_date: { type: 'string', description: 'YYYY-MM-DD' },
            end_date: { type: 'string', description: 'YYYY-MM-DD' },
            renewal_type: { type: 'string', enum: ['none', 'auto', 'manual'] },
            renewal_notice_days: { type: 'number' },
            value_cents: { type: 'number' },
            currency: { type: 'string' },
            notes: { type: 'string' },
            search_query: { type: 'string', description: 'Free-text search in title/counterparty' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Contracts track agreements with external parties. Status flow: draft → pending_signature → active → expired/terminated. When creating, default currency to SEK. For search, match against title and counterparty_name. Swedish: "avtal", "kontrakt", "NDA", "tjänsteavtal".',
  },
  {
    name: 'contract_renewal_check',
    description: 'Check for contracts expiring soon and alert. Use when: autonomous heartbeat checks for renewal deadlines, or admin asks "vilka avtal går ut snart?". NOT for: creating contracts (use manage_contract).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'contract_renewal_check',
        description: 'Find contracts expiring within a given number of days',
        parameters: {
          type: 'object',
          properties: {
            days_ahead: { type: 'number', description: 'Days to look ahead (default 30)' },
            include_auto_renew: { type: 'boolean', description: 'Include auto-renewing contracts' },
          },
        },
      },
    },
    instructions: 'Query active contracts where end_date is within the specified window. Group by urgency: critical (<7 days), warning (<30 days), notice (<90 days). For auto-renew contracts, check if renewal_notice_days has passed. Swedish: "förnyelse", "utgående avtal", "uppsägningstid".',
  },
];

const CONTRACT_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Contract Renewal Alert',
    description: 'Every weekday at 08:00, FlowPilot checks for contracts expiring within 30 days and alerts the admin.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 8 * * 1-5', expression: '0 8 * * 1-5' },
    skill_name: 'contract_renewal_check',
    skill_arguments: { days_ahead: 30 },
  },
];

registerBootstrap('contracts', {
  skills: CONTRACT_SKILLS,
  automations: CONTRACT_AUTOMATIONS,
});
