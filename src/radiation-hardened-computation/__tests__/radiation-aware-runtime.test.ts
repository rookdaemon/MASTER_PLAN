/**
 * Radiation-Aware Runtime — TDD Tests
 *
 * Tests for all 6 Behavioral Spec scenarios and acceptance criteria
 * from plan/0.2.1.1.2-radiation-aware-runtime.md
 *
 * RED phase: these tests should all fail until implementation exists.
 */

import { describe, it, expect, vi } from "vitest";
import {
  AlertLevel,
  ParticleType,
  type FluxSource,
  type FluxMeasurement,
  type Clock,
  type RuntimeConfig,
  type SafeModeListener,
} from "../types.js";
import { RadiationAwareRuntimeImpl } from "../radiation-aware-runtime.js";

// ── Test Helpers ────────────────────────────────────────────────────────────

/** Creates a deterministic FluxSource that returns flux values in sequence */
function createMockFluxSource(fluxValues: number[]): FluxSource {
  let index = 0;
  return {
    readFlux(): FluxMeasurement {
      const flux = index < fluxValues.length ? fluxValues[index] : fluxValues[fluxValues.length - 1];
      index++;
      return {
        particlesPerCm2PerSec: flux,
        particleType: ParticleType.Proton,
        energy_MeV: 100,
      };
    },
  };
}

/** Creates a deterministic Clock that returns controlled time values */
function createMockClock(startTime: number = 0): { clock: Clock; advance: (ms: number) => void } {
  let currentTime = startTime;
  return {
    clock: {
      now(): number {
        return currentTime;
      },
    },
    advance(ms: number) {
      currentTime += ms;
    },
  };
}

/** Default test config matching Threshold Registry values */
const DEFAULT_TEST_CONFIG: RuntimeConfig = {
  elevatedThreshold_particlesPerCm2PerSec: 100,
  stormThreshold_particlesPerCm2PerSec: 100000, // 10^5
  monitorInterval_ms: 1000,
  holdOffDuration_ms: 300000, // 5 minutes
  nominalScrubRate: 1,
  burstScrubMultiplier: 10,
  safeModeEntryTimeout_ms: 5000,
};

// ── Constructor Postconditions ──────────────────────────────────────────────

