import { useModules, defaultModulesSettings, type ModulesSettings } from './useModules';
import { useIntegrations, type IntegrationsSettings } from './useIntegrations';
import { useIntegrationStatus } from './useIntegrationStatus';

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

  const allModules = modules ?? defaultModulesSettings;
  const module = allModules[moduleId] ?? defaultModulesSettings[moduleId];
  const required = module?.requiredIntegrations ?? [];
  const optional = module?.optionalIntegrations ?? [];

  const isIntegrationActive = (key: string): boolean => {
    if (!integrations || !secretsStatus) return false;
    const noSecretNeeded = ['local_llm', 'n8n', 'google_analytics', 'meta_pixel', 'slack'];
    const hasKey = noSecretNeeded.includes(key) ? true : (secretsStatus.integrations?.[key as keyof IntegrationsSettings] ?? false);
    // Auto-enable: active if key exists, unless explicitly disabled (enabled === false)
    const explicitlyDisabled = integrations[key as keyof IntegrationsSettings]?.enabled === false;
    return hasKey && !explicitlyDisabled;
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
