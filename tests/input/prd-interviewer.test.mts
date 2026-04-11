import { describe, it, expect } from "bun:test";
import winston from "winston";
import { PrdInterviewer } from "../../src/input/prd-interviewer.mts";
import type { InterviewCallback } from "../../src/input/prd-interviewer.mts";
import { AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const silentLogger = winston.createLogger({
  silent: true,
  transports: [new winston.transports.Console()],
});

/**
 * Creates a mock chat model that returns predetermined responses.
 * Each call to invoke() returns the next response in the sequence.
 */
function createMockModel(responses: string[]): BaseChatModel {
  let callIndex = 0;

  const mock = {
    invoke: async (): Promise<AIMessage> => {
      const responseText = responses[callIndex] ?? "INTERVIEW_COMPLETE";
      callIndex++;
      return new AIMessage(responseText);
    },
  } as unknown as BaseChatModel;

  return mock;
}

describe("PrdInterviewer", () => {
  describe("runInterview", () => {
    it("should complete interview when model says INTERVIEW_COMPLETE", async () => {
      const model = createMockModel([
        "What entities does your API manage?",
        "INTERVIEW_COMPLETE",
        "# Test API — PRD\n\n- [ ] Feature: Orders — CRUD for orders",
      ]);

      const interviewer = new PrdInterviewer(model, silentLogger, {
        maxRounds: 10,
        projectName: "test-api",
      });

      const answers: string[] = [];
      const askUser: InterviewCallback = async (question: string): Promise<string> => {
        answers.push(question);
        return "I need work orders and users";
      };

      const result = await interviewer.runInterview("Build a work order API", askUser);

      expect(result.projectName).toBe("test-api");
      expect(result.rounds).toBeGreaterThanOrEqual(1);
      expect(result.prdContent).toBeTruthy();
    });

    it("should respect maxRounds limit", async () => {
      // Model never says INTERVIEW_COMPLETE
      const model = createMockModel([
        "What entities?",
        "What fields?",
        "What relationships?",
        "What operations?",
        "# PRD content",
      ]);

      const interviewer = new PrdInterviewer(model, silentLogger, {
        maxRounds: 3,
        projectName: "bounded-test",
      });

      const askUser: InterviewCallback = async (): Promise<string> => "Some answer";

      const result = await interviewer.runInterview("Build an API", askUser);
      expect(result.rounds).toBeLessThanOrEqual(3);
    });

    it("should pass questions from the model to the callback", async () => {
      const model = createMockModel([
        "Can you describe the entities in your system?",
        "INTERVIEW_COMPLETE",
        "# Generated PRD",
      ]);

      const interviewer = new PrdInterviewer(model, silentLogger, {
        maxRounds: 5,
        projectName: "test",
      });

      const questions: string[] = [];
      const askUser: InterviewCallback = async (question: string): Promise<string> => {
        questions.push(question);
        return "Entities: Order, Product";
      };

      await interviewer.runInterview("Build an e-commerce API", askUser);

      expect(questions).toHaveLength(1);
      expect(questions[0]).toContain("entities");
    });

    it("should extract project name from prompt when not configured", async () => {
      const model = createMockModel([
        "INTERVIEW_COMPLETE",
        "# Work Order API — PRD\n\n- [ ] Feature: WorkOrder",
      ]);

      const interviewer = new PrdInterviewer(model, silentLogger, {
        maxRounds: 5,
      });

      const askUser: InterviewCallback = async (): Promise<string> => "answer";

      const result = await interviewer.runInterview(
        "Build a work order management API",
        askUser,
      );

      expect(result.projectName).toBeTruthy();
    });
  });

  describe("generatePrdFromTranscript", () => {
    it("should generate PRD from a transcript string", async () => {
      const model = createMockModel([
        "# My API — PRD\n\n## Features\n\n- [ ] Feature: Orders — Order management",
      ]);

      const interviewer = new PrdInterviewer(model, silentLogger, {
        maxRounds: 5,
        projectName: "my-api",
      });

      const transcript = "User: I need an orders API\nInterviewer: What fields?";
      const prd = await interviewer.generatePrdFromTranscript(transcript, "my-api");

      expect(prd).toContain("#");
    });

    it("should ensure heading is present in output", async () => {
      const model = createMockModel([
        "Some content without a heading",
      ]);

      const interviewer = new PrdInterviewer(model, silentLogger, {
        maxRounds: 5,
        projectName: "test-project",
      });

      const prd = await interviewer.generatePrdFromTranscript("transcript", "test-project");
      expect(prd).toMatch(/^#/);
    });
  });
});
