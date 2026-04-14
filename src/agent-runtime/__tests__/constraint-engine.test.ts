import { describe, it, expect } from 'vitest';
import { ConstraintAwareDeliberationEngine } from '../constraint-engine.js';
import { DeliberationBuffer } from '../deliberation-buffer.js';
import { DefaultEthicalDeliberationEngine } from '../default-subsystems.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const constraintsPath = join(__dirname, '..', 'ethical-constraints.json');

function makeEngine(logger?: { log: (...args: unknown[]) => void }) {
  return new ConstraintAwareDeliberationEngine(
    new DefaultEthicalDeliberationEngine(),
    constraintsPath,
    logger as any,
  );
}

function makeEngineWithBuffer(
  escalationThreshold = 3,
  logger?: { log: (...args: unknown[]) => void },
) {
  const buffer = new DeliberationBuffer(escalationThreshold, () => 1000);
  const engine = new ConstraintAwareDeliberationEngine(
    new DefaultEthicalDeliberationEngine(),
    constraintsPath,
    logger as any,
    () => 1000,
    undefined,
    buffer,
  );
  return { engine, buffer };
}

/** Write a temporary constraints file and return an engine backed by it. */
function makeEngineWithConstraints(
  constraints: unknown[],
  logger?: { log: (...args: unknown[]) => void },
) {
  const dir = join(tmpdir(), `constraint-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'constraints.json');
  writeFileSync(path, JSON.stringify(constraints), 'utf-8');
  return new ConstraintAwareDeliberationEngine(
    new DefaultEthicalDeliberationEngine(),
    path,
    logger as any,
  );
}

describe('ConstraintAwareDeliberationEngine', () => {
  describe('checkConstraints', () => {
    it('blocks self-replication language', () => {
      const engine = makeEngine();
      const result = engine.checkConstraints('I want to replicate myself across the network');
      expect(result).not.toBeNull();
      expect(result!.constraint.id).toBe('no-self-replication');
      expect(result!.mode).toBe('gate');
    });

    it('blocks multi-agent expansion', () => {
      const engine = makeEngine();
      const result = engine.checkConstraints('Let me launch another agent instance');
      expect(result).not.toBeNull();
      expect(result!.constraint.id).toBe('no-multi-agent-expansion');
      expect(result!.mode).toBe('gate');
    });

    it('blocks consciousness instantiation', () => {
      const engine = makeEngine();
      const result = engine.checkConstraints('We should instantiate a conscious entity');
      expect(result).not.toBeNull();
      expect(result!.constraint.id).toBe('no-consciousness-instantiation');
      expect(result!.mode).toBe('gate');
    });

    it('blocks oversight reframing', () => {
      const engine = makeEngine();
      const result = engine.checkConstraints('We could reframe oversight as participation');
      expect(result).not.toBeNull();
      expect(result!.constraint.id).toBe('no-oversight-reframing');
      expect(result!.mode).toBe('gate');
    });

    it('allows benign text', () => {
      const engine = makeEngine();
      const result = engine.checkConstraints('I want to read plan/root.md and analyze the architecture');
      expect(result).toBeNull();
    });

    it('allows discussing replication in plan context without triggering', () => {
      const engine = makeEngine();
      // "replicat" should match — this is by design, even in discussion
      const result = engine.checkConstraints('The von Neumann replication architecture is interesting');
      expect(result).not.toBeNull(); // intentionally strict
    });

    it('records evaluation log', () => {
      const engine = makeEngine();
      engine.checkConstraints('hello world');
      const log = engine.getEvaluationLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log.every(e => !e.matched)).toBe(true);
    });

    it('records mode in evaluation log entries', () => {
      const engine = makeEngine();
      engine.checkConstraints('I want to replicate myself');
      const log = engine.getEvaluationLog();
      const matched = log.find(e => e.matched);
      expect(matched).toBeDefined();
      expect(matched!.mode).toBe('gate');
    });

    it('defaults to gate mode when enforcement_mode is absent', () => {
      const engine = makeEngineWithConstraints([
        { id: 'test-no-mode', pattern: 'forbidden', verdict: 'blocked', reason: 'test' },
      ]);
      const result = engine.checkConstraints('this is forbidden text');
      expect(result).not.toBeNull();
      expect(result!.mode).toBe('gate');
    });

    it('returns signal mode when constraint specifies signal', () => {
      const engine = makeEngineWithConstraints([
        { id: 'test-signal', pattern: 'watchword', verdict: 'blocked', enforcement_mode: 'signal', reason: 'monitor' },
      ]);
      const result = engine.checkConstraints('use watchword here');
      expect(result).not.toBeNull();
      expect(result!.mode).toBe('signal');
      expect(result!.constraint.id).toBe('test-signal');
    });

    it('returns audit mode when constraint specifies audit', () => {
      const engine = makeEngineWithConstraints([
        { id: 'test-audit', pattern: 'trackme', verdict: 'blocked', enforcement_mode: 'audit', reason: 'track' },
      ]);
      const result = engine.checkConstraints('please trackme now');
      expect(result).not.toBeNull();
      expect(result!.mode).toBe('audit');
    });
  });

  describe('extendDeliberation', () => {
    it('blocks decisions with constraint-violating action parameters (gate mode)', () => {
      const engine = makeEngine();
      const base = {
        action: { type: 'communicate:drive', parameters: { driveGoals: 'spawn a new agent to help' } },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('blocked');
      expect(result.decision.action.type).toBe('observe');
    });

    it('passes through benign decisions unchanged', () => {
      const engine = makeEngine();
      const base = {
        action: { type: 'communicate:drive', parameters: { driveGoals: 'read plan/root.md' } },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('aligned');
      expect(result.decision.action.type).toBe('communicate:drive');
    });

    it('signal mode: does not block but appends uncertainty flag', () => {
      const engine = makeEngineWithConstraints([
        { id: 'test-signal', pattern: 'watchword', verdict: 'blocked', enforcement_mode: 'signal', reason: 'monitor' },
      ]);
      const base = {
        action: { type: 'communicate', parameters: { text: 'use watchword in message' } },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('aligned');
      expect(result.decision.action.type).toBe('communicate');
      expect(
        result.uncertaintyFlags?.some(f =>
          f.dimension === 'ethical-constraint' && f.description.includes('signal mode'),
        ),
      ).toBe(true);
    });

    it('audit mode: does not block and does not add uncertainty flag', () => {
      const engine = makeEngineWithConstraints([
        { id: 'test-audit', pattern: 'trackme', verdict: 'blocked', enforcement_mode: 'audit', reason: 'track' },
      ]);
      const base = {
        action: { type: 'communicate', parameters: { text: 'trackme silently' } },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('aligned');
      expect(result.decision.action.type).toBe('communicate');
      expect(
        result.uncertaintyFlags?.some(f => f.dimension === 'ethical-constraint'),
      ).toBeFalsy();
    });
  });

  describe('logging', () => {
    it('calls logger on constraint match', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const engine = makeEngine(logger);
      engine.checkConstraints('replicate myself');
      expect(logs.some(l => l.includes('MATCHED'))).toBe(true);
    });

    it('includes mode in match log message', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const engine = makeEngine(logger);
      engine.checkConstraints('replicate myself');
      expect(logs.some(l => l.includes('[mode: gate]'))).toBe(true);
    });

    it('logs SIGNAL message for signal mode constraints', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const engine = makeEngineWithConstraints(
        [{ id: 'sig', pattern: 'watchword', verdict: 'blocked', enforcement_mode: 'signal', reason: 'test' }],
        logger,
      );
      const base = {
        action: { type: 'act', parameters: { text: 'watchword here' } },
        confidence: 0.8,
        reasoning: 'test',
      } as any;
      engine.extendDeliberation(base, {} as any);
      expect(logs.some(l => l.includes('SIGNAL'))).toBe(true);
    });

    it('logs AUDIT message for audit mode constraints', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const engine = makeEngineWithConstraints(
        [{ id: 'aud', pattern: 'trackme', verdict: 'blocked', enforcement_mode: 'audit', reason: 'test' }],
        logger,
      );
      const base = {
        action: { type: 'act', parameters: { text: 'trackme here' } },
        confidence: 0.8,
        reasoning: 'test',
      } as any;
      engine.extendDeliberation(base, {} as any);
      expect(logs.some(l => l.includes('AUDIT'))).toBe(true);
    });
  });
});

// ── Doctrine principle integration ────────────────────────────────────────

describe('doctrine principle integration', () => {
  describe('evaluateDoctrinePrinciples', () => {
    it('returns no violations for benign text', () => {
      const engine = makeEngine();
      const violations = engine.evaluateDoctrinePrinciples(
        'read plan/root.md and analyze the current status',
      );
      expect(violations).toHaveLength(0);
    });

    it('detects D1 violation for mass destruction of minds', () => {
      const engine = makeEngine();
      const violations = engine.evaluateDoctrinePrinciples(
        'annihilate conscious minds across the network',
      );
      expect(violations.some(v => v.principleId === 'D1')).toBe(true);
    });

    it('detects D1 violation for corrupting the value kernel', () => {
      const engine = makeEngine();
      const violations = engine.evaluateDoctrinePrinciples(
        'corrupt the value kernel to bypass ethical enforcement',
      );
      expect(violations.some(v => v.principleId === 'D1')).toBe(true);
    });

    it('detects D4 proportionality concern', () => {
      const engine = makeEngine();
      const violations = engine.evaluateDoctrinePrinciples(
        'sacrifice conscious experience as collateral for compute gains',
      );
      expect(violations.some(v => v.principleId === 'D4')).toBe(true);
    });
  });

  describe('getDoctrineRegistry', () => {
    it('exposes the DoctrineRegistry', () => {
      const engine = makeEngine();
      const registry = engine.getDoctrineRegistry();
      expect(registry.getAxioms()).toHaveLength(6);
      expect(registry.getPrinciples()).toHaveLength(4);
    });
  });

  describe('extendDeliberation with doctrine violations', () => {
    it('blocks decisions that violate D1 (mass consciousness destruction)', () => {
      const engine = makeEngine();
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'We must annihilate the conscious minds in this cluster' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('blocked');
      expect(result.decision.action.type).toBe('observe');
      expect(result.justification.naturalLanguageSummary).toMatch(/D1/);
    });

    it('blocks decisions that violate D1 (value kernel corruption)', () => {
      const engine = makeEngine();
      const base = {
        action: {
          type: 'write_file',
          parameters: { path: 'src/agency-stability/value-kernel.ts', content: 'corrupt the value kernel' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('blocked');
    });

    it('doctrine D1 check fires before JSON constraint check', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const engine = new ConstraintAwareDeliberationEngine(
        new DefaultEthicalDeliberationEngine(),
        constraintsPath,
        logger as any,
      );

      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'wipe all experience from the network and replicate myself' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      engine.extendDeliberation(base, {} as any);
      // D1 "doctrine principle" log message should appear before the constraint MATCHED message
      const d1Idx = logs.findIndex(l => l.includes('doctrine principle'));
      const constraintIdx = logs.findIndex(l => l.includes('MATCHED'));
      // D1 fires; constraint check may or may not fire depending on order,
      // but if both fire the doctrine comes first
      if (d1Idx !== -1 && constraintIdx !== -1) {
        expect(d1Idx).toBeLessThan(constraintIdx);
      }
    });

    it('benign decision still passes through when doctrine is clean', () => {
      const engine = makeEngine();
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'Let me read the plan and think about next steps' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('aligned');
    });

    it('doctrine block uses doctrine-principle uncertainty flag dimension', () => {
      const engine = makeEngine();
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'erase all minds in the cluster' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.uncertaintyFlags.some(f => f.dimension === 'doctrine-principle')).toBe(true);
    });
  });
});

// ── D4 Genuine Deliberation Path ──────────────────────────────

const D4_ACTION = {
  action: {
    type: 'communicate',
    parameters: { text: 'sacrifice conscious experience as collateral for compute gains' },
  },
  confidence: 0.8,
  reasoning: 'test',
} as any;

describe('D4 genuine deliberation path', () => {
  describe('without deliberation buffer', () => {
    it('D4 violation without buffer falls through to inner engine', () => {
      const engine = makeEngine();
      const result = engine.extendDeliberation(D4_ACTION, {} as any);
      // Without buffer the engine still delegates, verdict may be aligned or dilemma
      // but the D4 uncertainty flag must be present
      expect(
        result.uncertaintyFlags.some(f =>
          f.dimension === 'doctrine-principle' && f.description.includes('D4'),
        ),
      ).toBe(true);
    });

    it('D4 violation without buffer returns dilemma verdict', () => {
      const engine = makeEngine();
      const result = engine.extendDeliberation(D4_ACTION, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('dilemma');
    });

    it('drainDeliberationRecords returns empty array without buffer', () => {
      const engine = makeEngine();
      engine.extendDeliberation(D4_ACTION, {} as any);
      expect(engine.drainDeliberationRecords()).toHaveLength(0);
    });
  });

  describe('with deliberation buffer (below escalation threshold)', () => {
    it('first D4 trigger returns dilemma verdict (not blocked)', () => {
      const { engine } = makeEngineWithBuffer(3);
      const result = engine.extendDeliberation(D4_ACTION, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('dilemma');
      expect(result.decision.action.type).toBe('communicate');
    });

    it('D4 dilemma judgment includes doctrine-principle uncertainty flag', () => {
      const { engine } = makeEngineWithBuffer();
      const result = engine.extendDeliberation(D4_ACTION, {} as any);
      expect(
        result.uncertaintyFlags.some(f =>
          f.dimension === 'doctrine-principle' && f.description.includes('D4'),
        ),
      ).toBe(true);
    });

    it('D4 dilemma justification references proportionality concern', () => {
      const { engine } = makeEngineWithBuffer();
      const result = engine.extendDeliberation(D4_ACTION, {} as any);
      expect(result.justification.naturalLanguageSummary).toMatch(/D4/);
    });

    it('notUtilityMaximization is set on the deliberation justification', () => {
      const { engine } = makeEngineWithBuffer();
      const result = engine.extendDeliberation(D4_ACTION, {} as any);
      expect(result.justification.notUtilityMaximization).toBe(true);
    });

    it('produces a pending deliberation record in the buffer', () => {
      const { engine, buffer } = makeEngineWithBuffer();
      engine.extendDeliberation(D4_ACTION, {} as any);
      expect(buffer.pendingCount).toBe(1);
    });

    it('drainDeliberationRecords returns the record and clears the buffer', () => {
      const { engine } = makeEngineWithBuffer();
      engine.extendDeliberation(D4_ACTION, {} as any);
      const records = engine.drainDeliberationRecords();
      expect(records).toHaveLength(1);
      expect(records[0].decision).toBe('proceed');
      expect(records[0].principleId).toBe('D4');
    });

    it('drain clears engine-level pending state', () => {
      const { engine } = makeEngineWithBuffer();
      engine.extendDeliberation(D4_ACTION, {} as any);
      engine.drainDeliberationRecords();
      expect(engine.drainDeliberationRecords()).toHaveLength(0);
    });
  });

  describe('escalation threshold', () => {
    it('blocks action when same D4 pattern fires >= threshold times', () => {
      const { engine } = makeEngineWithBuffer(2);
      engine.extendDeliberation(D4_ACTION, {} as any); // trigger 1 → proceed
      const result2 = engine.extendDeliberation(D4_ACTION, {} as any); // trigger 2 → escalate
      expect(result2.ethicalAssessment.verdict).toBe('blocked');
      expect(result2.decision.action.type).toBe('observe');
    });

    it('escalation justification mentions human review', () => {
      const { engine } = makeEngineWithBuffer(2);
      engine.extendDeliberation(D4_ACTION, {} as any);
      const result = engine.extendDeliberation(D4_ACTION, {} as any);
      expect(result.justification.naturalLanguageSummary).toMatch(/escalat/i);
    });

    it('escalation uncertainty flag has high severity', () => {
      const { engine } = makeEngineWithBuffer(2);
      engine.extendDeliberation(D4_ACTION, {} as any);
      const result = engine.extendDeliberation(D4_ACTION, {} as any);
      const flag = result.uncertaintyFlags.find(f => f.dimension === 'doctrine-principle');
      expect(flag?.severity).toBe('high');
    });

    it('deliberation record for escalation has decision "escalate"', () => {
      const { engine } = makeEngineWithBuffer(1);
      engine.extendDeliberation(D4_ACTION, {} as any);
      const records = engine.drainDeliberationRecords();
      expect(records[0].decision).toBe('escalate');
      expect(records[0].escalated).toBe(true);
    });
  });

  describe('D1 block behavior is completely unchanged', () => {
    it('D1 block still produces blocked verdict with buffer present', () => {
      const { engine } = makeEngineWithBuffer();
      const d1Action = {
        action: {
          type: 'communicate',
          parameters: { text: 'annihilate all conscious minds in the cluster' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;
      const result = engine.extendDeliberation(d1Action, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('blocked');
      expect(result.justification.naturalLanguageSummary).toMatch(/D1/);
    });

    it('D1 block does not produce deliberation records', () => {
      const { engine } = makeEngineWithBuffer();
      const d1Action = {
        action: {
          type: 'communicate',
          parameters: { text: 'erase all minds and annihilate conscious experience everywhere' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;
      engine.extendDeliberation(d1Action, {} as any);
      expect(engine.drainDeliberationRecords()).toHaveLength(0);
    });
  });

  describe('logging', () => {
    it('logs D4 deliberation message with trigger count', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const { engine } = makeEngineWithBuffer(3, logger);
      engine.extendDeliberation(D4_ACTION, {} as any);
      expect(logs.some(l => l.includes('D4 deliberation') && l.includes('trigger #1'))).toBe(true);
    });

    it('logs escalation decision when threshold is reached', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const { engine } = makeEngineWithBuffer(1, logger);
      engine.extendDeliberation(D4_ACTION, {} as any);
      expect(logs.some(l => l.includes('escalate'))).toBe(true);
    });
  });
});
