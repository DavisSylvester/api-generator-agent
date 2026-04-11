import winston from "winston";

const SECRET_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OLLAMA_API_KEY",
  "LANGSMITH_API_KEY",
  "apiKey",
  "api_key",
  "anthropicApiKey",
  "openAIApiKey",
]);

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /key-[A-Za-z0-9_-]{20,}/g,
];

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const pattern of SECRET_PATTERNS) {
      result = result.replace(pattern, "[REDACTED]");
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value !== null && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SECRET_KEYS.has(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactValue(val);
    }
  }
  return result;
}

export function redactSecrets(): winston.Logform.Format {
  return winston.format((info) => {
    const redacted = redactObject(info as unknown as Record<string, unknown>);
    return redacted as unknown as winston.Logform.TransformableInfo;
  })();
}
