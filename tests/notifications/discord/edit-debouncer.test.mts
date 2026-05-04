import { describe, test, expect } from 'bun:test';
import { EditDebouncer } from '../../../src/notifications/discord/edit-debouncer.mts';
import type { DiscordMessagePayload } from '../../../src/notifications/discord/interfaces/i-discord-transport.mts';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('EditDebouncer', () => {

  test('coalesces rapid updates into a single flush with the latest payload', async () => {
    const calls: { messageId: string; payload: DiscordMessagePayload }[] = [];
    const debouncer = new EditDebouncer(
      async (_thread, messageId, payload) => {
        calls.push({ messageId, payload });
      },
      30,
    );

    debouncer.queue('thread', 'msg', { content: 'one' });
    debouncer.queue('thread', 'msg', { content: 'two' });
    debouncer.queue('thread', 'msg', { content: 'three' });

    await sleep(80);
    expect(calls.length).toBe(1);
    expect(calls[0]?.payload.content).toBe('three');
  });

  test('different message ids flush independently', async () => {
    const calls: { messageId: string; payload: DiscordMessagePayload }[] = [];
    const debouncer = new EditDebouncer(
      async (_thread, messageId, payload) => {
        calls.push({ messageId, payload });
      },
      20,
    );

    debouncer.queue('t', 'a', { content: 'A' });
    debouncer.queue('t', 'b', { content: 'B' });

    await sleep(60);
    expect(calls.length).toBe(2);
    const ids = new Set(calls.map((c) => c.messageId));
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  test('flushAll drains pending edits immediately', async () => {
    const calls: string[] = [];
    const debouncer = new EditDebouncer(
      async (_thread, messageId) => {
        calls.push(messageId);
      },
      1000, // long window
    );

    debouncer.queue('t', 'a', { content: 'A' });
    debouncer.queue('t', 'b', { content: 'B' });

    // Window hasn't expired — flushAll should still send.
    await debouncer.flushAll();
    expect(calls.length).toBe(2);
  });

  test('errors in editFn do not throw to the caller', async () => {
    const debouncer = new EditDebouncer(
      async () => { throw new Error('discord exploded'); },
      20,
    );

    debouncer.queue('t', 'm', { content: 'x' });
    await sleep(60);
    // No throw — test passes by reaching this line.
    expect(true).toBe(true);
  });
});
