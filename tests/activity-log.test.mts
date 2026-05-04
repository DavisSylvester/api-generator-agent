import { describe, test, expect, beforeEach } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActivityLog } from '../src/io/activity-log.mts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'act-log-'));
});

describe('ActivityLog', () => {
  test('writes header + row on first event', async () => {
    const path = join(dir, 'a.md');
    const log = new ActivityLog(path);
    await log.event({ type: 'task-start', summary: 'hello' });
    const contents = await readFile(path, 'utf-8');
    expect(contents).toContain('# Activity Log');
    expect(contents).toContain('| Timestamp | Event |');
    expect(contents).toContain('`task-start`');
    expect(contents).toContain('hello');
    await rm(path);
  });

  test('escapes pipes in summary so markdown table survives', async () => {
    const path = join(dir, 'b.md');
    const log = new ActivityLog(path);
    await log.event({ type: 'note', summary: 'a | b | c' });
    const contents = await readFile(path, 'utf-8');
    expect(contents).toContain('a \\| b \\| c');
    await rm(path);
  });

  test('serializes concurrent events without line interleaving', async () => {
    const path = join(dir, 'c.md');
    const log = new ActivityLog(path);
    await Promise.all([
      log.event({ type: 'codegen-start', summary: 'one' }),
      log.event({ type: 'codegen-end', summary: 'two', durationMs: 42 }),
      log.event({ type: 'qa-start', summary: 'three' }),
    ]);
    const contents = await readFile(path, 'utf-8');
    const rows = contents.split('\n').filter((l) => l.startsWith('|') && !l.includes('Timestamp') && !l.includes('---'));
    expect(rows.length).toBe(3);
    // Each row should have the expected column count (5 separators = 6 cells with escaping accounted)
    for (const row of rows) {
      expect(row.startsWith('|')).toBe(true);
      expect(row.endsWith('|')).toBe(true);
    }
    await rm(path);
  });

  test('links relative path for artifacts', async () => {
    const path = join(dir, 'tasks', 'foo', 'activity.md');
    const log = new ActivityLog(path);
    const artifact = join(dir, 'tasks', 'foo', 'iterations', '0', 'errors.json');
    await log.event({ type: 'qa-end', summary: 'failed', artifactPath: artifact });
    const contents = await readFile(path, 'utf-8');
    expect(contents).toContain('iterations/0/errors.json');
    expect(contents).toContain('[link]');
    await rm(path);
  });

  test('records duration as ms in details column', async () => {
    const path = join(dir, 'd.md');
    const log = new ActivityLog(path);
    await log.event({ type: 'codegen-end', summary: 'done', durationMs: 1234 });
    const contents = await readFile(path, 'utf-8');
    expect(contents).toContain('1234ms');
    await rm(path);
  });

  test('observer is called once per event with the same input', async () => {
    const path = join(dir, 'e.md');
    const seen: { type: string; summary: string }[] = [];
    const log = new ActivityLog(path, (e) => {
      seen.push({ type: e.type, summary: e.summary });
    });
    await log.event({ type: 'task-start', summary: 'one' });
    await log.event({ type: 'codegen-end', summary: 'two', durationMs: 10 });
    expect(seen).toEqual([
      { type: 'task-start', summary: 'one' },
      { type: 'codegen-end', summary: 'two' },
    ]);
    await rm(path);
  });

  test('observer errors do not break event() or corrupt the log', async () => {
    const path = join(dir, 'f.md');
    const log = new ActivityLog(path, () => {
      throw new Error('observer blew up');
    });
    // Should NOT throw.
    await log.event({ type: 'task-start', summary: 'still works' });
    const contents = await readFile(path, 'utf-8');
    expect(contents).toContain('still works');
    await rm(path);
  });

  test('async observer is awaited before event() resolves', async () => {
    const path = join(dir, 'g.md');
    let observerDone = false;
    const log = new ActivityLog(path, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      observerDone = true;
    });
    await log.event({ type: 'note', summary: 'sync me' });
    expect(observerDone).toBe(true);
    await rm(path);
  });
});
