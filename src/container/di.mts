import winston from 'winston';
import type { Logger } from 'winston';
import type { EnvConfig } from '../config/env.mts';
import type { PipelineConfig } from '../types/pipeline.mts';
import { MODEL_CHAINS } from '../config/models.mts';
import { OllamaFactory } from '../llm/ollama-factory.mts';
import { PlanningAgent } from '../agents/planning-agent.mts';
import { CodegenAgent } from '../agents/codegen-agent.mts';
import { EslintAgent } from '../agents/eslint-agent.mts';
import { QaAgent } from '../agents/qa-agent.mts';
import { DocumentationAgent } from '../agents/documentation-agent.mts';
import { AnthropicFactory } from '../llm/anthropic-factory.mts';
import { OpenAIFactory } from '../llm/openai-factory.mts';
import type { FallbackTier } from '../config/fallback-tiers.mts';
import { Notifier } from '../notifications/notifier.mts';
import { TelegramChannel } from '../notifications/telegram-channel.mts';
import { ConsoleChannel } from '../notifications/console-channel.mts';
import type { NotificationChannel } from '../notifications/notifier.mts';

export interface Container {

  readonly logger: Logger;
  readonly localFactory: OllamaFactory;
  readonly codegenFactory: OllamaFactory;
  readonly planningAgent: PlanningAgent;
  readonly codegenAgent: CodegenAgent;
  readonly eslintAgent: EslintAgent;
  readonly qaAgent: QaAgent;
  readonly documentationAgent: DocumentationAgent;
  readonly pipelineConfig: PipelineConfig;
  readonly fallbackTiers: readonly FallbackTier[];
  readonly notifier: Notifier;
}

export function createContainer(env: EnvConfig): Container {
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    defaultMeta: { service: 'api-generator-agent' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length > 1
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${String(timestamp)} [${level}] ${String(message)}${metaStr}`;
          }),
        ),
      }),
    ],
  });

  // Local Ollama for planning, QA, docs (qwen3.5:27b)
  const localFactory = new OllamaFactory({ host: env.OLLAMA_HOST });
  logger.info(`Local Ollama: ${env.OLLAMA_HOST}`);

  // Cloud Ollama for codegen (qwen3-coder-next) — falls back to local if no API key
  const CLOUD_TIMEOUT_MS = 600000; // 10 minutes for cloud models
  const codegenFactory = env.OLLAMA_API_KEY
    ? new OllamaFactory({ host: `https://api.ollama.com`, apiKey: env.OLLAMA_API_KEY, timeoutMs: CLOUD_TIMEOUT_MS })
    : localFactory;
  logger.info(`Codegen Ollama: ${env.OLLAMA_API_KEY ? `https://api.ollama.com (cloud, timeout: ${CLOUD_TIMEOUT_MS / 1000}s)` : `${env.OLLAMA_HOST} (local)`}`);

  const timeoutMs = env.LLM_TIMEOUT_MS;
  logger.info(`LLM timeout set to ${Math.round(timeoutMs / 1000)}s`);

  const planningAgent = new PlanningAgent(
    MODEL_CHAINS.planning,
    localFactory,
    logger,
    timeoutMs,
  );

  const codegenAgent = new CodegenAgent(
    MODEL_CHAINS.codegen,
    codegenFactory,
    logger,
    timeoutMs,
  );

  const eslintAgent = new EslintAgent(logger);

  const qaAgent = new QaAgent(
    MODEL_CHAINS.qa,
    codegenFactory,
    logger,
    timeoutMs,
  );

  const documentationAgent = new DocumentationAgent(
    MODEL_CHAINS.documentation,
    localFactory,
    logger,
    timeoutMs,
  );

  // Build fallback tiers for codegen retry/escalation
  const fallbackTiers: FallbackTier[] = [];

  // Tier 2: OpenAI GPT-5.4
  if (env.OPENAI_API_KEY) {
    const openaiFactory = new OpenAIFactory({ apiKey: env.OPENAI_API_KEY });
    fallbackTiers.push({
      name: `gpt-5.4`,
      model: `gpt-5.4`,
      maxIterations: 16,
      createChatModel: () => openaiFactory.create(`gpt-5.4`, 0.2),
    });
    logger.info(`Fallback Tier 2: gpt-5.4 (16 iterations)`);
  }

  // Tier 3: Claude Sonnet 4.6 via Anthropic API
  if (env.ANTHROPIC_API_KEY) {
    const anthropicFactory = new AnthropicFactory({ apiKey: env.ANTHROPIC_API_KEY });
    fallbackTiers.push({
      name: `claude-sonnet-4-6`,
      model: `claude-sonnet-4-6`,
      maxIterations: 16,
      createChatModel: () => anthropicFactory.create(`claude-sonnet-4-6`, 0.2),
    });
    logger.info(`Fallback Tier 3: claude-sonnet-4-6 (16 iterations)`);
  }

  if (fallbackTiers.length === 0) {
    logger.warn(`No fallback tiers configured — set OLLAMA_API_KEY and/or ANTHROPIC_API_KEY`);
  }

  const pipelineConfig: PipelineConfig = {
    maxFixIterations: env.MAX_FIX_ITERATIONS,
    maxConcurrency: env.MAX_CONCURRENCY,
    workspaceDir: env.WORKSPACE_DIR,
    ollamaHost: env.OLLAMA_HOST,
    integrationPort: env.INTEGRATION_PORT,
  };

  // Build notification channels
  const channels: NotificationChannel[] = [new ConsoleChannel(logger)];

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    channels.push(new TelegramChannel({
      botToken: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
    }));
    logger.info(`Telegram notifications enabled (chat: ${env.TELEGRAM_CHAT_ID})`);
  }

  const notifier = new Notifier({
    channels,
    statusIntervalMs: env.NOTIFICATION_INTERVAL_MS,
  });

  return {
    logger,
    localFactory,
    codegenFactory,
    planningAgent,
    codegenAgent,
    eslintAgent,
    qaAgent,
    documentationAgent,
    pipelineConfig,
    fallbackTiers,
    notifier,
  };
}
