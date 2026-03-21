/**
 * Graceful Degradation — SynthHealthMonitor Contract Tests
 *
 * Verifies every postcondition and invariant from the SynthHealthMonitor contract
 * specified in card 0.2.2.4.3.
 *
 * Card: 0.2.2.4.3
 */
import { describe, it, expect } from "vitest";
import { SynthFailureType, type ModuleId } from "../types.js";
import {
  DefaultSynthHealthMonitor,
  type Clock,
  type SynthSignalSource,
  type SynthMonitorConfig,
} from "../synth-health-monitor.js";

// ── Test Helpers ──────────────────────────────────────────────────────────────

function moduleId(name: string): ModuleId {
  return name as ModuleId;
}

function makeClock(now = 10_000): Clock & { advance(ms: number): void } {
  let t = now;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

interface ModuleState {
  health?: number;
  errorRate?: number;
  watchdogResponded?: boolean;
  lastResponseTimestamp_ms?: number;
}

/**
 * Builds a SynthSignalSource from a map of per-module states.
 * Falls back to fully-healthy defaults for any unspecified field.
 */
function makeSignalSource(
  states: Record<string, ModuleState>,
  temperature_K = 298.15, // 25 °C — safely within operating range
): SynthSignalSource {
  return {
    getModuleHealth: (id, _ts) => states[id as string]?.health ?? 1.0,
    getErrorRate: (id, _ts) => states[id as string]?.errorRate ?? 0.0,
    getWatchdogResponse: (id, _ts) => ({
      responded: states[id as string]?.watchdogResponded ?? true,
      lastResponseTimestamp_ms:
        states[id as string]?.lastResponseTimestamp_ms ?? _ts,
    }),
    getTemperature: (_ts) => temperature_K,
  };
}

function makeMonitor(
  moduleIds: ModuleId[],
  states: Record<string, ModuleState>,
  clockNow?: number,
  config?: SynthMonitorConfig,
  temperature_K?: number,
): DefaultSynthHealthMonitor {
  return new DefaultSynthHealthMonitor(
    moduleIds,
    makeSignalSource(states, temperature_K),
    makeClock(clockNow ?? 10_000),
    config,
  );
}

// ── moduleHealth postcondition ────────────────────────────────────────────────

describe("SynthHealthMonitor.moduleHealth", () => {
  it("returns a value in [0.0, 1.0] for a registered module", () => {
    const m = moduleId("cpu");
    const monitor = makeMonitor([m], { cpu: { health: 0.85 } });
    const score = monitor.moduleHealth(m);
    expect(score).toBeGreaterThanOrEqual(0.0);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("returns 1.0 for a fully-healthy module", () => {
    const m = moduleId("cpu");
    const monitor = makeMonitor([m], { cpu: { health: 1.0 } });
    expect(monitor.moduleHealth(m)).toBe(1.0);
  });

  it("clamps raw health values to [0, 1]", () => {
    const m = moduleId("cpu");
    // Raw signal returns out-of-range values — the monitor must clamp
    const source: SynthSignalSource = {
      getModuleHealth: () => 1.5, // above max
      getErrorRate: () => 0,
      getWatchdogResponse: (_id, ts) => ({ responded: true, lastResponseTimestamp_ms: ts }),
      getTemperature: () => 298.15,
    };
    const monitor = new DefaultSynthHealthMonitor([m], source, makeClock());
    expect(monitor.moduleHealth(m)).toBe(1.0);
  });

  it("returns 0.0 when the watchdog override is triggered (2 missed cycles)", () => {
    const m = moduleId("fpga");
    const clock = makeClock(10_000);
    // lastResponseTimestamp_ms = 0 means the module last responded at t=0
    // At t=10_000, with watchdogCycleDuration_ms=2 and threshold=2, deadline=4ms
    // 10_000 - 0 = 10_000 >> 4ms → watchdog override fires
    const source: SynthSignalSource = {
      getModuleHealth: () => 0.9, // raw health looks fine…
      getErrorRate: () => 0,
      getWatchdogResponse: () => ({ responded: false, lastResponseTimestamp_ms: 0 }),
      getTemperature: () => 298.15,
    };
    const monitor = new DefaultSynthHealthMonitor([m], source, clock);
    expect(monitor.moduleHealth(m)).toBe(0.0);
  });

  it("does NOT apply watchdog override when module did respond recently", () => {
    const m = moduleId("gpu");
    const clock = makeClock(10_000);
    // responded=false but lastResponseTimestamp_ms is recent (only 1ms ago)
    // deadline = 2 cycles × 2ms = 4ms → 1ms < 4ms → no override
    const source: SynthSignalSource = {
      getModuleHealth: () => 0.75,
      getErrorRate: () => 0,
      getWatchdogResponse: () => ({
        responded: false,
        lastResponseTimestamp_ms: 10_000 - 1,
      }),
      getTemperature: () => 298.15,
    };
    const monitor = new DefaultSynthHealthMonitor([m], source, clock);
    expect(monitor.moduleHealth(m)).toBe(0.75);
  });
});

// ── overallSynthHealth invariant ──────────────────────────────────────────────

describe("SynthHealthMonitor.overallSynthHealth", () => {
  it("returns 0.0 when no modules are registered", () => {
    const monitor = makeMonitor([], {});
    expect(monitor.overallSynthHealth()).toBe(0.0);
  });

  it("returns the single module's health when only one module is registered", () => {
    const m = moduleId("cpu");
    const monitor = makeMonitor([m], { cpu: { health: 0.72 } });
    const overall = monitor.overallSynthHealth();
    const individual = monitor.moduleHealth(m);
    expect(overall).toBeCloseTo(individual, 5);
  });

  it("returns the minimum health across all modules (invariant)", () => {
    const healthy = moduleId("cpu");
    const degraded = moduleId("fpga");
    const monitor = makeMonitor(
      [healthy, degraded],
      { cpu: { health: 0.95 }, fpga: { health: 0.30 } },
    );
    const overall = monitor.overallSynthHealth();
    const healthyScore = monitor.moduleHealth(healthy);
    const degradedScore = monitor.moduleHealth(degraded);

    expect(overall).toBeLessThanOrEqual(healthyScore);
    expect(overall).toBeLessThanOrEqual(degradedScore);
    expect(overall).toBeCloseTo(degradedScore, 5);
  });

  it("returns 0.0 when any module is failed via watchdog override", () => {
    const m1 = moduleId("cpu");
    const m2 = moduleId("fpga");
    const clock = makeClock(10_000);
    const source: SynthSignalSource = {
      getModuleHealth: (id) => id === (m2 as string) ? 0.9 : 1.0,
      getErrorRate: () => 0,
      getWatchdogResponse: (id, _ts) =>
        id === (m2 as string)
          ? { responded: false, lastResponseTimestamp_ms: 0 }  // failed watchdog
          : { responded: true, lastResponseTimestamp_ms: _ts },
      getTemperature: () => 298.15,
    };
    const monitor = new DefaultSynthHealthMonitor([m1, m2], source, clock);
    expect(monitor.overallSynthHealth()).toBe(0.0);
  });
});

// ── failureType postconditions and invariants ─────────────────────────────────

describe("SynthHealthMonitor.failureType", () => {
  it("returns NONE when all modules are healthy (≥ 0.5)", () => {
    const m = moduleId("cpu");
    const monitor = makeMonitor([m], { cpu: { health: 0.9 } });
    expect(monitor.failureType()).toBe(SynthFailureType.None);
  });

  it("returns HARD_FAULT when any module health = 0.0", () => {
    const m = moduleId("fpga");
    const monitor = makeMonitor([m], { fpga: { health: 0.0 } });
    expect(monitor.failureType()).toBe(SynthFailureType.HardFault);
  });

  it("returns HARD_FAULT when watchdog override makes health = 0.0", () => {
    const m = moduleId("fpga");
    const clock = makeClock(10_000);
    const source: SynthSignalSource = {
      getModuleHealth: () => 0.9,
      getErrorRate: () => 0,
      getWatchdogResponse: () => ({ responded: false, lastResponseTimestamp_ms: 0 }),
      getTemperature: () => 298.15,
    };
    const monitor = new DefaultSynthHealthMonitor([m], source, clock);
    expect(monitor.failureType()).toBe(SynthFailureType.HardFault);
  });

  it("returns DEGRADED when any module has 0.0 < health < 0.5", () => {
    const m = moduleId("gpu");
    const monitor = makeMonitor([m], { gpu: { health: 0.3 } });
    expect(monitor.failureType()).toBe(SynthFailureType.Degraded);
  });

  it("HARD_FAULT takes priority over DEGRADED when both conditions coexist", () => {
    const failed = moduleId("fpga");
    const degraded = moduleId("gpu");
    const monitor = makeMonitor(
      [failed, degraded],
      { fpga: { health: 0.0 }, gpu: { health: 0.3 } },
    );
    expect(monitor.failureType()).toBe(SynthFailureType.HardFault);
  });

  it("returns NONE when all module health scores equal exactly 0.5 (boundary)", () => {
    const m = moduleId("cpu");
    const monitor = makeMonitor([m], { cpu: { health: 0.5 } });
    expect(monitor.failureType()).toBe(SynthFailureType.None);
  });
});

// ── watchdogStatus postconditions ─────────────────────────────────────────────

describe("SynthHealthMonitor.watchdogStatus", () => {
  it("reports allResponding=true when all modules are responsive", () => {
    const m = moduleId("cpu");
    const monitor = makeMonitor([m], { cpu: { watchdogResponded: true } });
    const report = monitor.watchdogStatus();
    expect(report.allResponding).toBe(true);
    expect(report.unresponsiveModules).toHaveLength(0);
  });

  it("lists unresponsive modules that exceeded the missed-cycles deadline", () => {
    const m1 = moduleId("cpu");
    const m2 = moduleId("fpga");
    const clock = makeClock(10_000);
    // fpga: not responded, last response was at t=0 (well beyond the 4ms deadline)
    const source: SynthSignalSource = {
      getModuleHealth: () => 1.0,
      getErrorRate: () => 0,
      getWatchdogResponse: (id, _ts) =>
        id === (m2 as string)
          ? { responded: false, lastResponseTimestamp_ms: 0 }
          : { responded: true, lastResponseTimestamp_ms: _ts },
      getTemperature: () => 298.15,
    };
    const monitor = new DefaultSynthHealthMonitor([m1, m2], source, clock);
    const report = monitor.watchdogStatus();
    expect(report.allResponding).toBe(false);
    expect(report.unresponsiveModules).toContain(m2);
    expect(report.unresponsiveModules).not.toContain(m1);
  });

  it("does NOT include a module that last responded within the deadline", () => {
    const m = moduleId("gpu");
    const clock = makeClock(10_000);
    // last response 1ms ago — within the 4ms deadline
    const source: SynthSignalSource = {
      getModuleHealth: () => 1.0,
      getErrorRate: () => 0,
      getWatchdogResponse: () => ({
        responded: false,
        lastResponseTimestamp_ms: 10_000 - 1,
      }),
      getTemperature: () => 298.15,
    };
    const monitor = new DefaultSynthHealthMonitor([m], source, clock);
    const report = monitor.watchdogStatus();
    expect(report.allResponding).toBe(true);
    expect(report.unresponsiveModules).toHaveLength(0);
  });

  it("records the current timestamp in lastCheckTimestamp_ms", () => {
    const m = moduleId("cpu");
    const clock = makeClock(42_000);
    const monitor = new DefaultSynthHealthMonitor(
      [m],
      makeSignalSource({ cpu: {} }),
      clock,
    );
    expect(monitor.watchdogStatus().lastCheckTimestamp_ms).toBe(42_000);
  });
});

// ── thermalStatus postconditions ──────────────────────────────────────────────

describe("SynthHealthMonitor.thermalStatus", () => {
  it("reports withinOperatingRange=true at 25 °C (298.15 K)", () => {
    const monitor = makeMonitor([], {}, undefined, undefined, 298.15);
    const report = monitor.thermalStatus();
    expect(report.temperature_K).toBe(298.15);
    expect(report.withinOperatingRange).toBe(true);
  });

  it("reports withinOperatingRange=false when above maxOperatingTemp_K (85 °C = 358.15 K)", () => {
    const monitor = makeMonitor([], {}, undefined, undefined, 360);
    expect(monitor.thermalStatus().withinOperatingRange).toBe(false);
  });

  it("reports withinOperatingRange=false when below minOperatingTemp_K (−40 °C = 233.15 K)", () => {
    const monitor = makeMonitor([], {}, undefined, undefined, 230);
    expect(monitor.thermalStatus().withinOperatingRange).toBe(false);
  });

  it("is configurable: custom min/max override defaults", () => {
    // Very narrow operating range: 290 K–300 K
    const m = moduleId("cpu");
    const monitor = new DefaultSynthHealthMonitor(
      [m],
      makeSignalSource({ cpu: {} }, 295),
      makeClock(),
      { minOperatingTemp_K: 290, maxOperatingTemp_K: 300 },
    );
    expect(monitor.thermalStatus().withinOperatingRange).toBe(true);
    const monitorTooHot = new DefaultSynthHealthMonitor(
      [m],
      makeSignalSource({ cpu: {} }, 305),
      makeClock(),
      { minOperatingTemp_K: 290, maxOperatingTemp_K: 300 },
    );
    expect(monitorTooHot.thermalStatus().withinOperatingRange).toBe(false);
  });
});

// ── errorRate passthrough ─────────────────────────────────────────────────────

describe("SynthHealthMonitor.errorRate", () => {
  it("returns the error rate from the signal source", () => {
    const m = moduleId("cpu");
    const monitor = makeMonitor([m], { cpu: { errorRate: 0.42 } });
    expect(monitor.errorRate(m)).toBeCloseTo(0.42, 5);
  });

  it("returns 0.0 when no errors are occurring", () => {
    const m = moduleId("gpu");
    const monitor = makeMonitor([m], { gpu: { errorRate: 0.0 } });
    expect(monitor.errorRate(m)).toBe(0.0);
  });
});
