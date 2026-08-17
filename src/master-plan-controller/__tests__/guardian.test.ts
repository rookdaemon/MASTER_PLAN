import { describe, expect, it } from 'vitest';
import { Guardian } from '../guardian.js';
import { InMemoryClock, InMemoryScheduler } from '../testing/in-memory-adapters.js';
import { CONFIG, NOW } from './fixtures.js';

describe('Guardian', () => {
  it('runs bounded autonomous controller cycles with injected time and cooldown', async () => {
    const observedAt: string[] = [];
    const clock = new InMemoryClock(NOW);
    const scheduler = new InMemoryScheduler();
    const guardian = new Guardian(
      { async runCycle(now) {
        observedAt.push(now);
        return { status: 'waiting', selectedPacketId: null, rejections: [] };
      } },
      clock,
      scheduler,
      CONFIG,
    );

    await guardian.run({ shouldContinue: (completed) => completed < 2 });

    expect(observedAt).toEqual([NOW, NOW]);
    expect(scheduler.waits).toEqual([CONFIG.cooldownMs]);
  });

  it('can stop after one bounded cycle without scheduling another', async () => {
    const scheduler = new InMemoryScheduler();
    let cycles = 0;
    const guardian = new Guardian(
      { async runCycle() {
        cycles += 1;
        return { status: 'waiting', selectedPacketId: null, rejections: [] };
      } },
      new InMemoryClock(NOW),
      scheduler,
      CONFIG,
    );

    await guardian.run({ shouldContinue: (completed) => completed < 1 });

    expect(cycles).toBe(1);
    expect(scheduler.waits).toEqual([]);
  });
});
