/**
 * Digital Shop Template - E-commerce
 * 
 * E-commerce template for selling digital products.
 * Features product showcase, shopping cart, Stripe checkout, and order management.
 * 
 * NOTE: Page data is still sourced from the monolith during migration.
 * Full extraction planned for next phase.
 */
import { STARTER_TEMPLATES } from '@/data/starter-templates';
import type { StarterTemplate } from './types';

export const digitalShopTemplate: StarterTemplate = STARTER_TEMPLATES.find(t => t.id === 'digital-shop')!;
