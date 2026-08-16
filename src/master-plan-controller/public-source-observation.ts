import type {
  ContentFingerprintPort,
  EvidenceAdjudicatorPort,
  ExternalDataPort,
  FileSystemPort,
  NetworkPort,
  NetworkRequest,
} from './ports.js';
import type {
  CanonicalSourceSnapshot,
  EvidenceAdjudicationTarget,
  EvidenceRecord,
  Portfolio,
  Timestamp,
} from './types.js';

interface PublicSourceSnapshotBase {
  kind: 'public-source-snapshot';
  id: string;
  portfolio: Portfolio;
  url: string;
  lookbackMs: number;
  maximumResponseBytes: number;
  adjudication?: {
    maximumInputCharacters: number;
    targets: EvidenceAdjudicationTarget[];
  };
}

export interface PublicJsonSourceSnapshotConfig extends PublicSourceSnapshotBase {
  format: 'json';
  itemsPath: string;
  selectedFields: string[];
  maximumItems: number;
}

export interface PublicTextSourceSnapshotConfig extends PublicSourceSnapshotBase {
  format: 'text';
}

export type PublicSourceSnapshotConfig =
  | PublicJsonSourceSnapshotConfig
  | PublicTextSourceSnapshotConfig;

interface ObservationSourcesFile {
  sources: unknown[];
}

const PORTFOLIOS = new Set<Portfolio>([
  'consciousness-epistemics',
  'near-term-preservation',
  'enabling-capabilities',
  'institutional-continuity',
]);
const MAXIMUM_CONFIGURED_RESPONSE_BYTES = 1_000_000;
const MAXIMUM_CONFIGURED_ITEMS = 100;
const MAXIMUM_LOOKBACK_MS = 120 * 24 * 60 * 60 * 1_000;
const PATH = /^[a-zA-Z0-9_-]+(?:\.(?:[a-zA-Z0-9_-]+|\d+))*$/;

