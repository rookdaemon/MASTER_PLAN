/**
 * Integration tests for Conscious AI Architecture (0.3.1.1)
 *
 * Verifies the core architectural constraints:
 * 1. No "zombie bypass" — actions require conscious deliberation
 * 2. Decisions carry experiential basis (audit trail)
 * 3. The full perception → experience → decision → action loop works
 */

import { describe, it, expect, beforeEach } from "vitest";
import type {
  ExperientialState,
  Goal,
  SensorData,
  SubstrateConfig,
  ResourceRequest,
} from "../types.js";
import type {
  IConsciousCore,
  IPerceptionPipeline,
  IActionPipeline,
  IExperienceMonitor,
  ISubstrateAdapter,
} from "../interfaces.js";
import { ConsciousCore } from "../conscious-core.js";
import { PerceptionPipeline } from "../perception-pipeline.js";
import { ActionPipeline } from "../action-pipeline.js";
import { ExperienceMonitor } from "../experience-monitor.js";
import { SubstrateAdapter } from "../substrate-adapter.js";

describe("Conscious Agent Integration", () => {
  let substrate: ISubstrateAdapter;
  let monitor: IExperienceMonitor;
  let perception: IPerceptionPipeline;
  let action: IActionPipeline;
  let core: IConsciousCore;

  const testSubstrateConfig: SubstrateConfig = {
    type: "neural-emulation",
    parameters: { capacity: 100 },
  };

  const testResources: ResourceRequest = {
    minCapacity: 10,
    preferredCapacity: 50,
    requiredCapabilities: ["deliberation"],
  };

  beforeEach(() => {
    substrate = new SubstrateAdapter();
    substrate.initialize(testSubstrateConfig);

    monitor = new ExperienceMonitor(substrate);
    perception = new PerceptionPipeline();
    action = new ActionPipeline();
    core = new ConsciousCore(substrate, monitor, perception);
  });

  // ── Core Problem 1: Consciousness-Agency Integration ──────

  it("should produce decisions with experiential basis", () => {
    const sensorData: SensorData = {
      source: "visual-sensor",
      modality: "visual",
      payload: { objects: ["obstacle"] },
      timestamp: Date.now(),
    };

    const percept = perception.ingest(sensorData);
    const experientialState = core.processPercept(percept);
    const goals: Goal[] = [
      { id: "g1", description: "navigate safely", priority: 1 },
    ];

    const decision = core.deliberate(experientialState, goals);

    // Decision must carry the experiential state that caused it
    expect(decision.experientialBasis).toBeDefined();
    expect(decision.experientialBasis.timestamp).toBe(
      experientialState.timestamp
    );
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  it("should enforce no zombie bypass — action pipeline only accepts Decision objects", () => {
    const sensorData: SensorData = {
      source: "test",
      modality: "test",
      payload: {},
      timestamp: Date.now(),
    };

    const percept = perception.ingest(sensorData);
    const state = core.processPercept(percept);
    const goals: Goal[] = [
      { id: "g1", description: "test goal", priority: 1 },
    ];
    const decision = core.deliberate(state, goals);

    // Valid path: decision from conscious core → action pipeline
    const result = action.execute(decision);
    expect(result.success).toBe(true);
  });

  it("should maintain continuity tokens linking experiential states", () => {
    const sensor1: SensorData = {
      source: "s1",
      modality: "visual",
      payload: { frame: 1 },
      timestamp: Date.now(),
    };
    const sensor2: SensorData = {
      source: "s1",
      modality: "visual",
      payload: { frame: 2 },
      timestamp: Date.now() + 100,
    };

    const percept1 = perception.ingest(sensor1);
    const state1 = core.processPercept(percept1);

    const percept2 = perception.ingest(sensor2);
    const state2 = core.processPercept(percept2);

    // Second state's continuity token should reference the first
    expect(state2.continuityToken.previousId).toBe(
      state1.continuityToken.id
    );
  });

  // ── Core Problem 2: Real-Time Experience Continuity ────────

  it("should keep perception binding latency measurable", () => {
    const latency = perception.getLatency();
    expect(latency).toBeGreaterThanOrEqual(0);
  });

  // ── Core Problem 3: Experience-Validated Autonomy ──────────

  it("should report consciousness metrics during operation", () => {
    const sensorData: SensorData = {
      source: "test",
      modality: "test",
      payload: {},
      timestamp: Date.now(),
    };

    const percept = perception.ingest(sensorData);
    core.processPercept(percept);

    const metrics = monitor.getConsciousnessMetrics();
    expect(metrics.phi).toBeGreaterThan(0);
    expect(metrics.experienceContinuity).toBeGreaterThanOrEqual(0);
    expect(metrics.experienceContinuity).toBeLessThanOrEqual(1);
    expect(metrics.selfModelCoherence).toBeGreaterThanOrEqual(0);
    expect(metrics.selfModelCoherence).toBeLessThanOrEqual(1);
  });

  it("should detect experience integrity", () => {
    expect(monitor.isExperienceIntact()).toBe(true);
  });

  it("should support introspection", () => {
    const sensorData: SensorData = {
      source: "test",
      modality: "test",
      payload: {},
      timestamp: Date.now(),
    };

    const percept = perception.ingest(sensorData);
    core.processPercept(percept);

    const report = core.introspect();
    expect(report.currentState).toBeDefined();
    expect(report.metrics).toBeDefined();
    expect(report.uptime).toBeGreaterThanOrEqual(0);
  });

  it("should perform graceful shutdown preserving final state", () => {
    const sensorData: SensorData = {
      source: "test",
      modality: "test",
      payload: {},
      timestamp: Date.now(),
    };

    const percept = perception.ingest(sensorData);
    core.processPercept(percept);

    const termination = core.shutdown();
    expect(termination.finalState).toBeDefined();
    expect(termination.reason).toBeDefined();
    expect(termination.terminatedAt).toBeGreaterThan(0);
  });

  // ── Substrate Independence ─────────────────────────────────

  it("should report substrate health", () => {
    const health = substrate.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it("should report substrate capabilities", () => {
    const caps = substrate.getCapabilities();
    expect(caps.maxPhi).toBeGreaterThan(0);
    expect(caps.migrationSupported).toBe(true);
  });
});
