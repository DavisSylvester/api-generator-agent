import type { Logger } from "winston";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

/**
 * Callback function that sends a question to the user and returns their answer.
 * In CLI mode, this prompts on the terminal.
 * In Claude Code agent mode, this pauses the conversation.
 */
export type InterviewCallback = (question: string) => Promise<string>;

export interface PrdInterviewerConfig {
  maxRounds: number;
  projectName?: string;
}

export interface InterviewResult {
  prdContent: string;
  rounds: number;
  projectName: string;
}

const INTERVIEW_CATEGORIES = [
  "entities",
  "fields",
  "relationships",
  "operations",
  "businessRules",
  "nonFunctional",
] as const;

type InterviewCategory = typeof INTERVIEW_CATEGORIES[number];

interface InterviewState {
  projectName: string;
  coveredCategories: Set<InterviewCategory>;
  answers: Map<InterviewCategory, string[]>;
  round: number;
}

const SYSTEM_PROMPT = `You are an API requirements interviewer for agent-one.
Your job is to interview a user to gather requirements for a new Elysia API on Bun.

You must cover these categories:
1. Entities — What domain objects does this API manage?
2. Fields — What fields does each entity have? (types, required/optional)
3. Relationships — How do entities relate? (one-to-one, one-to-many, many-to-many)
4. Operations — What CRUD and custom operations are needed per entity?
5. Business Rules — Any status transitions, validations, or constraints?
6. Non-Functional — Auth requirements, rate limits, performance expectations?

Rules:
- Ask 1-2 focused questions at a time. Never overwhelm with a long list.
- After each answer, acknowledge what you learned and move to the next gap.
- When you have enough information for all categories, say "INTERVIEW_COMPLETE" on its own line.
- Keep questions conversational and specific.
- If the user gives a brief answer, ask a follow-up to clarify.
- Do NOT generate the PRD during the interview. Just gather requirements.`;

const PRD_GENERATION_PROMPT = `Based on the interview below, generate a complete PRD markdown document.

Format requirements:
- Start with a level-1 heading: "# <ProjectName> API — PRD"
- Include a "## Entities" section listing each entity with its fields
- Include a "## Features" section with checkboxes for each feature:
  - [ ] Feature: <EntityName> — <description>
- Include a "## Relationships" section
- Include a "## Business Rules" section
- Include a "## Non-Functional Requirements" section
- Use markdown tables for entity fields (Name | Type | Required | Description)
- Every feature must have a checkbox (- [ ])

Interview transcript:
`;

export class PrdInterviewer {

  private readonly model: BaseChatModel;
  private readonly logger: Logger;
  private readonly config: PrdInterviewerConfig;

  constructor(
    model: BaseChatModel,
    logger: Logger,
    config: PrdInterviewerConfig,
  ) {
    this.model = model;
    this.logger = logger;
    this.config = config;
  }

  public async runInterview(
    initialPrompt: string,
    askUser: InterviewCallback,
  ): Promise<InterviewResult> {
    const state = this.initState(initialPrompt);
    const messages: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(this.buildInitialMessage(state, initialPrompt)),
    ];

    this.logger.info(
      `[prd-interviewer] Starting interview for "${state.projectName}"`,
    );

    while (state.round < this.config.maxRounds) {
      state.round++;
      this.logger.info(
        `[prd-interviewer] Round ${state.round}/${this.config.maxRounds}`,
      );

      const aiResponse = await this.getModelResponse(messages);
      const responseText = this.extractText(aiResponse);
      messages.push(aiResponse);

      if (this.isInterviewComplete(responseText)) {
        this.logger.info("[prd-interviewer] Interview marked complete by model");
        break;
      }

      const question = this.extractQuestion(responseText);
      const userAnswer = await askUser(question);
      messages.push(new HumanMessage(userAnswer));

      this.updateCoveredCategories(state, responseText, userAnswer);
    }

    this.logger.info(
      `[prd-interviewer] Interview finished after ${state.round} rounds`,
    );

