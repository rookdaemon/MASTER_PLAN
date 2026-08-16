import { evidenceValidationErrors, integrateEvidence } from './evidence.js';
import type { ExternalDataPort, FileSystemPort, NetworkPort, NetworkRequest } from './ports.js';
import { appendRepositoryJsonArrayItems, formattedRepositoryJson } from './repository-json.js';
import { loadRepositoryStrategy, verifyRepositoryStrategy } from './repository-strategy.js';
import type { EvidenceRecord, Timestamp } from './types.js';

export {
  PublicSourceSnapshotObserver,
  loadPublicSourceSnapshotConfigs,
  type PublicSourceSnapshotConfig,
} from './public-source-observation.js';

export interface RepositoryControlObservationConfig {
  repository: string;
  branch: string;
  hypothesisId: string;
  branchProtected: boolean;
  requiredStatusChecks: string[];
  enforceAdmins: boolean;
}

interface BranchResponse {
  protected?: boolean;
  protection?: {
    required_status_checks?: {
      enforcement_level?: string;
      contexts?: string[];
      checks?: Array<{ context?: string }>;
    };
  };
}

interface LiveRepositoryControls {
  branchProtected: boolean;
  requiredStatusChecks: string[];
  enforceAdmins: boolean;
}

export interface RepositoryObservationResult {
  observedEvidenceIds: string[];
  integratedEvidenceIds: string[];
}

interface ObservationSourcesFile {
  sources: Array<{
    kind: string;
    branch?: string;
    hypothesisId?: string;
  }>;
}

interface BranchProtectionPolicyFile {
  appliedAndVerified: boolean;
  requiredStatusChecks: string[];
  enforceAdmins: boolean;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function stableFingerprint(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function parseJson<T>(body: string, label: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${label} response is malformed`);
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(`Live repository controls are malformed: ${label}`);
}

function liveControls(branch: BranchResponse): LiveRepositoryControls {
  const statusChecks = branch.protection?.required_status_checks;
  const checks = sortedUnique([
    ...(statusChecks?.contexts ?? []),
    ...(statusChecks?.checks ?? []).flatMap((check) => check.context ? [check.context] : []),
  ]);
  assertBoolean(branch.protected, 'branchProtected');
  if (!statusChecks || checks.length === 0 || typeof statusChecks.enforcement_level !== 'string') {
    throw new Error('Live repository controls are malformed: requiredStatusChecks');
  }
  return {
    branchProtected: branch.protected,
    requiredStatusChecks: checks,
    enforceAdmins: statusChecks.enforcement_level === 'everyone',
  };
}

function drift(expected: RepositoryControlObservationConfig, live: LiveRepositoryControls): string[] {
  const mismatches: string[] = [];
  const expectedChecks = sortedUnique(expected.requiredStatusChecks);
  if (JSON.stringify(live.requiredStatusChecks) !== JSON.stringify(expectedChecks)) {
    mismatches.push(`required status checks expected ${expectedChecks.join(',')} but observed ${live.requiredStatusChecks.join(',')}`);
  }
  for (const field of ['branchProtected', 'enforceAdmins'] as const) {
    if (live[field] !== expected[field]) {
      mismatches.push(`${field} expected ${String(expected[field])} but observed ${String(live[field])}`);
    }
  }
  return mismatches;
}

export class GitHubRepositoryControlObserver implements ExternalDataPort {
  constructor(
    private readonly network: NetworkPort,
    private readonly config: RepositoryControlObservationConfig,
    private readonly token?: string,
  ) {}

  async observe(now: Timestamp): Promise<EvidenceRecord[]> {
    if (Number.isNaN(Date.parse(now))) throw new Error('A valid caller-supplied observation timestamp is required');
    const baseUrl = `https://api.github.com/repos/${this.config.repository}`;
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (this.token?.trim()) headers.Authorization = `Bearer ${this.token}`;
    const request = async (url: string, label: string): Promise<string> => {
      const networkRequest: NetworkRequest = { method: 'GET', url, headers };
      const response = await this.network.request(networkRequest);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`${label} observation failed with HTTP ${response.status}`);
      }
      return response.body;
    };
    const branchUrl = `${baseUrl}/branches/${encodeURIComponent(this.config.branch)}`;
    const branch = parseJson<BranchResponse>(
      await request(branchUrl, 'Branch controls'),
      'Branch controls',
    );
    const live = liveControls(branch);
    const mismatches = drift(this.config, live);
    const aligned = mismatches.length === 0;
    const fingerprint = stableFingerprint(JSON.stringify({ live, mismatches }));
    return [{
      id: `evidence-live-repository-controls-${fingerprint}`,
      claim: aligned
        ? `Publicly observable live ${this.config.repository}/${this.config.branch} controls match the corresponding checked-in stewardship policy fields.`
        : `Publicly observable live ${this.config.repository}/${this.config.branch} controls have policy drift: ${mismatches.join('; ')}.`,
      method: `Deterministic GitHub API comparison observed ${JSON.stringify(live)}; ${
        aligned ? 'no mismatches' : mismatches.join('; ')}.`,
      source: branchUrl,
      strength: 0.55,
      limitations: [
        'This is a point-in-time GitHub control-plane snapshot, not proof that controls cannot change afterward.',
        'The public branch response does not expose strict update requirements, review count, conversation resolution, force-push, or deletion controls; those fields remain covered by protected workflow checks and privileged audits.',
      ],
      supportedHypotheses: aligned ? [this.config.hypothesisId] : [],
      falsifiedHypotheses: aligned ? [] : [this.config.hypothesisId],
      verifier: 'deterministic-live-repository-control-observer:v1',
      observedAt: now,
      outcome: aligned ? 'positive' : 'negative',
    }];
  }
}

