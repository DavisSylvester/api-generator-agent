import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Logger } from 'winston';
import type { Workspace } from '../io/workspace.mts';

interface DetectedStack {
  readonly database: 'mongodb' | 'postgres' | 'mysql' | 'none';
  readonly runtime: 'bun' | 'node';
  readonly runtimeVersion: string;
  readonly port: string;
  readonly envVars: Map<string, string>;
}

export async function generateDevcontainer(
  workspace: Workspace,
  logger: Logger,
): Promise<void> {
  const outputDir = workspace.outputDir();
  const stack = await detectStack(outputDir);
  logger.info(`[devcontainer] Detected stack: ${stack.runtime}@${stack.runtimeVersion}, db=${stack.database}, port=${stack.port}`);

  const devcontainerDir = join(outputDir, `.devcontainer`);
  await mkdir(devcontainerDir, { recursive: true });

  // 1. devcontainer.json
  await writeFile(
    join(devcontainerDir, `devcontainer.json`),
    buildDevcontainerJson(stack),
    `utf-8`,
  );
  logger.info(`[devcontainer] Wrote devcontainer.json`);

  // 2. docker-compose.yml
  await writeFile(
    join(devcontainerDir, `docker-compose.yml`),
    buildDockerCompose(stack),
    `utf-8`,
  );
  logger.info(`[devcontainer] Wrote docker-compose.yml`);

  // 3. Dockerfile
  await writeFile(
    join(devcontainerDir, `Dockerfile`),
    buildDockerfile(stack),
    `utf-8`,
  );
  logger.info(`[devcontainer] Wrote Dockerfile`);

  // 4. Create .env with working defaults
  await writeFile(
    join(outputDir, `.env`),
    buildDotEnv(stack),
    `utf-8`,
  );
  logger.info(`[devcontainer] Wrote .env`);

  // 5. Update .env.example with comments
  await writeFile(
    join(outputDir, `.env.example`),
    buildDotEnvExample(stack),
    `utf-8`,
  );
  logger.info(`[devcontainer] Updated .env.example`);

  // 6. Ensure .env is in .gitignore
  await ensureGitignore(outputDir, logger);

  logger.info(`[devcontainer] DevContainer setup complete`);
}

// --- Stack detection ---

