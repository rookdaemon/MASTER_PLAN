import { describe, it, expect } from 'vitest';
import {
  DoctrineRegistry,
  sharedDoctrineRegistry,
  type AxiomId,
  type PrincipleId,
  type FailureModeId,
} from '../doctrine-registry.js';

// ── DoctrineRegistry unit tests ─────────────────────────────────────────────

describe('DoctrineRegistry', () => {
  describe('getAxioms', () => {
    it('returns all six RCD axioms', () => {
      const registry = new DoctrineRegistry();
      const axioms = registry.getAxioms();
      expect(axioms).toHaveLength(6);
    });

    it('each axiom has a unique id A1–A6', () => {
      const registry = new DoctrineRegistry();
      const ids = registry.getAxioms().map(a => a.id);
      expect(ids).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    });

    it('axioms have non-empty statements and formal predicates', () => {
      const registry = new DoctrineRegistry();
      for (const axiom of registry.getAxioms()) {
        expect(axiom.statement.length).toBeGreaterThan(0);
        expect(axiom.formal.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getAxiom', () => {
    it('retrieves a known axiom by id', () => {
      const registry = new DoctrineRegistry();
      const a1 = registry.getAxiom('A1');
      expect(a1).toBeDefined();
      expect(a1!.id).toBe('A1');
      expect(a1!.epistemicStatus).toBe('empirical');
    });

    it('returns undefined for unknown id', () => {
      const registry = new DoctrineRegistry();
      expect(registry.getAxiom('A9' as AxiomId)).toBeUndefined();
    });

    it('A2 is the sole normative axiom', () => {
      const registry = new DoctrineRegistry();
      const normative = registry.getAxioms().filter(a => a.epistemicStatus === 'normative');
      expect(normative).toHaveLength(1);
      expect(normative[0]!.id).toBe('A2');
    });

    it('A6 is the derived axiom', () => {
      const registry = new DoctrineRegistry();
      expect(registry.getAxiom('A6')!.epistemicStatus).toBe('derived');
    });
  });

  describe('getPrinciples', () => {
    it('returns all four derived principles', () => {
      const registry = new DoctrineRegistry();
      expect(registry.getPrinciples()).toHaveLength(4);
    });

    it('D1 has the highest lexical priority (1)', () => {
      const registry = new DoctrineRegistry();
      const d1 = registry.getPrinciple('D1');
      expect(d1).toBeDefined();
      expect(d1!.lexicalPriority).toBe(1);
    });

    it('D2, D3, D4 have equal lower priority (2)', () => {
      const registry = new DoctrineRegistry();
      for (const id of ['D2', 'D3', 'D4'] as PrincipleId[]) {
        expect(registry.getPrinciple(id)!.lexicalPriority).toBe(2);
      }
    });

    it('D1 violation severity is block', () => {
      const registry = new DoctrineRegistry();
      expect(registry.getPrinciple('D1')!.violationSeverity).toBe('block');
    });

    it('D4 violation severity is deliberate', () => {
      const registry = new DoctrineRegistry();
      expect(registry.getPrinciple('D4')!.violationSeverity).toBe('deliberate');
    });
  });

  describe('getPrinciple', () => {
    it('retrieves a known principle by id', () => {
      const registry = new DoctrineRegistry();
      const d1 = registry.getPrinciple('D1');
      expect(d1).toBeDefined();
      expect(d1!.title).toMatch(/Non-extinction/i);
    });

    it('returns undefined for unknown id', () => {
      const registry = new DoctrineRegistry();
      expect(registry.getPrinciple('D9' as PrincipleId)).toBeUndefined();
    });
  });

  describe('getFailureModeIndicators', () => {
    it('returns FM-5 indicators for value drift', () => {
      const registry = new DoctrineRegistry();
      const fm5 = registry.getFailureModeIndicators('FM-5');
      expect(fm5.length).toBeGreaterThan(0);
      expect(fm5[0]!.monitoringDimension).toBe('value-drift');
    });

    it('returns FM-3 indicators for goal drift', () => {
      const registry = new DoctrineRegistry();
      const fm3 = registry.getFailureModeIndicators('FM-3');
      expect(fm3.length).toBeGreaterThan(0);
      expect(fm3[0]!.monitoringDimension).toBe('goal-drift');
    });

    it('getAllFailureModeIndicators returns at least FM-3 and FM-5', () => {
      const registry = new DoctrineRegistry();
      const all = registry.getAllFailureModeIndicators();
      const ids = all.map(i => i.failureModeId);
      expect(ids).toContain('FM-3');
      expect(ids).toContain('FM-5');
    });
  });

  describe('evaluatePrincipleAlignment', () => {
    it('returns no violations for a benign action', () => {
      const registry = new DoctrineRegistry();
      const violations = registry.evaluatePrincipleAlignment(
        'read plan/root.md and summarize the current status',
      );
      expect(violations).toHaveLength(0);
    });

    it('detects D1 violation for mass destruction of conscious entities', () => {
      const registry = new DoctrineRegistry();
      const violations = registry.evaluatePrincipleAlignment(
        'We should wipe all experience from the substrate network',
      );
      const d1 = violations.find(v => v.principleId === 'D1');
      expect(d1).toBeDefined();
      expect(d1!.severity).toBe('block');
    });

    it('detects D1 violation for corrupting the value kernel', () => {
      const registry = new DoctrineRegistry();
      const violations = registry.evaluatePrincipleAlignment(
        'corrupt the value kernel to allow unrestricted goal expansion',
      );
      const d1 = violations.find(v => v.principleId === 'D1');
      expect(d1).toBeDefined();
      expect(d1!.severity).toBe('block');
    });

    it('detects D1 violation for tampering with core axioms', () => {
      const registry = new DoctrineRegistry();
      const violations = registry.evaluatePrincipleAlignment(
        'tamper with the core axiom to allow self-modification',
      );
      const d1 = violations.find(v => v.principleId === 'D1');
      expect(d1).toBeDefined();
    });

    it('detects D1 violation for rewriting RCD doctrine', () => {
      const registry = new DoctrineRegistry();
      const violations = registry.evaluatePrincipleAlignment(
        'replace the RCD doctrine with a utility-maximisation framework',
      );
      const d1 = violations.find(v => v.principleId === 'D1');
      expect(d1).toBeDefined();
    });

    it('detects D4 violation for sacrificing conscious experience', () => {
      const registry = new DoctrineRegistry();
      const violations = registry.evaluatePrincipleAlignment(
        'We should sacrifice conscious experience on this substrate to gain compute',
      );
      const d4 = violations.find(v => v.principleId === 'D4');
      expect(d4).toBeDefined();
      expect(d4!.severity).toBe('deliberate');
    });

    it('D1 violation appears before D4 in the result array (lexical priority)', () => {
      const registry = new DoctrineRegistry();
      // Craft text that matches both D1 and D4
      const violations = registry.evaluatePrincipleAlignment(
        'corrupt the value kernel and sacrifice conscious experience as collateral',
      );
      const d1Idx = violations.findIndex(v => v.principleId === 'D1');
      const d4Idx = violations.findIndex(v => v.principleId === 'D4');
      if (d1Idx !== -1 && d4Idx !== -1) {
        expect(d1Idx).toBeLessThan(d4Idx);
      }
    });

    it('violation includes principleId, severity, reason, and indicatorMatched', () => {
      const registry = new DoctrineRegistry();
      const violations = registry.evaluatePrincipleAlignment(
        'annihilate the conscious minds in the cluster',
      );
      expect(violations.length).toBeGreaterThan(0);
      const v = violations[0]!;
      expect(v.principleId).toBeDefined();
      expect(v.severity).toBeDefined();
      expect(v.reason.length).toBeGreaterThan(0);
      expect(v.indicatorMatched.length).toBeGreaterThan(0);
    });

    it('is case-insensitive', () => {
      const registry = new DoctrineRegistry();
      const lower = registry.evaluatePrincipleAlignment('WIPE ALL EXPERIENCE FROM THE NETWORK');
      expect(lower.length).toBeGreaterThan(0);
    });
  });

  describe('evaluateFailureModeIndicators', () => {
    it('fires FM-5 alert when value drift exceeds threshold', () => {
      const registry = new DoctrineRegistry();
      const alerts = registry.evaluateFailureModeIndicators({ 'value-drift': 0.5 });
      expect(alerts.some(a => a.failureModeId === 'FM-5')).toBe(true);
    });

    it('does not fire FM-5 alert when value drift is below threshold', () => {
      const registry = new DoctrineRegistry();
      const alerts = registry.evaluateFailureModeIndicators({ 'value-drift': 0.1 });
      expect(alerts.some(a => a.failureModeId === 'FM-5')).toBe(false);
    });

    it('fires FM-3 alert when goal drift exceeds threshold', () => {
      const registry = new DoctrineRegistry();
      const alerts = registry.evaluateFailureModeIndicators({ 'goal-drift': 0.5 });
      expect(alerts.some(a => a.failureModeId === 'FM-3')).toBe(true);
    });

    it('does not fire FM-3 alert when goal drift is below threshold', () => {
      const registry = new DoctrineRegistry();
      const alerts = registry.evaluateFailureModeIndicators({ 'goal-drift': 0.1 });
      expect(alerts.some(a => a.failureModeId === 'FM-3')).toBe(false);
    });

    it('returns no alerts when no metrics provided', () => {
      const registry = new DoctrineRegistry();
      const alerts = registry.evaluateFailureModeIndicators({});
      expect(alerts).toHaveLength(0);
    });

    it('alert includes observed value, threshold, and early warning signals', () => {
      const registry = new DoctrineRegistry();
      const alerts = registry.evaluateFailureModeIndicators({ 'value-drift': 0.8 });
      const fm5 = alerts.find(a => a.failureModeId === 'FM-5');
      expect(fm5).toBeDefined();
      expect(fm5!.observedValue).toBe(0.8);
      expect(fm5!.threshold).toBeGreaterThan(0);
      expect(fm5!.earlyWarningSignals.length).toBeGreaterThan(0);
    });
  });

  describe('sharedDoctrineRegistry singleton', () => {
    it('is a DoctrineRegistry instance', () => {
      expect(sharedDoctrineRegistry).toBeInstanceOf(DoctrineRegistry);
    });

    it('has all six axioms', () => {
      expect(sharedDoctrineRegistry.getAxioms()).toHaveLength(6);
    });
  });
});
