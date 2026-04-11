export function renderPackageJson(projectName: string): string {
  const scopedName = `@${toKebabCase(projectName)}/api`;
  const kebab = toKebabCase(projectName);

  return JSON.stringify({
    name: scopedName,
    version: "0.1.0",
    type: "module",
    private: true,
    scripts: {
      dev: "bun run --watch src/index.mts",
      start: "bun run src/index.mts",
      test: "bun test",
      lint: "eslint src/ --fix",
    },
    dependencies: {
      "@elysiajs/cors": "^1.3.0",
      "@elysiajs/openapi": "^1.2.0",
      "elysia": "^1.3.0",
      "mongodb": "^6.15.0",
      "ulid": "^2.3.0",
      "@sinclair/typebox": "^0.34.0",
      "winston": "^3.19.0",
    },
    devDependencies: {
      "@types/bun": "latest",
      "typescript": "^5.8.0",
    },
  }, null, 2) + "\n";
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
