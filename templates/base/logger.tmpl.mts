export function renderLogger(projectName: string): string {
  return `import winston from "winston";
import type { Logger } from "winston";

export function createLogger(): Logger {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    defaultMeta: { service: "${projectName}" },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message }) =>
            \`\${String(timestamp)} [\${level}] \${String(message)}\`,
          ),
        ),
      }),
    ],
  });
}
`;
}
