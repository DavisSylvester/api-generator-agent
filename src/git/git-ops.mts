import type { Logger } from "winston";
import type { Result } from "../types/result.mts";
import { ok, err } from "../types/result.mts";

export class GitOps {

  private readonly projectDir: string;
  private readonly logger: Logger;
  private lastGoodCommit: string | undefined;

  constructor(projectDir: string, logger: Logger) {
    this.projectDir = projectDir;
    this.logger = logger;
  }

  public async init(): Promise<Result<void, Error>> {
    return this.exec(["git", "init"]);
  }

  public async addAll(): Promise<Result<void, Error>> {
    return this.exec(["git", "add", "-A"]);
  }

  public async commit(message: string): Promise<Result<void, Error>> {
    const addResult = await this.addAll();
    if (!addResult.ok) {
      return addResult;
    }

    const hasStagedResult = await this.hasStagedChanges();
    if (!hasStagedResult.ok) {
      return err(hasStagedResult.error);
    }

    if (!hasStagedResult.value) {
      this.logger.info("[git] No staged changes to commit");
      return ok(undefined);
    }

    const commitResult = await this.exec(["git", "commit", "-m", message]);
    if (commitResult.ok) {
      const hashResult = await this.getLastCommitHash();
      if (hashResult.ok) {
        this.lastGoodCommit = hashResult.value;
      }
    }
    return commitResult;
  }

  public async commitFeature(featureName: string): Promise<Result<void, Error>> {
    const message = `feat: add ${featureName}`;
    return this.commit(message);
  }

  public async commitInfrastructure(projectName: string): Promise<Result<void, Error>> {
    const message = `feat: scaffold ${projectName} infrastructure`;
    return this.commit(message);
  }

  public async commitVerified(
    featureName: string,
    verificationPassed: boolean,
  ): Promise<Result<void, Error>> {
    if (!verificationPassed) {
      this.logger.warn(`[git] Skipping commit for "${featureName}" — verification failed`);
      return ok(undefined);
    }
    return this.commitFeature(featureName);
  }

  public async getLastCommitHash(): Promise<Result<string, Error>> {
    try {
      const proc = Bun.spawn(
        ["git", "rev-parse", "HEAD"],
        { cwd: this.projectDir, stdout: "pipe", stderr: "pipe" },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        return err(new Error("No commits yet"));
      }
      const hash = (await new Response(proc.stdout).text()).trim();
      return ok(hash);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public async getLastGoodCommit(): Promise<string | undefined> {
    if (this.lastGoodCommit) {
      return this.lastGoodCommit;
    }
    const hashResult = await this.getLastCommitHash();
    return hashResult.ok ? hashResult.value : undefined;
  }

  public async rollbackToCommit(hash: string): Promise<Result<void, Error>> {
    this.logger.warn(`[git] Rolling back to commit ${hash}`);
    return this.exec(["git", "reset", "--hard", hash]);
  }

  public async rollbackToLastGood(): Promise<Result<void, Error>> {
    const hash = await this.getLastGoodCommit();
    if (!hash) {
      return err(new Error("No last good commit found to rollback to"));
    }
    return this.rollbackToCommit(hash);
  }

  public async saveCheckpoint(): Promise<Result<string, Error>> {
    const hashResult = await this.getLastCommitHash();
    if (hashResult.ok) {
      this.lastGoodCommit = hashResult.value;
      this.logger.info(`[git] Checkpoint saved: ${hashResult.value}`);
    }
    return hashResult;
  }

  public async getLog(count: number): Promise<Result<string[], Error>> {
    try {
      const proc = Bun.spawn(
        ["git", "log", `--oneline`, `-${count}`],
        { cwd: this.projectDir, stdout: "pipe", stderr: "pipe" },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        return err(new Error("Git log failed"));
      }
      const stdout = (await new Response(proc.stdout).text()).trim();
      const lines = stdout.split("\n").filter((l) => l.length > 0);
      return ok(lines);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async hasStagedChanges(): Promise<Result<boolean, Error>> {
    try {
      const proc = Bun.spawn(
        ["git", "diff", "--cached", "--name-only"],
        { cwd: this.projectDir, stdout: "pipe", stderr: "pipe" },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        return err(new Error("Git diff failed"));
      }
      const stdout = (await new Response(proc.stdout).text()).trim();
      return ok(stdout.length > 0);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async exec(args: string[]): Promise<Result<void, Error>> {
    try {
      const proc = Bun.spawn(args, {
        cwd: this.projectDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        return err(new Error(`Git command failed (${args.join(" ")}): ${stderr.trim()}`));
      }

      this.logger.info(`[git] ${args.join(" ")}`);
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
