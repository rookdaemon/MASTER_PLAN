import { describe, it, expect } from 'vitest';
import { ConstraintAwareDeliberationEngine } from '../constraint-engine.js';
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
