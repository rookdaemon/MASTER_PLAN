import type { ClockPort, SchedulerPort } from './ports.js';
import type { CycleResult } from './runner.js';
import type { ControllerConfig, Timestamp } from './types.js';

export interface CyclePort {
  runCycle(now: Timestamp): Promise<CycleResult>;
}

export interface LoopControl {
  shouldContinue(completedCycles: number): boolean;
}

export class ContinuousLoop {
  constructor(
    private readonly cycles: CyclePort,
    private readonly clock: ClockPort,
    private readonly scheduler: SchedulerPort,
    private readonly config: ControllerConfig,
  ) {}

  async run(control: LoopControl): Promise<void> {
    let completedCycles = 0;
    while (control.shouldContinue(completedCycles)) {
      await this.cycles.runCycle(this.clock.now());
      completedCycles += 1;
      if (!control.shouldContinue(completedCycles)) return;
      await this.scheduler.wait(this.config.cooldownMs);
    }
  }
}
