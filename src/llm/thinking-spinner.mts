const THINKING_PHRASES: readonly string[] = [
  'Analyzing code structure',
  'Reasoning through architecture',
  'Evaluating design patterns',
  'Constructing type definitions',
  'Mapping dependencies',
  'Composing module layout',
  'Weighing implementation tradeoffs',
  'Drafting interfaces',
  'Synthesizing requirements',
  'Resolving import chains',
  'Considering edge cases',
  'Formulating service layer',
  'Sketching repository pattern',
  'Validating schema constraints',
  'Iterating on approach',
  'Refining error handling',
  'Assembling route handlers',
  'Inspecting data flow',
  'Deliberating middleware logic',
  'Pondering DI container setup',
  'Crafting Zod validators',
  'Wiring controller responses',
  'Structuring test scenarios',
  'Reviewing type safety',
  'Building result types',
  'Generating endpoint signatures',
  'Processing business rules',
  'Optimizing query patterns',
  'Designing pagination logic',
  'Finalizing code output',
] as const;

const SPINNER_FRAMES = ['|', '/', '-', '\\'] as const;

export class ThinkingSpinner {

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private phraseIndex = 0;
  private startMs = 0;
  private readonly label: string;

  constructor(label: string) {
    this.label = label;
    this.phraseIndex = Math.floor(Math.random() * THINKING_PHRASES.length);
  }

  public start(): void {
    this.startMs = performance.now();
    this.intervalId = setInterval(() => {
      const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
      const phrase = THINKING_PHRASES[this.phraseIndex % THINKING_PHRASES.length];
      const elapsed = Math.round((performance.now() - this.startMs) / 1000);
      process.stdout.write(`\r  ${frame} [${this.label}] ${phrase}... (${elapsed}s)`);
      this.frameIndex++;
      if (this.frameIndex % 120 === 0) {
        this.phraseIndex = Math.floor(Math.random() * THINKING_PHRASES.length);
      }
    }, 250);
  }

  public stop(message: string): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    const elapsed = Math.round((performance.now() - this.startMs) / 1000);
    process.stdout.write(`\r  * [${this.label}] ${message} (${elapsed}s)\n`);
  }
}
