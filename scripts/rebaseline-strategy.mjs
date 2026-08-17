import { mkdir, readFile, writeFile } from 'node:fs/promises';

const BASELINE_AT = '2026-08-17T00:00:00.000Z';

async function nodeJsonRepository(root) {
  return {
    async read(path) {
      return JSON.parse(await readFile(new URL(path, root), 'utf8'));
    },
    async write(path, value) {
      const target = new URL(path, root);
      await mkdir(new URL('.', target), { recursive: true });
      await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    },
  };
}

const references = {
  G1: ['docs/PLAN.md#constitutional-objectives'],
  G2: ['docs/PLAN.md#constitutional-objectives'],
  G3: ['docs/PLAN.md#constitutional-objectives'],
  'hypothesis-theory-uncertainty': ['docs/reference/consciousness-science.md#current-position'],
  'hypothesis-single-theory-sufficient': ['docs/reference/consciousness-science.md#theory-and-prediction-program'],
  'hypothesis-indicator-framework': ['docs/reference/consciousness-science.md#metrics-and-calibration'],
  'hypothesis-ai-status-uncertain': ['docs/reference/consciousness-science.md#current-position'],
  'hypothesis-precaution-needed': ['docs/reference/ethics-and-coexistence.md#safe-experiential-research'],
  'capability-consciousness-assessment': ['docs/reference/consciousness-science.md'],
  'capability-welfare-precautions': ['docs/reference/ethics-and-coexistence.md'],
  'capability-near-term-preservation': ['docs/PLAN.md#current-hypotheses-and-priorities'],
  'capability-safe-durable-computation': ['docs/reference/durable-infrastructure.md'],
  'capability-institutional-continuity': ['docs/reference/institutions-and-transmission.md'],
  'program-space-settlement': ['docs/reference/space-and-longevity.md#planet-independent-infrastructure'],
  'program-self-replication': ['docs/reference/space-and-longevity.md#self-replication'],
  'program-cosmological-engineering': ['docs/reference/space-and-longevity.md#stellar-and-cosmological-horizons'],
  'capability-cross-substrate-coexistence-governance': ['docs/reference/ethics-and-coexistence.md#cross-substrate-coexistence'],
  'hypothesis-live-stewardship-controls-aligned': ['docs/OPERATIONS.md#review-and-merge-policy'],
};

function withoutGenerationSuffix(value) {
  return value.replace(/-v1$/u, '');
}

