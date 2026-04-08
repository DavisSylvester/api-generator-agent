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
  const codegenFactory = env.OLLAMA_API_KEY
    ? new OllamaFactory({ host: `https://api.ollama.com`, apiKey: env.OLLAMA_API_KEY })
    : localFactory;
  logger.info(`Codegen Ollama: ${env.OLLAMA_API_KEY ? `https://api.ollama.com (cloud)` : `${env.OLLAMA_HOST} (local)`}`);

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
    localFactory,
    logger,
    timeoutMs,
  );

  const documentationAgent = new DocumentationAgent(
    MODEL_CHAINS.documentation,
    localFactory,
    logger,
    timeoutMs,
  );

  const pipelineConfig: PipelineConfig = {
    maxFixIterations: env.MAX_FIX_ITERATIONS,
    maxConcurrency: env.MAX_CONCURRENCY,
    workspaceDir: env.WORKSPACE_DIR,
    ollamaHost: env.OLLAMA_HOST,
    integrationPort: env.INTEGRATION_PORT,
  };

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
  };
}
