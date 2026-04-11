import type { Collection, Db } from "mongodb";
import type { Logger } from "winston";
import type { ITraceEntry } from "../core/interfaces/index.mts";

const COLLECTION_NAME = "generation_traces";

export class TraceWriterMongo {

  private readonly collection: Collection<ITraceEntry>;
  private readonly logger: Logger;

  constructor(db: Db, logger: Logger) {
    this.collection = db.collection<ITraceEntry>(COLLECTION_NAME);
    this.logger = logger;
  }

  public async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ sessionId: 1, stepName: 1 }),
      this.collection.createIndex({ traceId: 1 }, { unique: true }),
      this.collection.createIndex({ featureName: 1 }),
      this.collection.createIndex({ startedAt: -1 }),
      this.collection.createIndex({ status: 1 }),
      this.collection.createIndex({ sessionId: 1, featureName: 1 }),
    ]);
    this.logger.info("[trace-mongo] Indexes ensured");
  }

  public async writeEntry(entry: ITraceEntry): Promise<void> {
    try {
      const document = toMongoDocument(entry);
      await this.collection.insertOne(document as ITraceEntry & { _id?: unknown });
      this.logger.info(`[trace-mongo] Wrote trace: ${entry.traceId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[trace-mongo] Failed to write trace: ${msg}`);
    }
  }

  public async writeEntries(entries: readonly ITraceEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    try {
      const documents = entries.map(toMongoDocument);
      await this.collection.insertMany(
        documents as unknown as Array<ITraceEntry & { _id?: unknown }>,
      );
      this.logger.info(`[trace-mongo] Wrote ${entries.length} trace entries`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[trace-mongo] Failed to write traces: ${msg}`);
    }
  }

  public async findBySession(sessionId: string): Promise<ITraceEntry[]> {
    return this.collection.find({ sessionId }).sort({ startedAt: 1 }).toArray();
  }

  public async findByFeature(featureName: string): Promise<ITraceEntry[]> {
    return this.collection.find({ featureName }).sort({ startedAt: 1 }).toArray();
  }

  public async findBySessionAndFeature(
    sessionId: string,
    featureName: string,
  ): Promise<ITraceEntry[]> {
    return this.collection
      .find({ sessionId, featureName })
      .sort({ startedAt: 1 })
      .toArray();
  }

  public async findFailed(sessionId?: string): Promise<ITraceEntry[]> {
    const filter: Record<string, unknown> = { status: "failed" };
    if (sessionId) {
      filter.sessionId = sessionId;
    }
    return this.collection.find(filter).sort({ startedAt: -1 }).toArray();
  }

  public async getSessionStats(sessionId: string): Promise<SessionStats> {
    const entries = await this.findBySession(sessionId);

    return {
      sessionId,
      totalEntries: entries.length,
      successCount: entries.filter((e) => e.status === "success").length,
      failedCount: entries.filter((e) => e.status === "failed").length,
      skippedCount: entries.filter((e) => e.status === "skipped").length,
      totalDurationMs: entries.reduce((s, e) => s + e.durationMs, 0),
      totalTokens: entries.reduce((s, e) => s + e.tokenConsumption.total, 0),
      totalFilesGenerated: entries.reduce(
        (s, e) => s + e.result.filesGenerated.length, 0,
      ),
      totalErrors: entries.reduce((s, e) => s + e.errors.length, 0),
    };
  }
}

export interface SessionStats {
  sessionId: string;
  totalEntries: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalDurationMs: number;
  totalTokens: number;
  totalFilesGenerated: number;
  totalErrors: number;
}

function toMongoDocument(entry: ITraceEntry): ITraceEntry {
  return {
    traceId: entry.traceId,
    sessionId: entry.sessionId,
    featureName: entry.featureName,
    stepName: entry.stepName,
    iteration: entry.iteration,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    durationMs: entry.durationMs,
    status: entry.status,
    toolUses: [...entry.toolUses],
    tokenConsumption: { ...entry.tokenConsumption },
    result: {
      filesGenerated: [...entry.result.filesGenerated],
      filesModified: [...entry.result.filesModified],
      linesOfCode: entry.result.linesOfCode,
      summary: entry.result.summary,
    },
    errors: entry.errors.map((e) => ({ ...e })),
    documentation: entry.documentation,
  };
}