export class CompositeExternalData implements ExternalDataPort {
  constructor(private readonly sources: readonly ExternalDataPort[]) {}

  async observe(now: Timestamp): Promise<EvidenceRecord[]> {
    return (await Promise.all(this.sources.map(async (source) => source.observe(now)))).flat();
  }
}

export async function loadRepositoryControlObservationConfigs(
  fileSystem: FileSystemPort,
  repository: string,
): Promise<RepositoryControlObservationConfig[]> {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new Error('A valid GitHub repository identity is required');
  const [sources, policy] = await Promise.all([
    fileSystem.readText('strategy/observation-sources.json'),
    fileSystem.readText('strategy/branch-protection.json'),
  ]);
  const parsedSources = parseJson<ObservationSourcesFile>(sources, 'Observation sources');
  const parsedPolicy = parseJson<BranchProtectionPolicyFile>(policy, 'Branch protection policy');
  if (!Array.isArray(parsedSources.sources) || parsedSources.sources.length === 0) {
    throw new Error('At least one external observation source is required');
  }
  const controls = parsedSources.sources.filter((source) => source.kind === 'github-repository-controls');
  if (controls.length === 0) throw new Error('At least one repository control observation source is required');
  return controls.map((source) => {
    if (source.kind !== 'github-repository-controls' || !source.branch?.trim() || !source.hypothesisId?.trim()) {
      throw new Error('Repository control observation source is malformed');
    }
    return {
      repository,
      branch: source.branch,
      hypothesisId: source.hypothesisId,
      branchProtected: parsedPolicy.appliedAndVerified,
      requiredStatusChecks: sortedUnique(parsedPolicy.requiredStatusChecks),
      enforceAdmins: parsedPolicy.enforceAdmins,
    };
  });
}

function sameSnapshotEvidence(left: EvidenceRecord, right: EvidenceRecord): boolean {
  const withoutObservationTime = ({ observedAt: _observedAt, ...record }: EvidenceRecord) => record;
  return JSON.stringify(withoutObservationTime(left)) === JSON.stringify(withoutObservationTime(right));
}

export async function runRepositoryObservation(
  fileSystem: FileSystemPort,
  externalData: ExternalDataPort,
  now: Timestamp,
): Promise<RepositoryObservationResult> {
  if (Number.isNaN(Date.parse(now))) throw new Error('A valid caller-supplied timestamp is required');
  const bundle = await loadRepositoryStrategy(fileSystem);
  const before = await verifyRepositoryStrategy(fileSystem, bundle, now);
  if (before.errors.length > 0) throw new Error(`Strategy verification failed: ${before.errors.join('; ')}`);
  const observed = await externalData.observe(now);
  let state = bundle.state;
  const integratedEvidenceIds: string[] = [];
  for (const evidence of observed) {
    const validationErrors = evidenceValidationErrors(state, evidence, now);
    if (validationErrors.length > 0) throw new Error(validationErrors.join('; '));
    const existing = state.evidence.find((record) => record.id === evidence.id);
    if (existing) {
      if (!sameSnapshotEvidence(existing, evidence)) {
        throw new Error(`Observed evidence identity collides with different content: ${evidence.id}`);
      }
      continue;
    }
    state = integrateEvidence(state, evidence, now, bundle.config);
    integratedEvidenceIds.push(evidence.id);
  }
  if (integratedEvidenceIds.length === 0) {
    return { observedEvidenceIds: observed.map((record) => record.id), integratedEvidenceIds };
  }
  const updated = { ...bundle, state };
  const after = await verifyRepositoryStrategy(fileSystem, updated, now);
  if (after.errors.length > 0) throw new Error(`Observed strategy failed verification: ${after.errors.join('; ')}`);
  const [evidenceText, assessmentsText] = await Promise.all([
    fileSystem.readText('strategy/evidence.json'),
    fileSystem.readText('strategy/assessments.json'),
  ]);
  await fileSystem.writeText(
    'strategy/evidence.json',
    appendRepositoryJsonArrayItems(evidenceText, bundle.state.evidence, state.evidence),
  );
  await fileSystem.writeText('strategy/graph.json', formattedRepositoryJson(state.nodes));
  await fileSystem.writeText(
    'strategy/assessments.json',
    appendRepositoryJsonArrayItems(assessmentsText, bundle.state.assessments, state.assessments),
  );
  return { observedEvidenceIds: observed.map((record) => record.id), integratedEvidenceIds };
}
