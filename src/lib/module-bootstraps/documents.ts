import { registerBootstrap, type SkillSeed, type AutomationSeed } from '@/lib/module-bootstrap';

const DOCS_SKILLS: SkillSeed[] = [
  {
    name: 'manage_document',
    description: 'Upload, search, categorize, and delete documents in the central archive. Use when: storing contracts, HR docs, financial records, or project files. NOT for: media library images (use manage_media), blog content.',
    category: 'content',
    handler: 'db:documents',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_document',
        description: 'CRUD for the document archive',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'search', 'list', 'delete', 'categorize'] },
            document_id: { type: 'string' },
            title: { type: 'string' },
            category: { type: 'string', enum: ['general', 'contract', 'hr', 'finance', 'project'] },
            folder: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            search_query: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Central document store. Categories map to modules: contract→Contracts, hr→HR, finance→Expenses/Invoicing, project→Projects. Auto-categorize based on related_entity_type when possible. Swedish: "dokument", "fil", "arkiv", "mapp".',
  },
];

registerBootstrap('documents', {
  skills: DOCS_SKILLS,
  automations: [],
});
