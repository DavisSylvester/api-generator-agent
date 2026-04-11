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

function renderMessageHandlerInterface(projectName: string): string {
  return `export interface IQueueMessage<T = unknown> {

  id: string;
  type: string;
  payload: T;
  metadata: IMessageMetadata;
}

export interface IMessageMetadata {

  correlationId: string;
  timestamp: string;
  source: string;
  retryCount: number;
  maxRetries: number;
}

export interface IMessageHandler<T = unknown> {

  readonly messageType: string;

  handle(message: IQueueMessage<T>): Promise<IHandlerResult>;

  canHandle(messageType: string): boolean;
}

export interface IHandlerResult {

  success: boolean;
  error?: string;
  shouldRetry: boolean;
  metadata?: Record<string, unknown>;
}
`;
}

function renderQueueListenerService(projectName: string): string {
  return `import type { Logger } from "winston";
import type {
  IQueueMessage,
  IMessageHandler,
  IHandlerResult,
} from "../interfaces/i-message-handler.mjs";
import type { IDeadLetterService } from "./i-dead-letter-service.mjs";

export interface IQueueListenerConfig {

  pollingIntervalMs: number;
  maxConcurrent: number;
  visibilityTimeoutMs: number;
  shutdownGracePeriodMs: number;
}

const DEFAULT_CONFIG: IQueueListenerConfig = {
  pollingIntervalMs: 1000,
  maxConcurrent: 5,
  visibilityTimeoutMs: 30000,
  shutdownGracePeriodMs: 5000,
};

export class QueueListenerService {

  private readonly logger: Logger;
  private readonly handlers: Map<string, IMessageHandler>;
  private readonly deadLetterService: IDeadLetterService;
  private readonly config: IQueueListenerConfig;
  private isRunning: boolean;
  private activeCount: number;

  constructor(
    logger: Logger,
    deadLetterService: IDeadLetterService,
    config?: Partial<IQueueListenerConfig>,
  ) {
    this.logger = logger;
    this.handlers = new Map();
    this.deadLetterService = deadLetterService;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isRunning = false;
    this.activeCount = 0;
  }

  public registerHandler(handler: IMessageHandler): void {
    this.handlers.set(handler.messageType, handler);
    this.logger.info(\`[queue-listener] Registered handler for: \${handler.messageType}\`);
  }

  public async processMessage(message: IQueueMessage): Promise<IHandlerResult> {
    const handler = this.findHandler(message.type);

    if (!handler) {
      this.logger.warn(\`[queue-listener] No handler for message type: \${message.type}\`);
      return { success: false, error: "No handler registered", shouldRetry: false };
    }

    try {
      this.activeCount++;
      const result = await handler.handle(message);
      this.handleResult(message, result);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(\`[queue-listener] Handler error: \${msg}\`, { messageId: message.id });
      return await this.handleFailure(message, msg);
    } finally {
      this.activeCount--;
    }
  }

  public getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public isListening(): boolean {
    return this.isRunning;
  }

  public start(): void {
    this.isRunning = true;
    this.logger.info("[queue-listener] Started listening");
  }

  public stop(): void {
    this.isRunning = false;
    this.logger.info("[queue-listener] Stopped listening");
  }

  private findHandler(messageType: string): IMessageHandler | undefined {
    return this.handlers.get(messageType);
  }

  private handleResult(message: IQueueMessage, result: IHandlerResult): void {
    if (result.success) {
      this.logger.info(\`[queue-listener] Message processed: \${message.id}\`);
    } else {
      this.logger.warn(\`[queue-listener] Message failed: \${message.id} - \${result.error}\`);
    }
  }

  private async handleFailure(message: IQueueMessage, error: string): Promise<IHandlerResult> {
    const shouldRetry = message.metadata.retryCount < message.metadata.maxRetries;

    if (!shouldRetry) {
      await this.deadLetterService.send(message, error);
      this.logger.warn(\`[queue-listener] Message sent to DLQ: \${message.id}\`);
    }

    return { success: false, error, shouldRetry };
  }
}
`;
}

