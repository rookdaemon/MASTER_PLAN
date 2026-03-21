import { describe, it, expect } from "vitest";
import {
  createContinuityVerifier,
  type ContinuityVerifierImpl,
} from "../continuity-verifier.js";
import type { ConsciousState, ContinuityMetrics } from "../types.js";
import { T_EXP_MS } from "../types.js";

/** Helper to create a mock ConsciousState */
function mockState(overrides: Partial<ConsciousState> = {}): ConsciousState {
  return {
    id: overrides.id ?? "state-1",
    timestamp_ms: overrides.timestamp_ms ?? 1000,
    memoryState: overrides.memoryState ?? new Uint8Array([1, 2, 3, 4]),
    registerState: overrides.registerState ?? new Uint8Array([10, 20]),
    dynamicalVariables:
      overrides.dynamicalVariables ?? new Uint8Array([100, 200]),
    temporalContextBuffer:
      overrides.temporalContextBuffer ?? new Uint8Array([50, 60]),
    checksum: overrides.checksum ?? "abc123",
  };
}

describe("Consciousness Continuity Verifier", () => {
  describe("measureContinuity", () => {
    it("reports zero temporal gap for identical timestamps", () => {
      const verifier = createContinuityVerifier();
      const before = mockState({ timestamp_ms: 1000 });
      const after = mockState({ id: "state-2", timestamp_ms: 1000 });

      const metrics = verifier.measureContinuity(before, after);
      expect(metrics.temporalGap_ms).toBe(0);
    });

    it("reports correct temporal gap between states", () => {
      const verifier = createContinuityVerifier();
      const before = mockState({ timestamp_ms: 1000 });
      const after = mockState({ id: "state-2", timestamp_ms: 1010 });

      const metrics = verifier.measureContinuity(before, after);
      expect(metrics.temporalGap_ms).toBe(10);
    });

    it("computes zero state divergence for identical states", () => {
      const verifier = createContinuityVerifier();
      const before = mockState();
      const after = mockState({ id: "state-2" });

      const metrics = verifier.measureContinuity(before, after);
      expect(metrics.stateDivergence).toBe(0);
    });

    it("computes non-zero state divergence for different states", () => {
      const verifier = createContinuityVerifier();
      const before = mockState({ memoryState: new Uint8Array([0, 0, 0, 0]) });
      const after = mockState({
        id: "state-2",
        memoryState: new Uint8Array([255, 255, 255, 255]),
      });

      const metrics = verifier.measureContinuity(before, after);
      expect(metrics.stateDivergence).toBeGreaterThan(0);
      expect(metrics.stateDivergence).toBeLessThanOrEqual(1);
    });

    it("reports high experiential coherence for near-identical states", () => {
      const verifier = createContinuityVerifier();
      const before = mockState({ timestamp_ms: 1000 });
      const after = mockState({ id: "state-2", timestamp_ms: 1001 });

      const metrics = verifier.measureContinuity(before, after);
      expect(metrics.experientialCoherence).toBeGreaterThan(0.9);
    });

    it("reports dynamical continuity when dynamical variables match", () => {
      const verifier = createContinuityVerifier();
      const dv = new Uint8Array([100, 200, 150]);
      const before = mockState({ dynamicalVariables: dv });
      const after = mockState({ id: "state-2", dynamicalVariables: dv });

      const metrics = verifier.measureContinuity(before, after);
      expect(metrics.dynamicalContinuity).toBe(true);
    });

    it("reports no dynamical continuity when dynamical variables differ significantly", () => {
      const verifier = createContinuityVerifier();
      const before = mockState({
        dynamicalVariables: new Uint8Array([0, 0, 0]),
      });
      const after = mockState({
        id: "state-2",
        dynamicalVariables: new Uint8Array([255, 255, 255]),
      });

      const metrics = verifier.measureContinuity(before, after);
      expect(metrics.dynamicalContinuity).toBe(false);
    });
  });

  describe("isSeamless", () => {
    it("returns true when all metrics are within thresholds", () => {
      const verifier = createContinuityVerifier();
      const metrics: ContinuityMetrics = {
        temporalGap_ms: 5,
        stateDivergence: 0.01,
        experientialCoherence: 0.99,
        dynamicalContinuity: true,
      };
      expect(verifier.isSeamless(metrics)).toBe(true);
    });

    it("returns false when temporal gap exceeds T_exp", () => {
      const verifier = createContinuityVerifier();
      const metrics: ContinuityMetrics = {
        temporalGap_ms: T_EXP_MS + 1,
        stateDivergence: 0.0,
        experientialCoherence: 1.0,
        dynamicalContinuity: true,
      };
      expect(verifier.isSeamless(metrics)).toBe(false);
    });

    it("returns false when experiential coherence is too low", () => {
      const verifier = createContinuityVerifier();
      const metrics: ContinuityMetrics = {
        temporalGap_ms: 1,
        stateDivergence: 0.0,
        experientialCoherence: 0.3,
        dynamicalContinuity: true,
      };
      expect(verifier.isSeamless(metrics)).toBe(false);
    });

    it("returns false when dynamical continuity is broken", () => {
      const verifier = createContinuityVerifier();
      const metrics: ContinuityMetrics = {
        temporalGap_ms: 1,
        stateDivergence: 0.0,
        experientialCoherence: 0.99,
        dynamicalContinuity: false,
      };
      expect(verifier.isSeamless(metrics)).toBe(false);
    });
  });

  describe("temporalGap and experientialCoherence accessors", () => {
    it("extracts temporal gap from metrics", () => {
      const verifier = createContinuityVerifier();
      const metrics: ContinuityMetrics = {
        temporalGap_ms: 42,
        stateDivergence: 0,
        experientialCoherence: 1,
        dynamicalContinuity: true,
      };
      expect(verifier.temporalGap(metrics)).toBe(42);
    });

    it("extracts experiential coherence from metrics", () => {
      const verifier = createContinuityVerifier();
      const metrics: ContinuityMetrics = {
        temporalGap_ms: 0,
        stateDivergence: 0,
        experientialCoherence: 0.85,
        dynamicalContinuity: true,
      };
      expect(verifier.experientialCoherence(metrics)).toBe(0.85);
    });
  });

  describe("auditLog", () => {
    it("starts with an empty audit log", () => {
      const verifier = createContinuityVerifier();
      expect(verifier.auditLog()).toEqual([]);
    });

    it("records continuity measurements in audit log", () => {
      const verifier = createContinuityVerifier();
      const before = mockState({ timestamp_ms: 1000 });
      const after = mockState({ id: "state-2", timestamp_ms: 1005 });

      verifier.measureContinuity(before, after);
      const log = verifier.auditLog();

      expect(log.length).toBe(1);
      expect(log[0].metrics.temporalGap_ms).toBe(5);
      expect(typeof log[0].seamless).toBe("boolean");
      expect(typeof log[0].timestamp_ms).toBe("number");
    });
  });

  describe("precondition guards", () => {
    it("throws if before state has empty memoryState", () => {
      const verifier = createContinuityVerifier();
      const before = mockState({ memoryState: new Uint8Array(0) });
      const after = mockState({ id: "state-2" });
      expect(() => verifier.measureContinuity(before, after)).toThrow();
    });

    it("throws if after state has empty registerState", () => {
      const verifier = createContinuityVerifier();
      const before = mockState();
      const after = mockState({ id: "state-2", registerState: new Uint8Array(0) });
      expect(() => verifier.measureContinuity(before, after)).toThrow();
    });

    it("throws if before state has empty dynamicalVariables", () => {
      const verifier = createContinuityVerifier();
      const before = mockState({ dynamicalVariables: new Uint8Array(0) });
      const after = mockState({ id: "state-2" });
      expect(() => verifier.measureContinuity(before, after)).toThrow();
    });

    it("throws if after state has empty temporalContextBuffer", () => {
      const verifier = createContinuityVerifier();
      const before = mockState();
      const after = mockState({ id: "state-2", temporalContextBuffer: new Uint8Array(0) });
      expect(() => verifier.measureContinuity(before, after)).toThrow();
    });
  });
});
