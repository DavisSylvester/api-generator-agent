import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

export class Workspace {

  private readonly baseDir: string;
  public readonly runId: string;
  public readonly root: string;

  constructor(baseDir: string, runId: string) {
    this.baseDir = baseDir;
    this.runId = runId;
    this.root = join(this.baseDir, runId);
  }

  public async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await mkdir(this.docsDir(), { recursive: true });
  }

  public async initTask(taskId: string): Promise<void> {
    const taskDir = this.taskDir(taskId);
    await Promise.all([
      mkdir(join(taskDir, 'code'), { recursive: true }),
      mkdir(join(taskDir, 'code-linted'), { recursive: true }),
      mkdir(join(taskDir, 'tests'), { recursive: true }),
      mkdir(join(taskDir, 'iterations'), { recursive: true }),
    ]);
  }

  public async initIteration(taskId: string, iteration: number): Promise<void> {
    const iterDir = this.iterationDir(taskId, iteration);
    await Promise.all([
      mkdir(join(iterDir, 'code'), { recursive: true }),
    ]);
  }

  public taskDir(taskId: string): string {
    return join(this.root, 'tasks', taskId);
  }

  public iterationDir(taskId: string, iteration: number): string {
    return join(this.taskDir(taskId), 'iterations', String(iteration));
  }

  public docsDir(): string {
    return join(this.root, 'docs');
  }

  public planPath(): string {
    return join(this.root, 'plan.json');
  }

  public taskCodeDir(taskId: string): string {
    return join(this.taskDir(taskId), 'code');
  }

  public taskLintedDir(taskId: string): string {
    return join(this.taskDir(taskId), 'code-linted');
  }

  public taskTestsDir(taskId: string): string {
    return join(this.taskDir(taskId), 'tests');
  }

  public taskQaResultsPath(taskId: string): string {
    return join(this.taskDir(taskId), 'qa-results.json');
  }

  public taskStatusPath(taskId: string): string {
    return join(this.taskDir(taskId), 'status.json');
  }

  public hoppscotchPath(): string {
    return join(this.docsDir(), 'hoppscotch-collection.json');
  }
}