export async function rebaseline(repository, now) {
  const [
    graph,
    evidence,
    templates,
    portfolio,
    predictions,
    indicators,
    risks,
    mitigation,
    durable,
    institutions,
  ] = await Promise.all([
    repository.read('strategy/graph.json'),
    repository.read('strategy/evidence.json'),
    repository.read('strategy/packet-templates.json'),
    repository.read('strategy/portfolio.json'),
    repository.read('strategy/results/consciousness-prediction-registry-v1.json'),
    repository.read('strategy/results/indicator-framework-comparison-v1.json'),
    repository.read('strategy/results/preservation-risk-register-v1.json'),
    repository.read('strategy/results/preservation-mitigation-tabletop-v1.json'),
    repository.read('strategy/results/durable-compute-fault-model-v1.json'),
    repository.read('strategy/results/institutional-dependency-map-v1.json'),
  ]);

  const baselineEvidence = evidence.slice(0, 3).map((record) => ({
    ...record,
    verifier: 'strategy-rebaseline-source-review',
  }));
  const liveControl = [...evidence].reverse().find(({ id }) =>
    id.startsWith('evidence-live-repository-controls-'));
  if (liveControl) {
    baselineEvidence.push({
      ...liveControl,
      id: 'evidence-repository-controls-baseline',
      verifier: 'strategy-rebaseline-control-observation',
    });
  }
  baselineEvidence.push({
    id: 'evidence-consciousness-assessment-baseline',
    claim: 'The consolidated prediction and indicator work identifies useful discriminating tests while retaining material theory and measurement uncertainty.',
    method: 'Rebaseline synthesis of source-limited prediction-registry and indicator-comparison artifacts; no subject experiment was performed.',
    source: 'strategy/findings/consciousness-assessment.json',
    strength: 0.55,
    limitations: ['The synthesis is not a completed preregistration.', 'No result establishes current machine consciousness.', 'Theory-derived indicators inherit uncertainty from their source theories.'],
    supportedHypotheses: ['hypothesis-theory-uncertainty', 'hypothesis-indicator-framework', 'hypothesis-ai-status-uncertain'],
    falsifiedHypotheses: [],
    verifier: 'strategy-rebaseline-independent-review-required',
    observedAt: now,
    outcome: 'positive',
  });
  baselineEvidence.push({
    id: 'evidence-preservation-risks-baseline',
    claim: 'The consolidated preservation analysis provides a bounded risk and mitigation map without demonstrating real-world risk reduction.',
    method: 'Rebaseline synthesis of the source-limited risk register and mitigation tabletop.',
    source: 'strategy/findings/preservation-risks.json',
    strength: 0.5,
    limitations: ['Risk rankings remain sensitive to source coverage and assumptions.', 'The tabletop produced planning evidence only.', 'No external mitigation outcome was measured.'],
    supportedHypotheses: ['hypothesis-material-preservation-update'],
    falsifiedHypotheses: [],
    verifier: 'strategy-rebaseline-independent-review-required',
    observedAt: now,
    outcome: 'positive',
  });
  baselineEvidence.push({
    id: 'evidence-durable-compute-baseline',
    claim: 'Deterministic fault-model work supports explicit failure domains and recovery invariants but not physical durability.',
    method: 'Rebaseline synthesis of local deterministic fault-recovery simulations.',
    source: 'strategy/findings/durable-compute.json',
    strength: 0.45,
    limitations: ['Simulation inputs are not hardware measurements.', 'The modeled fault envelope is incomplete.', 'No consciousness continuity claim is supported.'],
    supportedHypotheses: ['hypothesis-material-durable-compute-update'],
    falsifiedHypotheses: [],
    verifier: 'strategy-rebaseline-independent-review-required',
    observedAt: now,
    outcome: 'positive',
  });
  baselineEvidence.push({
    id: 'evidence-institutional-continuity-baseline',
    claim: 'The institutional analysis identifies capture, succession, funding, and provenance dependencies without demonstrating organizational continuity.',
    method: 'Rebaseline synthesis of a source-limited dependency map and adversarial scenarios.',
    source: 'strategy/findings/institutional-continuity.json',
    strength: 0.45,
    limitations: ['Repository controls are not equivalent to a durable institution.', 'No multi-generation succession was observed.', 'Funding and governance assumptions need external testing.'],
    supportedHypotheses: ['hypothesis-live-stewardship-controls-aligned'],
    falsifiedHypotheses: [],
    verifier: 'strategy-rebaseline-independent-review-required',
    observedAt: now,
    outcome: 'positive',
  });

  const evidenceReplacement = {
    'evidence-indicator-framework-comparison-v1-executed': 'evidence-consciousness-assessment-baseline',
    'evidence-live-repository-controls-8ed7132f4c054ff5': 'evidence-repository-controls-baseline',
    'evidence-live-repository-controls-e1fe0bbe32d43b40': 'evidence-repository-controls-baseline',
  };
  const rebasedGraph = graph.map((node) => {
    const { legacyPlanReferences: _removed, ...current } = node;
    return {
      ...current,
      evidenceReferences: [...new Set(current.evidenceReferences.map((id) => evidenceReplacement[id] ?? id))],
      referencePaths: references[current.id] ?? ['docs/REFERENCE.md'],
    };
  });

  const rebasedTemplates = templates.map((template) => {
    const id = withoutGenerationSuffix(template.id);
    return {
      ...template,
      id,
      seriesId: id,
      runNumber: 0,
      recurrence: { ...template.recurrence, kind: 'iterated' },
      deliverables: template.deliverables.map(withoutGenerationSuffix),
      retrySignature: withoutGenerationSuffix(template.retrySignature),
    };
  });

  await Promise.all([
    repository.write('strategy/graph.json', rebasedGraph),
    repository.write('strategy/evidence.json', baselineEvidence),
    repository.write('strategy/packet-templates.json', rebasedTemplates),
    repository.write('strategy/work-packets.json', []),
    repository.write('strategy/approvals.json', []),
    repository.write('strategy/assessments.json', []),
    repository.write('strategy/escalations.json', []),
    repository.write('strategy/periodic-reviews.json', []),
    repository.write('strategy/audit-log.json', [{
      id: `audit:strategy-baselined:${now}`,
      type: 'strategy-baselined',
      packetId: null,
      occurredAt: now,
      details: {
        findings: [
          'strategy/findings/consciousness-assessment.json',
          'strategy/findings/preservation-risks.json',
          'strategy/findings/durable-compute.json',
          'strategy/findings/institutional-continuity.json',
        ],
        reviewedResultCount: 0,
      },
    }]),
    repository.write('strategy/governance.json', {
      mode: 'automated-stewardship',
      reviewedResultCount: 0,
      safeAutoMergeEnabled: true,
    }),
    repository.write('strategy/portfolio.json', {
      ...portfolio,
      currentEffort: structuredClone(portfolio.weights),
    }),
    repository.write('strategy/findings/consciousness-assessment.json', {
      kind: 'consciousness-assessment', synthesizedAt: now,
      scope: predictions.scope,
      sources: predictions.sources,
      registrationGate: predictions.registrationGate,
      blinding: predictions.blinding,
      theoryFamilies: predictions.theoryFamilies,
      predictions: predictions.predictions,
      indicators: indicators.indicators,
      limitations: ['Source-limited synthesis only.', 'No subject experiment was run.', 'No consciousness status is declared.'],
    }),
    repository.write('strategy/findings/preservation-risks.json', {
      kind: 'preservation-risks', synthesizedAt: now,
      scope: risks.scope,
      methodology: risks.methodology,
      sources: risks.sources,
      risks: risks.risks,
      mitigationTabletop: { selection: mitigation.selection, findings: mitigation.findings, summary: mitigation.summary },
      limitations: ['The analysis does not demonstrate real-world risk reduction.', 'Rankings depend on source coverage and explicit uncertainty.'],
    }),
    repository.write('strategy/findings/durable-compute.json', {
      kind: 'durable-compute', synthesizedAt: now,
      scope: durable.scope,
      preregistration: durable.preregistration,
      scenarios: durable.scenarios,
      summary: durable.summary,
      limitations: durable.limitations,
    }),
    repository.write('strategy/findings/institutional-continuity.json', {
      kind: 'institutional-continuity', synthesizedAt: now,
      scope: institutions.scope,
      sources: institutions.sources,
      dependencies: institutions.dependencies,
      edges: institutions.edges,
      scenarios: institutions.scenarios,
      limitations: ['Artifact evidence is not organizational readiness.', 'No durable institution or succession outcome is demonstrated.'],
    }),
  ]);
}

const repository = await nodeJsonRepository(new URL('../', import.meta.url));
await rebaseline(repository, BASELINE_AT);
