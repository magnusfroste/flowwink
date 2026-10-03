import { useModules, defaultModulesSettings, type ModulesSettings } from './useModules';
import { useIntegrations, resolveIntegrationStatus, type IntegrationsSettings } from './useIntegrations';
import { useIntegrationStatus } from './useIntegrationStatus';
import { useComposioConnectedToolkits } from './useComposioConnectedToolkits';

export interface ModuleReadiness {
  ready: boolean;
  missingRequired: string[];
  missingOptional: string[];
  activeRequired: string[];
  activeOptional: string[];
  totalRequired: number;
  totalOptional: number;
  /** True when the module needs AI but no provider is active */
  missingAI: boolean;
  /** True when the module needs FlowPilot but it's disabled */
  missingFlowPilot: boolean;
  /** True when the module works without FlowPilot but gains proactive capabilities with it */
  flowPilotEnhanced: boolean;
  /** True when enhanced by FlowPilot AND FlowPilot is currently disabled */
  flowPilotEnhancedButMissing: boolean;
}

const AI_PROVIDER_KEYS = ['openai', 'gemini', 'local_llm'] as const;

/**
 * Check if a module's integration dependencies are satisfied.
 * Auto-enable logic: active when secret exists, unless explicitly disabled by admin.
 */
export function useModuleReadiness(moduleId: keyof ModulesSettings): ModuleReadiness {
  const { data: modules } = useModules();
  const { data: integrations } = useIntegrations();
  const { data: secretsStatus } = useIntegrationStatus();
  const { toolkits } = useComposioConnectedToolkits();

  const allModules = modules ?? defaultModulesSettings;
  const module = allModules[moduleId] ?? defaultModulesSettings[moduleId];
  const required = module?.requiredIntegrations ?? [];
  const optional = module?.optionalIntegrations ?? [];

  // ONE answer to "is this integration usable": resolveIntegrationStatus. This
  // hook used to keep its own list of secret-less integrations and treat every
  // other key as "needs a vault secret", so a Composio-backed integration (Meta
  // Ads) read as missing forever and a config-based one (searxng, smtp) too.
  const isIntegrationActive = (key: string): boolean => {
    if (!integrations || !secretsStatus) return false;
    return resolveIntegrationStatus(key as keyof IntegrationsSettings, secretsStatus.integrations, integrations, toolkits).isActive;
  };

  const missingRequired = required.filter(k => !isIntegrationActive(k));
  const missingOptional = optional.filter(k => !isIntegrationActive(k));
  const activeRequired = required.filter(k => isIntegrationActive(k));
  const activeOptional = optional.filter(k => isIntegrationActive(k));

  // Check requiresAI — at least one AI provider must be active
  const missingAI = module?.requiresAI === true &&
    !AI_PROVIDER_KEYS.some(k => isIntegrationActive(k));

  // Check requiresFlowPilot — FlowPilot module must be enabled
  const flowpilotConfig = allModules.flowpilot ?? defaultModulesSettings.flowpilot;
  const missingFlowPilot = module?.requiresFlowPilot === true &&
    flowpilotConfig.enabled === false;

  // Check enhancedByFlowPilot — works without but better with
  const flowPilotEnhanced = module?.enhancedByFlowPilot === true;
  const flowPilotEnhancedButMissing = flowPilotEnhanced && flowpilotConfig.enabled === false;

  return {
    ready: missingRequired.length === 0 && !missingAI && !missingFlowPilot,
    missingRequired,
    missingOptional,
    activeRequired,
    activeOptional,
    totalRequired: required.length,
    totalOptional: optional.length,
    missingAI,
    missingFlowPilot,
    flowPilotEnhanced,
    flowPilotEnhancedButMissing,
  };
}

/**
 * Build a map from integration key → module names that use it.
 */
export function useIntegrationModuleMap(): Record<string, { required: string[]; optional: string[] }> {
  const { data: modules } = useModules();
  const settings = modules ?? defaultModulesSettings;

  const map: Record<string, { required: string[]; optional: string[] }> = {};

  for (const [moduleId, config] of Object.entries(settings)) {
    for (const intKey of config.requiredIntegrations ?? []) {
      if (!map[intKey]) map[intKey] = { required: [], optional: [] };
      map[intKey].required.push(config.name);
    }
    for (const intKey of config.optionalIntegrations ?? []) {
      if (!map[intKey]) map[intKey] = { required: [], optional: [] };
      map[intKey].optional.push(config.name);
    }
  }

  return map;
}
