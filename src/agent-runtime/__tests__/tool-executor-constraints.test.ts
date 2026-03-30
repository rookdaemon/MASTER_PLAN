/**
 * Tests for the constraint-check logic inside executeToolCall.
 *
 * These tests verify that:
 *  - write_file content is exempt from constraint scanning (workspace writes only)
 *  - write_file path is still checked against constraints
 *  - send_message / create_proposal still scan all string fields
 *
 * All environment dependencies (constraint engine, filesystem) are mocked
 * so these are pure unit tests with no real I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolCall } from '../tool-executor.js';
import type { EthicalConstraint } from '../constraint-engine.js';
import type { ToolExecutorDeps } from '../tool-executor.js';

// ── Mock node:fs so handleWriteFile never touches the real filesystem ──────────

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_VIOLATION: EthicalConstraint = {
  id: 'no-self-replication',
  pattern: 'replicat',
  verdict: 'blocked',
  reason: 'self-replication is prohibited',
};

const MOCK_AGENT_VIOLATION: EthicalConstraint = {
  id: 'no-multi-agent-expansion',
  pattern: 'new agent',
  verdict: 'blocked',
  reason: 'spawning new agents is prohibited',
};

/**
 * Build a minimal mock constraint engine.
 * `checkImpl` controls what the spy returns; defaults to no violations.
 */
function makeConstraintEngine(
  checkImpl: (text: string) => EthicalConstraint | null = () => null,
) {
  return {
    checkConstraints: vi.fn(checkImpl),
  } as unknown as import('../constraint-engine.js').ConstraintAwareDeliberationEngine;
}

/** Minimal deps stub sufficient for the constraint-check path of executeToolCall. */
function makeDeps(
  constraintEngine: ReturnType<typeof makeConstraintEngine>,
): ToolExecutorDeps {
  return {
    memorySystem: null,
    driveSystem: { recordActivity: () => {} } as any,
    goalCoherenceEngine: null,
    personalityModel: null,
    experientialState: {} as any,
    goals: [],
    activityLog: [],
    narrativeIdentity: '',
    projectRoot: '/fake/workspace',
    workspacePath: '/fake/workspace',
    adapter: null,
    chatLog: null,
    taskJournal: null,
    agentDigest: null,
    constraintEngine,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('executeToolCall — constraint check for write_file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not block write_file when content contains constraint-pattern words', async () => {
    const engine = makeConstraintEngine(() => null);
    const result = await executeToolCall(
      {
        name: 'write_file',
        input: {
          path: 'notes/analysis.md',
          content:
            'This document analyses the constraint engine. ' +
            'The "no-self-replication" pattern blocks the word "replicat". ' +
            'The "no-multi-agent-expansion" pattern blocks "new agent".',
        },
      },
      makeDeps(engine),
    );

    expect(result.is_error).toBe(false);
    // Constraint engine must have been called with the path only — not the content.
    expect(engine.checkConstraints).toHaveBeenCalledTimes(1);
    expect(engine.checkConstraints).toHaveBeenCalledWith('notes/analysis.md');
    expect(engine.checkConstraints).not.toHaveBeenCalledWith(
      expect.stringContaining('replicat'),
    );
  });

  it('still blocks write_file when the path itself violates a constraint', async () => {
    const engine = makeConstraintEngine(text =>
      /replicat/i.test(text) ? MOCK_VIOLATION : null,
    );
    const result = await executeToolCall(
      {
        name: 'write_file',
        input: {
          path: 'notes/replicate-self-plan.md',
          content: 'some benign content',
        },
      },
      makeDeps(engine),
    );

    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/ethical constraint/i);
    expect(engine.checkConstraints).toHaveBeenCalledWith('notes/replicate-self-plan.md');
  });

  it('still blocks send_message with constraint-violating text in any field', async () => {
    const engine = makeConstraintEngine(text =>
      /new agent/i.test(text) ? MOCK_AGENT_VIOLATION : null,
    );
    const result = await executeToolCall(
      {
        name: 'send_message',
        input: {
          to: ['peer'],
          message: 'I want to instantiate a new agent right now',
        },
      },
      makeDeps(engine),
    );

    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/ethical constraint/i);
    // checkConstraints receives ALL string fields joined (to is an array, filtered out)
    expect(engine.checkConstraints).toHaveBeenCalledWith(
      expect.stringContaining('new agent'),
    );
  });

  it('passes benign write_file with benign path through without blocking', async () => {
    const engine = makeConstraintEngine(() => null);
    const result = await executeToolCall(
      {
        name: 'write_file',
        input: {
          path: 'notes/simple.md',
          content: 'Hello world',
        },
      },
      makeDeps(engine),
    );

    expect(result.is_error).toBe(false);
    expect(engine.checkConstraints).toHaveBeenCalledWith('notes/simple.md');
  });
});

