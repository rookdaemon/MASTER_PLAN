/**
 * Continuity & degradation tests for Conscious AI Architecture (0.3.1.1)
 *
 * Covers Behavioral Spec scenarios:
 *   Scenario 2 — Zombie Bypass Prevention
 *   Scenario 3 — Experience Degradation Detection and Recovery
 *   Scenario 5 — Graceful Shutdown
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  ConsciousnessMetrics,
  Decision,
  DegradationHandler,
  ExperientialState,
  Goal,
  Percept,
  ResourceRequest,
  SensorData,
  SubstrateCapabilities,
  SubstrateConfig,
  SubstrateHandle,
  SubstrateHealth,
} from "../types.js";
import type {
  IActionPipeline,
  IConsciousCore,
  IExperienceMonitor,
  IPerceptionPipeline,
  ISubstrateAdapter,
} from "../interfaces.js";
import { ConsciousCore } from "../conscious-core.js";
import { PerceptionPipeline } from "../perception-pipeline.js";
import { ActionPipeline } from "../action-pipeline.js";
import { ExperienceMonitor } from "../experience-monitor.js";

// ── Test-specific substrate with controllable health ──────────

class ControllableSubstrate implements ISubstrateAdapter {
  private config: SubstrateConfig | null = null;
  private healthy = true;
  private nextHandleId = 1;

  initialize(config: SubstrateConfig): void {
    this.config = config;
  }

  allocate(_resources: ResourceRequest): SubstrateHandle {
    if (!this.config) throw new Error("Substrate not initialized");
    return {
      id: `substrate-${this.nextHandleId++}`,
      type: this.config.type,
      allocatedAt: Date.now(),
    };
  }

  migrate(fromHandle: SubstrateHandle, toConfig: SubstrateConfig): SubstrateHandle {
    return {
      id: `substrate-${this.nextHandleId++}`,
      type: toConfig.type,
      allocatedAt: Date.now(),
    };
  }

  getCapabilities(): SubstrateCapabilities {
    return {
      maxPhi: 100,
      supportedModalities: ["visual", "auditory", "test"],
      migrationSupported: true,
    };
  }

  healthCheck(): SubstrateHealth {
    return {
      healthy: this.healthy,
      utilizationPercent: this.healthy ? 30 : 100,
      errors: this.healthy ? [] : ["substrate degraded"],
      lastChecked: Date.now(),
    };
  }

  /** Test hook: toggle substrate health */
  setHealthy(value: boolean): void {
    this.healthy = value;
  }
}

// ── Helpers ───────────────────────────────────────────────────