async function detectStack(outputDir: string): Promise<DetectedStack> {
  const sourceFiles = await collectAllSource(join(outputDir, `src`));
  const envVars = new Map<string, string>();
  let database: DetectedStack['database'] = `none`;
  let runtime: DetectedStack['runtime'] = `bun`;
  let runtimeVersion = `1.3.12`;
  let port = `3000`;

  // Read package.json for runtime hints
  try {
    const pkgRaw = await readFile(join(outputDir, `package.json`), `utf-8`);
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const deps = { ...(pkg.dependencies as Record<string, string> ?? {}), ...(pkg.devDependencies as Record<string, string> ?? {}) };
    if (`mongodb` in deps) database = `mongodb`;
    else if (`pg` in deps) database = `postgres`;
    else if (`mysql2` in deps) database = `mysql`;
  } catch {
    // No package.json yet — rely on source scan
  }

  // Scan source for imports and env vars
  const importPatterns: Array<{ re: RegExp; db: DetectedStack['database'] }> = [
    { re: /from\s+['"]mongodb['"]/, db: `mongodb` },
    { re: /from\s+['"]pg['"]/, db: `postgres` },
    { re: /from\s+['"]mysql2['"]/, db: `mysql` },
  ];

  const envRe = /process\.env\.(\w+)|Bun\.env\.(\w+)/g;

  for (const [, content] of sourceFiles) {
    // Database detection from imports
    if (database === `none`) {
      for (const { re, db } of importPatterns) {
        if (re.test(content)) {
          database = db;
        }
      }
    }

    // Env var extraction
    let match: RegExpExecArray | null;
    while ((match = envRe.exec(content)) !== null) {
      const varName = match[1] ?? match[2]!;
      if (!envVars.has(varName)) {
        envVars.set(varName, ``);
      }
    }
  }

  // Fallback: check for MONGODB_URI / DATABASE_URL in env vars
  if (database === `none`) {
    if (envVars.has(`MONGODB_URI`)) database = `mongodb`;
    else if (envVars.has(`DATABASE_URL`)) database = `postgres`;
  }

  // Extract port from env config or source
  for (const [, content] of sourceFiles) {
    const portDefault = content.match(/PORT.*default['":\s]+['"]?(\d{4})['"]?/);
    if (portDefault?.[1]) {
      port = portDefault[1];
      break;
    }
  }

  // Populate env var defaults
  populateEnvDefaults(envVars, database, port);

  return { database, runtime, runtimeVersion, port, envVars };
}

function populateEnvDefaults(
  envVars: Map<string, string>,
  database: DetectedStack['database'],
  port: string,
): void {
  // Ensure core vars exist with sensible defaults
  envVars.set(`PORT`, port);
  envVars.set(`NODE_ENV`, `development`);

  switch (database) {
    case `mongodb`:
      envVars.set(`MONGODB_URI`, `mongodb://admin:admin@localhost:27017/app?authSource=admin`);
      break;
    case `postgres`:
      envVars.set(`DATABASE_URL`, `postgresql://admin:admin@localhost:5432/app`);
      break;
    case `mysql`:
      envVars.set(`DATABASE_URL`, `mysql://admin:admin@localhost:3306/app`);
      break;
    default:
      break;
  }

  if (!envVars.has(`JWT_SECRET`)) {
    envVars.set(`JWT_SECRET`, `dev-secret-key-that-is-at-least-32-characters-long!!`);
  } else {
    envVars.set(`JWT_SECRET`, `dev-secret-key-that-is-at-least-32-characters-long!!`);
  }
}

// --- File builders ---

function buildDevcontainerJson(stack: DetectedStack): string {
  const forwardPorts: number[] = [Number(stack.port)];
  const extensions = [
    `oven.bun-vscode`,
    `ms-azuretools.vscode-docker`,
    `humao.rest-client`,
  ];

  if (stack.database === `mongodb`) {
    extensions.push(`mongodb.mongodb-vscode`);
    forwardPorts.push(27017);
  } else if (stack.database === `postgres`) {
    extensions.push(`ckolkman.vscode-postgres`);
    forwardPorts.push(5432);
  } else if (stack.database === `mysql`) {
    extensions.push(`cweijan.vscode-mysql-client2`);
    forwardPorts.push(3306);
  }

  const config = {
    name: `API Dev Environment`,
    dockerComposeFile: `docker-compose.yml`,
    service: `app`,
    workspaceFolder: `/workspace`,
    postCreateCommand: `bun install`,
    forwardPorts,
    customizations: {
      vscode: {
        extensions,
      },
    },
  };

  return JSON.stringify(config, null, 2) + `\n`;
}

function buildDockerCompose(stack: DetectedStack): string {
  const lines: string[] = [
    `services:`,
    `  app:`,
    `    build:`,
    `      context: .`,
    `      dockerfile: Dockerfile`,
    `    volumes:`,
    `      - ..:/workspace:cached`,
    `    environment:`,
    `      - NODE_ENV=development`,
    `      - PORT=${stack.port}`,
    `      - JWT_SECRET=dev-secret-key-that-is-at-least-32-characters-long!!`,
  ];

  // Add database connection env var to app service
  switch (stack.database) {
    case `mongodb`:
      lines.push(
        `      - MONGODB_URI=mongodb://\${MONGO_USER:-admin}:\${MONGO_PASS:-admin}@mongodb:27017/app?authSource=admin`,
      );
      break;
    case `postgres`:
      lines.push(
        `      - DATABASE_URL=postgresql://\${PG_USER:-admin}:\${PG_PASS:-admin}@postgres:5432/app`,
      );
      break;
    case `mysql`:
      lines.push(
        `      - DATABASE_URL=mysql://\${MYSQL_USER:-admin}:\${MYSQL_PASS:-admin}@mysql:3306/app`,
      );
      break;
  }

  lines.push(`    ports:`, `      - "\${PORT:-${stack.port}}:${stack.port}"`);

  // Add depends_on with healthcheck
  if (stack.database !== `none`) {
    lines.push(`    depends_on:`);
    const svcName = dbServiceName(stack.database);
    lines.push(`      ${svcName}:`, `        condition: service_healthy`);
  }

  lines.push(``);

  // Add database service
  switch (stack.database) {
    case `mongodb`:
      lines.push(
        `  mongodb:`,
        `    image: mongo:7`,
        `    restart: unless-stopped`,
        `    environment:`,
        `      - MONGO_INITDB_ROOT_USERNAME=\${MONGO_USER:-admin}`,
        `      - MONGO_INITDB_ROOT_PASSWORD=\${MONGO_PASS:-admin}`,
        `      - MONGO_INITDB_DATABASE=app`,
        `    ports:`,
        `      - "27017:27017"`,
        `    volumes:`,
        `      - mongodb_data:/data/db`,
        `    healthcheck:`,
        `      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]`,
        `      interval: 10s`,
        `      timeout: 5s`,
        `      retries: 5`,
        `      start_period: 10s`,
      );
      break;
    case `postgres`:
      lines.push(
        `  postgres:`,
        `    image: postgres:16`,
        `    restart: unless-stopped`,
        `    environment:`,
        `      - POSTGRES_USER=\${PG_USER:-admin}`,
        `      - POSTGRES_PASSWORD=\${PG_PASS:-admin}`,
        `      - POSTGRES_DB=app`,
        `    ports:`,
        `      - "5432:5432"`,
        `    volumes:`,
        `      - postgres_data:/var/lib/postgresql/data`,
        `    healthcheck:`,
        `      test: ["CMD-SHELL", "pg_isready -U $` + `{PG_USER:-admin}"]`,
        `      interval: 10s`,
        `      timeout: 5s`,
        `      retries: 5`,
        `      start_period: 10s`,
      );
      break;
    case `mysql`:
      lines.push(
        `  mysql:`,
        `    image: mysql:8`,
        `    restart: unless-stopped`,
        `    environment:`,
        `      - MYSQL_ROOT_PASSWORD=\${MYSQL_PASS:-admin}`,
        `      - MYSQL_USER=\${MYSQL_USER:-admin}`,
        `      - MYSQL_PASSWORD=\${MYSQL_PASS:-admin}`,
        `      - MYSQL_DATABASE=app`,
        `    ports:`,
        `      - "3306:3306"`,
        `    volumes:`,
        `      - mysql_data:/var/lib/mysql`,
        `    healthcheck:`,
        `      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]`,
        `      interval: 10s`,
        `      timeout: 5s`,
        `      retries: 5`,
        `      start_period: 10s`,
      );
      break;
  }

  // Named volumes
  lines.push(``);
  lines.push(`volumes:`);
  switch (stack.database) {
    case `mongodb`:
      lines.push(`  mongodb_data:`);
      break;
    case `postgres`:
      lines.push(`  postgres_data:`);
      break;
    case `mysql`:
      lines.push(`  mysql_data:`);
      break;
    default:
      lines.push(`  {}`);
      break;
  }

  return lines.join(`\n`) + `\n`;
}

function buildDockerfile(stack: DetectedStack): string {
  const baseImage = stack.runtime === `bun`
    ? `oven/bun:${stack.runtimeVersion}`
    : `node:20-slim`;

  return [
    `FROM ${baseImage}`,
    ``,
    `RUN apt-get update && apt-get install -y --no-install-recommends \\`,
    `    git \\`,
    `    curl \\`,
    `  && rm -rf /var/lib/apt/lists/*`,
    ``,
    `WORKDIR /workspace`,
    ``,
  ].join(`\n`);
}

function buildDotEnv(stack: DetectedStack): string {
  const lines: string[] = [];
  const sorted = [...stack.envVars.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of sorted) {
    lines.push(`${key}=${value}`);
  }
  return lines.join(`\n`) + `\n`;
}

function buildDotEnvExample(stack: DetectedStack): string {
  const comments: Record<string, string> = {
    PORT: `# Server port`,
    NODE_ENV: `# Environment: development | test | production`,
    MONGODB_URI: `# MongoDB connection string (devcontainer default: admin:admin)`,
    DATABASE_URL: `# Database connection string (devcontainer default: admin:admin)`,
    JWT_SECRET: `# JWT signing secret (min 32 chars)`,
  };

  const lines = [
    `# Environment variables for this API`,
    `# Copy to .env and fill in values`,
    `# DevContainer provides working defaults — override with shell vars:`,
    `#   MONGO_USER=test MONGO_PASS=test docker compose up`,
    ``,
  ];

  const sorted = [...stack.envVars.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of sorted) {
    const comment = comments[key];
    if (comment) lines.push(comment);
    lines.push(`${key}=${value}`);
    if (comment) lines.push(``);
  }

  return lines.join(`\n`) + `\n`;
}

async function ensureGitignore(outputDir: string, logger: Logger): Promise<void> {
  const gitignorePath = join(outputDir, `.gitignore`);
  let content = ``;
  try {
    content = await readFile(gitignorePath, `utf-8`);
  } catch {
    // No .gitignore — will create one
  }

  if (!content.includes(`.env`)) {
    content += `\n.env\n`;
    await writeFile(gitignorePath, content, `utf-8`);
    logger.info(`[devcontainer] Added .env to .gitignore`);
  }
}

// --- Utility ---

function dbServiceName(database: DetectedStack['database']): string {
  switch (database) {
    case `mongodb`: return `mongodb`;
    case `postgres`: return `postgres`;
    case `mysql`: return `mysql`;
    default: return `db`;
  }
}

async function collectAllSource(dir: string, prefix = ``): Promise<Map<string, string>> {
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
      const sub = await collectAllSource(fullPath, relPath);
      for (const [k, v] of sub) files.set(k, v);
    }
  }
  return files;
}
