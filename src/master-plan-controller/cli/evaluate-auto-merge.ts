import { AutoMergeService } from '../auto-merge-service.js';
import { classifyChange } from '../change-classifier.js';
import { ProcessGit, ProcessGitHub } from '../process-adapters.js';
import { NodeFileSystem, NodeProcess } from '../runtime-adapters.js';
import { argumentValue, NodeCliRuntime } from './runtime.js';
import { safeAutoMergeFeatureEnabled } from '../auto-merge-gate.js';

interface BranchProtectionFile {
  branch: string;
  requiredStatusChecks: string[];
  requiredApprovingReviewCount: number;
  dismissStaleReviews: boolean;
  enforceAdmins: boolean;
  safeAutoMergeVariableEnabled: boolean;
}

async function main(): Promise<void> {
  const cli = new NodeCliRuntime();
  const args = cli.arguments();
  const base = argumentValue(args, '--base') ?? cli.environment('BASE_SHA');
  const head = argumentValue(args, '--head') ?? cli.environment('HEAD_SHA');
  const pullRequest = Number(argumentValue(args, '--pr') ?? cli.environment('PR_NUMBER'));
  const repository = cli.environment('GITHUB_REPOSITORY');
  const workingDirectory = cli.environment('GITHUB_WORKSPACE') ?? '.';
  if (!base || !head || !repository || !Number.isSafeInteger(pullRequest)) {
    cli.writeError('base, head, pull request number, and GITHUB_REPOSITORY are required');
    cli.fail();
    return;
  }
  try {
    const process = new NodeProcess();
    const git = new ProcessGit(process, workingDirectory);
    const classification = classifyChange(await git.diff(base, head));
    const fileSystem = new NodeFileSystem(workingDirectory);
    const branchProtection = JSON.parse(
      await fileSystem.readText('strategy/branch-protection.json'),
    ) as BranchProtectionFile;
    const github = new ProcessGitHub(process, {
      repository,
      branch: branchProtection.branch,
      pullRequestNumber: pullRequest,
      requiredChecks: branchProtection.requiredStatusChecks,
      requiredApprovingReviewCount: branchProtection.requiredApprovingReviewCount,
      dismissStaleReviews: branchProtection.dismissStaleReviews,
      enforceAdmins: branchProtection.enforceAdmins,
      featureEnabled: safeAutoMergeFeatureEnabled(
        branchProtection.safeAutoMergeVariableEnabled,
        cli.environment('MASTER_PLAN_SAFE_AUTOMERGE_ENABLED') === 'true',
      ),
      workingDirectory,
    });
    const assessment = await new AutoMergeService(github).evaluateAndRequest(
      pullRequest,
      classification.safeCodeCandidate,
    );
    cli.write(JSON.stringify(assessment, null, 2));
    if (!assessment.allowed) cli.fail();
  } catch (error) {
    cli.writeError(error instanceof Error ? error.message : String(error));
    cli.fail();
  }
}

void main();
