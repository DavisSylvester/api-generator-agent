export class CycleError extends Error {

  public readonly cycle: readonly string[];

  constructor(cycle: readonly string[]) {
    super(`Cycle detected in task graph: ${cycle.join(' -> ')}`);
    this.name = 'CycleError';
    this.cycle = cycle;
  }
}