describe("RadiationAwareRuntime — Constructor Postconditions", () => {
  it("starts with NOMINAL alert level", () => {
    const fluxSource = createMockFluxSource([0]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    expect(runtime.alertLevel()).toBe(AlertLevel.Nominal);
  });

  it("starts with nominal scrub rate", () => {
    const fluxSource = createMockFluxSource([0]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    expect(runtime.scrubRate()).toBe(1);
  });

  it("starts not in safe mode", () => {
    const fluxSource = createMockFluxSource([0]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    expect(runtime.isInSafeMode()).toBe(false);
  });
});

// ── Constructor Precondition Guards ─────────────────────────────────────────

describe("RadiationAwareRuntime — Constructor Precondition Guards", () => {
  it("throws if fluxSource is null", () => {
    const { clock } = createMockClock();
    expect(() => new RadiationAwareRuntimeImpl(null as any, DEFAULT_TEST_CONFIG, clock)).toThrow();
  });

  it("throws if elevatedThreshold >= stormThreshold", () => {
    const fluxSource = createMockFluxSource([0]);
    const { clock } = createMockClock();
    const badConfig = { ...DEFAULT_TEST_CONFIG, elevatedThreshold_particlesPerCm2PerSec: 200000 };
    expect(() => new RadiationAwareRuntimeImpl(fluxSource, badConfig, clock)).toThrow();
  });

  it("throws if thresholds are not positive", () => {
    const fluxSource = createMockFluxSource([0]);
    const { clock } = createMockClock();
    const badConfig = { ...DEFAULT_TEST_CONFIG, elevatedThreshold_particlesPerCm2PerSec: -1 };
    expect(() => new RadiationAwareRuntimeImpl(fluxSource, badConfig, clock)).toThrow();
  });

  it("throws if monitorInterval_ms <= 0", () => {
    const fluxSource = createMockFluxSource([0]);
    const { clock } = createMockClock();
    const badConfig = { ...DEFAULT_TEST_CONFIG, monitorInterval_ms: 0 };
    expect(() => new RadiationAwareRuntimeImpl(fluxSource, badConfig, clock)).toThrow();
  });

  it("throws if holdOffDuration_ms <= 0", () => {
    const fluxSource = createMockFluxSource([0]);
    const { clock } = createMockClock();
    const badConfig = { ...DEFAULT_TEST_CONFIG, holdOffDuration_ms: 0 };
    expect(() => new RadiationAwareRuntimeImpl(fluxSource, badConfig, clock)).toThrow();
  });

  it("throws if nominalScrubRate <= 0", () => {
    const fluxSource = createMockFluxSource([0]);
    const { clock } = createMockClock();
    const badConfig = { ...DEFAULT_TEST_CONFIG, nominalScrubRate: 0 };
    expect(() => new RadiationAwareRuntimeImpl(fluxSource, badConfig, clock)).toThrow();
  });

  it("throws if burstScrubMultiplier < 1", () => {
    const fluxSource = createMockFluxSource([0]);
    const { clock } = createMockClock();
    const badConfig = { ...DEFAULT_TEST_CONFIG, burstScrubMultiplier: 0.5 };
    expect(() => new RadiationAwareRuntimeImpl(fluxSource, badConfig, clock)).toThrow();
  });

  it("throws if clock is null", () => {
    const fluxSource = createMockFluxSource([0]);
    expect(() => new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, null as any)).toThrow();
  });
});

// ── Acceptance Criteria: Alert Level Classification ─────────────────────────

describe("RadiationAwareRuntime — Alert Level Classification", () => {
  it("classifies flux of 4 as NOMINAL", () => {
    const fluxSource = createMockFluxSource([4]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    runtime.evaluateFlux();
    expect(runtime.alertLevel()).toBe(AlertLevel.Nominal);
  });

  it("classifies flux of 200 as ELEVATED", () => {
    const fluxSource = createMockFluxSource([200]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    runtime.evaluateFlux();
    expect(runtime.alertLevel()).toBe(AlertLevel.Elevated);
  });

  it("classifies flux of 200000 as STORM", () => {
    const fluxSource = createMockFluxSource([200000]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    runtime.evaluateFlux();
    expect(runtime.alertLevel()).toBe(AlertLevel.Storm);
  });

  it("classifies flux at exact elevated threshold (100) as ELEVATED", () => {
    const fluxSource = createMockFluxSource([100]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    runtime.evaluateFlux();
    expect(runtime.alertLevel()).toBe(AlertLevel.Elevated);
  });

  it("classifies flux at exact storm threshold (100000) as STORM", () => {
    const fluxSource = createMockFluxSource([100000]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    runtime.evaluateFlux();
    expect(runtime.alertLevel()).toBe(AlertLevel.Storm);
  });
});

// ── Scenario 1: Gradual Escalation NOMINAL → ELEVATED → STORM ──────────────

describe("Scenario 1: Gradual Escalation NOMINAL → ELEVATED → STORM", () => {
  it("transitions through NOMINAL → ELEVATED → STORM across three cycles", () => {
    const fluxSource = createMockFluxSource([4, 200, 200000]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    // Cycle 1: flux = 4 → NOMINAL
    runtime.evaluateFlux();
    expect(runtime.alertLevel()).toBe(AlertLevel.Nominal);
    expect(runtime.scrubRate()).toBe(1); // nominal
    expect(runtime.isInSafeMode()).toBe(false);

    // Cycle 2: flux = 200 → ELEVATED
    runtime.evaluateFlux();
    expect(runtime.alertLevel()).toBe(AlertLevel.Elevated);
    expect(runtime.scrubRate()).toBe(1); // still nominal
    expect(runtime.isInSafeMode()).toBe(false);

    // Cycle 3: flux = 200000 → STORM
    runtime.evaluateFlux();
    expect(runtime.alertLevel()).toBe(AlertLevel.Storm);
    expect(runtime.scrubRate()).toBe(10); // nominalRate × burstScrubMultiplier
    expect(runtime.isInSafeMode()).toBe(true);
  });

  it("invokes safe mode entry listeners on STORM transition", () => {
    const fluxSource = createMockFluxSource([4, 200, 200000]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    const entryListener = vi.fn();
    runtime.onSafeModeEntry(entryListener);

    runtime.evaluateFlux(); // NOMINAL
    runtime.evaluateFlux(); // ELEVATED
    expect(entryListener).not.toHaveBeenCalled();

    runtime.evaluateFlux(); // STORM
    expect(entryListener).toHaveBeenCalledTimes(1);
  });
});

// ── Scenario 2: Emergency Direct Transition NOMINAL → STORM ─────────────────

describe("Scenario 2: Emergency Direct Transition NOMINAL → STORM", () => {
  it("transitions directly from NOMINAL to STORM when flux exceeds storm threshold", () => {
    const fluxSource = createMockFluxSource([4, 500000]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    runtime.evaluateFlux(); // NOMINAL (flux = 4)
    expect(runtime.alertLevel()).toBe(AlertLevel.Nominal);

    runtime.evaluateFlux(); // STORM directly (flux = 500000)
    expect(runtime.alertLevel()).toBe(AlertLevel.Storm);
    expect(runtime.isInSafeMode()).toBe(true);
    expect(runtime.scrubRate()).toBe(10);
  });

  it("invokes safe mode entry listeners on emergency transition", () => {
    const fluxSource = createMockFluxSource([4, 500000]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    const entryListener = vi.fn();
    runtime.onSafeModeEntry(entryListener);

    runtime.evaluateFlux(); // NOMINAL
    runtime.evaluateFlux(); // emergency STORM
    expect(entryListener).toHaveBeenCalledTimes(1);
  });
});

// ── Scenario 3: Safe Mode Exit with Hold-Off ────────────────────────────────

describe("Scenario 3: Safe Mode Exit with Hold-Off", () => {
  it("transitions STORM → ELEVATED immediately when flux drops, but safe mode remains active", () => {
    const fluxSource = createMockFluxSource([500000, 50, 50, 50, 50]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    runtime.evaluateFlux(); // STORM
    expect(runtime.alertLevel()).toBe(AlertLevel.Storm);
    expect(runtime.isInSafeMode()).toBe(true);

    advance(1000);
    runtime.evaluateFlux(); // flux = 50, below elevated threshold
    expect(runtime.alertLevel()).toBe(AlertLevel.Elevated);
    expect(runtime.isInSafeMode()).toBe(true); // safe mode still active during hold-off
  });

  it("exits safe mode and transitions to NOMINAL after hold-off completes", () => {
    const fluxSource = createMockFluxSource([500000, 50, 50]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    const exitListener = vi.fn();
    runtime.onSafeModeExit(exitListener);

    runtime.evaluateFlux(); // STORM
    advance(1000);
    runtime.evaluateFlux(); // ELEVATED (flux = 50, hold-off starts)
    expect(runtime.isInSafeMode()).toBe(true);
    expect(exitListener).not.toHaveBeenCalled();

    // Advance past hold-off duration
    advance(300000);
    runtime.evaluateFlux(); // flux still 50, hold-off expired
    expect(runtime.alertLevel()).toBe(AlertLevel.Nominal);
    expect(runtime.isInSafeMode()).toBe(false);
    expect(runtime.scrubRate()).toBe(1); // back to nominal
    expect(exitListener).toHaveBeenCalledTimes(1);
  });

  it("invokes exit listeners in reverse registration order", () => {
    const fluxSource = createMockFluxSource([500000, 50, 50]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    const order: string[] = [];
    runtime.onSafeModeExit(() => order.push("A"));
    runtime.onSafeModeExit(() => order.push("B"));
    runtime.onSafeModeExit(() => order.push("C"));

    runtime.evaluateFlux(); // STORM
    advance(1000);
    runtime.evaluateFlux(); // ELEVATED, hold-off starts
    advance(300000);
    runtime.evaluateFlux(); // hold-off expired → exit

    expect(order).toEqual(["C", "B", "A"]);
  });
});

// ── Scenario 4: Hold-Off Reset on Flux Spike ────────────────────────────────

describe("Scenario 4: Hold-Off Reset on Flux Spike", () => {
  it("resets hold-off timer and returns to STORM when flux re-exceeds storm threshold", () => {
    // Sequence: STORM → flux drops → hold-off running → flux spikes back → STORM
    const fluxSource = createMockFluxSource([500000, 50, 500000, 50, 50]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    const exitListener = vi.fn();
    runtime.onSafeModeExit(exitListener);

    runtime.evaluateFlux(); // STORM
    expect(runtime.alertLevel()).toBe(AlertLevel.Storm);

    advance(1000);
    runtime.evaluateFlux(); // ELEVATED (flux = 50), hold-off starts
    expect(runtime.alertLevel()).toBe(AlertLevel.Elevated);
    expect(runtime.isInSafeMode()).toBe(true);

    // Advance 200000ms into hold-off (not complete yet)
    advance(200000);
    runtime.evaluateFlux(); // flux spikes to 500000 → STORM again
    expect(runtime.alertLevel()).toBe(AlertLevel.Storm);
    expect(runtime.isInSafeMode()).toBe(true);

    // Now drop again — hold-off must restart from zero
    advance(1000);
    runtime.evaluateFlux(); // ELEVATED (flux = 50), NEW hold-off starts
    expect(runtime.alertLevel()).toBe(AlertLevel.Elevated);
    expect(runtime.isInSafeMode()).toBe(true);

    // Advance only 200000ms — not enough for NEW hold-off
    advance(200000);
    runtime.evaluateFlux(); // flux still 50, but hold-off not complete
    expect(runtime.isInSafeMode()).toBe(true);
    expect(exitListener).not.toHaveBeenCalled();
  });
});

// ── Scenario 5: Listener Invocation Order ───────────────────────────────────

describe("Scenario 5: Listener Invocation Order", () => {
  it("invokes entry listeners in registration order (A, B, C)", () => {
    const fluxSource = createMockFluxSource([500000]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    const order: string[] = [];
    runtime.onSafeModeEntry(() => order.push("A"));
    runtime.onSafeModeEntry(() => order.push("B"));
    runtime.onSafeModeEntry(() => order.push("C"));

    runtime.evaluateFlux(); // STORM
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("invokes exit listeners in reverse registration order (C, B, A)", () => {
    const fluxSource = createMockFluxSource([500000, 50, 50]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    const order: string[] = [];
    runtime.onSafeModeExit(() => order.push("A"));
    runtime.onSafeModeExit(() => order.push("B"));
    runtime.onSafeModeExit(() => order.push("C"));

    runtime.evaluateFlux(); // STORM
    advance(1000);
    runtime.evaluateFlux(); // ELEVATED, hold-off starts
    advance(300000);
    runtime.evaluateFlux(); // hold-off expired, exit

    expect(order).toEqual(["C", "B", "A"]);
  });
});

// ── Scenario 6: Forbidden STORM → NOMINAL Transition ────────────────────────

describe("Scenario 6: Forbidden STORM → NOMINAL Transition", () => {
  it("transitions to ELEVATED (not NOMINAL) when flux drops from STORM to below all thresholds", () => {
    const fluxSource = createMockFluxSource([500000, 2]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    runtime.evaluateFlux(); // STORM
    expect(runtime.alertLevel()).toBe(AlertLevel.Storm);

    advance(1000);
    runtime.evaluateFlux(); // flux = 2, below all thresholds
    // Must go to ELEVATED, NOT NOMINAL (forbidden direct de-escalation)
    expect(runtime.alertLevel()).toBe(AlertLevel.Elevated);
    expect(runtime.isInSafeMode()).toBe(true);
  });

  it("only transitions to NOMINAL after hold-off completes", () => {
    const fluxSource = createMockFluxSource([500000, 2, 2]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    runtime.evaluateFlux(); // STORM
    advance(1000);
    runtime.evaluateFlux(); // ELEVATED (forbidden STORM → NOMINAL)
    advance(300000);
    runtime.evaluateFlux(); // hold-off expired → NOMINAL
    expect(runtime.alertLevel()).toBe(AlertLevel.Nominal);
    expect(runtime.isInSafeMode()).toBe(false);
  });
});

// ── Invariants ──────────────────────────────────────────────────────────────

describe("RadiationAwareRuntime — Invariants", () => {
  it("scrubRate is always > 0", () => {
    const fluxSource = createMockFluxSource([0, 200, 500000, 50, 50]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    for (let i = 0; i < 5; i++) {
      runtime.evaluateFlux();
      expect(runtime.scrubRate()).toBeGreaterThan(0);
      advance(1000);
    }
  });

  it("currentFlux returns the most recent reading after evaluateFlux", () => {
    const fluxSource = createMockFluxSource([4, 200]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    runtime.evaluateFlux();
    expect(runtime.currentFlux().particlesPerCm2PerSec).toBe(4);

    runtime.evaluateFlux();
    expect(runtime.currentFlux().particlesPerCm2PerSec).toBe(200);
  });

  it("alert level is always one of NOMINAL, ELEVATED, STORM", () => {
    const fluxSource = createMockFluxSource([0, 100, 100000, 50, 0]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);
    const validLevels = [AlertLevel.Nominal, AlertLevel.Elevated, AlertLevel.Storm];

    for (let i = 0; i < 5; i++) {
      runtime.evaluateFlux();
      expect(validLevels).toContain(runtime.alertLevel());
      advance(1000);
    }
  });
});

// ── Burst Scrubbing ─────────────────────────────────────────────────────────

describe("RadiationAwareRuntime — Burst Scrubbing", () => {
  it("sets scrub rate to nominalScrubRate × burstScrubMultiplier during STORM", () => {
    const config = { ...DEFAULT_TEST_CONFIG, nominalScrubRate: 2, burstScrubMultiplier: 15 };
    const fluxSource = createMockFluxSource([500000]);
    const { clock } = createMockClock();
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, config, clock);

    runtime.evaluateFlux();
    expect(runtime.scrubRate()).toBe(30); // 2 × 15
  });

  it("returns scrub rate to nominal after safe mode exit", () => {
    const fluxSource = createMockFluxSource([500000, 50, 50]);
    const { clock, advance } = createMockClock(0);
    const runtime = new RadiationAwareRuntimeImpl(fluxSource, DEFAULT_TEST_CONFIG, clock);

    runtime.evaluateFlux(); // STORM
    expect(runtime.scrubRate()).toBe(10);

    advance(1000);
    runtime.evaluateFlux(); // ELEVATED
    advance(300000);
    runtime.evaluateFlux(); // NOMINAL (hold-off expired)
    expect(runtime.scrubRate()).toBe(1);
  });
});
