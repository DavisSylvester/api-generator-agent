import type { Logger } from "winston";
import type { FullGenerationResult } from "../generation/engine.mts";
import type { TraceSummary } from "../trace/trace-logger.mts";

export class ConsoleReporter {

  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public reportPlanApproval(
    projectName: string,
    featureNames: string[],
  ): void {
    this.logger.info(`=== Generation Plan: ${projectName} ===`);
    this.logger.info(`Features (${featureNames.length}):`);
    for (const name of featureNames) {
      this.logger.info(`  - ${name}`);
    }
    this.logger.info("Awaiting approval...");
  }

  public reportFeatureStart(featureName: string): void {
    this.logger.info(`--- Starting feature: ${featureName} ---`);
  }

  public reportFeatureComplete(
    featureName: string,
    filesGenerated: number,
    durationMs: number,
  ): void {
    this.logger.info(
      `--- Feature "${featureName}" complete: ${filesGenerated} files, ${durationMs}ms ---`,
    );
  }

  public reportGenerationResult(result: FullGenerationResult): void {
    this.logger.info(`=== Generation Results: ${result.projectName} ===`);
    this.logger.info(`Total files: ${result.totalFiles}`);
    this.logger.info(`Duration: ${result.durationMs}ms`);
    this.logger.info(`Infrastructure files: ${result.infrastructureFiles.length}`);
    this.logger.info(`Features:`);
    for (const feature of result.features) {
      const status = feature.errors.length > 0 ? "ERRORS" : "OK";
      this.logger.info(
        `  [${status}] ${feature.featureName}: ${feature.filesGenerated.length} files, ${feature.durationMs}ms`,
      );
    }
    if (result.errors.length > 0) {
      this.logger.warn(`Errors (${result.errors.length}):`);
      for (const error of result.errors) {
        this.logger.warn(`  - ${error}`);
      }
    }
  }

  public reportTraceSummary(summary: TraceSummary): void {
    this.logger.info(`=== Trace Summary ===`);
    this.logger.info(`Session: ${summary.sessionId}`);
    this.logger.info(`Steps: ${summary.totalSteps} (${summary.successCount} success, ${summary.failedCount} failed)`);
    this.logger.info(`Duration: ${summary.totalDurationMs}ms`);
    this.logger.info(`Tokens: ${summary.totalTokens}`);
    this.logger.info(`Files: ${summary.totalFiles}`);
  }
}
