import type { RepositoryStrategyBundle } from './repository-strategy.js';
import type { Portfolio } from './types.js';

const PORTFOLIO_LABELS: Record<Portfolio, string> = {
  'consciousness-epistemics': 'Consciousness epistemics',
  'near-term-preservation': 'Near-term preservation',
  'enabling-capabilities': 'Enabling capabilities',
  'institutional-continuity': 'Institutional continuity',
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function renderRoadmap(bundle: RepositoryStrategyBundle): string {
  const objectives = bundle.state.nodes.filter((node) => node.kind === 'objective');
  const deferredIds = [
    'program-space-settlement',
    'program-self-replication',
    'program-cosmological-engineering',
  ];
  const lines = [
    '# MASTER_PLAN v2 generated roadmap',
    '',
    'This file is deterministically rendered from the checked-in strategy graph, packets, and',
    'portfolio configuration. It is a view of state, not independent evidence or authorization.',
    '',
    '## Constitutional objectives',
    '',
    ...objectives.map((node) => `- ${node.id} — ${node.title}.`),
    '',
    '## Bootstrap portfolio and bounded frontier',
    '',
    '| Portfolio | Target | Initial bounded packet |',
    '|---|---:|---|',
  ];
  for (const [portfolio, weight] of Object.entries(bundle.config.portfolioWeights) as Array<[Portfolio, number]>) {
    const packet = bundle.state.packets.find((candidate) => candidate.portfolio === portfolio);
    lines.push(`| ${PORTFOLIO_LABELS[portfolio]} | ${percent(weight)} | ${packet?.title ?? 'No eligible packet'} |`);
  }
  lines.push(
    '',
    'Only one packet may be active. Credible G1 extinction-prevention work has lexical priority',
    'over expansion. Positive, negative, and null evidence are integrated without forcing success.',
    '',
    '## Deferred complete map',
    '',
  );
  for (const id of deferredIds) {
    const node = bundle.state.nodes.find((candidate) => candidate.id === id);
    if (!node) continue;
    const gates = node.activationGates
      .map((gate) => gate.type === 'node-verified' ? gate.nodeId : gate.type)
      .join(', ');
    lines.push(`- ${node.title}: **${node.lifecycle}**; activation gates: ${gates}.`);
  }
  lines.push(
    '',
    '## Rollout status',
    '',
    `- Mode: **${bundle.state.governance.mode === 'supervised' ? 'agent-supervised automation' : bundle.state.governance.mode}**.`,
    `- Agent-reviewed shadow cycles: ${bundle.state.governance.shadowCyclesReviewed}/20 historical calibration records, not a recurring or human-approval gate.`,
    `- Agent-supervised results independently reviewed: ${bundle.state.governance.supervisedResultsReviewed}.`,
    `- Safe auto-merge enabled: ${bundle.state.governance.safeAutoMergeEnabled ? 'yes' : 'no'}.`,
    '- Automated execution requires every result to receive fresh independent agent review.',
    '- Weekly portfolio review and quarterly evidence, weight, and constitutional-risk review are automated with independent agent review.',
    '- The human servant leader is contacted only for an evidence-backed, intrinsically human escalation.',
  );
  return `${lines.join('\n')}\n`;
}
