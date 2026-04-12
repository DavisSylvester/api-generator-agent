import { readdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Logger } from 'winston';
import type { Workspace } from '../io/workspace.mts';
import type { TaskGraph } from '../types/task.mts';

export async function scaffoldProject(
  workspace: Workspace,
  graph: TaskGraph,
  prdText: string,
  logger: Logger,
): Promise<void> {
  const outputDir = workspace.outputDir();

  // 1. Scan all source files for dependencies and env vars
  const sourceFiles = await collectSourceFiles(join(outputDir, `src`));
  const { dependencies, envVars } = analyzeSource(sourceFiles);
  logger.info(`[scaffold] Found ${dependencies.size} dependencies, ${envVars.size} env vars`);

  // 2. Extract project name from PRD (first heading)
  const projectName = extractProjectName(prdText);

  // 3. Write package.json
  await writeFile(join(outputDir, `package.json`), buildPackageJson(projectName, dependencies), `utf-8`);
  logger.info(`[scaffold] Wrote package.json`);

  // 4. Write tsconfig.json
  await writeFile(join(outputDir, `tsconfig.json`), TSCONFIG, `utf-8`);
  logger.info(`[scaffold] Wrote tsconfig.json`);

  // 5. Write .env.example
  await writeFile(join(outputDir, `.env.example`), buildEnvExample(envVars), `utf-8`);
  logger.info(`[scaffold] Wrote .env.example`);

  // 6. Write .gitignore
  await writeFile(join(outputDir, `.gitignore`), GITIGNORE, `utf-8`);
  logger.info(`[scaffold] Wrote .gitignore`);

  // 7. Copy assembled index.mts over the output one if it exists
  const assembledPath = join(workspace.docsDir(), `assembled-index.mts`);
  const outputIndexPath = join(outputDir, `src`, `index.mts`);
  try {
    await access(assembledPath);
    await copyFile(assembledPath, outputIndexPath);
    logger.info(`[scaffold] Copied assembled index.mts to output`);
  } catch {
    logger.info(`[scaffold] No assembled index.mts — keeping original`);
  }

  // 8. Write README.md
  await writeFile(join(outputDir, `README.md`), buildReadme(projectName, graph, envVars), `utf-8`);
  logger.info(`[scaffold] Wrote README.md`);

  logger.info(`[scaffold] Project scaffolding complete — ready to run with: bun install && bun run dev`);
}

// --- Helpers ---

async function collectSourceFiles(dir: string, prefix = ``): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    try {
      const content = await readFile(fullPath, `utf-8`);
      if (entry.endsWith(`.mts`) || entry.endsWith(`.ts`)) {
        files.set(relPath, content);
      }
    } catch {
      // Directory — recurse
      const sub = await collectSourceFiles(fullPath, relPath);
      for (const [k, v] of sub) files.set(k, v);
    }
  }
  return files;
}

interface SourceAnalysis {
  readonly dependencies: Set<string>;
  readonly envVars: Set<string>;
}

function analyzeSource(files: Map<string, string>): SourceAnalysis {
  const dependencies = new Set<string>();
  const envVars = new Set<string>();

  // Baseline deps always needed
  dependencies.add(`elysia`);
  dependencies.add(`mongodb`);
  dependencies.add(`@sinclair/typebox`);
  dependencies.add(`jose`);

  const importRe = /from\s+['"]([^./][^'"]*)['"]/g;
  const envRe = /process\.env\.(\w+)/g;

  for (const [, content] of files) {
    // Extract third-party imports
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(content)) !== null) {
      const pkg = match[1]!;
      // Resolve scoped packages (@foo/bar) vs bare (foo)
      const name = pkg.startsWith(`@`) ? pkg.split(`/`).slice(0, 2).join(`/`) : pkg.split(`/`)[0]!;
      // Skip bun built-ins
      if (!name.startsWith(`bun:`) && !name.startsWith(`node:`)) {
        dependencies.add(name);
      }
    }

    // Extract env vars
    while ((match = envRe.exec(content)) !== null) {
      envVars.add(match[1]!);
    }
  }

  return { dependencies, envVars };
}

