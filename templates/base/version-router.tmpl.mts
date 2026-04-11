export function renderVersionRouter(projectName: string, version: string): string {
  return `import { Elysia } from "elysia";

export function createVersionRouter(): Elysia {
  return new Elysia()
    .get("/version", () => ({
      name: "${projectName}",
      version: "${version}",
      timestamp: new Date().toISOString(),
    }));
}
`;
}
