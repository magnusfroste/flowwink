/**
 * TrustCorp Template - Enterprise
 * 
 * Professional template for established enterprises.
 * Emphasizes trust, scale, and data sovereignty.
 * 
 * NOTE: Page data is still sourced from the monolith during migration.
 * Full extraction planned for next phase.
 */
import { STARTER_TEMPLATES } from '@/data/starter-templates';
import type { StarterTemplate } from './types';

export const trustcorpTemplate: StarterTemplate = STARTER_TEMPLATES.find(t => t.id === 'trustcorp')!;
