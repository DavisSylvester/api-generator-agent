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

function renderMessageBuilder(): string {
  return `export interface ITeamsMessageCard {

  type: "MessageCard";
  context: string;
  themeColor: string;
  summary: string;
  sections: ITeamsSection[];
  potentialAction?: ITeamsAction[];
}

export interface ITeamsSection {

  activityTitle: string;
  activitySubtitle?: string;
  activityImage?: string;
  facts?: ITeamsFact[];
  markdown: boolean;
  text?: string;
}

export interface ITeamsFact {

  name: string;
  value: string;
}

export interface ITeamsAction {

  type: "OpenUri" | "HttpPOST";
  name: string;
  targets?: Array<{ os: string; uri: string }>;
}

export const THEME_COLORS = {
  SUCCESS: "00C853",
  WARNING: "FFD600",
  ERROR: "FF1744",
  INFO: "2979FF",
} as const;

export type ThemeColor = typeof THEME_COLORS[keyof typeof THEME_COLORS];

export class TeamsMessageBuilder {

  private themeColor: string;
  private summary: string;
  private sections: ITeamsSection[];
  private actions: ITeamsAction[];

  constructor() {
    this.themeColor = THEME_COLORS.INFO;
    this.summary = "";
    this.sections = [];
    this.actions = [];
  }

  public setColor(color: ThemeColor): TeamsMessageBuilder {
    this.themeColor = color;
    return this;
  }

  public setSummary(summary: string): TeamsMessageBuilder {
    this.summary = summary;
    return this;
  }

  public addSection(section: ITeamsSection): TeamsMessageBuilder {
    this.sections.push(section);
    return this;
  }

  public addFacts(title: string, facts: ITeamsFact[]): TeamsMessageBuilder {
    this.sections.push({
      activityTitle: title,
      facts,
      markdown: true,
    });
    return this;
  }

  public addTextSection(title: string, text: string): TeamsMessageBuilder {
    this.sections.push({
      activityTitle: title,
      text,
      markdown: true,
    });
    return this;
  }

  public addAction(action: ITeamsAction): TeamsMessageBuilder {
    this.actions.push(action);
    return this;
  }

  public build(): ITeamsMessageCard {
    return {
      type: "MessageCard",
      context: "https://schema.org/extensions",
      themeColor: this.themeColor,
      summary: this.summary,
      sections: [...this.sections],
      potentialAction: this.actions.length > 0 ? [...this.actions] : undefined,
    };
  }
}
`;
}

function renderWebhookClient(): string {
  return `import type { Logger } from "winston";
import type { ITeamsMessageCard } from "./message-builder.mjs";

export interface IWebhookConfig {

  webhookUrl: string;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface IWebhookResult {

  success: boolean;
  statusCode: number;
  error?: string;
  durationMs: number;
}

const DEFAULT_WEBHOOK_CONFIG: IWebhookConfig = {
  webhookUrl: "",
  timeoutMs: 10000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

export class TeamsWebhookClient {

  private readonly logger: Logger;
  private readonly config: IWebhookConfig;

  constructor(logger: Logger, config: Partial<IWebhookConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_WEBHOOK_CONFIG, ...config };
  }

  public async send(card: ITeamsMessageCard): Promise<IWebhookResult> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      const result = await this.executeSend(card);
      if (result.success) {
        return result;
      }

      lastError = result.error;
      this.logger.warn(
        \`[teams-webhook] Retry \${attempt}/\${this.config.retryAttempts}: \${result.error}\`,
      );

      if (attempt < this.config.retryAttempts) {
        await this.delay(this.config.retryDelayMs * attempt);
      }
    }

    return { success: false, statusCode: 0, error: lastError, durationMs: 0 };
  }

  public getConfig(): IWebhookConfig {
    return { ...this.config };
  }

  private async executeSend(card: ITeamsMessageCard): Promise<IWebhookResult> {
    const startMs = performance.now();

    try {
      const controller = new AbortController();
      const timerId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
        signal: controller.signal,
      });

      clearTimeout(timerId);
      const durationMs = Math.round(performance.now() - startMs);

      if (response.ok) {
        this.logger.info(\`[teams-webhook] Message sent successfully in \${durationMs}ms\`);
      }

      return {
        success: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : \`HTTP \${response.status}\`,
        durationMs,
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - startMs);
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(\`[teams-webhook] Send failed: \${msg}\`);
      return { success: false, statusCode: 0, error: msg, durationMs };
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
`;
}

