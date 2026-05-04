import winston from 'winston';
import type { Logger } from 'winston';
import type { EnvConfig } from '../config/env.mts';
import type { PipelineConfig } from '../types/pipeline.mts';
import { PROVIDER_MODEL_MAP } from '../config/models.mts';
import { redactSecrets } from '../llm/redact-secrets.mts';
import { CostTracker } from '../llm/cost-tracker.mts';
import pc from 'picocolors';
import type { ILlmFactory } from '../interfaces/i-llm-factory.mjs';
import { OllamaFactory } from '../llm/ollama-factory.mts';
import { AnthropicFactory } from '../llm/anthropic-factory.mts';
import { OpenAIFactory } from '../llm/openai-factory.mts';
import { PlanningAgent } from '../agents/planning-agent.mts';
import { CodegenAgent } from '../agents/codegen-agent.mts';
import { EslintAgent } from '../agents/eslint-agent.mts';
import { QaAgent } from '../agents/qa-agent.mts';
import { DocumentationAgent } from '../agents/documentation-agent.mts';
import { FlutterUiAgent } from '../agents/flutter-ui-agent.mts';
import { PrdExpansionAgent } from '../agents/prd-expansion-agent.mts';
import type { FallbackTier } from '../config/fallback-tiers.mts';
import { Notifier } from '../notifications/notifier.mts';
import { TelegramChannel } from '../notifications/telegram-channel.mts';
import { ConsoleChannel } from '../notifications/console-channel.mts';
import type { NotificationChannel } from '../notifications/notifier.mts';
import { DiscordChannel } from '../notifications/discord/discord-channel.mts';
import { WebhookTransport } from '../notifications/discord/webhook-transport.mts';
import type { IDiscordTransport } from '../notifications/discord/interfaces/i-discord-transport.mts';

export interface Container {

  readonly logger: Logger;
  readonly primaryFactory: ILlmFactory;
  readonly codegenFactory: ILlmFactory;
  readonly planningAgent: PlanningAgent;
  readonly codegenAgent: CodegenAgent;
  readonly eslintAgent: EslintAgent;
  readonly qaAgent: QaAgent;
  readonly documentationAgent: DocumentationAgent;
  readonly flutterUiAgent: FlutterUiAgent;
  readonly prdExpansionAgent: PrdExpansionAgent;
  readonly pipelineConfig: PipelineConfig;
  readonly fallbackTiers: readonly FallbackTier[];
  readonly costTracker: CostTracker;
  readonly notifier: Notifier;
  readonly discordChannel: DiscordChannel | undefined;
}

function createPrimaryFactory(env: EnvConfig, logger: Logger): ILlmFactory {
  switch (env.LLM_PROVIDER) {
    case 'ollama': {
      logger.info(`Primary LLM: Ollama (${env.OLLAMA_HOST})`);
      return new OllamaFactory({ host: env.OLLAMA_HOST });
    }
    case 'openai': {
      logger.info(`Primary LLM: OpenAI`);
      return new OpenAIFactory({ apiKey: env.OPENAI_API_KEY! });
    }
    case 'anthropic': {
      logger.info(`Primary LLM: Anthropic`);
      return new AnthropicFactory({ apiKey: env.ANTHROPIC_API_KEY! });
    }
  }
}

function buildFallbackTiers(env: EnvConfig, logger: Logger): FallbackTier[] {
  const tiers: FallbackTier[] = [];
  const primary = env.LLM_PROVIDER;

  if (primary !== 'openai' && env.OPENAI_API_KEY) {
    const openaiFactory = new OpenAIFactory({ apiKey: env.OPENAI_API_KEY });
    tiers.push({
      name: 'gpt-5.4',
      model: 'gpt-5.4',
      maxIterations: 16,
      createChatModel: () => openaiFactory.create('gpt-5.4', 0.2),
    });
    logger.info(`Fallback tier: gpt-5.4 (16 iterations)`);
  }

  if (primary !== 'anthropic' && env.ANTHROPIC_API_KEY) {
    const anthropicFactory = new AnthropicFactory({ apiKey: env.ANTHROPIC_API_KEY });
    tiers.push({
      name: 'claude-sonnet-4-6',
      model: 'claude-sonnet-4-6',
      maxIterations: 16,
      createChatModel: () => anthropicFactory.create('claude-sonnet-4-6', 0.2),
    });
    logger.info(`Fallback tier: claude-sonnet-4-6 (16 iterations)`);
  }

  if (tiers.length === 0) {
    logger.warn('No fallback tiers configured — set additional API keys for escalation');
  }

  return tiers;
}

