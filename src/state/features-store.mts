import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type FeatureStatus = "pending" | "in-progress" | "complete" | "failed";

export interface IFeatureState {
  readonly id: string;
  readonly name: string;
  status: FeatureStatus;
  startedAt?: string;
  completedAt?: string;
  iteration: number;
  lastError?: string;
}

export interface IFeaturesJson {
  readonly runId: string;
  readonly createdAt: string;
  updatedAt: string;
  features: IFeatureState[];
}

export class FeaturesStore {

  private readonly filePath: string;
  private data: IFeaturesJson | undefined;

  constructor(workspaceRoot: string, runId: string) {
    this.filePath = `${workspaceRoot}/${runId}/features.json`;
  }

  public async init(runId: string, features: ReadonlyArray<{ id: string; name: string }>): Promise<void> {
    const now = new Date().toISOString();
    this.data = {
      runId,
      createdAt: now,
      updatedAt: now,
      features: features.map((f) => ({
        id: f.id,
        name: f.name,
        status: "pending",
        iteration: 0,
      })),
    };
    await this.persist();
  }

  public async markInProgress(id: string): Promise<void> {
    await this.load();
    const feature = this.findFeature(id);
    if (!feature) return;
    feature.status = "in-progress";
    feature.startedAt = new Date().toISOString();
    await this.persist();
  }

  public async markComplete(id: string, iteration: number): Promise<void> {
    await this.load();
    const feature = this.findFeature(id);
    if (!feature) return;
    feature.status = "complete";
    feature.completedAt = new Date().toISOString();
    feature.iteration = iteration;
    delete feature.lastError;
    await this.persist();
  }

  public async markFailed(id: string, iteration: number, error: string): Promise<void> {
    await this.load();
    const feature = this.findFeature(id);
    if (!feature) return;
    feature.status = "failed";
    feature.completedAt = new Date().toISOString();
    feature.iteration = iteration;
    feature.lastError = error;
    await this.persist();
  }

  public async getAll(): Promise<readonly IFeatureState[]> {
    await this.load();
    return this.data?.features ?? [];
  }

  public async getByStatus(status: FeatureStatus): Promise<readonly IFeatureState[]> {
    const all = await this.getAll();
    return all.filter((f) => f.status === status);
  }

  private findFeature(id: string): IFeatureState | undefined {
    return this.data?.features.find((f) => f.id === id);
  }

  private async load(): Promise<void> {
    if (this.data) return;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.data = JSON.parse(raw) as IFeaturesJson;
    } catch {
      // File does not exist yet — data stays undefined
    }
  }

  private async persist(): Promise<void> {
    if (!this.data) return;
    this.data.updatedAt = new Date().toISOString();
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }
}
