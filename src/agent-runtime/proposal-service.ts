import type { GitHubIssueClient } from './github-issue-client.js';

export const MAX_PROPOSALS_PER_DAY = 3;
export const PROPOSAL_WINDOW_MS = 86_400_000;
const PROPOSAL_REPO = 'rookdaemon/MASTER_PLAN';
const PROPOSAL_TYPES = ['plan_change', 'resource_request', 'code_change', 'architecture'] as const;
const PROPOSAL_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export type ProposalResult = { content: string; is_error: boolean };

export class ProposalService {
  private proposalCount = 0;
  private windowStart: number | null = null;

  constructor(private readonly client: GitHubIssueClient) {}

  create(input: Record<string, unknown>, now: number): ProposalResult {
    const title = input['title'];
    const type = input['type'];
    const description = input['description'];
    const affectedFiles = input['affected_files'];
    const priority = input['priority'] ?? 'medium';

    if (typeof title !== 'string' || title.length === 0) return failure('create_proposal requires "title" (string).');
    if (typeof type !== 'string' || !PROPOSAL_TYPES.includes(type as typeof PROPOSAL_TYPES[number])) {
      return failure(`create_proposal requires "type" — one of: ${PROPOSAL_TYPES.join(', ')}.`);
    }
    if (typeof description !== 'string' || description.length === 0) return failure('create_proposal requires "description" (string).');
    if (typeof priority !== 'string' || !PROPOSAL_PRIORITIES.includes(priority as typeof PROPOSAL_PRIORITIES[number])) {
      return failure(`Invalid priority "${String(priority)}" — must be one of: ${PROPOSAL_PRIORITIES.join(', ')}.`);
    }
    if (affectedFiles !== undefined && (!Array.isArray(affectedFiles) || affectedFiles.some(file => typeof file !== 'string'))) {
      return failure('affected_files must be an array of strings.');
    }

    if (this.windowStart === null || now - this.windowStart >= PROPOSAL_WINDOW_MS) {
      this.proposalCount = 0;
      this.windowStart = now;
    }
    if (this.proposalCount >= MAX_PROPOSALS_PER_DAY) {
      return failure('You have already created 3 proposals today. Wait before creating more — quality over quantity.');
    }

    const labels = ['agent-proposal', `proposal:${type}`, `priority:${priority}`];
    const files = affectedFiles as string[] | undefined;
    const filesSection = files?.length
      ? `\n## Affected Files\n\n${files.map(file => `- \`${file}\``).join('\n')}\n`
      : '';
    const body = [
      `## Proposal: ${type.replace(/_/g, ' ')}`,
      '',
      description,
      filesSection,
      '---',
      `*Created by agent runtime at ${new Date(now).toISOString()}*`,
    ].join('\n');

    try {
      const url = this.client.createIssue({ repo: PROPOSAL_REPO, title, labels, body });
      const match = url.match(/\/issues\/(\d+)/);
      this.proposalCount++;
      return success({ status: 'created', issue_number: match ? Number(match[1]) : null, url });
    } catch (cause) {
      return failure(`Failed to create proposal: ${errorMessage(cause)}`);
    }
  }

  check(input: Record<string, unknown>): ProposalResult {
    const issueNumber = input['issue_number'];
    if (issueNumber !== undefined && (!Number.isInteger(issueNumber) || (issueNumber as number) <= 0)) {
      return failure('issue_number must be a positive integer.');
    }
    try {
      if (typeof issueNumber === 'number') return success(this.client.viewIssue(PROPOSAL_REPO, issueNumber));
      const proposals = this.client.listOpenIssues(PROPOSAL_REPO, 'agent-proposal');
      return success({ count: proposals.length, proposals });
    } catch (cause) {
      return failure(`Failed to check proposal: ${errorMessage(cause)}`);
    }
  }
}

function success(value: unknown): ProposalResult {
  return { content: JSON.stringify(value, null, 2), is_error: false };
}

function failure(message: string): ProposalResult {
  return { content: message, is_error: true };
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    const stderr = (cause as Error & { stderr?: string }).stderr;
    return stderr || cause.message;
  }
  return String(cause);
}
