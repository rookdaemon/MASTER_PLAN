import { describe, it, expect } from "vitest";
import { RollbackEngineImpl } from "../rollback-engine.js";
import {
  NeuronSubstrateState,
  type ReplacementUnit,
  type PsiMetric,
  DEFAULT_GRACE_PERIOD_MS,
} from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUnit(
  stepIndex: number,
  overrides: Partial<ReplacementUnit> = {}
): ReplacementUnit {
  const now = Date.now();
  return {
    neuronId: `neuron-${stepIndex}`,
    clusterId: `cluster-0`,
    loopIds: ["loop-0"],
    state: NeuronSubstrateState.Synthetic,
    stepIndex,
    replacedAt_ms: now - 10_000,
    graceDeadline_ms: now + DEFAULT_GRACE_PERIOD_MS,
    rollbackAvailable: true,
    ...overrides,
  };
}

function makePsi(value: number, threshold: number): PsiMetric {
  const now = Date.now();
  return {
    value,
    threshold,
    phi: { value: 3.0, baseline: 2.0, timestamp_ms: now },
    causalContinuity: { intact: true, chainLength: 100, lastVerified_ms: now },
    experientialBinding: { coherence: 0.95, fragmentCount: 1, timestamp_ms: now },
    timestamp_ms: now,
  };
}

const defaultPsiProvider = () => makePsi(3.0, 2.0);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("RollbackEngineImpl", () => {
  describe("construction", () => {
    it("creates with a list of completed replacement units", () => {
      const units = [makeUnit(0), makeUnit(1), makeUnit(2)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);
      expect(engine.getReversibleSteps()).toBe(3);
    });

    it("creates with empty units list", () => {
      const engine = new RollbackEngineImpl([], DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);
      expect(engine.getReversibleSteps()).toBe(0);
    });
  });

  describe("canRollback", () => {
    it("returns true when enough reversible steps exist", () => {
      const units = [makeUnit(0), makeUnit(1), makeUnit(2)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);
      expect(engine.canRollback(2)).toBe(true);
    });

    it("returns true for rolling back all steps", () => {
      const units = [makeUnit(0), makeUnit(1)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);
      expect(engine.canRollback(2)).toBe(true);
    });

    it("returns false when requesting more steps than available", () => {
      const units = [makeUnit(0)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);
      expect(engine.canRollback(2)).toBe(false);
    });

    it("returns false when zero steps requested", () => {
      const units = [makeUnit(0)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);
      expect(engine.canRollback(0)).toBe(false);
    });

    it("returns false when units have passed grace period", () => {
      const now = Date.now();
      const expiredUnit = makeUnit(0, {
        graceDeadline_ms: now - 1000, // expired
        rollbackAvailable: false,
      });
      const engine = new RollbackEngineImpl([expiredUnit], DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);
      expect(engine.canRollback(1)).toBe(false);
    });
  });

  describe("getReversibleSteps", () => {
    it("counts only units with rollbackAvailable=true", () => {
      const now = Date.now();
      const units = [
        makeUnit(0, { rollbackAvailable: false, graceDeadline_ms: now - 1000 }),
        makeUnit(1, { rollbackAvailable: true }),
        makeUnit(2, { rollbackAvailable: true }),
      ];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);
      // Only counts consecutive reversible steps from the latest
      expect(engine.getReversibleSteps()).toBe(2);
    });

    it("returns 0 when no units exist", () => {
      const engine = new RollbackEngineImpl([], DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);
      expect(engine.getReversibleSteps()).toBe(0);
    });
  });

  describe("executeRollback", () => {
    it("reverses the requested number of steps", async () => {
      const units = [makeUnit(0), makeUnit(1), makeUnit(2)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);

      const result = await engine.executeRollback(2);

      expect(result.success).toBe(true);
      expect(result.stepsReversed).toBe(2);
      expect(result.currentStepIndex).toBe(0); // rolled back to step 0
      expect(result.irreversibleUnits).toHaveLength(0);
      expect(result.postRollbackPsi.value).toBe(3.0);
    });

    it("marks rolled-back units as RollingBack then Biological", async () => {
      const units = [makeUnit(0), makeUnit(1)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);

      await engine.executeRollback(1);

      // The last unit (step 1) should be reverted to Biological
      expect(units[1].state).toBe(NeuronSubstrateState.Biological);
      // The first unit (step 0) should remain Synthetic
      expect(units[0].state).toBe(NeuronSubstrateState.Synthetic);
    });

    it("reverses steps in reverse order (latest first)", async () => {
      const units = [makeUnit(0), makeUnit(1), makeUnit(2)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);

      await engine.executeRollback(3);

      // All should be biological now
      expect(units[0].state).toBe(NeuronSubstrateState.Biological);
      expect(units[1].state).toBe(NeuronSubstrateState.Biological);
      expect(units[2].state).toBe(NeuronSubstrateState.Biological);
    });

    it("reports irreversible units that are past grace period", async () => {
      const now = Date.now();
      const units = [
        makeUnit(0, {
          rollbackAvailable: false,
          graceDeadline_ms: now - 1000,
          state: NeuronSubstrateState.SyntheticFinal,
        }),
        makeUnit(1, { rollbackAvailable: true }),
      ];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);

      // Can only roll back 1 step (the latest)
      const result = await engine.executeRollback(1);

      expect(result.success).toBe(true);
      expect(result.stepsReversed).toBe(1);
      expect(units[1].state).toBe(NeuronSubstrateState.Biological);
      expect(units[0].state).toBe(NeuronSubstrateState.SyntheticFinal); // unchanged
    });

    it("fails if requesting more steps than reversible", async () => {
      const units = [makeUnit(0)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);

      const result = await engine.executeRollback(5);
      expect(result.success).toBe(false);
    });

    it("updates reversible step count after rollback", async () => {
      const units = [makeUnit(0), makeUnit(1), makeUnit(2)];
      const engine = new RollbackEngineImpl(units, DEFAULT_GRACE_PERIOD_MS, defaultPsiProvider);

      expect(engine.getReversibleSteps()).toBe(3);

      await engine.executeRollback(2);

      expect(engine.getReversibleSteps()).toBe(1);
    });
  });
});
