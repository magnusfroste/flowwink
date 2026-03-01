/**
 * ServicePro Template - Service Business
 * 
 * Modern template for service businesses with smart booking,
 * real-time availability, service showcase, and online scheduling.
 * 
 * NOTE: Page data is still sourced from the monolith during migration.
 * Full extraction planned for next phase.
 */
import { STARTER_TEMPLATES } from '@/data/starter-templates';
import type { StarterTemplate } from './types';

export const serviceProTemplate: StarterTemplate = STARTER_TEMPLATES.find(t => t.id === 'service-pro')!;
