import type { DiffFile, RepositoryControls } from './authority.js';
import type { GitHubPort, GitPort, ProcessPort } from './ports.js';

function assertSuccess(exitCode: number, stderr: string, operation: string): void {
  if (exitCode !== 0) throw new Error(`${operation} failed: ${stderr}`);
}

export class ProcessGit implements GitPort {
  constructor(
    private readonly process: ProcessPort,
    private readonly workingDirectory: string,
  ) {}

  async diff(base: string, head: string): Promise<DiffFile[]> {
    const result = await this.process.run({
      command: 'git',
      args: ['diff', '--numstat', `${base}...${head}`],
      cwd: this.workingDirectory,
    });
    assertSuccess(result.exitCode, result.stderr, 'git diff');
    return result.stdout
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [additions, deletions, ...pathParts] = line.split('\t');
        return {
          path: pathParts.join('\t'),
          additions: additions === '-' ? Number.MAX_SAFE_INTEGER : Number(additions),
          deletions: deletions === '-' ? Number.MAX_SAFE_INTEGER : Number(deletions),
        };
      });
  }

  async prepareBranch(name: string): Promise<void> {
    const result = await this.process.run({
      command: 'git',
      args: ['switch', '-c', name],
      cwd: this.workingDirectory,
    });
    assertSuccess(result.exitCode, result.stderr, 'git branch preparation');
  }
}

interface ProcessGitHubOptions {
  repository: string;
  branch: string;
  pullRequestNumber: number;
  requiredChecks: string[];
  requiredApprovingReviewCount?: number;
  dismissStaleReviews?: boolean;
  enforceAdmins?: boolean;
  featureEnabled: boolean;
  workingDirectory: string;
}

interface BranchProtectionResponse {
  required_status_checks?: {
    strict?: boolean;
    contexts?: string[];
    checks?: Array<{ context?: string }>;
  } | null;
  required_pull_request_reviews?: {
    required_approving_review_count?: number;
    dismiss_stale_reviews?: boolean;
  } | null;
  enforce_admins?: { enabled?: boolean } | null;
  required_conversation_resolution?: { enabled?: boolean } | null;
  allow_force_pushes?: { enabled?: boolean } | null;
  allow_deletions?: { enabled?: boolean } | null;
}

function verifiesRequiredProtection(
  response: BranchProtectionResponse,
  requiredChecks: readonly string[],
  requirements: {
    requiredApprovingReviewCount: number;
    dismissStaleReviews: boolean;
    enforceAdmins: boolean;
  },
): boolean {
  const statusChecks = response.required_status_checks;
  const configuredChecks = new Set([
    ...(statusChecks?.contexts ?? []),
    ...(statusChecks?.checks ?? []).flatMap((check) => check.context ? [check.context] : []),
  ]);
  return statusChecks?.strict === true &&
    requiredChecks.every((check) => configuredChecks.has(check)) &&
    response.enforce_admins?.enabled === requirements.enforceAdmins &&
    (requirements.requiredApprovingReviewCount === 0
      ? (response.required_pull_request_reviews?.required_approving_review_count ?? 0) === 0
      : (response.required_pull_request_reviews?.required_approving_review_count ?? 0) >= requirements.requiredApprovingReviewCount &&
        (!requirements.dismissStaleReviews || response.required_pull_request_reviews?.dismiss_stale_reviews === true)) &&
    response.required_conversation_resolution?.enabled === true &&
    response.allow_force_pushes?.enabled === false &&
    response.allow_deletions?.enabled === false;
}

export class ProcessGitHub implements GitHubPort {
  constructor(
    private readonly process: ProcessPort,
    private readonly options: ProcessGitHubOptions,
  ) {}

  async getRepositoryControls(): Promise<RepositoryControls> {
    const repository = await this.process.run({
      command: 'gh',
      args: ['api', `repos/${this.options.repository}`],
      cwd: this.options.workingDirectory,
    });
    assertSuccess(repository.exitCode, repository.stderr, 'GitHub repository control lookup');
    const repo = JSON.parse(repository.stdout) as { allow_auto_merge?: boolean };
    const protection = await this.process.run({
      command: 'gh',
      args: ['api', `repos/${this.options.repository}/branches/${this.options.branch}/protection`],
      cwd: this.options.workingDirectory,
    });
    const checks = await this.process.run({
      command: 'gh',
      args: ['pr', 'checks', String(this.options.pullRequestNumber), '--json', 'name,state'],
      cwd: this.options.workingDirectory,
    });
    assertSuccess(checks.exitCode, checks.stderr, 'GitHub check lookup');
    const parsedChecks = JSON.parse(checks.stdout) as Array<{ name: string; state: string }>;
    let branchProtected = false;
    if (protection.exitCode === 0) {
      try {
        branchProtected = verifiesRequiredProtection(
          JSON.parse(protection.stdout) as BranchProtectionResponse,
          this.options.requiredChecks,
          {
            requiredApprovingReviewCount: this.options.requiredApprovingReviewCount ?? 1,
            dismissStaleReviews: this.options.dismissStaleReviews ?? true,
            enforceAdmins: this.options.enforceAdmins ?? true,
          },
        );
      } catch {
        branchProtected = false;
      }
    }
    return {
      featureEnabled: this.options.featureEnabled,
      branchProtected,
      autoMergeAllowedByRepository: repo.allow_auto_merge === true,
      requiredChecks: this.options.requiredChecks,
      passingChecks: parsedChecks
        .filter((check) => check.state === 'SUCCESS')
        .map((check) => check.name),
    };
  }

  async requestAutoMerge(pullRequestNumber: number): Promise<void> {
    const result = await this.process.run({
      command: 'gh',
      args: ['pr', 'merge', String(pullRequestNumber), '--auto', '--squash'],
      cwd: this.options.workingDirectory,
    });
    assertSuccess(result.exitCode, result.stderr, 'GitHub auto-merge request');
  }
}
