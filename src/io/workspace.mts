import { join } from 'node:path';
import { mkdir, access, readdir } from 'node:fs/promises';

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
    await mkdir(join(this.root, 'logs'), { recursive: true });
    await mkdir(this.outputDir(), { recursive: true });
  }

  public async initForResume(): Promise<void> {
    await access(this.root);
    // Ensure log dir exists for appending
    await mkdir(join(this.root, 'logs'), { recursive: true });
  }

  public async loadCompletedTaskIds(): Promise<ReadonlySet<string>> {
    const completed = new Set<string>();
    const tasksDir = join(this.root, 'tasks');
    let taskDirs: string[];
    try {
      taskDirs = await readdir(tasksDir);
    } catch {
      return completed;
    }
    for (const taskId of taskDirs) {
      try {
        const statusPath = this.taskStatusPath(taskId);
        const raw = await Bun.file(statusPath).json();
        if (raw && raw.status === `completed`) {
          completed.add(taskId);
        }
      } catch {
        // No status.json or not completed — skip
      }
    }
    return completed;
  }

  public async initTask(taskId: string): Promise<void> {
    const taskDir = this.taskDir(taskId);
    await Promise.all([
      mkdir(join(taskDir, 'code'), { recursive: true }),
      mkdir(join(taskDir, 'code-linted'), { recursive: true }),
      mkdir(join(taskDir, 'tests'), { recursive: true }),
      mkdir(join(taskDir, 'integration'), { recursive: true }),
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

  public outputDir(): string {
    return join(this.root, 'output');
  }

  public docsDir(): string {
    return join(this.root, 'docs');
  }

  public planPath(): string {
    return join(this.root, 'plan.json');
  }

  public planCachePath(prdHash: string): string {
    return join(this.baseDir, '.plan-cache', `${prdHash}.json`);
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

  public taskIntegrationDir(taskId: string): string {
    return join(this.taskDir(taskId), 'integration');
  }

  public taskHoppscotchCollectionPath(taskId: string): string {
    return join(this.taskIntegrationDir(taskId), 'collection.json');
  }

  public taskIntegrationResultsPath(taskId: string): string {
    return join(this.taskDir(taskId), 'integration-results.json');
  }

  public hoppscotchPath(): string {
    return join(this.docsDir(), 'hoppscotch-collection.json');
  }

  public runLogPath(): string {
    return join(this.root, 'logs', 'run.log');
  }

  public iterationLogPath(taskId: string, iteration: number): string {
    return join(this.iterationDir(taskId, iteration), 'iteration.log');
  }

  public qaKnowledgePath(): string {
    return join(this.root, `qa-knowledge.md`);
  }

  public taskQaKnowledgePath(taskId: string): string {
    return join(this.taskDir(taskId), `qa-knowledge.md`);
  }

  public reportPath(): string {
    return join(this.root, `report.md`);
  }
}
