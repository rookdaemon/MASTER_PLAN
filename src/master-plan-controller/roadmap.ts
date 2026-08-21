import type { RepositoryStrategyBundle } from './repository-strategy.js';
import type { PlanNode, Portfolio } from './types.js';

const PORTFOLIO_LABELS: Record<Portfolio, string> = {
  'consciousness-epistemics': 'Consciousness epistemics',
  'near-term-preservation': 'Near-term preservation',
  'enabling-capabilities': 'Enabling capabilities',
  'institutional-continuity': 'Institutional continuity',
};

const DEFERRED_IDS = [
  'program-space-settlement',
  'program-self-replication',
  'program-cosmological-engineering',
] as const;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function gateSummary(node: PlanNode): string {
  const gates = node.activationGates.map((gate) => {
    if (gate.type === 'node-verified') return gate.nodeId;
    if (gate.type === 'minimum-confidence') return `confidence >= ${gate.minimum}`;
    if (gate.type === 'fresh-evidence') return `fresh evidence >= ${gate.minimumStrength}`;
    if (gate.type === 'metric-target') return `metric ${gate.metricId}`;
    return 'verified dependencies';
  });
  return gates.length === 0 ? 'no activation gate' : gates.join(', ');
}

export function renderPortfolioBlock(bundle: RepositoryStrategyBundle): string {
  const lines = [
    '| Portfolio | Target | Initial bounded intervention |',
    '|---|---:|---|',
  ];
  for (const [portfolio, weight] of Object.entries(bundle.config.portfolioWeights) as Array<[Portfolio, number]>) {
    const template = bundle.packetTemplates.find((candidate) => candidate.portfolio === portfolio);
    lines.push(`| ${PORTFOLIO_LABELS[portfolio]} | ${percent(weight)} | ${template?.title ?? 'No current intervention'} |`);
  }
  return lines.join('\n');
}

export function renderGateBlock(bundle: RepositoryStrategyBundle): string {
  const lines = ['### Current activation summary', ''];
  for (const id of DEFERRED_IDS) {
    const node = bundle.state.nodes.find((candidate) => candidate.id === id);
    if (!node) continue;
    lines.push(`- ${node.title}: **${node.lifecycle}**; gated by ${gateSummary(node)}.`);
  }
  return lines.join('\n');
}

export function renderOperatingStateBlock(bundle: RepositoryStrategyBundle): string {
  const activePackets = bundle.state.packets.filter((packet) => packet.lifecycle === 'active').length;
  return [
    '- Mode: **automated stewardship**.',
    '- Repository updates use deterministic CI only.',
    `- Reviewed results since the current baseline: **${bundle.state.governance.reviewedResultCount}**.`,
    `- Active work packets: **${activePackets}**.`,
    '- Guardian executes one bounded repository-only packet every hour.',
    '- Guardian publishes progress updates and accepts immediate status requests plus queued messages and answers through configured connectors.',
  ].join('\n');
}

export function replaceGeneratedBlock(
  document: string,
  name: 'PORTFOLIO' | 'GATES' | 'OPERATING-STATE',
  content: string,
): string {
  const start = `<!-- GENERATED:${name}:START -->`;
  const end = `<!-- GENERATED:${name}:END -->`;
  const firstStart = document.indexOf(start);
  const firstEnd = document.indexOf(end);
  if (firstStart < 0 || firstEnd < firstStart || document.indexOf(start, firstStart + 1) >= 0 ||
      document.indexOf(end, firstEnd + 1) >= 0) {
    throw new Error(`Document must contain exactly one ordered ${name} generated block`);
  }
  return `${document.slice(0, firstStart + start.length)}\n${content}\n${document.slice(firstEnd)}`;
}

export function renderPlanDocument(bundle: RepositoryStrategyBundle, current: string): string {
  return replaceGeneratedBlock(
    replaceGeneratedBlock(current, 'PORTFOLIO', renderPortfolioBlock(bundle)),
    'GATES',
    renderGateBlock(bundle),
  );
}

export function renderOperationsDocument(bundle: RepositoryStrategyBundle, current: string): string {
  return replaceGeneratedBlock(current, 'OPERATING-STATE', renderOperatingStateBlock(bundle));
}
