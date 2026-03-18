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
}

/**
 * Check if a module's integration dependencies are satisfied.
 * An integration is "active" when it has a configured secret AND is enabled.
 */
export function useModuleReadiness(moduleId: keyof ModulesSettings): ModuleReadiness {
  const { data: modules } = useModules();
  const { data: integrations } = useIntegrations();
  const { data: secretsStatus } = useIntegrationStatus();

  const module = modules?.[moduleId] ?? defaultModulesSettings[moduleId];
  const required = module?.requiredIntegrations ?? [];
  const optional = module?.optionalIntegrations ?? [];

  const isIntegrationActive = (key: string): boolean => {
    if (!integrations || !secretsStatus) return false;
    const noSecretNeeded = ['local_llm', 'n8n', 'google_analytics', 'meta_pixel', 'slack'];
    const hasKey = noSecretNeeded.includes(key) ? true : (secretsStatus.integrations?.[key as keyof IntegrationsSettings] ?? false);
    const isEnabled = integrations[key as keyof IntegrationsSettings]?.enabled ?? false;
    return hasKey && isEnabled;
  };

  const missingRequired = required.filter(k => !isIntegrationActive(k));
  const missingOptional = optional.filter(k => !isIntegrationActive(k));
  const activeRequired = required.filter(k => isIntegrationActive(k));
  const activeOptional = optional.filter(k => isIntegrationActive(k));

  return {
    ready: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    activeRequired,
    activeOptional,
    totalRequired: required.length,
    totalOptional: optional.length,
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
