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
  readonly ollamaFactory: OllamaFactory;
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

  const ollamaFactory = new OllamaFactory({ host: env.OLLAMA_HOST });

  const timeoutMs = env.LLM_TIMEOUT_MS;
  logger.info(`LLM timeout set to ${Math.round(timeoutMs / 1000)}s`);

  const planningAgent = new PlanningAgent(
    MODEL_CHAINS.planning,
    ollamaFactory,
    logger,
    timeoutMs,
  );

  const codegenAgent = new CodegenAgent(
    MODEL_CHAINS.codegen,
    ollamaFactory,
    logger,
    timeoutMs,
  );

  const eslintAgent = new EslintAgent(logger);

  const qaAgent = new QaAgent(
    MODEL_CHAINS.qa,
    ollamaFactory,
    logger,
    timeoutMs,
  );

  const documentationAgent = new DocumentationAgent(
    MODEL_CHAINS.documentation,
    ollamaFactory,
    logger,
    timeoutMs,
  );

  const pipelineConfig: PipelineConfig = {
    maxFixIterations: env.MAX_FIX_ITERATIONS,
    maxConcurrency: env.MAX_CONCURRENCY,
    workspaceDir: env.WORKSPACE_DIR,
    ollamaHost: env.OLLAMA_HOST,
  };

  return {
    logger,
    ollamaFactory,
    planningAgent,
    codegenAgent,
    eslintAgent,
    qaAgent,
    documentationAgent,
    pipelineConfig,
  };
}
