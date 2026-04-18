/**
 * Module Registry
 * 
 * Central coordinator for all FlowWink modules. Handles registration,
 * validation, and execution of module operations.
 * 
 * Modules self-register via defineModule() on import.
 * Legacy modules (globalBlocks, orders) are registered explicitly.
 * 
 * @see docs/reference/module-api.md for full documentation
 */

import { logger } from '@/lib/logger';
import type { ModuleDefinition, ModuleCapability } from '@/types/module-contracts';
import { getAllUnifiedModules } from '@/lib/module-def';

// Import all modules to trigger defineModule() self-registration
import {
  // Unified modules (auto-register via defineModule)
  blogModule, pagesModule, kbModule, mediaModule, newsletterModule,
  handbookModule, templatesModule, crmModule, dealsModule, companiesModule,
  formsModule, bookingModule, productsModule, inventoryModule, chatModule,
  liveSupportModule, webinarsModule, analyticsModule, companyInsightsModule,
  invoicingModule, accountingModule, expensesModule, timesheetsModule,
  purchasingModule, contractsModule, hrModule, documentsModule, projectsModule,
  slaModule, calendarModule, subscriptionsModule, salesIntelligenceModule,
  growthModule, resumeModule, browserControlModule, federationModule,
  composioModule, ticketsModule, siteMigrationModule, developerModule,
  flowpilotModule, emailModule,
  // Legacy modules (manual registration)
  globalBlocksModule, ordersModule,
} from '@/lib/modules';

// =============================================================================
// Module Registry Class
// =============================================================================

class ModuleRegistry {
  private modules: Map<string, ModuleDefinition<unknown, unknown>> = new Map();

  constructor() {
    // All unified modules auto-registered via defineModule() on import above
    for (const unified of getAllUnifiedModules()) {
      if (!this.modules.has(unified.id)) {
        this.register(unified as unknown as ModuleDefinition<unknown, unknown>);
      }
    }

    // Legacy modules without ModulesSettings keys — register explicitly
    const legacy = [globalBlocksModule, ordersModule];
    for (const mod of legacy) {
      if (!this.modules.has(mod.id)) {
        this.register(mod as ModuleDefinition<unknown, unknown>);
      }
    }
  }

  register<TInput, TOutput>(module: ModuleDefinition<TInput, TOutput>): void {
    if (this.modules.has(module.id)) {
      logger.warn(`[ModuleRegistry] Module '${module.id}' already registered, overwriting`);
    }
    this.modules.set(module.id, module as ModuleDefinition<unknown, unknown>);
    logger.log(`[ModuleRegistry] Registered module: ${module.id} v${module.version}`);
  }

  get<TInput, TOutput>(moduleId: string): ModuleDefinition<TInput, TOutput> | undefined {
    return this.modules.get(moduleId) as ModuleDefinition<TInput, TOutput> | undefined;
  }

  list(): Array<{
    id: string;
    name: string;
    version: string;
    description?: string;
    capabilities: ModuleCapability[];
  }> {
    return Array.from(this.modules.values()).map(m => ({
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      capabilities: m.capabilities,
    }));
  }

  preflight(
    moduleId: string,
    readiness: { ready: boolean; missingRequired: string[] }
  ): { ok: true } | { ok: false; missing: string[]; error: string } {
    const module = this.modules.get(moduleId);
    if (!module) {
      return { ok: false, missing: [], error: `Module '${moduleId}' not found` };
    }
    if (!readiness.ready) {
      const missing = readiness.missingRequired;
      return {
        ok: false,
        missing,
        error: `Module '${module.name}' requires integrations that are not configured: ${missing.join(', ')}`,
      };
    }
    return { ok: true };
  }

  async publish<TInput, TOutput>(
    moduleId: string,
    input: TInput,
    readiness?: { ready: boolean; missingRequired: string[] }
  ): Promise<TOutput> {
    const module = this.modules.get(moduleId);
    
    if (!module) {
      throw new Error(`Module '${moduleId}' not found`);
    }

    if (readiness) {
      const check = this.preflight(moduleId, readiness);
      if (check.ok === false) {
        logger.error(`[ModuleRegistry] Pre-flight failed for ${moduleId}: ${check.error}`);
        return {
          success: false,
          error: check.error,
          missing_integrations: check.missing,
        } as TOutput;
      }
    }

    const validationResult = module.inputSchema.safeParse(input);
    if (!validationResult.success) {
      logger.error(`[ModuleRegistry] Validation failed for ${moduleId}:`, validationResult.error);
      return {
        success: false,
        error: 'Validation failed',
        validation_errors: validationResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      } as TOutput;
    }

    logger.log(`[ModuleRegistry] Publishing to ${moduleId}...`);
    const result = await module.publish(validationResult.data);
    
    const outputValidation = module.outputSchema.safeParse(result);
    if (!outputValidation.success) {
      logger.warn(`[ModuleRegistry] Output validation failed for ${moduleId}:`, outputValidation.error);
    }

    return result as TOutput;
  }

  hasCapability(moduleId: string, capability: ModuleCapability): boolean {
    const module = this.modules.get(moduleId);
    return module?.capabilities.includes(capability) ?? false;
  }

  getByCapability(capability: ModuleCapability): string[] {
    return Array.from(this.modules.entries())
      .filter(([_, m]) => m.capabilities.includes(capability))
      .map(([id]) => id);
  }
}

export const moduleRegistry = new ModuleRegistry();

export type { ModuleDefinition };
