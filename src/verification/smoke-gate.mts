import type { Logger } from "winston";
import type {
  ISmokeEndpointResult,
  ISmokeGateResult,
} from "../core/interfaces/index.mts";

export interface SmokeGateConfig {
  projectDir: string;
  port: number;
  endpoints?: EndpointSpec[];
  startTimeoutMs?: number;
}

export interface EndpointSpec {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  expectedStatus?: number;
}

const DEFAULT_ENDPOINTS: EndpointSpec[] = [
  { method: "GET", path: "/health", expectedStatus: 200 },
  { method: "GET", path: "/swagger", expectedStatus: 200 },
];

export async function runSmokeGate(
  projectDir: string,
  port: number,
  logger: Logger,
  endpoints?: EndpointSpec[],
): Promise<ISmokeGateResult> {
  const startMs = performance.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const endpointResults: ISmokeEndpointResult[] = [];
  const allEndpoints = [...DEFAULT_ENDPOINTS, ...(endpoints ?? [])];

  logger.info(`[smoke-gate] Starting server on port ${port} for smoke testing`);
  logger.info(`[smoke-gate] Testing ${allEndpoints.length} endpoint(s)`);

  let serverProc: ReturnType<typeof Bun.spawn> | undefined;

  try {
    serverProc = Bun.spawn(
      ["bun", "run", "src/index.mts"],
      {
        cwd: projectDir,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, PORT: String(port) },
      },
    );

    await waitForServer(`http://localhost:${port}/health`, 10000);

    for (const endpoint of allEndpoints) {
      const result = await testEndpoint(port, endpoint, logger);
      endpointResults.push(result);

      if (!result.passed) {
        const msg = `${endpoint.method} ${endpoint.path}: ${result.error ?? "unknown error"}`;
        if (endpoint.path === "/health") {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    }

    logger.info(
      `[smoke-gate] Endpoint results: ${endpointResults.filter((r) => r.passed).length}/${endpointResults.length} passed`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Smoke test failed: ${msg}`);
  } finally {
    if (serverProc) {
      serverProc.kill();
    }
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info(`[smoke-gate] Complete: ${errors.length} errors (${durationMs}ms)`);

  return {
    passed: errors.length === 0,
    gate: "smoke",
    errors,
    warnings,
    durationMs,
    endpointResults,
  };
}

async function testEndpoint(
  port: number,
  endpoint: EndpointSpec,
  logger: Logger,
): Promise<ISmokeEndpointResult> {
  const url = `http://localhost:${port}${endpoint.path}`;
  const expectedStatus = endpoint.expectedStatus ?? 200;

  try {
    const fetchOptions: RequestInit = {
      method: endpoint.method,
      headers: { "Content-Type": "application/json" },
    };

    if (endpoint.body && endpoint.method !== "GET") {
      fetchOptions.body = JSON.stringify(endpoint.body);
    }

    const res = await fetch(url, fetchOptions);
    const statusCode = res.status;

    if (statusCode !== expectedStatus) {
      return {
        method: endpoint.method,
        path: endpoint.path,
        statusCode,
        passed: false,
        error: `Expected ${expectedStatus}, got ${statusCode}`,
      };
    }

    const validationError = await validateResponseShape(res, endpoint, logger);
    if (validationError) {
      return {
        method: endpoint.method,
        path: endpoint.path,
        statusCode,
        passed: false,
        error: validationError,
      };
    }

    return {
      method: endpoint.method,
      path: endpoint.path,
      statusCode,
      passed: true,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      method: endpoint.method,
      path: endpoint.path,
      statusCode: 0,
      passed: false,
      error: msg,
    };
  }
}

async function validateResponseShape(
  res: Response,
  endpoint: EndpointSpec,
  logger: Logger,
): Promise<string | undefined> {
  if (endpoint.path === "/swagger") {
    return undefined;
  }

  if (endpoint.path === "/health") {
    try {
      const body = await res.json() as Record<string, unknown>;
      if (body.status !== "ok") {
        return `Health endpoint returned status: ${String(body.status)}`;
      }
    } catch {
      return "Health endpoint did not return valid JSON";
    }
    return undefined;
  }

  try {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      logger.info(`[smoke-gate] Non-JSON response for ${endpoint.path} — skipping shape validation`);
      return undefined;
    }

    const body = await res.json() as Record<string, unknown>;
    return validateApiResponseShape(body, endpoint.path);
  } catch {
    return `Could not parse JSON response for ${endpoint.path}`;
  }
}

function validateApiResponseShape(
  body: Record<string, unknown>,
  path: string,
): string | undefined {
  if (typeof body.success !== "boolean") {
    return `Response for ${path} missing "success" boolean field`;
  }

  if (body.success === true) {
    if (!("data" in body)) {
      return `Success response for ${path} missing "data" field`;
    }
  } else {
    if (!("error" in body)) {
      return `Error response for ${path} missing "error" field`;
    }
  }

  return undefined;
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const startMs = performance.now();
  const interval = 500;

  while (performance.now() - startMs < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Server did not start within ${timeoutMs}ms`);
}
