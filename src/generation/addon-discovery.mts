import type { Logger } from "winston";
import type { ITemplate } from "../core/interfaces/index.mts";
import {
  validateTemplateContract,
  isValidTemplate,
} from "./template-contract-validator.mts";
import type { IContractValidationResult } from "./template-contract-validator.mts";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface IDiscoveredAddon {
  template: ITemplate;
  sourcePath: string;
  validation: IContractValidationResult;
}

export interface IDiscoveryResult {
  addons: IDiscoveredAddon[];
  errors: IDiscoveryError[];
  scannedPaths: string[];
}

export interface IDiscoveryError {
  path: string;
  reason: string;
  validation?: IContractValidationResult;
}

export class AddonDiscovery {

  private readonly logger: Logger;
  private readonly addonsDir: string;

  constructor(logger: Logger, addonsDir: string) {
    this.logger = logger;
    this.addonsDir = resolve(addonsDir);
  }

  public async discover(): Promise<IDiscoveryResult> {
    const addons: IDiscoveredAddon[] = [];
    const errors: IDiscoveryError[] = [];
    const scannedPaths: string[] = [];

    if (!existsSync(this.addonsDir)) {
      this.logger.warn(
        `[addon-discovery] Addons directory does not exist: ${this.addonsDir}`,
      );
      return { addons, errors, scannedPaths };
    }

    const entries = this.listAddonDirectories();

    for (const addonDir of entries) {
      const fullPath = join(this.addonsDir, addonDir);
      scannedPaths.push(fullPath);

      const result = await this.loadAddon(fullPath, addonDir);
      if (result.addon) {
        addons.push(result.addon);
        this.logger.info(
          `[addon-discovery] Loaded addon: ${result.addon.template.name} from ${addonDir}`,
        );
      }
      if (result.error) {
        errors.push(result.error);
        this.logger.warn(
          `[addon-discovery] Rejected addon at ${addonDir}: ${result.error.reason}`,
        );
      }
    }

    this.logger.info(
      `[addon-discovery] Discovery complete: ${addons.length} addons loaded, ${errors.length} errors`,
    );

    return { addons, errors, scannedPaths };
  }

  public getAddonsDir(): string {
    return this.addonsDir;
  }

  private listAddonDirectories(): string[] {
    try {
      return readdirSync(this.addonsDir).filter((entry) => {
        const fullPath = join(this.addonsDir, entry);
        return statSync(fullPath).isDirectory();
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[addon-discovery] Failed to read addons directory: ${msg}`);
      return [];
    }
  }

  private async loadAddon(
    fullPath: string,
    dirName: string,
  ): Promise<{ addon?: IDiscoveredAddon; error?: IDiscoveryError }> {
    const indexPath = join(fullPath, "index.mts");

    if (!existsSync(indexPath)) {
      return {
        error: {
          path: fullPath,
          reason: `No index.mts found in addon directory "${dirName}"`,
        },
      };
    }

    try {
      const mod = await import(indexPath);
      const candidate = mod.template ?? mod.default;

      const validation = validateTemplateContract(candidate, indexPath);

      if (!validation.valid) {
        return {
          error: {
            path: fullPath,
            reason: `Template contract validation failed: ${validation.errors.join("; ")}`,
            validation,
          },
        };
      }

      if (!isValidTemplate(candidate)) {
        return {
          error: {
            path: fullPath,
            reason: "Template does not satisfy ITemplate type guard",
          },
        };
      }

      for (const warning of validation.warnings) {
        this.logger.warn(`[addon-discovery] ${dirName}: ${warning}`);
      }

      return {
        addon: {
          template: candidate,
          sourcePath: fullPath,
          validation,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        error: {
          path: fullPath,
          reason: `Failed to import addon module: ${msg}`,
        },
      };
    }
  }
}
