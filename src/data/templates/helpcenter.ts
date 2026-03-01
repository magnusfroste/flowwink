/**
 * HelpCenter Template - Unified Help Center
 * 
 * Supports multiple help styles via helpStyle parameter:
 * - 'kb-classic': SEO-focused documentation without AI
 * - 'ai-hub': AI-first with prominent chat
 * - 'hybrid': Searchable KB + AI chat (default)
 * 
 * NOTE: Page data is still sourced from the monolith during migration.
 * Full extraction planned for next phase.
 */
import { STARTER_TEMPLATES } from '@/data/starter-templates';
import type { StarterTemplate } from './types';

export const helpCenterTemplate: StarterTemplate = STARTER_TEMPLATES.find(t => t.id === 'helpcenter')!;
