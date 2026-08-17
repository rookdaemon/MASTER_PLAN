/**
 * Proposal System tests — covers the 5 behavioral spec scenarios from
 * Canonical runtime proposal-system reference.
 *
 * Scenarios:
 *   1. Successful proposal creation
 *   2. Rate limit enforcement (3 per 24-hour window)
 *   3. Rate limit window reset after 24 hours
 *   4. Check specific proposal by issue number
 *   5. List all open proposals
 *
 * GitHub operations are supplied through a fake issue client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolCall } from '../tool-executor.js';
import type { ToolExecutorDeps } from '../tool-executor.js';
import type { GitHubIssueClient } from '../github-issue-client.js';
import { ProposalService } from '../proposal-service.js';

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

const createIssue = vi.fn();
const viewIssue = vi.fn();
const listOpenIssues = vi.fn();
const issueClient: GitHubIssueClient = { createIssue, viewIssue, listOpenIssues };

function makeDeps(now = 1_800_000_000_000): ToolExecutorDeps {
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
      timestamp: now,
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
    proposalService: new ProposalService(issueClient),
  };
}

const GH_ISSUE_URL = 'https://github.com/rookdaemon/MASTER_PLAN/issues/42';

// ── Tests ────────────────────────────────────────────────────────────────

describe('Proposal System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createIssue.mockReturnValue(GH_ISSUE_URL);
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
      expect(createIssue).toHaveBeenCalledWith(expect.objectContaining({
        repo: 'rookdaemon/MASTER_PLAN',
        labels: ['agent-proposal', 'proposal:code_change', 'priority:medium'],
      }));
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
      expect(createIssue).toHaveBeenCalledTimes(3);
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
      deps.experientialState = {
        ...deps.experientialState,
        timestamp: deps.experientialState.timestamp + 25 * 60 * 60 * 1000,
      };

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
        labels: [{ name: 'agent-proposal' }, { name: 'proposal:code_change' }],
        body: 'Memory store grows unbounded...',
        comments: [],
        createdAt: '2026-03-31T00:00:00Z',
        closedAt: null,
      };
      viewIssue.mockReturnValue(issueData);

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

      expect(viewIssue).toHaveBeenCalledWith('rookdaemon/MASTER_PLAN', 42);
    });
  });

  describe('Scenario 5: List all open proposals', () => {
    it('returns a list of open agent-proposal issues when no issue number given', async () => {
      const issueList = [
        { number: 41, title: 'Proposal A', state: 'OPEN', labels: [{ name: 'agent-proposal' }], createdAt: '2026-03-30T00:00:00Z' },
        { number: 42, title: 'Proposal B', state: 'OPEN', labels: [{ name: 'agent-proposal' }], createdAt: '2026-03-31T00:00:00Z' },
      ];
      listOpenIssues.mockReturnValue(issueList);

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

      expect(listOpenIssues).toHaveBeenCalledWith('rookdaemon/MASTER_PLAN', 'agent-proposal');
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
      deps.experientialState = {
        ...deps.experientialState,
        timestamp: deps.experientialState.timestamp + 86_400_000,
      };

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

      for (const call of createIssue.mock.calls) {
        expect(call[0].labels).toContain('agent-proposal');
      }
    });
  });
});
