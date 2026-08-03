import type {
  ControllerConfig,
  DecompositionResult,
  InterventionCandidate,
  Timestamp,
} from './types.js';

export type InterventionSplitter = (candidate: InterventionCandidate) => InterventionCandidate[];

function isExecutable(candidate: InterventionCandidate): boolean {
  return Boolean(
    candidate.executable &&
      candidate.owner &&
      candidate.resourceBound &&
      candidate.primaryDeliverable &&
      candidate.acceptanceCriteria &&
      candidate.acceptanceCriteria.length > 0 &&
      candidate.verificationMethod,
  );
}

export function decomposeIntervention(
  root: InterventionCandidate,
  split: InterventionSplitter,
  config: ControllerConfig,
  now: Timestamp,
): DecompositionResult {
  const maximumDepth = root.depth + config.maxDecompositionDepth;
  const leaves: InterventionCandidate[] = [];
  const blocked: InterventionCandidate[] = [];
  const queue: InterventionCandidate[] = [root];

  while (queue.length > 0) {
    const candidate = queue.shift()!;
    if (isExecutable(candidate)) {
      leaves.push(candidate);
      continue;
    }
    if (candidate.depth >= maximumDepth) {
      blocked.push(candidate);
      continue;
    }
    const children = split(candidate);
    if (children.length > config.maxChildrenPerDecomposition) {
      throw new Error(`A decomposition may create at most 5 children; received ${children.length}`);
    }
    if (children.length === 0) {
      blocked.push(candidate);
      continue;
    }
    for (const child of children) {
      if (child.depth !== candidate.depth + 1) {
        throw new Error(`Child ${child.id} must be exactly one level below ${candidate.id}`);
      }
      queue.push(child);
    }
  }

  const status: DecompositionResult['status'] =
    leaves.length > 0 && blocked.length === 0
      ? 'converged'
      : blocked.some((candidate) => candidate.depth >= maximumDepth)
        ? 'depth-limit'
        : 'no-candidates';
  return { status, leaves, blocked, maxDepth: maximumDepth, occurredAt: now };
}
