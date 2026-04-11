import type { IFeatureSpec } from "./i-feature-spec.mts";

export interface IGenerationStep {
  featureName: string;
  stepName: string;
  order: number;
  dependsOn: string[];
}

export interface IGenerationPlan {
  projectName: string;
  features: IFeatureSpec[];
  steps: IGenerationStep[];
  createdAt: string;
}
