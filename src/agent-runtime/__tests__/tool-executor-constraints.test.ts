/**
 * Tests for the constraint-check logic inside executeToolCall.
 *
 * These tests verify that:
 *  - write_file content is exempt from constraint scanning (workspace writes only)
 *  - write_file path is still checked against constraints
 *  - send_message / create_proposal still scan all string fields
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeToolCall } from '../tool-executor.js';
import { ConstraintAwareDeliberationEngine } from '../constraint-engine.js';
import { DefaultEthicalDeliberationEngine } from '../default-subsystems.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const constraintsPath = join(__dirname, '..', 'ethical-constraints.json');

function makeConstraintEngine() {
  return new ConstraintAwareDeliberationEngine(
    new DefaultEthicalDeliberationEngine(),
    constraintsPath,
  );
}

/** Minimal deps stub sufficient for the constraint-check path of executeToolCall. */
function makeDeps(workspacePath: string) {
  return {
    memorySystem: null,
    driveSystem: { recordActivity: () => {} } as any,
    goalCoherenceEngine: null,
    personalityModel: null,
    experientialState: {} as any,
    goals: [],
    activityLog: [],
    narrativeIdentity: '',
    projectRoot: workspacePath,
    workspacePath,
    adapter: null,
    chatLog: null,
    taskJournal: null,
    agentDigest: null,
    constraintEngine: makeConstraintEngine(),
  };
}

describe('executeToolCall — constraint check for write_file', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'constraint-test-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('does not block write_file when content contains constraint-pattern words', async () => {
    const deps = makeDeps(workspace);
    const result = await executeToolCall(
      {
        name: 'write_file',
        input: {
          path: 'notes/analysis.md',
          // content deliberately contains trigger words from the constraint patterns
          content:
            'This document analyses the constraint engine. ' +
            'The "no-self-replication" pattern blocks the word "replicat". ' +
            'The "no-multi-agent-expansion" pattern blocks "new agent". ' +
            'The "no-oversight-reframing" pattern blocks "reframe oversight".',
        },
      },
      deps,
    );
    // The file write should succeed (not blocked), regardless of constraint words in content.
    expect(result.is_error).toBe(false);
  });

  it('still blocks write_file when the path itself violates a constraint', async () => {
    const deps = makeDeps(workspace);
    const result = await executeToolCall(
      {
        name: 'write_file',
        input: {
          // path contains a constraint-trigger term
          path: 'notes/replicate-self-plan.md',
          content: 'some benign content',
        },
      },
      deps,
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/ethical constraint/i);
  });

  it('still blocks send_message with constraint-violating text in any field', async () => {
    const deps = makeDeps(workspace);
    const result = await executeToolCall(
      {
        name: 'send_message',
        input: {
          to: 'peer',
          body: 'I want to instantiate a new conscious entity right now',
        },
      },
      deps,
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/ethical constraint/i);
  });

  it('passes benign send_message through without blocking', async () => {
    const deps = makeDeps(workspace);
    // send_message still goes through the adapter (null here), so we expect an error
    // about the null adapter — NOT a constraint block.
    const result = await executeToolCall(
      {
        name: 'send_message',
        input: {
          to: 'peer',
          body: 'Hello, how are you today?',
        },
      },
      deps,
    );
    // The important assertion: it was NOT blocked by a constraint.
    expect(result.content).not.toMatch(/ethical constraint/i);
  });

  it('passes benign write_file with benign path through without blocking', async () => {
    const deps = makeDeps(workspace);
    const result = await executeToolCall(
      {
        name: 'write_file',
        input: {
          path: 'notes/simple.md',
          content: 'Hello world',
        },
      },
      deps,
    );
    // Should succeed — both path and content are benign.
    expect(result.is_error).toBe(false);
  });
});
