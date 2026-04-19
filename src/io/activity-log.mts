import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { dirname, relative } from 'node:path';

// ---------------------------------------------------------------------------
// ActivityLog — append-only markdown event log per task.
//
// Each task gets its own activity.md inside `<run-root>/.docs/tasks/<taskId>/`.
// Every event (iteration start, codegen start/end, eslint, qa, iteration end,
// task end) is one row in a markdown table. When an event has an artifact
// (codegen-result.json, errors.json, etc.) the row includes a relative link
// so a reader tailing activity.md can jump straight to the data.
//
// Design choices:
//
// 1. Append-only. Never rewrites history. Safe to tail while the pipeline
//    writes.
// 2. Table header written idempotently on first event — we stat the file
//    and only write the header if size=0.
// 3. Writes are serialized via an in-flight promise chain so concurrent
//    callers don't interleave lines. Two tasks writing to DIFFERENT files
//    obviously don't contend; two events on the SAME task are queued.
// 4. No winston dep. The pipeline is noisy enough; this file is a pure
//    artifact, not a log sink.
// ---------------------------------------------------------------------------

export type ActivityEventType =
  | 'task-start'
  | 'iteration-start'
  | 'codegen-start'
  | 'codegen-end'
  | 'eslint-start'
  | 'eslint-end'
  | 'qa-start'
  | 'qa-end'
  | 'iteration-end'
  | 'task-end'
  | 'note';

export interface ActivityEventInput {
  readonly type: ActivityEventType;
  readonly summary: string;
  readonly meta?: Record<string, string | number | boolean | undefined>;
  readonly artifactPath?: string;
  readonly durationMs?: number;
}

const TABLE_HEADER =
  `| Timestamp | Event | Summary | Details | Artifact |\n` +
  `|---|---|---|---|---|\n`;

const escapePipe = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const formatMeta = (meta: Record<string, string | number | boolean | undefined> | undefined, durationMs: number | undefined): string => {
  const parts: string[] = [];
  if (durationMs !== undefined) {
    parts.push(`\`${String(Math.round(durationMs))}ms\``);
  }
  if (meta !== undefined) {
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined) continue;
      parts.push(`\`${k}=${String(v)}\``);
    }
  }
  return parts.length === 0 ? '' : parts.join(' ');
};

export class ActivityLog {

  private readonly filePath: string;
  private headerWritten: boolean = false;
  private chain: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async event(input: ActivityEventInput): Promise<void> {
    this.chain = this.chain.then(() => this.writeRow(input));
    await this.chain;
  }

  private async writeRow(input: ActivityEventInput): Promise<void> {
    if (!this.headerWritten) {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, `# Activity Log\n\n${TABLE_HEADER}`, { encoding: 'utf-8', flag: 'wx' }).catch(async (e: NodeJS.ErrnoException) => {
        // EEXIST: another writer beat us. Assume the header is there.
        if (e.code !== 'EEXIST') throw e;
      });
      this.headerWritten = true;
    }

    const ts = new Date().toISOString();
    const details = formatMeta(input.meta, input.durationMs);
    const artifact = input.artifactPath !== undefined
      ? `[link](${escapePipe(relative(dirname(this.filePath), input.artifactPath).replace(/\\/g, '/'))})`
      : '';

    const row = `| \`${ts}\` | \`${input.type}\` | ${escapePipe(input.summary)} | ${details} | ${artifact} |\n`;
    await appendFile(this.filePath, row, { encoding: 'utf-8' });
  }

  public get path(): string {
    return this.filePath;
  }
}
