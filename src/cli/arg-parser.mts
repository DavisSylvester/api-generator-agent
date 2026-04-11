/**
 * Zero-dependency CLI argument parser for agent-one.
 * Parses positional args and flags from process.argv.
 */

export const CLI_COMMANDS = {
  GENERATE: "generate",
  RESUME: "resume",
  STATUS: "status",
  TRACE: "trace",
} as const;

export type CliCommand = typeof CLI_COMMANDS[keyof typeof CLI_COMMANDS];

export interface ParsedGenerateArgs {
  command: typeof CLI_COMMANDS.GENERATE;
  projectName: string;
  prdPath?: string;
  prompt?: string;
  dryRun: boolean;
  maxIterations?: number;
  outputDir?: string;
}

export interface ParsedResumeArgs {
  command: typeof CLI_COMMANDS.RESUME;
  runId: string;
  maxIterations?: number;
  outputDir?: string;
}

export interface ParsedStatusArgs {
  command: typeof CLI_COMMANDS.STATUS;
  runId: string;
  outputDir?: string;
}

export interface ParsedTraceArgs {
  command: typeof CLI_COMMANDS.TRACE;
  runId: string;
  outputDir?: string;
}

export type ParsedArgs =
  | ParsedGenerateArgs
  | ParsedResumeArgs
  | ParsedStatusArgs
  | ParsedTraceArgs;

export interface ParseError {
  message: string;
  showHelp: boolean;
}

export type ParseResult =
  | { ok: true; value: ParsedArgs }
  | { ok: false; error: ParseError };

/**
 * Parse raw argv array (typically process.argv.slice(2))
 * into a typed command with flags.
 */
export function parseArgs(argv: string[]): ParseResult {
  if (argv.length === 0) {
    return {
      ok: false,
      error: { message: "No command provided.", showHelp: true },
    };
  }

  const command = argv[0];

  switch (command) {
    case CLI_COMMANDS.GENERATE:
      return parseGenerateArgs(argv.slice(1));
    case CLI_COMMANDS.RESUME:
      return parseResumeArgs(argv.slice(1));
    case CLI_COMMANDS.STATUS:
      return parseStatusArgs(argv.slice(1));
    case CLI_COMMANDS.TRACE:
      return parseTraceArgs(argv.slice(1));
    case "--help":
    case "-h":
      return {
        ok: false,
        error: { message: "", showHelp: true },
      };
    default:
      return {
        ok: false,
        error: {
          message: `Unknown command: "${command}".`,
          showHelp: true,
        },
      };
  }
}

function parseGenerateArgs(argv: string[]): ParseResult {
  const flags = extractFlags(argv);
  const positionals = extractPositionals(argv);

  if (positionals.length === 0) {
    return {
      ok: false,
      error: {
        message: "Missing project name. Usage: agent-one generate <project-name>",
        showHelp: false,
      },
    };
  }

  const projectName = positionals[0] as string;
  const prdPath = flags.get("prd");
  const prompt = flags.get("prompt");
  const dryRun = flags.has("dry-run");
  const maxIterations = parseIntFlag(flags, "max-iterations");
  const outputDir = flags.get("output");

  if (!prdPath && !prompt) {
    return {
      ok: false,
      error: {
        message: "Either --prd <path> or --prompt <text> is required.",
        showHelp: false,
      },
    };
  }

  if (maxIterations !== undefined && isNaN(maxIterations)) {
    return {
      ok: false,
      error: {
        message: "--max-iterations must be a positive integer.",
        showHelp: false,
      },
    };
  }

  return {
    ok: true,
    value: {
      command: CLI_COMMANDS.GENERATE,
      projectName,
      prdPath,
      prompt,
      dryRun,
      maxIterations,
      outputDir,
    },
  };
}

function parseResumeArgs(argv: string[]): ParseResult {
  const flags = extractFlags(argv);
  const positionals = extractPositionals(argv);

  if (positionals.length === 0) {
    return {
      ok: false,
      error: {
        message: "Missing run ID. Usage: agent-one resume <run-id>",
        showHelp: false,
      },
    };
  }

  const runId = positionals[0] as string;
  const maxIterations = parseIntFlag(flags, "max-iterations");
  const outputDir = flags.get("output");

  return {
    ok: true,
    value: {
      command: CLI_COMMANDS.RESUME,
      runId,
      maxIterations,
      outputDir,
    },
  };
}

