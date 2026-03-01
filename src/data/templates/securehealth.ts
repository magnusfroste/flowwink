/**
 * SecureHealth Template - Healthcare/Compliance
 * 
 * Compliance-first template for healthcare, legal, and finance.
 * Features a prominent Private AI assistant with HIPAA-compliant messaging.
 * 
 * NOTE: Page data is still sourced from the monolith during migration.
 * Full extraction planned for next phase.
 */
import { STARTER_TEMPLATES } from '@/data/starter-templates';
import type { StarterTemplate } from './types';

export const securehealthTemplate: StarterTemplate = STARTER_TEMPLATES.find(t => t.id === 'securehealth')!;
