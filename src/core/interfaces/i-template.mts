import type { TemplateType } from "../enums/template-type.mts";
import type { IFeatureSpec } from "./i-feature-spec.mts";

export interface IGeneratedFile {
  path: string;
  description: string;
}

export interface IRenderedFile {
  path: string;
  content: string;
}

export interface IValidationResult {
  valid: boolean;
  errors: string[];
}

export interface IGenerationContext {
  projectName: string;
  outputDir: string;
  existingFiles: Map<string, string>;
}

export interface ITemplate {
  name: string;
  type: TemplateType;
  description: string;

  plan(feature: IFeatureSpec): IGeneratedFile[];

  render(feature: IFeatureSpec, context: IGenerationContext): IRenderedFile[];

  validate(files: IRenderedFile[]): IValidationResult;
}