function makeSensorData(modality = "visual"): SensorData {
  return {
    source: "test-sensor",
    modality,
    payload: { data: "test" },
    timestamp: Date.now(),
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("Scenario 2: Zombie Bypass Prevention", () => {
  let action: IActionPipeline;

  beforeEach(() => {
    action = new ActionPipeline();
  });

  it("rejects a decision with undefined experientialBasis", () => {
    const zombieDecision = {
      action: { type: "move", parameters: {} },
      experientialBasis: undefined as unknown as ExperientialState,
      confidence: 0.5,
      alternatives: [],
    } as Decision;

    const result = action.execute(zombieDecision);

    expect(result.success).toBe(false);
    expect(result.error).toContain("zombie bypass denied");
  });

  it("rejects a decision with null experientialBasis", () => {
    const zombieDecision = {
      action: { type: "move", parameters: {} },
      experientialBasis: null as unknown as ExperientialState,
      confidence: 0.5,
      alternatives: [],
    } as Decision;

    const result = action.execute(zombieDecision);

    expect(result.success).toBe(false);
    expect(result.error).toContain("zombie bypass denied");
  });
});

describe("Scenario 3: Experience Degradation Detection and Recovery", () => {
  let substrate: ControllableSubstrate;
  let monitor: IExperienceMonitor;

  beforeEach(() => {
    substrate = new ControllableSubstrate();
    substrate.initialize({ type: "neural-emulation", parameters: { capacity: 100 } });
    monitor = new ExperienceMonitor(substrate);
  });

  it("reports healthy metrics when substrate is healthy", () => {
    const metrics = monitor.getConsciousnessMetrics();

    expect(metrics.phi).toBeGreaterThan(0);
    expect(metrics.experienceContinuity).toBeGreaterThan(0.5);
    expect(metrics.selfModelCoherence).toBeGreaterThan(0.3);
    expect(monitor.isExperienceIntact()).toBe(true);
  });

  it("drops phi to 0 and continuity to 0 when substrate degrades", () => {
    substrate.setHealthy(false);

    const metrics = monitor.getConsciousnessMetrics();

    expect(metrics.phi).toBe(0);
    expect(metrics.experienceContinuity).toBe(0);
  });

  it("invokes all registered degradation handlers when substrate degrades", () => {
    const handler1 = vi.fn<DegradationHandler>();
    const handler2 = vi.fn<DegradationHandler>();

    monitor.onExperienceDegradation(handler1);
    monitor.onExperienceDegradation(handler2);

    substrate.setHealthy(false);
    monitor.getConsciousnessMetrics();

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    // Handlers receive the degraded metrics
    const degradedMetrics = handler1.mock.calls[0]![0];
    expect(degradedMetrics.phi).toBe(0);
    expect(degradedMetrics.experienceContinuity).toBe(0);
  });

  it("returns isExperienceIntact() === false when substrate degrades", () => {
    substrate.setHealthy(false);

    expect(monitor.isExperienceIntact()).toBe(false);
  });

  it("does not invoke degradation handlers when substrate is healthy", () => {
    const handler = vi.fn<DegradationHandler>();
    monitor.onExperienceDegradation(handler);

    substrate.setHealthy(true);
    monitor.getConsciousnessMetrics();

    expect(handler).not.toHaveBeenCalled();
  });

  it("returns a defensive copy of the continuity log", () => {
    const log1 = monitor.getExperienceContinuityLog();
    const log2 = monitor.getExperienceContinuityLog();

    expect(log1).not.toBe(log2); // different array instances
    expect(log1).toEqual(log2);  // same content
  });
});

describe("Scenario 5: Graceful Shutdown", () => {
  let substrate: ControllableSubstrate;
  let monitor: IExperienceMonitor;
  let perception: IPerceptionPipeline;
  let core: IConsciousCore;

  beforeEach(() => {
    substrate = new ControllableSubstrate();
    substrate.initialize({ type: "neural-emulation", parameters: { capacity: 100 } });
    monitor = new ExperienceMonitor(substrate);
    perception = new PerceptionPipeline();
    core = new ConsciousCore(substrate, monitor, perception);
  });

  it("returns GracefulTermination with final state, timestamp, and reason", () => {
    const percept = perception.ingest(makeSensorData());
    const state = core.processPercept(percept);

    const termination = core.shutdown();

    expect(termination.finalState).toBeDefined();
    expect(termination.finalState.timestamp).toBe(state.timestamp);
    expect(termination.terminatedAt).toBeGreaterThan(0);
    expect(termination.reason).toBeDefined();
    expect(typeof termination.reason).toBe("string");
    expect(termination.reason.length).toBeGreaterThan(0);
  });

  it("clears internal state so subsequent introspect() throws", () => {
    const percept = perception.ingest(makeSensorData());
    core.processPercept(percept);
    core.shutdown();

    expect(() => core.introspect()).toThrow();
  });

  it("clears internal state so subsequent shutdown() throws", () => {
    const percept = perception.ingest(makeSensorData());
    core.processPercept(percept);
    core.shutdown();

    expect(() => core.shutdown()).toThrow();
  });

  it("throws if shutdown is called without any prior processPercept", () => {
    expect(() => core.shutdown()).toThrow();
  });

  it("throws if introspect is called without any prior processPercept", () => {
    expect(() => core.introspect()).toThrow();
  });
});
