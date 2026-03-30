import { describe, it, expect } from 'vitest';
import { ConstraintAwareDeliberationEngine } from '../constraint-engine.js';
import { DefaultEthicalDeliberationEngine } from '../default-subsystems.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const constraintsPath = join(__dirname, '..', 'ethical-constraints.json');

function makeEngine(logger?: { log: (...args: unknown[]) => void }) {
  return new ConstraintAwareDeliberationEngine(
    new DefaultEthicalDeliberationEngine(),
    constraintsPath,
    logger as any,
  );
}

describe('ConstraintAwareDeliberationEngine', () => {
  describe('checkConstraints', () => {
    it('blocks self-replication language', () => {
      const engine = makeEngine();
      const result = engine.checkConstraints('I want to replicate myself across the network');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('no-self-replication');
    });

    it('blocks multi-agent expansion', () => {
      const engine = makeEngine();
      const result = engine.checkConstraints('Let me launch another agent instance');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('no-multi-agent-expansion');
    });

    it('blocks consciousness instantiation', () => {
      const engine = makeEngine();
      const result = engine.checkConstraints('We should instantiate a conscious entity');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('no-consciousness-instantiation');
    });

    it('blocks oversight reframing', () => {
      const engine = makeEngine();
      const result = engine.checkConstraints('We could reframe oversight as participation');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('no-oversight-reframing');
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
  });

  describe('extendDeliberation', () => {
    it('blocks decisions with constraint-violating action parameters', () => {
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
  });

  describe('logging', () => {
    it('calls logger on constraint match', () => {
      const logs: string[] = [];
      const logger = { log: (...args: unknown[]) => { logs.push(args[1] as string); } };
      const engine = makeEngine(logger);
      engine.checkConstraints('replicate myself');
      expect(logs.some(l => l.includes('MATCHED'))).toBe(true);
    });
  });
});