export function createContainer(env: EnvConfig): Container {
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      redactSecrets(),
      winston.format.timestamp(),
      winston.format.json(),
    ),
    defaultMeta: { service: 'api-generator-agent' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length > 1
              ? ` ${pc.dim(JSON.stringify(meta))}`
              : '';
            const ts = pc.dim(String(timestamp));
            const msg = String(message);
            let coloredLevel: string;
            switch (level) {
              case 'error': coloredLevel = pc.red(pc.bold('ERR')); break;
              case 'warn': coloredLevel = pc.yellow('WRN'); break;
              case 'debug': coloredLevel = pc.gray('DBG'); break;
              default: coloredLevel = pc.green('INF'); break;
            }
            // Highlight phase headers
            const coloredMsg = msg.startsWith('Phase ') || msg.startsWith('===')
              ? pc.cyan(pc.bold(msg))
              : msg.includes('[OK]') ? pc.green(msg)
              : msg.includes('[FAIL]') ? pc.red(msg)
              : msg.includes('[SKIP]') ? pc.yellow(msg)
              : msg;
            return `${ts} ${coloredLevel} ${coloredMsg}${metaStr}`;
          }),
        ),
      }),
    ],
  });

  const provider = env.LLM_PROVIDER;
  const modelChains = PROVIDER_MODEL_MAP[provider];

  const primaryFactory = createPrimaryFactory(env, logger);

  // For Ollama, use cloud Ollama for codegen + qa only; planning + documentation
  // stay on the primary (local) Ollama. This matches the original design:
  // heavy-weight codegen benefits from cloud GPU scale, while planning on a
  // smaller local model is fast and private.
  const CLOUD_TIMEOUT_MS = 600000;
  let codegenFactory: ILlmFactory = primaryFactory;
  if (provider === 'ollama' && env.OLLAMA_API_KEY) {
    codegenFactory = new OllamaFactory({ host: 'https://api.ollama.com', apiKey: env.OLLAMA_API_KEY, timeoutMs: CLOUD_TIMEOUT_MS });
    logger.info(`Codegen Ollama: https://api.ollama.com (cloud, timeout: ${CLOUD_TIMEOUT_MS / 1000}s)`);
  }

  const timeoutMs = env.LLM_TIMEOUT_MS;
  logger.info(`LLM timeout set to ${Math.round(timeoutMs / 1000)}s`);

  const planningAgent = new PlanningAgent(
    modelChains.planning,
    primaryFactory,
    logger,
    timeoutMs,
  );

  const codegenAgent = new CodegenAgent(
    modelChains.codegen,
    codegenFactory,
    logger,
    timeoutMs,
  );

  const eslintAgent = new EslintAgent(logger);

  const qaAgent = new QaAgent(
    modelChains.qa,
    codegenFactory,
    logger,
    timeoutMs,
  );

  const documentationAgent = new DocumentationAgent(
    modelChains.documentation,
    primaryFactory,
    logger,
    timeoutMs,
  );

  const flutterUiAgent = new FlutterUiAgent(
    modelChains[`flutter-ui`],
    codegenFactory,
    logger,
    timeoutMs,
  );

  const prdExpansionAgent = new PrdExpansionAgent(
    modelChains['prd-expansion'],
    primaryFactory,
    logger,
    timeoutMs,
  );

  const costTracker = new CostTracker(logger);
  const fallbackTiers = buildFallbackTiers(env, logger);

  const pipelineConfig: PipelineConfig = {
    maxFixIterations: env.MAX_FIX_ITERATIONS,
    maxConcurrency: env.MAX_CONCURRENCY,
    workspaceDir: env.WORKSPACE_DIR,
    llmProvider: provider,
    llmProviderHost: provider === 'ollama' ? env.OLLAMA_HOST : undefined,
    integrationPort: env.INTEGRATION_PORT,
    taskCostLimit: env.TASK_COST_LIMIT,
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

  // Discord — opt-in. Webhook transport for now (forum channel required for thread-per-run).
  // Bot transport is reserved for a future phase.
  let discordChannel: DiscordChannel | undefined;
  if (env.DISCORD_ENABLED) {
    let transport: IDiscordTransport | undefined;
    if (env.DISCORD_TRANSPORT === 'webhook' && env.DISCORD_PIPELINE_WEBHOOK_URL) {
      transport = new WebhookTransport({
        pipelineWebhookUrl: env.DISCORD_PIPELINE_WEBHOOK_URL,
        alertWebhookUrl: env.DISCORD_ALERT_WEBHOOK_URL,
        logger,
      });
      logger.info(`Discord notifications enabled (webhook transport)`);
    } else if (env.DISCORD_TRANSPORT === 'bot') {
      logger.warn(`Discord bot transport not yet implemented — falling back to webhook check`);
    }

    if (transport !== undefined) {
      discordChannel = new DiscordChannel({
        transport,
        logger,
        costTracker,
        workspaceDir: env.WORKSPACE_DIR,
        alertMention: env.DISCORD_ALERT_MENTION,
        editWindowMs: env.DISCORD_EDIT_WINDOW_MS,
      });
      channels.push(discordChannel);
    }
  }

  const notifier = new Notifier({
    channels,
    statusIntervalMs: env.NOTIFICATION_INTERVAL_MS,
  });

  return {
    logger,
    primaryFactory,
    codegenFactory,
    planningAgent,
    codegenAgent,
    eslintAgent,
    qaAgent,
    documentationAgent,
    flutterUiAgent,
    prdExpansionAgent,
    pipelineConfig,
    fallbackTiers,
    costTracker,
    notifier,
    discordChannel,
  };
}