function extractProjectName(prdText: string): string {
  const headingMatch = prdText.match(/^#\s+(.+?)(?:\s*[-—]|$)/m);
  if (headingMatch?.[1]) {
    return headingMatch[1]
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, `-`)
      .replace(/^-|-$/g, ``);
  }
  return `generated-api`;
}

function buildPackageJson(name: string, deps: Set<string>): string {
  const sorted = [...deps].sort();
  const dependencies: Record<string, string> = {};
  for (const dep of sorted) {
    dependencies[dep] = `latest`;
  }

  const pkg = {
    name,
    version: `0.1.0`,
    private: true,
    type: `module`,
    scripts: {
      start: `bun run src/index.mts`,
      dev: `bun --watch src/index.mts`,
    },
    dependencies,
    devDependencies: {
      [`@types/bun`]: `latest`,
    },
  };

  return JSON.stringify(pkg, null, 2) + `\n`;
}

const TSCONFIG = `{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  }
}
`;

function buildEnvExample(envVars: Set<string>): string {
  const lines = [`# Environment variables for this API`, `# Copy to .env and fill in values`, ``];

  // Common vars with sensible defaults/descriptions
  const descriptions: Record<string, string> = {
    PORT: `3000`,
    MONGODB_URI: `mongodb://localhost:27017/mydb`,
    JWT_SECRET: `change-me-to-a-secure-random-string`,
    NODE_ENV: `development`,
    AUTH0_DOMAIN: `your-tenant.auth0.com`,
    AUTH0_AUDIENCE: `https://your-api`,
    GOOGLE_PLACES_API_KEY: `your-google-places-key`,
  };

  const sorted = [...envVars].sort();
  for (const v of sorted) {
    const val = descriptions[v] ?? ``;
    lines.push(`${v}=${val}`);
  }

  return lines.join(`\n`) + `\n`;
}

const GITIGNORE = `node_modules/
.env
*.log
bun.lockb
dist/
.DS_Store
`;

function buildReadme(name: string, graph: TaskGraph, envVars: Set<string>): string {
  const title = name.replace(/-/g, ` `).replace(/\b\w/g, (c) => c.toUpperCase());
  const endpoints = graph.tasks.filter((t) => t.type === `endpoint`);
  const services = graph.tasks.filter((t) => t.type === `service`);
  const models = graph.tasks.filter((t) => t.type === `model`);

  const lines = [
    `# ${title}`,
    ``,
    `Generated API built with Elysia + BunJS + MongoDB.`,
    ``,
    `## Quick Start`,
    ``,
    `\`\`\`bash`,
    `# Install dependencies`,
    `bun install`,
    ``,
    `# Copy and configure environment variables`,
    `cp .env.example .env`,
    ``,
    `# Start the server`,
    `bun run dev`,
    `\`\`\``,
    ``,
    `## Environment Variables`,
    ``,
    `See \`.env.example\` for all required variables:`,
    ``,
    ...[...envVars].sort().map((v) => `- \`${v}\``),
    ``,
    `## API Endpoints`,
    ``,
    `| Group | Description |`,
    `|-------|-------------|`,
    ...endpoints.map((t) => `| ${t.name} | ${t.description.substring(0, 80)} |`),
    ``,
    `## Architecture`,
    ``,
    `| Layer | Components |`,
    `|-------|-----------|`,
    `| Models | ${models.map((t) => t.name).join(`, `)} |`,
    `| Services | ${services.map((t) => t.name).join(`, `)} |`,
    `| Endpoints | ${endpoints.map((t) => t.name).join(`, `)} |`,
    ``,
    `## Health Check`,
    ``,
    `\`\`\``,
    `GET /health`,
    `\`\`\``,
    ``,
  ];

  return lines.join(`\n`);
}
