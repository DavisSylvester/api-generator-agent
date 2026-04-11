export interface IVerificationResult {
  passed: boolean;
  gate: "eslint" | "test" | "smoke" | "playwright" | "all";
  errors: string[];
  warnings: string[];
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface ITestDetail {
  name: string;
  status: "pass" | "fail" | "skip";
  durationMs?: number;
  error?: string;
}

export interface ITestGateResult extends IVerificationResult {
  gate: "test";
  passCount: number;
  failCount: number;
  skipCount: number;
  totalCount: number;
  testDetails: ITestDetail[];
}

export interface ISmokeEndpointResult {
  method: string;
  path: string;
  statusCode: number;
  passed: boolean;
  error?: string;
}

export interface ISmokeGateResult extends IVerificationResult {
  gate: "smoke";
  endpointResults: ISmokeEndpointResult[];
}
