/**
 * Proposal System tests — covers the 5 behavioral spec scenarios from
 * plan/0.3.1.5.15-proposal-system.md
 *
 * Scenarios:
 *   1. Successful proposal creation
 *   2. Rate limit enforcement (3 per 24-hour window)
 *   3. Rate limit window reset after 24 hours
 *   4. Check specific proposal by issue number
 *   5. List all open proposals
 *
 * All GitHub CLI calls are mocked via child_process.execSync.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, type MockInstance } from 'vitest';
import { executeToolCall } from '../tool-executor.js';
import type { ToolExecutorDeps } from '../tool-executor.js';

// ── Mock child_process.execSync ─────────────────────────────────────────

const { execSyncMock } = vi.hoisted(() => {
  const execSyncMock = vi.fn();
  return { execSyncMock };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, execSync: execSyncMock };
});

// ── Mock node:fs so write_file / read_file don't touch disk ─────────────

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(''),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────

function makeDeps(): ToolExecutorDeps {
  return {
    memorySystem: null,
    driveSystem: { recordActivity: () => {} } as any,
    goalCoherenceEngine: null,
    personalityModel: null,
    experientialState: {
      valence: 0,
      arousal: 0.3,
      dominantEmotion: 'neutral',
      unityIndex: 0.8,
      timestamp: Date.now(),
    } as any,
    goals: [],
    activityLog: [],
    narrativeIdentity: '',
    projectRoot: '/fake/project',
    workspacePath: '/fake/workspace',
    adapter: null,
    chatLog: null,
    taskJournal: null,
    agentDigest: null,
    constraintEngine: null,
  };
}

const GH_ISSUE_URL = 'https://github.com/rookdaemon/MASTER_PLAN/issues/42';

// ── Tests ────────────────────────────────────────────────────────────────

describe('Proposal System', () => {
  // Use fake timers for the entire suite — the module-level rate limit state
  // (_proposalCount, _proposalWindowStart) persists across tests, so we must
  // keep the fake clock monotonically advancing (never reset it mid-suite).
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: gh issue create returns a URL
    execSyncMock.mockReturnValue(GH_ISSUE_URL);
    // Advance 25 hours to guarantee a fresh rate-limit window for each test.
    // Because fake timers accumulate monotonically, this always moves past
    // the previous test's window start.
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
  });

  describe('Scenario 1: Successful proposal creation', () => {
    it('creates a GitHub issue with correct labels and returns the URL', async () => {
      const result = await executeToolCall(
        {
          name: 'create_proposal',
          input: {
            title: 'Add memory compaction',
            type: 'code_change',
            description: 'Memory store grows unbounded...',
          },
        },
        makeDeps(),
      );

      expect(result.is_error).toBe(false);
      const parsed = JSON.parse(result.content);
      expect(parsed.status).toBe('created');
      expect(parsed.issue_number).toBe(42);
      expect(parsed.url).toBe(GH_ISSUE_URL);

      // Verify gh was called with correct labels
      expect(execSyncMock).toHaveBeenCalledTimes(1);
      const ghCall = execSyncMock.mock.calls[0][0] as string;
      expect(ghCall).toContain('--repo rookdaemon/MASTER_PLAN');
      expect(ghCall).toContain('agent-proposal');
      expect(ghCall).toContain('proposal:code-change');
      expect(ghCall).toContain('priority:medium'); // default priority
    });
  });

  describe('Scenario 2: Rate limit enforcement', () => {
    it('blocks the 4th proposal within a 24-hour window', async () => {
      const deps = makeDeps();

      // Create 3 proposals successfully
      for (let i = 0; i < 3; i++) {
        const r = await executeToolCall(
          {
            name: 'create_proposal',
            input: {
              title: `Proposal ${i + 1}`,
              type: 'plan_change',
              description: `Description ${i + 1}`,
            },
          },
          deps,
        );
        expect(r.is_error).toBe(false);
      }

      // 4th proposal should be blocked
      const blocked = await executeToolCall(
        {
          name: 'create_proposal',
          input: {
            title: 'Proposal 4',
            type: 'architecture',
            description: 'Should be blocked',
          },
        },
        deps,
      );

      expect(blocked.is_error).toBe(true);
      expect(blocked.content).toMatch(/already created 3 proposals/i);
      // gh should have been called only 3 times, not 4
      expect(execSyncMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('Scenario 3: Rate limit window reset', () => {
    it('resets the counter after 24 hours have elapsed', async () => {
      const deps = makeDeps();

      // Create 3 proposals
      for (let i = 0; i < 3; i++) {
        await executeToolCall(
          {
            name: 'create_proposal',
            input: {
              title: `Old proposal ${i + 1}`,
              type: 'resource_request',
              description: `Old description ${i + 1}`,
            },
          },
          deps,
        );
      }

      // Advance past the 24-hour window
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      // This should succeed because the window has reset
      const result = await executeToolCall(
        {
          name: 'create_proposal',
          input: {
            title: 'New proposal after reset',
            type: 'code_change',
            description: 'Window should have reset',
          },
        },
        deps,
      );

      expect(result.is_error).toBe(false);
      const parsed = JSON.parse(result.content);
      expect(parsed.status).toBe('created');
    });
  });

  describe('Scenario 4: Check specific proposal', () => {
    it('returns issue details when given an issue number', async () => {
      const issueData = {
        number: 42,
        title: 'Add memory compaction',
        state: 'OPEN',
        labels: [{ name: 'agent-proposal' }, { name: 'proposal:code-change' }],
        body: 'Memory store grows unbounded...',
        comments: [],
        createdAt: '2026-03-31T00:00:00Z',
        closedAt: null,
      };
      execSyncMock.mockReturnValue(JSON.stringify(issueData));

      const result = await executeToolCall(
        {
          name: 'check_proposal',
          input: { issue_number: 42 },
        },
        makeDeps(),
      );

      expect(result.is_error).toBe(false);
      const parsed = JSON.parse(result.content);
      expect(parsed.number).toBe(42);
      expect(parsed.title).toBe('Add memory compaction');
      expect(parsed.state).toBe('OPEN');
      expect(parsed.body).toContain('Memory store grows unbounded');

      const ghCall = execSyncMock.mock.calls[0][0] as string;
      expect(ghCall).toContain('gh issue view 42');
      expect(ghCall).toContain('--repo rookdaemon/MASTER_PLAN');
    });
  });

  describe('Scenario 5: List all open proposals', () => {
    it('returns a list of open agent-proposal issues when no issue number given', async () => {
      const issueList = [
        { number: 41, title: 'Proposal A', state: 'OPEN', labels: [{ name: 'agent-proposal' }], createdAt: '2026-03-30T00:00:00Z' },
        { number: 42, title: 'Proposal B', state: 'OPEN', labels: [{ name: 'agent-proposal' }], createdAt: '2026-03-31T00:00:00Z' },
      ];
      execSyncMock.mockReturnValue(JSON.stringify(issueList));

      const result = await executeToolCall(
        {
          name: 'check_proposal',
          input: {},
        },
        makeDeps(),
      );

      expect(result.is_error).toBe(false);
      const parsed = JSON.parse(result.content);
      expect(parsed.count).toBe(2);
      expect(parsed.proposals).toHaveLength(2);
      expect(parsed.proposals[0].number).toBe(41);
      expect(parsed.proposals[1].number).toBe(42);

      const ghCall = execSyncMock.mock.calls[0][0] as string;
      expect(ghCall).toContain('gh issue list');
      expect(ghCall).toContain('--label agent-proposal');
      expect(ghCall).toContain('--state open');
    });
  });

  describe('Precondition guards', () => {
    it('rejects missing title', async () => {
      const result = await executeToolCall(
        { name: 'create_proposal', input: { type: 'code_change', description: 'desc' } },
        makeDeps(),
      );
      expect(result.is_error).toBe(true);
      expect(result.content).toMatch(/title/i);
    });

    it('rejects invalid type', async () => {
      const result = await executeToolCall(
        { name: 'create_proposal', input: { title: 'T', type: 'invalid_type', description: 'desc' } },
        makeDeps(),
      );
      expect(result.is_error).toBe(true);
      expect(result.content).toMatch(/type/i);
    });

    it('rejects missing description', async () => {
      const result = await executeToolCall(
        { name: 'create_proposal', input: { title: 'T', type: 'code_change' } },
        makeDeps(),
      );
      expect(result.is_error).toBe(true);
      expect(result.content).toMatch(/description/i);
    });

    it('rejects invalid priority', async () => {
      const result = await executeToolCall(
        { name: 'create_proposal', input: { title: 'T', type: 'code_change', description: 'D', priority: 'urgent' } },
        makeDeps(),
      );
      expect(result.is_error).toBe(true);
      expect(result.content).toMatch(/priority/i);
    });

    it('rejects non-positive issue_number in check_proposal', async () => {
      const result = await executeToolCall(
        { name: 'check_proposal', input: { issue_number: -1 } },
        makeDeps(),
      );
      expect(result.is_error).toBe(true);
      expect(result.content).toMatch(/positive integer/i);
    });
  });

  describe('Threshold Registry constants', () => {
    it('enforces exactly 3 proposals per window (MAX_PROPOSALS_PER_DAY)', async () => {
      const deps = makeDeps();

      // 3 should succeed
      for (let i = 0; i < 3; i++) {
        const r = await executeToolCall(
          { name: 'create_proposal', input: { title: `P${i}`, type: 'plan_change', description: `D${i}` } },
          deps,
        );
        expect(r.is_error).toBe(false);
      }

      // 4th blocked
      const r4 = await executeToolCall(
        { name: 'create_proposal', input: { title: 'P3', type: 'plan_change', description: 'D3' } },
        deps,
      );
      expect(r4.is_error).toBe(true);
    });

    it('window resets after exactly 86,400,000ms (PROPOSAL_WINDOW_MS)', async () => {
      // Start a fresh window
      const deps = makeDeps();

      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        await executeToolCall(
          { name: 'create_proposal', input: { title: `P${i}`, type: 'plan_change', description: `D${i}` } },
          deps,
        );
      }

      // Advance by exactly 86_400_000ms (24h)
      vi.advanceTimersByTime(86_400_001);

      const result = await executeToolCall(
        { name: 'create_proposal', input: { title: 'After window', type: 'code_change', description: 'Reset' } },
        deps,
      );
      expect(result.is_error).toBe(false);
    });
  });

  describe('Invariants', () => {
    it('agent-proposal label is present on every created issue', async () => {
      const deps = makeDeps();

      for (const type of ['plan_change', 'resource_request', 'code_change'] as const) {
        await executeToolCall(
          { name: 'create_proposal', input: { title: `T`, type, description: 'D' } },
          deps,
        );
      }

      for (const call of execSyncMock.mock.calls) {
        const cmd = call[0] as string;
        expect(cmd).toContain('agent-proposal');
      }
    });
  });
});
