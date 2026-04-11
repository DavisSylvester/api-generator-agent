export function renderHealthRouter(): string {
  return `import { Elysia } from "elysia";

export function createHealthRouter(): Elysia {
  return new Elysia()
    .get("/health", () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    }));
}
`;
}
