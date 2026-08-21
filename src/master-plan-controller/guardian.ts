import type { ClockPort, SchedulerPort } from './ports.js';
import type { CycleResult } from './runner.js';
import type { ControllerConfig, Timestamp } from './types.js';

export interface GuardianCyclePort {
  runCycle(now: Timestamp): Promise<CycleResult>;
}

export interface GuardianControl {
  shouldContinue(completedCycles: number): boolean;
}

/**
 * The autonomous operating loop for the strategy controller.
 *
 * Production scheduling, filesystem access, execution, review, and publication remain outside
 * this class and enter through injected ports. Each iteration is one bounded controller cycle.
 */
export class Guardian {
  constructor(
    private readonly cycles: GuardianCyclePort,
    private readonly clock: ClockPort,
    private readonly scheduler: SchedulerPort,
    private readonly config: ControllerConfig,
  ) {}

  async run(control: GuardianControl): Promise<void> {
    let completedCycles = 0;
    while (control.shouldContinue(completedCycles)) {
      await this.cycles.runCycle(this.clock.now());
      completedCycles += 1;
      if (!control.shouldContinue(completedCycles)) return;
      await this.scheduler.wait(this.config.cooldownMs);
    }
  }
}
