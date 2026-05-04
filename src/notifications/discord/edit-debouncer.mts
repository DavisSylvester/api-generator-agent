import type { DiscordMessagePayload } from './interfaces/i-discord-transport.mjs';

export type EditFn = (threadId: string, messageId: string, payload: DiscordMessagePayload) => Promise<void>;

interface PendingEdit {
  threadId: string;
  messageId: string;
  latestPayload: DiscordMessagePayload;
  timer: ReturnType<typeof setTimeout> | undefined;
  inFlight: Promise<void> | undefined;
}

// Per-message debouncer — coalesces rapid card mutations into one PATCH.
//
// When state changes, callers fire `queue(messageId, payload)`. We hold the
// payload for `windowMs` ms; any subsequent `queue()` within the window
// replaces the payload (we always send the LATEST state, never intermediate
// snapshots). When the window expires, we flush.
//
// If a flush is already in flight when the window expires, the new payload
// is held back until the in-flight flush resolves, then sent. This preserves
// final-state-correctness: the very last queued payload always lands.
export class EditDebouncer {

  private readonly editFn: EditFn;
  private readonly windowMs: number;
  private readonly pending = new Map<string, PendingEdit>();

  constructor(editFn: EditFn, windowMs: number = 250) {
    this.editFn = editFn;
    this.windowMs = windowMs;
  }

  public queue(threadId: string, messageId: string, payload: DiscordMessagePayload): void {
    const existing = this.pending.get(messageId);
    if (existing !== undefined) {
      existing.latestPayload = payload;
      existing.threadId = threadId;
      if (existing.timer !== undefined) {
        // Reset window — collapse multiple updates within the window.
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => this.flush(messageId), this.windowMs);
      }
      return;
    }

    const entry: PendingEdit = {
      threadId,
      messageId,
      latestPayload: payload,
      timer: undefined,
      inFlight: undefined,
    };
    entry.timer = setTimeout(() => this.flush(messageId), this.windowMs);
    this.pending.set(messageId, entry);
  }

  public async flushAll(): Promise<void> {
    const ids = [...this.pending.keys()];
    await Promise.all(ids.map((id) => this.flush(id)));
  }

  private async flush(messageId: string): Promise<void> {
    const entry = this.pending.get(messageId);
    if (entry === undefined) return;

    if (entry.inFlight !== undefined) {
      // A flush is already running — let it complete, then fire again with
      // whatever the latest payload is now. Caller's queue() may have updated
      // it while the previous flush was running.
      await entry.inFlight;
      // Re-read in case the entry was evicted.
      const refreshed = this.pending.get(messageId);
      if (refreshed === undefined) return;
      entry.latestPayload = refreshed.latestPayload;
    }

    entry.timer = undefined;
    const payload = entry.latestPayload;

    entry.inFlight = (async (): Promise<void> => {
      try {
        await this.editFn(entry.threadId, entry.messageId, payload);
      } catch {
        // Errors are swallowed by the transport already; if it threw past that
        // it's not catastrophic — observability degrades, pipeline continues.
      }
    })();

    await entry.inFlight;
    entry.inFlight = undefined;

    // If no further updates were queued, clean up.
    if (entry.timer === undefined && this.pending.get(messageId) === entry) {
      this.pending.delete(messageId);
    }
  }
}