function parseStatusArgs(argv: string[]): ParseResult {
  const flags = extractFlags(argv);
  const positionals = extractPositionals(argv);

  if (positionals.length === 0) {
    return {
      ok: false,
      error: {
        message: "Missing run ID. Usage: agent-one status <run-id>",
        showHelp: false,
      },
    };
  }

  const runId = positionals[0] as string;
  const outputDir = flags.get("output");

  return {
    ok: true,
    value: {
      command: CLI_COMMANDS.STATUS,
      runId,
      outputDir,
    },
  };
}

function parseTraceArgs(argv: string[]): ParseResult {
  const flags = extractFlags(argv);
  const positionals = extractPositionals(argv);

  if (positionals.length === 0) {
    return {
      ok: false,
      error: {
        message: "Missing run ID. Usage: agent-one trace <run-id>",
        showHelp: false,
      },
    };
  }

  const runId = positionals[0] as string;
  const outputDir = flags.get("output");

  return {
    ok: true,
    value: {
      command: CLI_COMMANDS.TRACE,
      runId,
      outputDir,
    },
  };
}

/**
 * Extract flag key-value pairs from argv.
 * Supports: --flag value, --flag=value, --boolean-flag
 */
function extractFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;

    const eqIdx = arg.indexOf("=");

    if (eqIdx !== -1) {
      const key = arg.slice(2, eqIdx);
      const value = arg.slice(eqIdx + 1);
      flags.set(key, value);
    } else {
      const key = arg.slice(2);
      const nextArg = argv[i + 1];

      if (nextArg && !nextArg.startsWith("--")) {
        flags.set(key, nextArg);
        i++;
      } else {
        flags.set(key, "true");
      }
    }
  }

  return flags;
}

/**
 * Extract positional arguments (non-flag args) from argv.
 */
function extractPositionals(argv: string[]): string[] {
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        const nextArg = argv[i + 1];
        if (nextArg && !nextArg.startsWith("--")) {
          i++;
        }
      }
      continue;
    }

    positionals.push(arg);
  }

  return positionals;
}

function parseIntFlag(
  flags: Map<string, string>,
  key: string,
): number | undefined {
  const value = flags.get(key);
  if (value === undefined) return undefined;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed <= 0 ? NaN : parsed;
}

/**
 * Generate help text for the CLI.
 */
export function getHelpText(): string {
  return [
    "agent-one -- Production-ready Elysia API generator",
    "",
    "USAGE:",
    "  agent-one <command> [options]",
    "",
    "COMMANDS:",
    "  generate <project-name>  Generate a new API project",
    "  resume <run-id>          Resume an interrupted generation",
    "  status <run-id>          Show generation status",
    "  trace <run-id>           Show trace summary for a run",
    "",
    "OPTIONS (generate):",
    "  --prd <path>             Use PRD file as input",
    "  --prompt <text>          Use natural language prompt as input",
    "  --dry-run                Output plan without writing files",
    "  --max-iterations <n>     Max fix loop iterations (default: 5)",
    "  --output <dir>           Output directory (default: .workspace)",
    "",
    "OPTIONS (resume):",
    "  --max-iterations <n>     Max fix loop iterations (default: 5)",
    "  --output <dir>           Output directory (default: .workspace)",
    "",
    "OPTIONS (status, trace):",
    "  --output <dir>           Output directory (default: .workspace)",
    "",
    "EXAMPLES:",
    "  agent-one generate my-api --prd ./requirements.md",
    "  agent-one generate my-api --prompt \"Build a work order API\"",
    "  agent-one generate my-api --prd ./prd.md --dry-run",
    "  agent-one resume 01HXYZ123456",
    "  agent-one status 01HXYZ123456",
    "  agent-one trace 01HXYZ123456",
  ].join("\n");
}
