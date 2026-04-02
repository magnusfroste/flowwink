/**
 * Module Registry
 * 
 * Central coordinator for all FlowWink modules. Handles registration,
 * validation, and execution of module operations.
 * 
 * Individual module implementations live in src/lib/modules/*.ts
 * 
 * @see docs/MODULE-API.md for full documentation
 */

import { logger } from '@/lib/logger';
import type { ModuleDefinition, ModuleCapability } from '@/types/module-contracts';

// Import all module implementations
import {
  blogModule,
  newsletterModule,
  crmModule,
  pagesModule,
  kbModule,
  productsModule,
  bookingModule,
  globalBlocksModule,
  mediaModule,
  dealsModule,
  companiesModule,
  formsModule,
  ordersModule,
  webinarsModule,
  salesIntelligenceModule,
  resumeModule,
  browserControlModule,
  growthModule,
  federationModule,
  composioModule,
  ticketsModule,
  siteMigrationModule,
  templatesModule,
  developerModule,
} from '@/lib/modules';

// =============================================================================
// Module Registry Class
// =============================================================================

class ModuleRegistry {
  private modules: Map<string, ModuleDefinition<unknown, unknown>> = new Map();

  constructor() {
    // Register all built-in modules
    const builtIn = [
      blogModule,
      newsletterModule,
      crmModule,
      pagesModule,
      kbModule,
      productsModule,
      bookingModule,
      globalBlocksModule,
      mediaModule,
      dealsModule,
      companiesModule,
      formsModule,
      ordersModule,
      webinarsModule,
      salesIntelligenceModule,
      resumeModule,
      browserControlModule,
      growthModule,
      federationModule,
      composioModule,
      ticketsModule,
      siteMigrationModule,
      templatesModule,
      developerModule,
    ];

    for (const mod of builtIn) {
      this.register(mod as ModuleDefinition<unknown, unknown>);
    }
  }

  /**
   * Register a new module
   */
  register<TInput, TOutput>(module: ModuleDefinition<TInput, TOutput>): void {
    if (this.modules.has(module.id)) {
      logger.warn(`[ModuleRegistry] Module '${module.id}' already registered, overwriting`);
    }
    this.modules.set(module.id, module as ModuleDefinition<unknown, unknown>);
    logger.log(`[ModuleRegistry] Registered module: ${module.id} v${module.version}`);
  }

  /**
   * Get a registered module
   */
  get<TInput, TOutput>(moduleId: string): ModuleDefinition<TInput, TOutput> | undefined {
    return this.modules.get(moduleId) as ModuleDefinition<TInput, TOutput> | undefined;
  }

  /**
   * List all registered modules
   */
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

  /**
   * Pre-flight check: verify that a module's required integrations are active.
   * Returns { ok: true } or { ok: false, missing: string[] }.
   * 
   * @param moduleId - The module to check
   * @param readiness - Integration readiness data (from useModuleReadiness)
   */
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

  /**
   * Publish content through a module
   * 
   * @param readiness - Optional integration readiness. When provided, publish
   *   will fail fast if required integrations are missing.
   */
  async publish<TInput, TOutput>(
    moduleId: string,
    input: TInput,
    readiness?: { ready: boolean; missingRequired: string[] }
  ): Promise<TOutput> {
    const module = this.modules.get(moduleId);
    
    if (!module) {
      throw new Error(`Module '${moduleId}' not found`);
    }

    // Pre-flight integration check (when readiness data is provided)
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

    // Validate input against schema
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

    // Execute module
    logger.log(`[ModuleRegistry] Publishing to ${moduleId}...`);
    const result = await module.publish(validationResult.data);
    
    // Validate output
    const outputValidation = module.outputSchema.safeParse(result);
    if (!outputValidation.success) {
      logger.warn(`[ModuleRegistry] Output validation failed for ${moduleId}:`, outputValidation.error);
    }

    return result as TOutput;
  }

  /**
   * Check if a module has a specific capability
   */
  hasCapability(moduleId: string, capability: ModuleCapability): boolean {
    const module = this.modules.get(moduleId);
    return module?.capabilities.includes(capability) ?? false;
  }

  /**
   * Get all modules with a specific capability
   */
  getByCapability(capability: ModuleCapability): string[] {
    return Array.from(this.modules.entries())
      .filter(([_, m]) => m.capabilities.includes(capability))
      .map(([id]) => id);
  }
}

// Export singleton instance
export const moduleRegistry = new ModuleRegistry();

// Export types for external use
export type { ModuleDefinition };
