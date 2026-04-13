export interface CliOptions {
  readonly command: `run` | `list-runs` | `status` | `help`;
  readonly prd?: string;
  readonly resume?: string;
  readonly statusRunId?: string;
  readonly iterations?: number;
  readonly maxTasks?: number;
  readonly concurrency?: number;
  readonly noDiagrams: boolean;
  readonly noDocs: boolean;
  readonly noValidate: boolean;
}

const HELP_TEXT = `
api-generator-agent — Autonomous API code generator

Usage:
  bun run src/index.mts --prd <file> [options]
  bun run src/index.mts --resume <run-id> [options]
  bun run src/index.mts --list-runs
  bun run src/index.mts --status <run-id>

Options:
  -p, --prd <file>       Path to PRD markdown file (required for new runs)
  -r, --resume <run-id>  Resume a previous run (skips completed tasks)
  -i, --iterations <n>   Max fix loop iterations per task (default: from env or 5)
  -t, --max-tasks <n>    Max tasks to execute (default: all)
  -c, --concurrency <n>  Max parallel tasks (default: from env)
  -D, --no-diagrams      Skip diagram generation phase
  -N, --no-docs          Skip documentation generation phase
  -V, --no-validate      Skip output validation (bun install, swagger screenshot)
  -l, --list-runs        List all previous runs with status
  -s, --status <run-id>  Show detailed status of a specific run
  -h, --help             Show this help message

Examples:
  bun run src/index.mts --prd my-app.md --iterations 20
  bun run src/index.mts --resume 6b8ed261-b6fe-42bb-beeb-414a8706b5a2
  bun run src/index.mts --list-runs
  bun run src/index.mts --status 6b8ed261-b6fe-42bb-beeb-414a8706b5a2

Legacy (positional args, backward compatible):
  bun run src/index.mts <prd-file> [max-iterations] [max-tasks]
`.trim();

export function printHelp(): void {
  console.log(HELP_TEXT);
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const args = argv.slice(2);

  if (args.length === 0) {
    return { command: `help`, noDiagrams: false, noDocs: false, noValidate: false };
  }

  // Detect legacy positional mode: first arg doesn't start with -
  if (args[0] && !args[0].startsWith(`-`)) {
    return parseLegacy(args);
  }

  let command: CliOptions[`command`] = `run`;
  let prd: string | undefined;
  let resume: string | undefined;
  let statusRunId: string | undefined;
  let iterations: number | undefined;
  let maxTasks: number | undefined;
  let concurrency: number | undefined;
  let noDiagrams = false;
  let noDocs = false;
  let noValidate = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const next = args[i + 1];

    switch (arg) {
      case `--help`:
      case `-h`:
        return { command: `help`, noDiagrams: false, noDocs: false, noValidate: false };

      case `-l`:
      case `--list-runs`:
        return { command: `list-runs`, noDiagrams: false, noDocs: false, noValidate: false };

      case `-s`:
      case `--status`:
        if (!next || next.startsWith(`-`)) {
          console.error(`Error: --status requires a run ID`);
          process.exit(1);
        }
        return { command: `status`, statusRunId: next, noDiagrams: false, noDocs: false, noValidate: false };

      case `-p`:
      case `--prd`:
        if (!next || next.startsWith(`-`)) {
          console.error(`Error: --prd requires a file path`);
          process.exit(1);
        }
        prd = next;
        i++;
        break;

      case `-r`:
      case `--resume`:
        if (!next || next.startsWith(`-`)) {
          console.error(`Error: --resume requires a run ID`);
          process.exit(1);
        }
        resume = next;
        i++;
        break;

      case `-i`:
      case `--iterations`:
        if (!next) {
          console.error(`Error: --iterations requires a number`);
          process.exit(1);
        }
        iterations = parseInt(next, 10);
        i++;
        break;

      case `-t`:
      case `--max-tasks`:
        if (!next) {
          console.error(`Error: --max-tasks requires a number`);
          process.exit(1);
        }
        maxTasks = parseInt(next, 10);
        i++;
        break;

      case `-c`:
      case `--concurrency`:
        if (!next) {
          console.error(`Error: --concurrency requires a number`);
          process.exit(1);
        }
        concurrency = parseInt(next, 10);
        i++;
        break;

      case `-D`:
      case `--no-diagrams`:
        noDiagrams = true;
        break;

      case `-N`:
      case `--no-docs`:
        noDocs = true;
        break;

      case `-V`:
      case `--no-validate`:
        noValidate = true;
        break;

      default:
        console.error(`Unknown option: ${arg}`);
        console.error(`Run with --help for usage information.`);
        process.exit(1);
    }
  }

  if (command === `run` && !prd && !resume) {
    console.error(`Error: --prd <file> or --resume <run-id> is required`);
    console.error(`Run with --help for usage information.`);
    process.exit(1);
  }

  return { command, prd, resume, iterations, maxTasks, concurrency, noDiagrams, noDocs, noValidate };
}

function parseLegacy(args: readonly string[]): CliOptions {
  const prd = args[0];
  const iterations = args[1] ? parseInt(args[1], 10) : undefined;
  const maxTasks = args[2] ? parseInt(args[2], 10) : undefined;
  return { command: `run`, prd, iterations, maxTasks, noDiagrams: false, noDocs: false, noValidate: false };
}
