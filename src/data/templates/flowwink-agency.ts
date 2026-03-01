/**
 * FlowWink Agency Template - Agency/Consultant
 * 
 * Agency-focused template for web agencies and consultants.
 * Features ROI calculator, competitor comparisons, and white-label positioning.
 * 
 * NOTE: Page data is still sourced from the monolith during migration.
 * Full extraction planned for next phase.
 */
import { STARTER_TEMPLATES } from '@/data/starter-templates';
import type { StarterTemplate } from './types';

export const flowwinkAgencyTemplate: StarterTemplate = STARTER_TEMPLATES.find(t => t.id === 'flowwink-agency')!;
