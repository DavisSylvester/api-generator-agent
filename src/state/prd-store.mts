import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "winston";

/**
 * Status of a single checkbox item in the PRD.
 */
export interface PrdCheckboxItem {
  line: number;
  text: string;
  featureName: string;
  checked: boolean;
}

/**
 * Parsed state of a PRD document with checkbox tracking.
 */
export interface PrdState {
  filePath: string;
  content: string;
  items: PrdCheckboxItem[];
  checkedCount: number;
  totalCount: number;
}

/**
 * Reads a PRD markdown file, updates checkboxes as features complete
 * (marks `- [ ]` as `- [x]`), writes the updated PRD back to disk.
 */
export class PrdStore {

  private readonly logger: Logger;
  private state: PrdState | undefined;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Load and parse a PRD file from disk.
   */
  public async load(filePath: string): Promise<PrdState> {
    this.logger.info(`[prd-store] Loading PRD from ${filePath}`);

    const content = await readFile(filePath, "utf-8");
    const items = this.parseCheckboxes(content);
    const checkedCount = items.filter((i) => i.checked).length;

    this.state = {
      filePath,
      content,
      items,
      checkedCount,
      totalCount: items.length,
    };

    this.logger.info(
      `[prd-store] Loaded ${items.length} checkbox items (${checkedCount} checked)`,
    );

    return this.state;
  }

  /**
   * Create a new PRD file from content and save it.
   */
  public async create(
    filePath: string,
    content: string,
  ): Promise<PrdState> {
    this.logger.info(`[prd-store] Creating PRD at ${filePath}`);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");

    return this.load(filePath);
  }

  /**
   * Mark a feature as complete in the PRD (check its checkbox).
   * Matches feature names case-insensitively.
   */
  public async markFeatureComplete(
    featureName: string,
  ): Promise<boolean> {
    if (!this.state) {
      this.logger.warn("[prd-store] No PRD loaded — cannot mark feature");
      return false;
    }

    const item = this.findItem(featureName);
    if (!item) {
      this.logger.warn(
        `[prd-store] Feature "${featureName}" not found in PRD`,
      );
      return false;
    }

    if (item.checked) {
      this.logger.info(
        `[prd-store] Feature "${featureName}" already checked`,
      );
      return true;
    }

    const updatedContent = this.checkItem(
      this.state.content,
      item,
    );

    this.state.content = updatedContent;
    item.checked = true;
    this.state.checkedCount++;

    await this.persist();

    this.logger.info(
      `[prd-store] Marked "${featureName}" complete (${this.state.checkedCount}/${this.state.totalCount})`,
    );

    return true;
  }

  /**
   * Mark a feature as incomplete (uncheck its checkbox).
   */
  public async markFeatureIncomplete(
    featureName: string,
  ): Promise<boolean> {
    if (!this.state) {
      this.logger.warn("[prd-store] No PRD loaded — cannot unmark feature");
      return false;
    }

    const item = this.findItem(featureName);
    if (!item) {
      this.logger.warn(
        `[prd-store] Feature "${featureName}" not found in PRD`,
      );
      return false;
    }

    if (!item.checked) {
      this.logger.info(
        `[prd-store] Feature "${featureName}" already unchecked`,
      );
      return true;
    }

    const updatedContent = this.uncheckItem(
      this.state.content,
      item,
    );

    this.state.content = updatedContent;
    item.checked = false;
    this.state.checkedCount--;

    await this.persist();

    this.logger.info(
      `[prd-store] Marked "${featureName}" incomplete (${this.state.checkedCount}/${this.state.totalCount})`,
    );

    return true;
  }

  /**
   * Get the names of all pending (unchecked) features.
   */
  public getPendingFeatures(): string[] {
    if (!this.state) return [];
    return this.state.items
      .filter((i) => !i.checked)
      .map((i) => i.featureName);
  }

  /**
   * Get the names of all completed (checked) features.
   */
  public getCompletedFeatures(): string[] {
    if (!this.state) return [];
    return this.state.items
      .filter((i) => i.checked)
      .map((i) => i.featureName);
  }

  /**
   * Get the current progress as a fraction.
   */
  public getProgress(): { checked: number; total: number } {
    if (!this.state) return { checked: 0, total: 0 };
    return {
      checked: this.state.checkedCount,
      total: this.state.totalCount,
    };
  }

  /**
   * Get the current PRD content.
   */
  public getContent(): string {
    return this.state?.content ?? "";
  }

  /**
   * Get the current file path.
   */
  public getFilePath(): string {
    return this.state?.filePath ?? "";
  }

  private parseCheckboxes(content: string): PrdCheckboxItem[] {
    const lines = content.split("\n");
    const items: PrdCheckboxItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const match = line.match(
        /^(\s*)-\s*\[([x ])\]\s*(?:Feature:\s*)?(.+?)(?:\s*[-:—]\s*(.+))?$/i,
      );

      if (match) {
        const checked = match[2] === "x";
        const featureName = (match[3] ?? "").trim();

        items.push({
          line: i,
          text: line,
          featureName,
          checked,
        });
      }
    }

    return items;
  }

  private findItem(featureName: string): PrdCheckboxItem | undefined {
    if (!this.state) return undefined;

    const lowerName = featureName.toLowerCase();
    return this.state.items.find(
      (i) => i.featureName.toLowerCase() === lowerName,
    );
  }

  private checkItem(
    content: string,
    item: PrdCheckboxItem,
  ): string {
    const lines = content.split("\n");
    const line = lines[item.line];
    if (line) {
      lines[item.line] = line.replace("- [ ]", "- [x]");
    }
    return lines.join("\n");
  }

  private uncheckItem(
    content: string,
    item: PrdCheckboxItem,
  ): string {
    const lines = content.split("\n");
    const line = lines[item.line];
    if (line) {
      lines[item.line] = line.replace("- [x]", "- [ ]");
    }
    return lines.join("\n");
  }

  private async persist(): Promise<void> {
    if (!this.state) return;
    await writeFile(this.state.filePath, this.state.content, "utf-8");
  }
}
