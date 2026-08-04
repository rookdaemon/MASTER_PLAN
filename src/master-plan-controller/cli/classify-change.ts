import { classifyChange } from '../change-classifier.js';
import { ProcessGit } from '../process-adapters.js';
import { assessProposalPolicy, retainsExistingEvidence } from '../proposal-policy.js';
import { NodeProcess } from '../runtime-adapters.js';
import { argumentValue, NodeCliRuntime } from './runtime.js';

async function main(): Promise<void> {
  const cli = new NodeCliRuntime();
  const args = cli.arguments();
  const base = argumentValue(args, '--base') ?? cli.environment('BASE_SHA');
  const head = argumentValue(args, '--head') ?? cli.environment('HEAD_SHA');
  const commitCount = Number(argumentValue(args, '--commit-count') ?? cli.environment('PR_COMMIT_COUNT'));
  if (!base || !head || !Number.isSafeInteger(commitCount) || commitCount < 1) {
    cli.writeError('base, head, and a positive pull-request commit count are required');
    cli.fail();
    return;
  }
  try {
    const git = new ProcessGit(new NodeProcess(), cli.environment('GITHUB_WORKSPACE') ?? '.');
    const classification = classifyChange(await git.diff(base, head));
    const evidenceOnly = classification.safeCodeCandidate.files.length > 0 &&
      classification.safeCodeCandidate.files.every((file) => file.path === 'strategy/evidence.json');
    const evidenceRetentionVerified = evidenceOnly && retainsExistingEvidence(
      await git.readTextAtRevision(base, 'strategy/evidence.json'),
      await git.readTextAtRevision(head, 'strategy/evidence.json'),
    );
    const proposalPolicy = assessProposalPolicy(
      classification,
      commitCount,
      evidenceRetentionVerified,
    );
    cli.write(JSON.stringify({ ...classification, proposalPolicy }, null, 2));
    if (!proposalPolicy.allowed) cli.fail();
  } catch (error) {
    cli.writeError(error instanceof Error ? error.message : String(error));
    cli.fail();
  }
}

void main();
