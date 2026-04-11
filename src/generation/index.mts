export { GenerationEngine } from "./engine.mts";
export type {
  GenerationEngineConfig,
  FeatureGenerationResult,
  FullGenerationResult,
} from "./engine.mts";

export { TemplateRegistry } from "./template-registry.mts";
export type { TemplateLayer } from "./template-registry.mts";

export { AddonDiscovery } from "./addon-discovery.mts";
export type {
  IDiscoveredAddon,
  IDiscoveryResult,
  IDiscoveryError,
} from "./addon-discovery.mts";

export {
  validateTemplateContract,
  isValidTemplate,
} from "./template-contract-validator.mts";
export type { IContractValidationResult } from "./template-contract-validator.mts";