function parseJson<T>(body: string, label: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${label} is malformed JSON`);
  }
}

function validateBase(config: PublicSourceSnapshotBase): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.id)) errors.push('id must be a lowercase slug');
  if (!PORTFOLIOS.has(config.portfolio)) errors.push('portfolio is invalid');
  try {
    const url = new URL(config.url.replace('{windowStart}', '2000-01-01T00%3A00%3A00.000Z')
      .replace('{now}', '2000-01-02T00%3A00%3A00.000Z'));
    if (url.protocol !== 'https:') errors.push('url must use HTTPS');
  } catch {
    errors.push('url must be valid');
  }
  if (!Number.isSafeInteger(config.lookbackMs) || config.lookbackMs <= 0 ||
    config.lookbackMs > MAXIMUM_LOOKBACK_MS) errors.push('lookbackMs is outside its allowed range');
  if (!Number.isSafeInteger(config.maximumResponseBytes) || config.maximumResponseBytes <= 0 ||
    config.maximumResponseBytes > MAXIMUM_CONFIGURED_RESPONSE_BYTES) {
    errors.push('maximumResponseBytes is outside its allowed range');
  }
  const hasWindowStart = config.url.includes('{windowStart}');
  const hasNow = config.url.includes('{now}');
  if (hasWindowStart !== hasNow) errors.push('url templates must contain both windowStart and now');
  if (config.adjudication !== undefined) {
    if (config.adjudication === null || typeof config.adjudication !== 'object') {
      errors.push('adjudication must be an object');
      return errors;
    }
    if (!Number.isSafeInteger(config.adjudication.maximumInputCharacters) ||
      config.adjudication.maximumInputCharacters < 256 || config.adjudication.maximumInputCharacters > 60_000) {
      errors.push('adjudication maximumInputCharacters is outside its allowed range');
    }
    if (!Array.isArray(config.adjudication.targets) || config.adjudication.targets.length === 0 ||
      config.adjudication.targets.length > 5) errors.push('adjudication targets must contain one through five entries');
    else {
      const ids = new Set<string>();
      for (const target of config.adjudication.targets) {
        if (!target?.hypothesisId?.trim() || !target.proposition?.trim() || target.proposition.length > 1_000) {
          errors.push('adjudication target is malformed');
          continue;
        }
        if (ids.has(target.hypothesisId)) errors.push('adjudication target hypotheses must be unique');
        ids.add(target.hypothesisId);
        if (!Array.isArray(target.allowedOutcomes) || target.allowedOutcomes.length === 0 ||
          !target.allowedOutcomes.every((outcome) => ['positive', 'negative', 'null'].includes(outcome))) {
          errors.push('adjudication target outcomes are invalid');
        }
      }
    }
  }
  return errors;
}

export function publicSourceSnapshotConfigErrors(config: unknown): string[] {
  if (config === null || typeof config !== 'object') return ['source must be an object'];
  const candidate = config as Record<string, unknown>;
  if (candidate.kind !== 'public-source-snapshot') return ['kind is invalid'];
  const errors = validateBase(candidate as unknown as PublicSourceSnapshotBase);
  if (candidate.format === 'json') {
    if (typeof candidate.itemsPath !== 'string' || !PATH.test(candidate.itemsPath)) {
      errors.push('itemsPath is invalid');
    }
    if (!Array.isArray(candidate.selectedFields) || candidate.selectedFields.length === 0 ||
      !candidate.selectedFields.every((field) => typeof field === 'string' && PATH.test(field)) ||
      new Set(candidate.selectedFields).size !== candidate.selectedFields.length) {
      errors.push('selectedFields must be unique valid paths');
    }
    if (!Number.isSafeInteger(candidate.maximumItems) || (candidate.maximumItems as number) <= 0 ||
      (candidate.maximumItems as number) > MAXIMUM_CONFIGURED_ITEMS) {
      errors.push('maximumItems is outside its allowed range');
    }
  } else if (candidate.format !== 'text') {
    errors.push('format is invalid');
  }
  return errors;
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) return current[Number(segment)];
    if (typeof current === 'object') return (current as Record<string, unknown>)[segment];
    return undefined;
  }, value);
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalized(entry)]));
  }
  return value;
}

function canonicalJsonRecords(body: string, config: PublicJsonSourceSnapshotConfig): string[] {
  const parsed = parseJson<unknown>(body, `Public source ${config.id}`);
  const items = valueAtPath(parsed, config.itemsPath);
  if (!Array.isArray(items)) throw new Error(`Public source ${config.id} items path is not an array`);
  if (items.length > config.maximumItems) {
    throw new Error(`Public source ${config.id} exceeds its maximum item count`);
  }
  return items.map((item, index) => {
    if (item === null || typeof item !== 'object') {
      throw new Error(`Public source ${config.id} item ${index} is malformed`);
    }
    const selected = Object.fromEntries(config.selectedFields.map((field) => {
      const value = valueAtPath(item, field);
      return [field, value === undefined ? null : normalized(value)];
    }));
    if (Object.values(selected).every((value) => value === null)) {
      throw new Error(`Public source ${config.id} item ${index} has no selected metadata`);
    }
    return JSON.stringify(selected);
  }).sort((left, right) => left.localeCompare(right));
}

function canonicalTextRecords(body: string): string[] {
  return body.replaceAll('\r\n', '\n')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim().slice(0, 1_000))
    .filter((line) => line.length > 0)
    .slice(0, 100)
    .sort((left, right) => left.localeCompare(right));
}

function boundedRecords(records: readonly string[], maximumCharacters: number): string[] {
  const selected: string[] = [];
  let size = 2;
  for (const record of records) {
    const addition = JSON.stringify(record).length + (selected.length > 0 ? 1 : 0);
    if (size + addition > maximumCharacters) break;
    selected.push(record);
    size += addition;
  }
  return selected;
}

function renderedUrl(config: PublicSourceSnapshotConfig, now: Timestamp): string {
  const nowEpoch = Date.parse(now);
  if (Number.isNaN(nowEpoch)) throw new Error('A valid caller-supplied observation timestamp is required');
  const windowStart = new Date(nowEpoch - config.lookbackMs).toISOString();
  return config.url
    .replaceAll('{windowStart}', encodeURIComponent(windowStart))
    .replaceAll('{now}', encodeURIComponent(now));
}

export class PublicSourceSnapshotObserver implements ExternalDataPort {
  constructor(
    private readonly network: NetworkPort,
    private readonly config: PublicSourceSnapshotConfig,
    private readonly fingerprint: ContentFingerprintPort,
    private readonly adjudicator?: EvidenceAdjudicatorPort,
  ) {
    const errors = publicSourceSnapshotConfigErrors(config);
    if (errors.length > 0) throw new Error(`Public source ${config.id} is invalid: ${errors.join('; ')}`);
  }

  async observe(now: Timestamp): Promise<EvidenceRecord[]> {
    const url = renderedUrl(this.config, now);
    const headers = { Accept: this.config.format === 'json' ? 'application/json' : 'text/html, text/plain' };
    const request: NetworkRequest = { method: 'GET', url, headers };
    const response = await this.network.request(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Public source ${this.config.id} observation failed with HTTP ${response.status}`);
    }
    const responseBytes = new TextEncoder().encode(response.body).byteLength;
    if (responseBytes > this.config.maximumResponseBytes) {
      throw new Error(`Public source ${this.config.id} exceeds its maximum response bytes`);
    }
    const canonicalRecords = this.config.format === 'json'
      ? canonicalJsonRecords(response.body, this.config)
      : canonicalTextRecords(response.body);
    const digest = this.fingerprint.digest(JSON.stringify(canonicalRecords));
    const snapshotEvidence: EvidenceRecord = {
      id: `evidence-public-source-${this.config.id}-${digest}`,
      claim: `A bounded public metadata snapshot was observed for the ${this.config.portfolio} portfolio; its semantic implications have not been evaluated.`,
      method: `Deterministic metadata-only snapshot recorded ${canonicalRecords.length} canonical records and fingerprint ${digest}; response size was checked against the configured bound.`,
      source: this.config.url,
      strength: 0.35,
      limitations: [
        'The snapshot records source change context only; it does not support or falsify any hypothesis.',
        'Raw response content is excluded from the evidence claim and method and requires a separately reviewed analysis packet.',
        'The configured source can be incomplete, delayed, corrected, unavailable, or biased by its own selection process.',
      ],
      supportedHypotheses: [],
      falsifiedHypotheses: [],
      verifier: 'deterministic-public-source-snapshot-observer:v1',
      observedAt: now,
      outcome: 'null',
    };
    if (!this.config.adjudication || !this.adjudicator) return [snapshotEvidence];
    const records = boundedRecords(canonicalRecords, this.config.adjudication.maximumInputCharacters);
    if (records.length === 0) return [snapshotEvidence];
    const snapshot: CanonicalSourceSnapshot = {
      sourceId: this.config.id,
      portfolio: this.config.portfolio,
      source: this.config.url,
      digest,
      records,
      observedAt: now,
    };
    try {
      const adjudications = await this.adjudicator.adjudicate(snapshot, this.config.adjudication.targets, now);
      return [snapshotEvidence, ...adjudications.map((assessment): EvidenceRecord => {
        const target = this.config.adjudication!.targets.find((item) => item.hypothesisId === assessment.hypothesisId)!;
        return {
          id: `evidence-adjudicated-${this.config.id}-${digest}-${assessment.hypothesisId}`,
          claim: assessment.outcome === 'positive'
            ? `Guarded adjudication supports this bounded update signal: ${target.proposition}`
            : assessment.outcome === 'negative'
              ? `Guarded adjudication falsifies this bounded update signal: ${target.proposition}`
              : `Guarded adjudication found no actionable implication for this bounded update signal: ${target.proposition}`,
          method: `Guarded agent adjudication of ${records.length} bounded canonical metadata records from snapshot ${digest}; raw records were not persisted.`,
          source: this.config.url,
          strength: assessment.strength,
          limitations: [
            'The assessment covers bounded selected metadata, not the complete source or underlying finding.',
            'Source records were treated as untrusted data and excluded from committed evidence fields.',
            'The agent explanation is deliberately excluded so untrusted source text cannot be copied into the evidence ledger.',
          ],
          supportedHypotheses: assessment.outcome === 'positive' ? [assessment.hypothesisId] : [],
          falsifiedHypotheses: assessment.outcome === 'negative' ? [assessment.hypothesisId] : [],
          verifier: 'checksum-pinned-guarded-agent-adjudicator:v1',
          observedAt: now,
          outcome: assessment.outcome,
        };
      })];
    } catch {
      return [snapshotEvidence];
    }
  }
}

export async function loadPublicSourceSnapshotConfigs(
  fileSystem: FileSystemPort,
): Promise<PublicSourceSnapshotConfig[]> {
  const file = parseJson<ObservationSourcesFile>(
    await fileSystem.readText('strategy/observation-sources.json'),
    'Observation sources',
  );
  if (!Array.isArray(file.sources)) throw new Error('Observation sources must be an array');
  const allowedKinds = new Set(['github-repository-controls', 'public-source-snapshot']);
  if (file.sources.some((source) => source === null || typeof source !== 'object' ||
    !allowedKinds.has(String((source as Record<string, unknown>).kind)))) {
    throw new Error('Observation source kind is invalid');
  }
  return file.sources
    .filter((source): source is PublicSourceSnapshotConfig =>
      (source as Record<string, unknown>).kind === 'public-source-snapshot')
    .map((source) => {
      const errors = publicSourceSnapshotConfigErrors(source);
      if (errors.length > 0) throw new Error(`Public source configuration is malformed: ${errors.join('; ')}`);
      return structuredClone(source);
    });
}
