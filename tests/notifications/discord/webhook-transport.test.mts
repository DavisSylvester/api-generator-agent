import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import winston from 'winston';
import { WebhookTransport } from '../../../src/notifications/discord/webhook-transport.mts';

interface FakeRequest {
  url: string;
  method: string;
  body: unknown;
}

let server: ReturnType<typeof Bun.serve> | undefined;
let received: FakeRequest[] = [];
let nextResponse: { status: number; body: object } = { status: 200, body: { id: 'msg-1', channel_id: 'thread-1', guild_id: 'guild-1' } };

const silentLogger = winston.createLogger({
  silent: true,
  transports: [new winston.transports.Console({ silent: true })],
});

beforeEach(() => {
  received = [];
  nextResponse = { status: 200, body: { id: 'msg-1', channel_id: 'thread-1', guild_id: 'guild-1' } };
  server = Bun.serve({
    port: 0,
    async fetch(req: Request) {
      const body = req.method === 'POST' || req.method === 'PATCH'
        ? await req.json().catch(() => undefined)
        : undefined;
      received.push({ url: req.url, method: req.method, body });
      return new Response(JSON.stringify(nextResponse.body), {
        status: nextResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
});

afterEach(() => {
  server?.stop(true);
  server = undefined;
});

const baseUrl = (): string => `http://localhost:${server!.port}/api/webhooks/123/test`;

describe('WebhookTransport', () => {

  test('startThread posts with thread_name and returns channel_id as threadId', async () => {
    const transport = new WebhookTransport({
      pipelineWebhookUrl: baseUrl(),
      alertWebhookUrl: undefined,
      logger: silentLogger,
    });

    const result = await transport.startThread('abc-123', 'starting');
    expect(result.threadId).toBe('thread-1');
    expect(received.length).toBe(1);
    expect(received[0]?.method).toBe('POST');
    const body = received[0]?.body as { thread_name?: string; content?: string };
    expect(body.thread_name).toBe('run-abc-123');
    expect(body.content).toBe('starting');
  });

  test('postCard posts to thread_id and returns message id', async () => {
    nextResponse = { status: 200, body: { id: 'msg-99', channel_id: 'thread-1' } };
    const transport = new WebhookTransport({
      pipelineWebhookUrl: baseUrl(),
      alertWebhookUrl: undefined,
      logger: silentLogger,
    });

    const result = await transport.postCard('thread-1', { content: 'hello' });
    expect(result.messageId).toBe('msg-99');
    expect(received[0]?.url).toContain('thread_id=thread-1');
    expect(received[0]?.url).toContain('wait=true');
  });

  test('editCard issues PATCH against the message id', async () => {
    const transport = new WebhookTransport({
      pipelineWebhookUrl: baseUrl(),
      alertWebhookUrl: undefined,
      logger: silentLogger,
    });

    await transport.editCard('thread-1', 'msg-99', { content: 'updated' });
    expect(received[0]?.method).toBe('PATCH');
    expect(received[0]?.url).toContain('/messages/msg-99');
  });

  test('marks transport unhealthy on 401 and stops sending', async () => {
    nextResponse = { status: 401, body: { error: 'unauthorized' } };
    const transport = new WebhookTransport({
      pipelineWebhookUrl: baseUrl(),
      alertWebhookUrl: undefined,
      logger: silentLogger,
    });

    // First call hits 401 — transport disables itself.
    await expect(transport.startThread('abc-123', 'x')).rejects.toThrow();

    // Subsequent calls should not even hit the server.
    received = [];
    await transport.postCard('thread-1', { content: 'x' }).catch(() => undefined);
    expect(received.length).toBe(0);
  });

  test('alert routes to alertWebhookUrl when provided', async () => {
    const transport = new WebhookTransport({
      pipelineWebhookUrl: 'http://nope.invalid/webhook',
      alertWebhookUrl: baseUrl(),
      logger: silentLogger,
    });

    await transport.postAlert({
      mention: '<@&123>',
      embed: { title: 'fail', description: 'bad', color: 0xE74C3C },
      threadDeepLink: 'https://discord.com/channels/g/t',
    });

    expect(received.length).toBe(1);
    const body = received[0]?.body as { content?: string; embeds?: unknown[] };
    expect(body.content).toBe('<@&123>');
    expect(body.embeds?.length).toBe(1);
  });
});