    const prdContent = await this.generatePrd(messages, state);
    return {
      prdContent,
      rounds: state.round,
      projectName: state.projectName,
    };
  }

  public async generatePrdFromTranscript(
    transcript: string,
    projectName: string,
  ): Promise<string> {
    const messages: BaseMessage[] = [
      new SystemMessage("You are a technical writer generating PRD documents."),
      new HumanMessage(PRD_GENERATION_PROMPT + transcript),
    ];

    const response = await this.getModelResponse(messages);
    const prdContent = this.extractText(response);
    return this.ensureProjectHeading(prdContent, projectName);
  }

  private initState(initialPrompt: string): InterviewState {
    const projectName = this.config.projectName
      ?? this.extractProjectName(initialPrompt);
    return {
      projectName,
      coveredCategories: new Set(),
      answers: new Map(),
      round: 0,
    };
  }

  private buildInitialMessage(
    state: InterviewState,
    prompt: string,
  ): string {
    return [
      `I want to build an API called "${state.projectName}".`,
      `Here is my initial description: ${prompt}`,
      "Please interview me to gather all the requirements.",
    ].join("\n");
  }

  private async getModelResponse(
    messages: BaseMessage[],
  ): Promise<AIMessage> {
    const response = await this.model.invoke(messages);
    return new AIMessage(this.extractText(response));
  }

  private extractText(message: BaseMessage | AIMessage): string {
    if (typeof message.content === "string") {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content
        .filter((block): block is { type: "text"; text: string } =>
          typeof block === "object" && block !== null && "type" in block && block.type === "text",
        )
        .map((block) => block.text)
        .join("\n");
    }
    return String(message.content);
  }

  private isInterviewComplete(text: string): boolean {
    return text.includes("INTERVIEW_COMPLETE");
  }

  private extractQuestion(responseText: string): string {
    // Return the full response as the question — it includes
    // acknowledgment of previous answers and the next question.
    return responseText
      .replace("INTERVIEW_COMPLETE", "")
      .trim();
  }

  private updateCoveredCategories(
    state: InterviewState,
    aiText: string,
    userAnswer: string,
  ): void {
    const combined = (aiText + " " + userAnswer).toLowerCase();
    const categoryKeywords: Record<InterviewCategory, string[]> = {
      entities: ["entity", "entities", "object", "resource", "model", "domain"],
      fields: ["field", "property", "attribute", "column", "type"],
      relationships: ["relationship", "reference", "foreign", "parent", "child", "belongs"],
      operations: ["operation", "crud", "endpoint", "action", "create", "read", "update", "delete"],
      businessRules: ["rule", "validation", "constraint", "status", "transition", "workflow"],
      nonFunctional: ["auth", "rate", "performance", "security", "scalab", "deploy"],
    };

    for (const category of INTERVIEW_CATEGORIES) {
      const keywords = categoryKeywords[category];
      if (keywords.some((kw) => combined.includes(kw))) {
        state.coveredCategories.add(category);
        const existing = state.answers.get(category) ?? [];
        existing.push(userAnswer);
        state.answers.set(category, existing);
      }
    }
  }

  private async generatePrd(
    messages: BaseMessage[],
    state: InterviewState,
  ): Promise<string> {
    const transcript = this.buildTranscript(messages);
    const prdMessages: BaseMessage[] = [
      new SystemMessage("You are a technical writer generating PRD documents."),
      new HumanMessage(PRD_GENERATION_PROMPT + transcript),
    ];

    this.logger.info("[prd-interviewer] Generating PRD from interview transcript");
    const response = await this.getModelResponse(prdMessages);
    const prdContent = this.extractText(response);
    return this.ensureProjectHeading(prdContent, state.projectName);
  }

  private buildTranscript(messages: BaseMessage[]): string {
    return messages
      .filter((m) => !(m instanceof SystemMessage))
      .map((m) => {
        const role = m instanceof HumanMessage ? "User" : "Interviewer";
        return `**${role}:** ${this.extractText(m)}`;
      })
      .join("\n\n");
  }

  private ensureProjectHeading(
    prdContent: string,
    projectName: string,
  ): string {
    if (prdContent.startsWith("#")) {
      return prdContent;
    }
    return `# ${projectName} API — PRD\n\n${prdContent}`;
  }

  private extractProjectName(prompt: string): string {
    // Look for patterns like "build X API" or "X management"
    const patterns = [
      /(?:build|create|generate)\s+(?:a\s+)?(\w[\w\s]*?)\s+api/i,
      /(\w[\w\s]*?)\s+(?:management|tracking|system)/i,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return "my-project";
  }
}
