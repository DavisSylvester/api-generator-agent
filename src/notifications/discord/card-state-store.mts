import { writeFile, readFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import type { ICardState, IPersistedCards } from './interfaces/i-card-state.mjs';
import type { DiscordTransportKind } from './interfaces/i-discord-config.mjs';
import { PersistedCardsSchema } from './schemas/card-state-schema.mts';

// Atomic, write-after-mutate persistence for Discord card state.
//
// Lives at `<runRoot>/discord-cards.json`. On --resume, the DiscordChannel
// loads this file and re-attaches to the same threadId + per-task messageIds,
// so card edits continue against the existing thread instead of starting over.
export class CardStateStore {

  private readonly path: string;
  private readonly transport: DiscordTransportKind;
  private runId: string | undefined;
  private threadId: string | undefined;
  private readonly cards = new Map<string, ICardState>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(path: string, transport: DiscordTransportKind) {
    this.path = path;
    this.transport = transport;
  }

  public init(runId: string, threadId: string): void {
    this.runId = runId;
    this.threadId = threadId;
  }

  public set(taskId: string, state: ICardState): void {
    this.cards.set(taskId, state);
    this.persistAsync();
  }

  public get(taskId: string): ICardState | undefined {
    return this.cards.get(taskId);
  }

  public update(taskId: string, patch: Partial<ICardState>): ICardState | undefined {
    const current = this.cards.get(taskId);
    if (current === undefined) return undefined;
    const next: ICardState = { ...current, ...patch };
    this.cards.set(taskId, next);
    this.persistAsync();
    return next;
  }

  public has(taskId: string): boolean {
    return this.cards.has(taskId);
  }

  public values(): readonly ICardState[] {
    return [...this.cards.values()];
  }

  public getThreadId(): string | undefined {
    return this.threadId;
  }

  public async load(): Promise<IPersistedCards | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf-8');
    } catch {
      return undefined;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Value.Check(PersistedCardsSchema, parsed)) {
        return undefined;
      }
      const persisted = parsed as IPersistedCards;
      this.runId = persisted.runId;
      this.threadId = persisted.threadId;
      for (const [taskId, card] of Object.entries(persisted.tasks)) {
        this.cards.set(taskId, card);
      }
      return persisted;
    } catch {
      return undefined;
    }
  }

  public async flush(): Promise<void> {
    await this.writeChain;
  }

  private persistAsync(): void {
    this.writeChain = this.writeChain.then(() => this.persist()).catch(() => undefined);
  }

  private async persist(): Promise<void> {
    if (this.runId === undefined || this.threadId === undefined) return;

    const data: IPersistedCards = {
      runId: this.runId,
      threadId: this.threadId,
      transport: this.transport,
      tasks: Object.fromEntries(this.cards),
    };

    await mkdir(dirname(this.path), { recursive: true });
    const tmpPath = `${this.path}.tmp`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await rename(tmpPath, this.path);
  }
}