function renderDeadLetterService(): string {
  return `import type { Logger } from "winston";
import type { IQueueMessage } from "../interfaces/i-message-handler.mjs";

export interface IDeadLetterService {

  send(message: IQueueMessage, reason: string): Promise<void>;

  getCount(): Promise<number>;
}

export interface IDeadLetterEntry {

  originalMessage: IQueueMessage;
  reason: string;
  sentAt: string;
  id: string;
}

export class InMemoryDeadLetterService implements IDeadLetterService {

  private readonly logger: Logger;
  private readonly entries: IDeadLetterEntry[];

  constructor(logger: Logger) {
    this.logger = logger;
    this.entries = [];
  }

  public async send(message: IQueueMessage, reason: string): Promise<void> {
    const entry: IDeadLetterEntry = {
      originalMessage: message,
      reason,
      sentAt: new Date().toISOString(),
      id: message.id,
    };

    this.entries.push(entry);
    this.logger.warn(\`[dead-letter] Message added to DLQ: \${message.id}, reason: \${reason}\`);
  }

  public async getCount(): Promise<number> {
    return this.entries.length;
  }

  public getEntries(): IDeadLetterEntry[] {
    return [...this.entries];
  }
}
`;
}

function renderRetryHandler(): string {
  return `import type { Logger } from "winston";
import type { IQueueMessage, IMessageMetadata } from "../interfaces/i-message-handler.mjs";

export interface IRetryConfig {

  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: IRetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export class RetryHandler {

  private readonly logger: Logger;
  private readonly config: IRetryConfig;

  constructor(logger: Logger, config?: Partial<IRetryConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  public shouldRetry(message: IQueueMessage): boolean {
    return message.metadata.retryCount < this.config.maxRetries;
  }

  public getDelay(retryCount: number): number {
    const delay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, retryCount);
    return Math.min(delay, this.config.maxDelayMs);
  }

  public prepareRetry(message: IQueueMessage): IQueueMessage {
    const updatedMetadata: IMessageMetadata = {
      ...message.metadata,
      retryCount: message.metadata.retryCount + 1,
      timestamp: new Date().toISOString(),
    };

    this.logger.info(
      \`[retry] Preparing retry \${updatedMetadata.retryCount}/\${this.config.maxRetries} for message \${message.id}\`,
    );

    return { ...message, metadata: updatedMetadata };
  }

  public getConfig(): IRetryConfig {
    return { ...this.config };
  }
}
`;
}

export const template: ITemplate = {
  name: "queue-consumer",
  type: TEMPLATE_TYPE.ADDON as TemplateType,
  description: "Generates a queue consumer pattern: message handler interface, queue listener service, dead-letter handling, retry logic",

  plan(feature: IFeatureSpec): IGeneratedFile[] {
    return [
      { path: "src/queue/interfaces/i-message-handler.mts", description: "Message handler interface with IQueueMessage and IHandlerResult" },
      { path: "src/queue/service/queue-listener-service.mts", description: "Queue listener service with handler registration and message routing" },
      { path: "src/queue/service/i-dead-letter-service.mts", description: "Dead letter queue service interface and in-memory implementation" },
      { path: "src/queue/service/retry-handler.mts", description: "Retry handler with exponential backoff" },
    ];
  },

  render(feature: IFeatureSpec, context: IGenerationContext): IRenderedFile[] {
    return [
      { path: "src/queue/interfaces/i-message-handler.mts", content: renderMessageHandlerInterface(context.projectName) },
      { path: "src/queue/service/queue-listener-service.mts", content: renderQueueListenerService(context.projectName) },
      { path: "src/queue/service/i-dead-letter-service.mts", content: renderDeadLetterService() },
      { path: "src/queue/service/retry-handler.mts", content: renderRetryHandler() },
    ];
  },

  validate(files: IRenderedFile[]): IValidationResult {
    const errors: string[] = [];

    const requiredFiles = [
      "src/queue/interfaces/i-message-handler.mts",
      "src/queue/service/queue-listener-service.mts",
      "src/queue/service/i-dead-letter-service.mts",
      "src/queue/service/retry-handler.mts",
    ];

    for (const required of requiredFiles) {
      const found = files.find((f) => f.path === required);
      if (!found) {
        errors.push(`Missing required file: ${required}`);
      } else if (found.content.trim().length === 0) {
        errors.push(`File is empty: ${required}`);
      }
    }

    const handlerFile = files.find((f) => f.path.includes("i-message-handler"));
    if (handlerFile) {
      validateHandlerInterface(handlerFile.content, errors);
    }

    return { valid: errors.length === 0, errors };
  },
};

function validateHandlerInterface(content: string, errors: string[]): void {
  const requiredTypes = ["IQueueMessage", "IMessageHandler", "IHandlerResult"];
  for (const typeName of requiredTypes) {
    if (!content.includes(typeName)) {
      errors.push(`Message handler interface missing type: ${typeName}`);
    }
  }
}
