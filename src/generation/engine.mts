import type { Logger } from "winston";
import type { IFeatureSpec, IRenderedFile } from "../core/interfaces/index.mts";
import { TemplateRegistry } from "./template-registry.mts";
import type { TemplateLayer } from "./template-registry.mts";
import { writeCode } from "../io/file-protocol.mts";
import { join } from "node:path";

export interface GenerationEngineConfig {
  projectName: string;
  outputDir: string;
  integrationPort: number;
}

export interface FeatureGenerationResult {
  featureName: string;
  filesGenerated: string[];
  errors: string[];
  durationMs: number;
}

export interface FullGenerationResult {
  projectName: string;
  features: FeatureGenerationResult[];
  infrastructureFiles: string[];
  totalFiles: number;
  durationMs: number;
  errors: string[];
}

const LAYER_ORDER: TemplateLayer[] = [
  "interface",
  "schema",
  "repository",
  "service",
  "router",
  "swagger",
  "test",
  "integration-test",
];

export class GenerationEngine {

  private readonly registry: TemplateRegistry;
  private readonly logger: Logger;
  private readonly config: GenerationEngineConfig;

  constructor(logger: Logger, config: GenerationEngineConfig) {
    this.registry = new TemplateRegistry();
    this.logger = logger;
    this.config = config;
  }

  public async generateAll(features: IFeatureSpec[]): Promise<FullGenerationResult> {
    const startMs = performance.now();
    const errors: string[] = [];
    const featureResults: FeatureGenerationResult[] = [];

    this.logger.info(`[engine] Starting full generation for "${this.config.projectName}"`);
    this.logger.info(`[engine] Features: ${features.map((f) => f.name).join(", ")}`);

    // Step 1: Generate infrastructure
    const infraFiles = await this.generateInfrastructure(features);

    // Step 2: Generate features bottom-up
    for (const feature of features) {
      const result = await this.generateFeature(feature);
      featureResults.push(result);
      if (result.errors.length > 0) {
        errors.push(...result.errors);
      }
    }

    const totalFiles = infraFiles.length + featureResults.reduce(
      (sum, r) => sum + r.filesGenerated.length, 0,
    );
    const durationMs = Math.round(performance.now() - startMs);

    this.logger.info(`[engine] Generation complete: ${totalFiles} files in ${durationMs}ms`);

    return {
      projectName: this.config.projectName,
      features: featureResults,
      infrastructureFiles: infraFiles,
      totalFiles,
      durationMs,
      errors,
    };
  }

  public async generateFeature(feature: IFeatureSpec): Promise<FeatureGenerationResult> {
    const startMs = performance.now();
    const filesGenerated: string[] = [];
    const errors: string[] = [];

    this.logger.info(`[engine] Generating feature: ${feature.name}`);

    for (const layer of LAYER_ORDER) {
      try {
        const files = this.registry.renderFeatureLayer(
          layer,
          feature,
          this.config.integrationPort,
        );
        const written = await this.writeFiles(files);
        filesGenerated.push(...written);
        this.logger.info(`[engine]   ${layer}: ${files.length} files`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${feature.name}/${layer}: ${msg}`);
        this.logger.error(`[engine]   ${layer} failed: ${msg}`);
      }
    }

    const durationMs = Math.round(performance.now() - startMs);
    this.logger.info(
      `[engine] Feature "${feature.name}" complete: ${filesGenerated.length} files, ${durationMs}ms`,
    );

    return {
      featureName: feature.name,
      filesGenerated,
      errors,
      durationMs,
    };
  }

  public async generateInfrastructure(features: IFeatureSpec[]): Promise<string[]> {
    this.logger.info("[engine] Generating infrastructure files");
    const files = this.registry.renderInfrastructure(this.config.projectName, features);
    const written = await this.writeFiles(files);
    this.logger.info(`[engine] Infrastructure: ${written.length} files`);
    return written;
  }

  private async writeFiles(files: IRenderedFile[]): Promise<string[]> {
    const written: string[] = [];

    for (const file of files) {
      const fullPath = join(this.config.outputDir, file.path);
      const result = await writeCode(fullPath, file.content);
      if (result.ok) {
        written.push(file.path);
      } else {
        this.logger.error(`[engine] Failed to write ${file.path}: ${result.error.message}`);
      }
    }

    return written;
  }
}