function renderNotificationTemplates(): string {
  return `import { TeamsMessageBuilder, THEME_COLORS } from "./message-builder.mjs";
import type { ITeamsMessageCard } from "./message-builder.mjs";

export interface INotificationContext {

  projectName: string;
  environment: string;
  timestamp: string;
  triggeredBy?: string;
}

export function buildDeployNotification(
  context: INotificationContext,
  version: string,
  status: "success" | "failure",
): ITeamsMessageCard {
  const color = status === "success" ? THEME_COLORS.SUCCESS : THEME_COLORS.ERROR;
  const emoji = status === "success" ? "Deployed" : "Deploy Failed";

  return new TeamsMessageBuilder()
    .setColor(color)
    .setSummary(\`\${emoji}: \${context.projectName} v\${version}\`)
    .addFacts("Deployment", [
      { name: "Project", value: context.projectName },
      { name: "Version", value: version },
      { name: "Environment", value: context.environment },
      { name: "Status", value: status.toUpperCase() },
      { name: "Time", value: context.timestamp },
    ])
    .build();
}

export function buildErrorNotification(
  context: INotificationContext,
  errorMessage: string,
  severity: "low" | "medium" | "high" | "critical",
): ITeamsMessageCard {
  const colorMap = {
    low: THEME_COLORS.INFO,
    medium: THEME_COLORS.WARNING,
    high: THEME_COLORS.ERROR,
    critical: THEME_COLORS.ERROR,
  } as const;

  return new TeamsMessageBuilder()
    .setColor(colorMap[severity])
    .setSummary(\`Error [\${severity.toUpperCase()}]: \${context.projectName}\`)
    .addFacts("Error Details", [
      { name: "Project", value: context.projectName },
      { name: "Environment", value: context.environment },
      { name: "Severity", value: severity.toUpperCase() },
      { name: "Time", value: context.timestamp },
    ])
    .addTextSection("Error Message", errorMessage)
    .build();
}

export function buildHealthCheckNotification(
  context: INotificationContext,
  status: "healthy" | "degraded" | "unhealthy",
  details: string,
): ITeamsMessageCard {
  const colorMap = {
    healthy: THEME_COLORS.SUCCESS,
    degraded: THEME_COLORS.WARNING,
    unhealthy: THEME_COLORS.ERROR,
  } as const;

  return new TeamsMessageBuilder()
    .setColor(colorMap[status])
    .setSummary(\`Health: \${context.projectName} is \${status}\`)
    .addFacts("Health Check", [
      { name: "Project", value: context.projectName },
      { name: "Environment", value: context.environment },
      { name: "Status", value: status.toUpperCase() },
      { name: "Time", value: context.timestamp },
    ])
    .addTextSection("Details", details)
    .build();
}
`;
}

export const template: ITemplate = {
  name: "teams-notification",
  type: TEMPLATE_TYPE.ADDON as TemplateType,
  description: "Generates a Teams webhook notification service: message builder, webhook client, notification templates",

  plan(feature: IFeatureSpec): IGeneratedFile[] {
    return [
      { path: "src/notifications/service/message-builder.mts", description: "Teams Adaptive Card message builder with fluent API" },
      { path: "src/notifications/service/webhook-client.mts", description: "Teams webhook client with retry logic" },
      { path: "src/notifications/service/notification-templates.mts", description: "Pre-built notification templates (deploy, error, health)" },
    ];
  },

  render(feature: IFeatureSpec, context: IGenerationContext): IRenderedFile[] {
    return [
      { path: "src/notifications/service/message-builder.mts", content: renderMessageBuilder() },
      { path: "src/notifications/service/webhook-client.mts", content: renderWebhookClient() },
      { path: "src/notifications/service/notification-templates.mts", content: renderNotificationTemplates() },
    ];
  },

  validate(files: IRenderedFile[]): IValidationResult {
    const errors: string[] = [];

    const requiredFiles = [
      "src/notifications/service/message-builder.mts",
      "src/notifications/service/webhook-client.mts",
      "src/notifications/service/notification-templates.mts",
    ];

    for (const required of requiredFiles) {
      const found = files.find((f) => f.path === required);
      if (!found) {
        errors.push(`Missing required file: ${required}`);
      } else if (found.content.trim().length === 0) {
        errors.push(`File is empty: ${required}`);
      }
    }

    const builderFile = files.find((f) => f.path.includes("message-builder"));
    if (builderFile) {
      validateBuilderContent(builderFile.content, errors);
    }

    return { valid: errors.length === 0, errors };
  },
};

function validateBuilderContent(content: string, errors: string[]): void {
  const requiredTypes = ["ITeamsMessageCard", "TeamsMessageBuilder", "ITeamsSection"];
  for (const typeName of requiredTypes) {
    if (!content.includes(typeName)) {
      errors.push(`Message builder missing type: ${typeName}`);
    }
  }
}
