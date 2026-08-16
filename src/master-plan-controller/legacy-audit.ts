import type { Timestamp } from './types.js';

export interface LegacyAuditRecord {
  path: string;
  title: string;
  legacyStatus: string;
  repositoryArtifactCompletion: 'claimed-complete' | 'incomplete-or-unassessed';
  supportingEvidenceStrength: 'unassessed';
  organizationalReadiness: 'unassessed';
  realWorldOutcomeAttainment: 'not-verified';
  v2Disposition:
    | 'consciousness-epistemics'
    | 'near-term-preservation'
    | 'enabling-capabilities'
    | 'institutional-continuity'
    | 'deferred-pending-activation-gates';
  auditedAt: Timestamp;
}

function disposition(path: string): LegacyAuditRecord['v2Disposition'] {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (/^0\.[456](?:\.|-)/.test(name)) return 'deferred-pending-activation-gates';
  if (/^0\.1(?:\.|-)/.test(name)) return 'consciousness-epistemics';
  if (/^0\.7(?:\.|-)/.test(name) || name === 'root.md') return 'institutional-continuity';
  if (/^0\.0(?:\.|-)/.test(name)) return 'near-term-preservation';
  return 'enabling-capabilities';
}

export function auditLegacyCards(
  files: Readonly<Record<string, string>>,
  now: Timestamp,
): LegacyAuditRecord[] {
  return Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, content]) => {
      const heading = content.match(/^#\s+(.+?)(?:\s+\[([^\]]+)\])?\s*$/m);
      const title = heading?.[1]?.trim() ?? path;
      const legacyStatus = heading?.[2]?.trim() ?? 'UNLABELED';
      return {
        path,
        title,
        legacyStatus,
        repositoryArtifactCompletion:
          legacyStatus === 'DONE' ? 'claimed-complete' : 'incomplete-or-unassessed',
        supportingEvidenceStrength: 'unassessed',
        organizationalReadiness: 'unassessed',
        realWorldOutcomeAttainment: 'not-verified',
        v2Disposition: disposition(path),
        auditedAt: now,
      };
    });
}

export function verifyLegacyAuditCoverage(
  planFiles: readonly string[],
  audit: readonly LegacyAuditRecord[],
): { complete: boolean; missing: string[]; extra: string[] } {
  const expected = new Set(planFiles);
  const actual = new Set(audit.map((record) => record.path));
  const missing = [...expected].filter((path) => !actual.has(path)).sort();
  const extra = [...actual].filter((path) => !expected.has(path)).sort();
  return { complete: missing.length === 0 && extra.length === 0, missing, extra };
}
