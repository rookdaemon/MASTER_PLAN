import type { AutoMergeRequest, DiffFile } from './authority.js';
import { classifyAuthority } from './authority.js';
import type { AuthorityDecision, AuthorityRequest } from './authority.js';

export interface ChangeClassification {
  authority: AuthorityDecision;
  domains: AuthorityRequest['domains'];
  changedLines: number;
  safeCodeCandidate: AutoMergeRequest;
}

function domainForPath(path: string): AuthorityRequest['domains'][number] {
  if (path === 'AGENTS.md') return 'governance';
  if (path.startsWith('.github/')) return 'workflow';
  if (path.startsWith('plan/')) return 'plan';
  if (path.startsWith('strategy/CONSTITUTION') || path === 'strategy/constitution.json') return 'constitutional';
  if (path.startsWith('strategy/')) return 'governance';
  if (path.startsWith('docs/')) return 'doctrine';
  if (path === 'package.json' || path === 'package-lock.json') return 'dependency';
  if (path.startsWith('src/master-plan-controller/') || path.startsWith('src/plan-guardian/')) return 'governance';
  if (path.includes('deploy')) return 'deployment';
  if (path.includes('network')) return 'network';
  if (path.includes('security')) return 'security';
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || path.includes('/__tests__/')) return 'test';
  return 'code';
}

export function classifyChange(files: readonly DiffFile[], maximumChangedLines = 100): ChangeClassification {
  const domains = [...new Set(files.map((file) => domainForPath(file.path)))];
  const protectedChange = domains.some((domain) =>
    ['plan', 'doctrine', 'governance', 'workflow', 'dependency', 'deployment', 'network', 'security', 'constitutional'].includes(domain),
  );
  const authority = classifyAuthority({
    action: protectedChange ? 'change' : 'prepare-branch',
    domains,
  });
  const changedLines = files.reduce((sum, file) => sum + file.additions + file.deletions, 0);
  const hasSource = files.some((file) => file.path.startsWith('src/') && domainForPath(file.path) === 'code');
  const hasTest = files.some((file) => file.path.startsWith('src/') && domainForPath(file.path) === 'test');
  return {
    authority,
    domains,
    changedLines,
    safeCodeCandidate: {
      files: [...files],
      backwardCompatible: files.every((file) => file.deletions === 0),
      behaviorCoveredByTests: hasSource && hasTest,
      maximumChangedLines,
    },
  };
}
