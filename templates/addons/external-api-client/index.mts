import { TEMPLATE_TYPE } from "../../../src/core/enums/index.mts";
import type { TemplateType } from "../../../src/core/enums/index.mts";
import type {
  ITemplate,
  IFeatureSpec,
  IGeneratedFile,
  IRenderedFile,
  IValidationResult,
  IGenerationContext,
} from "../../../src/core/interfaces/index.mts";

function renderApiClientInterface(): string {
  return `export interface IApiClientConfig {

  baseUrl: string;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  headers?: Record<string, string>;
}

export interface IApiResponse<T> {

  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
  headers: Record<string, string>;
  durationMs: number;
}

export interface IApiClient {

  get<T>(path: string, options?: IRequestOptions): Promise<IApiResponse<T>>;

  post<T, B = unknown>(path: string, body: B, options?: IRequestOptions): Promise<IApiResponse<T>>;

  put<T, B = unknown>(path: string, body: B, options?: IRequestOptions): Promise<IApiResponse<T>>;

  patch<T, B = unknown>(path: string, body: B, options?: IRequestOptions): Promise<IApiResponse<T>>;

  delete<T>(path: string, options?: IRequestOptions): Promise<IApiResponse<T>>;
}

export interface IRequestOptions {

  headers?: Record<string, string>;
  timeoutMs?: number;
  retryAttempts?: number;
  queryParams?: Record<string, string>;
}
`;
}

function renderApiClientImplementation(): string {
  return `import type { Logger } from "winston";
import type {
  IApiClient,
  IApiClientConfig,
  IApiResponse,
  IRequestOptions,
} from "../interfaces/i-api-client.mjs";

const DEFAULT_CONFIG: IApiClientConfig = {
  baseUrl: "",
  timeoutMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
  headers: {},
};

export class HttpApiClient implements IApiClient {

  private readonly logger: Logger;
  private readonly config: IApiClientConfig;

  constructor(logger: Logger, config: Partial<IApiClientConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public async get<T>(path: string, options?: IRequestOptions): Promise<IApiResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  public async post<T, B = unknown>(path: string, body: B, options?: IRequestOptions): Promise<IApiResponse<T>> {
    return this.request<T>("POST", path, body, options);
  }

  public async put<T, B = unknown>(path: string, body: B, options?: IRequestOptions): Promise<IApiResponse<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  public async patch<T, B = unknown>(path: string, body: B, options?: IRequestOptions): Promise<IApiResponse<T>> {
    return this.request<T>("PATCH", path, body, options);
  }

  public async delete<T>(path: string, options?: IRequestOptions): Promise<IApiResponse<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  public getConfig(): IApiClientConfig {
    return { ...this.config };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: IRequestOptions,
  ): Promise<IApiResponse<T>> {
    const url = this.buildUrl(path, options?.queryParams);
    const attempts = options?.retryAttempts ?? this.config.retryAttempts;
    const timeout = options?.timeoutMs ?? this.config.timeoutMs;
    const headers = this.mergeHeaders(options?.headers);

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const result = await this.executeRequest<T>(method, url, headers, body, timeout);
      if (result.success || !this.isRetryable(result.statusCode)) {
        return result;
      }

      lastError = result.error;
      this.logger.warn(
        \`[api-client] Retry \${attempt}/\${attempts} for \${method} \${path}: \${result.error}\`,
      );

      if (attempt < attempts) {
        await this.delay(this.config.retryDelayMs * attempt);
      }
    }

    return this.buildErrorResponse(lastError ?? "Max retries exceeded");
  }

  private async executeRequest<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeout: number,
  ): Promise<IApiResponse<T>> {
    const startMs = performance.now();

    try {
      const controller = new AbortController();
      const timerId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timerId);
      return await this.mapResponse<T>(response, startMs);
    } catch (error) {
      const durationMs = Math.round(performance.now() - startMs);
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(\`[api-client] \${method} \${url} failed: \${msg}\`);
      return { success: false, error: msg, statusCode: 0, headers: {}, durationMs };
    }
  }

  private async mapResponse<T>(response: Response, startMs: number): Promise<IApiResponse<T>> {
    const durationMs = Math.round(performance.now() - startMs);
    const responseHeaders = this.extractHeaders(response.headers);

    try {
      const data = await response.json() as T;
      return {
        success: response.ok,
        data: response.ok ? data : undefined,
        error: response.ok ? undefined : JSON.stringify(data),
        statusCode: response.status,
        headers: responseHeaders,
        durationMs,
      };
    } catch {
      return {
        success: response.ok,
        statusCode: response.status,
        headers: responseHeaders,
        durationMs,
        error: response.ok ? undefined : \`HTTP \${response.status}\`,
      };
    }
  }

  private buildUrl(path: string, queryParams?: Record<string, string>): string {
    const base = this.config.baseUrl.replace(/\\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : \`/\${path}\`;
    const url = new URL(\`\${base}\${cleanPath}\`);

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  private mergeHeaders(extra?: Record<string, string>): Record<string, string> {
    return { ...this.config.headers, ...extra };
  }

  private extractHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  private isRetryable(statusCode: number): boolean {
    return statusCode === 0 || statusCode === 429 || statusCode >= 500;
  }

  private buildErrorResponse<T>(error: string): IApiResponse<T> {
    return { success: false, error, statusCode: 0, headers: {}, durationMs: 0 };
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
`;
}

