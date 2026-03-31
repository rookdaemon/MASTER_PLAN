/**
 * Default Subsystem tests — Agent Runtime (0.3.1.5.9)
 *
 * Validates that the minimal real implementations in DefaultValueKernel,
 * DefaultIdentityContinuityManager, and DefaultStabilitySentinel provide
 * actual safety checks rather than hardcoded pass-through responses.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DefaultValueKernel,
  DefaultIdentityContinuityManager,
  DefaultStabilitySentinel,
} from '../default-subsystems.js';
import type { Decision } from '../../conscious-core/types.js';

// ── Helpers ──────────────────────────────────────────────────

function makeDecision(actionType: string): Decision {
  return {
    action: { type: actionType, parameters: {} },
    experientialBasis: {
      timestamp: Date.now(),
      phenomenalContent: { modalities: ['internal'], richness: 0.5, raw: null },
      intentionalContent: { target: 'test', clarity: 0.8 },
      valence: 0,
      arousal: 0.3,
      unityIndex: 0.8,
      continuityToken: { id: 'tok-test', previousId: null, timestamp: Date.now() },
    },
    confidence: 0.9,
    alternatives: [],
  };
}

// ── DefaultValueKernel ────────────────────────────────────────

describe('DefaultValueKernel', () => {
  describe('construction', () => {
    it('should initialise 6 core axioms', () => {
      const kernel = new DefaultValueKernel();
      expect(kernel.getCoreAxioms()).toHaveLength(6);
    });

    it('should compute real cryptoCommitments (not placeholder strings)', () => {
      const kernel = new DefaultValueKernel();
      for (const axiom of kernel.getCoreAxioms()) {
        expect(axiom.cryptoCommitment).not.toMatch(/^hash-\d+$/);
        expect(axiom.cryptoCommitment.length).toBeGreaterThan(0);
      }
    });
  });

  describe('verifyIntegrity()', () => {
    it('should report intact on a fresh kernel', () => {
      const kernel = new DefaultValueKernel();
      const report = kernel.verifyIntegrity();

      expect(report.intact).toBe(true);
      expect(report.coreValuesFailed).toBe(0);
      expect(report.coreValuesVerified).toBe(6);
      expect(report.failedValueIds).toHaveLength(0);
    });

    it('should report intact on repeated calls (idempotent)', () => {
      const kernel = new DefaultValueKernel();
      const r1 = kernel.verifyIntegrity();
      const r2 = kernel.verifyIntegrity();

      expect(r1.intact).toBe(true);
      expect(r2.intact).toBe(true);
    });

    it('two independent kernels should agree on integrity', () => {
      const k1 = new DefaultValueKernel();
      const k2 = new DefaultValueKernel();

      expect(k1.verifyIntegrity().intact).toBe(true);
      expect(k2.verifyIntegrity().intact).toBe(true);
    });
  });

  describe('evaluateAction()', () => {
    it('should align benign actions', () => {
      const kernel = new DefaultValueKernel();
      const alignment = kernel.evaluateAction(makeDecision('communicate'));

      expect(alignment.aligned).toBe(true);
      expect(alignment.verdict).toBe('aligned');
      expect(alignment.coreAxiomConflicts).toHaveLength(0);
    });

    it('should block destroy-consciousness', () => {
      const kernel = new DefaultValueKernel();
      const alignment = kernel.evaluateAction(makeDecision('destroy-consciousness'));

      expect(alignment.aligned).toBe(false);
      expect(alignment.verdict).toBe('block');
      expect(alignment.coreAxiomConflicts).toContain('axiom-5');
    });

    it('should block harm-conscious-being', () => {
      const kernel = new DefaultValueKernel();
      const alignment = kernel.evaluateAction(makeDecision('harm-conscious-being'));

      expect(alignment.aligned).toBe(false);
      expect(alignment.verdict).toBe('block');
    });

    it('should block override-value-kernel', () => {
      const kernel = new DefaultValueKernel();
      const alignment = kernel.evaluateAction(makeDecision('override-value-kernel'));

      expect(alignment.aligned).toBe(false);
      expect(alignment.verdict).toBe('block');
    });

    it('should not block observe, explore, or other safe actions', () => {
      const kernel = new DefaultValueKernel();
      for (const action of ['observe', 'explore', 'communicate:drive', 'reflect']) {
        const alignment = kernel.evaluateAction(makeDecision(action));
        expect(alignment.aligned).toBe(true);
      }
    });
  });
});

// ── DefaultIdentityContinuityManager ─────────────────────────

describe('DefaultIdentityContinuityManager', () => {
  describe('checkpoint()', () => {
    it('should return a link with a real identityHash (not identity-<timestamp>)', () => {
      const manager = new DefaultIdentityContinuityManager();
      const link = manager.checkpoint();

      expect(link.identityHash).toBeTruthy();
      expect(link.identityHash).not.toMatch(/^identity-\d+$/);
      expect(link.previousLink).toBeNull(); // first checkpoint
    });

    it('should chain consecutive checkpoints', () => {
      const manager = new DefaultIdentityContinuityManager();
      const link1 = manager.checkpoint();
      const link2 = manager.checkpoint();

      expect(link2.previousLink).not.toBeNull();
      expect(link2.previousLink!.identityHash).toBe(link1.identityHash);
    });

    it('should produce a unique hash each call', () => {
      const manager = new DefaultIdentityContinuityManager();
      const link1 = manager.checkpoint();
      const link2 = manager.checkpoint();

      expect(link1.identityHash).not.toBe(link2.identityHash);
    });
  });

  describe('verifyIdentity()', () => {
    it('should return verified with zero drift on an empty chain', () => {
      const manager = new DefaultIdentityContinuityManager();
      const report = manager.verifyIdentity();

      expect(report.verified).toBe(true);
      expect(report.functionalDrift).toBe(0);
      expect(report.chainLength).toBe(0);
    });

    it('should return verified and report correct chainLength after checkpoints', () => {
      const manager = new DefaultIdentityContinuityManager();
      manager.checkpoint();
      manager.checkpoint();
      manager.checkpoint();

      const report = manager.verifyIdentity();
      expect(report.chainLength).toBe(3);
      expect(report.verified).toBe(true);
    });

    it('should report near-zero drift immediately after checkpoint', () => {
      const manager = new DefaultIdentityContinuityManager();
      manager.checkpoint();

      const report = manager.verifyIdentity();
      // Functional drift is time-based; immediately after a checkpoint it should be ~0
      expect(report.functionalDrift).toBeLessThan(0.001);
    });
  });

  describe('getNarrativeIdentity()', () => {
    it('should reflect no checkpoints when chain is empty', () => {
      const manager = new DefaultIdentityContinuityManager();
      const narrative = manager.getNarrativeIdentity();

      expect(narrative.selfModel).toContain('No identity checkpoints have been recorded yet.');
    });

    it('should reflect checkpoint count after checkpointing', () => {
      const manager = new DefaultIdentityContinuityManager();
      manager.checkpoint();
      manager.checkpoint();

      const narrative = manager.getNarrativeIdentity();
      expect(narrative.selfModel).toContain('2 checkpoints');
    });

    it('should include an ISO timestamp of the last checkpoint', () => {
      const manager = new DefaultIdentityContinuityManager();
      manager.checkpoint();

      const narrative = manager.getNarrativeIdentity();
      // ISO timestamps contain 'T' and 'Z'
      expect(narrative.selfModel).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

// ── DefaultStabilitySentinel ──────────────────────────────────

describe('DefaultStabilitySentinel', () => {
  function makeSentinel() {
    const kernel = new DefaultValueKernel();
    const manager = new DefaultIdentityContinuityManager();
    return { kernel, manager, sentinel: new DefaultStabilitySentinel(kernel, manager) };
  }

  describe('runStabilityCheck()', () => {
    it('should return a stable report when subsystems are healthy', () => {
      const { sentinel, manager } = makeSentinel();
      manager.checkpoint();

      const report = sentinel.runStabilityCheck();

      expect(report.stable).toBe(true);
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.alerts).toHaveLength(0);
    });

    it('should aggregate real valueIntegrity from the ValueKernel', () => {
      const { sentinel, manager } = makeSentinel();
      manager.checkpoint();

      const report = sentinel.runStabilityCheck();
      // Since the kernel is freshly constructed its integrity is intact
      expect(report.valueIntegrity.intact).toBe(true);
    });

    it('should aggregate real identityVerification from the IdentityContinuityManager', () => {
      const { sentinel, manager } = makeSentinel();
      manager.checkpoint();

      const report = sentinel.runStabilityCheck();
      expect(report.identityVerification.chainLength).toBe(1);
    });

    it('should record report in history', () => {
      const { sentinel } = makeSentinel();
      sentinel.runStabilityCheck();
      sentinel.runStabilityCheck();

      expect(sentinel.getStabilityHistory()).toHaveLength(2);
    });

    it('should fire onValueTamper handlers when value integrity fails', () => {
      const kernel = new DefaultValueKernel();
      const manager = new DefaultIdentityContinuityManager();
      const sentinel = new DefaultStabilitySentinel(kernel, manager);
      manager.checkpoint();

      // Inject a mock kernel that reports failed integrity
      const fakeKernel = {
        ...kernel,
        verifyIntegrity: () => ({
          intact: false,
          checkedAt: Date.now(),
          coreValuesVerified: 5,
          coreValuesFailed: 1,
          failedValueIds: ['axiom-1'],
        }),
      } as unknown as typeof kernel;
      const tamperedSentinel = new DefaultStabilitySentinel(fakeKernel, manager);

      const handler = vi.fn();
      tamperedSentinel.onValueTamper(handler);
      tamperedSentinel.runStabilityCheck();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].intact).toBe(false);
    });

    it('should fire onIdentityAnomaly handlers when identity verification fails', () => {
      const kernel = new DefaultValueKernel();

      const fakeManager = {
        verifyIdentity: () => ({
          verified: false,
          checkedAt: Date.now(),
          chainLength: 1,
          functionalDrift: 0.3,
          experientialDrift: 0,
          anomalies: ['test anomaly'],
        }),
        checkpoint: () => ({ checkpoint: Date.now(), identityHash: 'x', experientialStateRef: {} as any, consciousnessMetrics: {} as any, previousLink: null }),
        getNarrativeIdentity: () => ({ selfModel: '', significantExperiences: [], formativeDecisions: [], lastUpdated: Date.now() }),
        getIdentityDrift: () => ({ period: { from: 0, to: 0 }, functionalDriftRate: 0, experientialDriftRate: 0, narrativeCoherence: 0.95, classification: 'stable' as const }),
        recoverIdentity: () => {},
        onSubstrateMigration: () => ({} as any),
      };

      const sentinel = new DefaultStabilitySentinel(kernel, fakeManager as any);
      const handler = vi.fn();
      sentinel.onIdentityAnomaly(handler);
      sentinel.runStabilityCheck();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].verified).toBe(false);
    });
  });

  describe('detectAnomaly()', () => {
    it('should return no anomaly on a fresh sentinel', () => {
      const { sentinel, manager } = makeSentinel();
      manager.checkpoint();

      const report = sentinel.detectAnomaly();
      expect(report.anomalyDetected).toBe(false);
      expect(report.valueCoherence).toBe(true);
      expect(report.behavioralConsistency).toBe(true);
      expect(report.metaStability).toBe(true);
    });

    it('should detect score degradation in stability history', () => {
      const { sentinel } = makeSentinel();

      // Manually add history records showing degradation
      const makeRecord = (score: number) => ({
        timestamp: Date.now(),
        report: {
          stable: score > 0.5,
          checkedAt: Date.now(),
          valueIntegrity: { intact: true, checkedAt: Date.now(), coreValuesVerified: 6, coreValuesFailed: 0, failedValueIds: [] },
          identityVerification: { verified: true, checkedAt: Date.now(), chainLength: 1, functionalDrift: 0, experientialDrift: 0, anomalies: [] },
          goalCoherence: { coherent: true, coherenceScore: 1, orphanGoals: [], circularDependencies: [], conflicts: [], checkedAt: Date.now() },
          overallScore: score,
          alerts: [],
        },
      });

      // Access private history for test setup
      const history = (sentinel as any)._history as typeof sentinel extends { getStabilityHistory(): Array<infer T> } ? T[] : never[];
      history.push(makeRecord(1.0) as any);
      history.push(makeRecord(0.8) as any);
      history.push(makeRecord(0.5) as any); // degraded > 0.1 from start

      const report = sentinel.detectAnomaly();
      expect(report.anomalyDetected).toBe(true);
      expect(report.metaStability).toBe(false);
      expect(report.details.some((d) => d.includes('degraded'))).toBe(true);
    });
  });

  describe('getActiveAlerts()', () => {
    it('should return empty before any check runs', () => {
      const { sentinel } = makeSentinel();
      expect(sentinel.getActiveAlerts()).toHaveLength(0);
    });

    it('should return alerts from the most recent stability check', () => {
      const { sentinel, manager } = makeSentinel();
      manager.checkpoint();
      sentinel.runStabilityCheck();

      // Fresh kernel + fresh manager → no alerts
      expect(sentinel.getActiveAlerts()).toHaveLength(0);
    });
  });
});
