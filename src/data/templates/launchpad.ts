/**
 * LaunchPad Template - Startup SaaS
 * 
 * Modern, conversion-focused template for SaaS and tech startups.
 * Features bold hero with video support, social proof stats, and AI chat.
 * 
 * NOTE: Page data is still sourced from the monolith during migration.
 * Full extraction planned for next phase.
 */
import { STARTER_TEMPLATES } from '@/data/starter-templates';
import type { StarterTemplate } from './types';

export const launchpadTemplate: StarterTemplate = STARTER_TEMPLATES.find(t => t.id === 'launchpad')!;
