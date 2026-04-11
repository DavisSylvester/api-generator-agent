export function renderTracePlugin(): string {
  return `import { Elysia } from "elysia";
import { ulid } from "ulid";
import type { Logger } from "winston";

export function tracePlugin(logger: Logger): Elysia {
  return new Elysia({ name: "trace-plugin" })
    .onRequest(({ request, store }) => {
      const traceId = ulid();
      (store as Record<string, unknown>).traceId = traceId;
      logger.info(\`[\${traceId}] \${request.method} \${new URL(request.url).pathname}\`);
    })
    .onAfterHandle(({ request, store, response }) => {
      const traceId = (store as Record<string, unknown>).traceId as string;
      logger.info(\`[\${traceId}] Response sent for \${request.method} \${new URL(request.url).pathname}\`);
    })
    .onError(({ request, store, error }) => {
      const traceId = (store as Record<string, unknown>).traceId as string;
      logger.error(\`[\${traceId}] Error: \${error.message} — \${request.method} \${new URL(request.url).pathname}\`);
    });
}
`;
}
