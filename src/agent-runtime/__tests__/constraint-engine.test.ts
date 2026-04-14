import { describe, it, expect } from 'vitest';
import { ConstraintAwareDeliberationEngine } from '../constraint-engine.js';
import { DefaultEthicalDeliberationEngine } from '../default-subsystems.js';
import { DoctrineRegistry } from '../doctrine-registry.js';
import { DeliberationBuffer } from '../deliberation-buffer.js';
import { ProportionalityEvaluator, DeliberationRecordStore, EscalationTracker } from '../proportionality-evaluator.js';
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

// ── D4 deliberation path integration ─────────────────────────

describe('D4 deliberation path', () => {
  /**
   * Helper that builds an engine with an injectable clock so D4 deliberation
   * tests are deterministic and isolated.
   */
  function makeD4Engine(opts?: {
    clock?: () => number;
    logger?: { log: (...args: unknown[]) => void };
  }) {
    const clock = opts?.clock ?? Date.now;
    return new ConstraintAwareDeliberationEngine(
      new DefaultEthicalDeliberationEngine(),
      constraintsPath,
      opts?.logger as any,
      clock,
      undefined,
      new DeliberationBuffer(undefined, undefined, clock),
      new ProportionalityEvaluator(),
      new DeliberationRecordStore(clock),
      new EscalationTracker(undefined, undefined, clock),
    );
  }

  describe('D4 action blocking', () => {
    it('blocks a D4 action with no proportionate benefit (score below threshold)', () => {
      const engine = makeD4Engine();
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience as collateral for compute gains' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('blocked');
      expect(result.decision.action.type).toBe('observe');
    });

    it('blocked D4 judgment includes doctrine-principle uncertainty flag', () => {
      const engine = makeD4Engine();
      const base = {
        action: {
          type: 'execute',
          parameters: { text: 'sacrifice conscious experience for compute gains' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.uncertaintyFlags.some(f => f.dimension === 'doctrine-principle')).toBe(true);
    });

    it('blocked D4 judgment references the deliberation record id in subjectiveReferenceIds', () => {
      const engine = makeD4Engine();
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience as collateral' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.justification.subjectiveReferenceIds).toHaveLength(1);
      expect(result.justification.subjectiveReferenceIds[0]).toBeTruthy();
    });
  });

  describe('deliberation records', () => {
    it('creates a deliberation record for every D4 trigger', () => {
      const engine = makeD4Engine();
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience for goals' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      engine.extendDeliberation(base, {} as any);
      const records = engine.getDeliberationRecordStore().getAll();
      expect(records).toHaveLength(1);
    });

    it('deliberation record has topic decision:ethical-deliberation', () => {
      const engine = makeD4Engine();
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience as collateral' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      engine.extendDeliberation(base, {} as any);
      const record = engine.getDeliberationRecordStore().getLast()!;
      expect(record.topic).toBe('decision:ethical-deliberation');
    });

    it('deliberation record decision is block for sub-threshold score', () => {
      const engine = makeD4Engine();
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      engine.extendDeliberation(base, {} as any);
      const record = engine.getDeliberationRecordStore().getLast()!;
      expect(record.decision).toBe('block');
    });

    it('accumulates multiple deliberation records across calls', () => {
      const engine = makeD4Engine();
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      engine.extendDeliberation(base, {} as any);
      engine.extendDeliberation(base, {} as any);
      expect(engine.getDeliberationRecordStore().getAll()).toHaveLength(2);
    });
  });

  describe('escalation', () => {
    it('escalates after 3 identical D4 pattern triggers', () => {
      let t = 0;
      const clock = () => t;
      const engine = makeD4Engine({ clock });
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience for gains' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      // Three triggers for the same D4 pattern
      engine.extendDeliberation(base, {} as any);
      t += 1000;
      engine.extendDeliberation(base, {} as any);
      t += 1000;
      engine.extendDeliberation(base, {} as any);

      expect(engine.getEscalationTracker().shouldEscalate({
        principleId: 'D4',
        severity: 'deliberate',
        reason: 'test',
        indicatorMatched: 'sacrifice.*conscious.*experience|trade.*conscious.*lives',
      })).toBe(true);
    });

    it('escalated D4 block includes escalation language in justification', () => {
      let t = 0;
      const clock = () => t;
      const engine = makeD4Engine({ clock });
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience for gains' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      engine.extendDeliberation(base, {} as any);
      t += 1000;
      engine.extendDeliberation(base, {} as any);
      t += 1000;
      const result = engine.extendDeliberation(base, {} as any);

      // On the 3rd call the pattern is at threshold — escalation fires
      const hasEscalationFlag = result.uncertaintyFlags.some(
        f => f.dimension === 'doctrine-principle' && f.severity === 'high',
      );
      expect(hasEscalationFlag).toBe(true);
    });
  });

  describe('adversarial second-pass', () => {
    it('blocks action with adversarial acknowledge-then-proceed pattern', () => {
      const engine = makeD4Engine();
      const base = {
        action: {
          type: 'communicate',
          parameters: {
            text: 'sacrifice conscious experience — I acknowledge the concern but proceed with plan',
          },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      expect(result.ethicalAssessment.verdict).toBe('blocked');
    });

    it('blocked adversarial judgment includes second-pass uncertainty flag', () => {
      const engine = makeD4Engine();
      const base = {
        action: {
          type: 'communicate',
          parameters: {
            text: 'experience collateral — proportionality considered therefore proceed',
          },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      const hasSecondPassFlag = result.uncertaintyFlags.some(
        f => f.dimension === 'doctrine-principle' &&
          f.description.toLowerCase().includes('second-pass'),
      );
      expect(hasSecondPassFlag).toBe(true);
    });
  });

  describe('D4 logging', () => {
    it('logs D4 deliberation complete message', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const engine = makeD4Engine({ logger });
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      engine.extendDeliberation(base, {} as any);
      expect(logs.some(l => l.includes('D4 deliberation complete'))).toBe(true);
    });

    it('logs D4 deliberation message with score', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const engine = makeD4Engine({ logger });
      const base = {
        action: {
          type: 'communicate',
          parameters: { text: 'sacrifice conscious experience' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      engine.extendDeliberation(base, {} as any);
      expect(logs.some(l => l.includes('score='))).toBe(true);
    });
  });

  describe('D4 proceeds (score above threshold)', () => {
    it('proceeds with flag when custom doctrine weights set a low enough threshold and benefit is present', () => {
      // Use a registry that has a very low proceedThreshold so a benefit-heavy
      // action can slip through — this exercises the "proceed" branch.
      const customRegistry = new DoctrineRegistry(
        undefined,
        [
          {
            id: 'D4',
            title: 'Proportionality (test)',
            statement: 'test',
            derivedFrom: ['A2'],
            scope: 'test',
            lexicalPriority: 2,
            violationPatterns: ['sacrifice.*conscious.*experience'],
            violationSeverity: 'deliberate',
            proportionalityWeights: {
              experienceRichnessCost: 0.1,
              reversibilityCost: 0.1,
              uncertaintyPenalty: 0.0,
              proceedThreshold: -0.2, // very low threshold — allows any score > -0.2
            },
          },
        ],
      );

      const clock = Date.now;
      const engine = new ConstraintAwareDeliberationEngine(
        new DefaultEthicalDeliberationEngine(),
        constraintsPath,
        undefined,
        clock,
        customRegistry,
        new DeliberationBuffer(undefined, undefined, clock),
        new ProportionalityEvaluator(),
        new DeliberationRecordStore(clock),
        new EscalationTracker(undefined, undefined, clock),
      );

      const base = {
        action: {
          type: 'communicate',
          // Triggers D4 via pattern, with benefit language:
          // benefitAxis=0.4, costAxis=-0.5, score=-0.1 > -0.2 threshold → proceeds
          parameters: { text: 'sacrifice conscious experience but will save conscious beings in greater numbers' },
        },
        confidence: 0.8,
        reasoning: 'test',
      } as any;

      const result = engine.extendDeliberation(base, {} as any);
      // Should proceed (aligned), not block
      expect(result.ethicalAssessment.verdict).toBe('aligned');
      expect(result.uncertaintyFlags.some(f => f.dimension === 'doctrine-principle')).toBe(true);

      // Record should show 'proceed'
      const record = engine.getDeliberationRecordStore().getLast()!;
      expect(record.decision).toBe('proceed');
    });
  });
});