function renderResponseMapper(): string {
  return `export interface IResponseMapper<TRaw, TMapped> {

  map(raw: TRaw): TMapped;

  mapArray(raw: TRaw[]): TMapped[];
}

export class DefaultResponseMapper<TRaw, TMapped> implements IResponseMapper<TRaw, TMapped> {

  private readonly mapFn: (raw: TRaw) => TMapped;

  constructor(mapFn: (raw: TRaw) => TMapped) {
    this.mapFn = mapFn;
  }

  public map(raw: TRaw): TMapped {
    return this.mapFn(raw);
  }

  public mapArray(raw: TRaw[]): TMapped[] {
    return raw.map((item) => this.mapFn(item));
  }
}
`;
}

export const template: ITemplate = {
  name: "external-api-client",
  type: TEMPLATE_TYPE.ADDON as TemplateType,
  description: "Generates a typed HTTP client wrapper: interface for external API, client implementation with retry/timeout, response mapping",

  plan(feature: IFeatureSpec): IGeneratedFile[] {
    return [
      { path: "src/clients/interfaces/i-api-client.mts", description: "API client interface with typed request/response" },
      { path: "src/clients/service/http-api-client.mts", description: "HTTP client implementation with retry and timeout" },
      { path: "src/clients/service/response-mapper.mts", description: "Response mapping utility for transforming API responses" },
    ];
  },

  render(feature: IFeatureSpec, context: IGenerationContext): IRenderedFile[] {
    return [
      { path: "src/clients/interfaces/i-api-client.mts", content: renderApiClientInterface() },
      { path: "src/clients/service/http-api-client.mts", content: renderApiClientImplementation() },
      { path: "src/clients/service/response-mapper.mts", content: renderResponseMapper() },
    ];
  },

  validate(files: IRenderedFile[]): IValidationResult {
    const errors: string[] = [];

    const requiredFiles = [
      "src/clients/interfaces/i-api-client.mts",
      "src/clients/service/http-api-client.mts",
      "src/clients/service/response-mapper.mts",
    ];

    for (const required of requiredFiles) {
      const found = files.find((f) => f.path === required);
      if (!found) {
        errors.push(`Missing required file: ${required}`);
      } else if (found.content.trim().length === 0) {
        errors.push(`File is empty: ${required}`);
      }
    }

    const clientFile = files.find((f) => f.path.includes("i-api-client"));
    if (clientFile) {
      validateClientInterface(clientFile.content, errors);
    }

    return { valid: errors.length === 0, errors };
  },
};

function validateClientInterface(content: string, errors: string[]): void {
  const requiredTypes = ["IApiClient", "IApiResponse", "IApiClientConfig"];
  for (const typeName of requiredTypes) {
    if (!content.includes(typeName)) {
      errors.push(`API client interface missing type: ${typeName}`);
    }
  }
}
