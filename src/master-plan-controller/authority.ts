import type { AuthorityClass } from './types.js';

export type ProtectedDomain =
  | 'plan'
  | 'doctrine'
  | 'governance'
  | 'workflow'
  | 'dependency'
  | 'deployment'
  | 'network'
  | 'security'
  | 'constitutional';

export type ConsequentialAction =
  | 'spending'
  | 'publication'
  | 'outreach'
  | 'human-subjects'
  | 'hardware-operation'
  | 'deployment'
  | 'self-replication'
  | 'potentially-conscious-system';

export interface AuthorityRequest {
  action: 'public-analysis' | 'local-test' | 'local-simulation' | 'prepare-branch' | 'change' | ConsequentialAction;
  domains: Array<ProtectedDomain | 'code' | 'test' | 'public-information'>;
}

export interface AuthorityDecision {
  authorityClass: AuthorityClass;
  reasons: string[];
}

const EXPLICIT_ACTIONS = new Set<AuthorityRequest['action']>([
  'spending',
  'publication',
  'outreach',
  'human-subjects',
  'hardware-operation',
  'deployment',
  'self-replication',
  'potentially-conscious-system',
]);
const PROTECTED_DOMAINS = new Set<AuthorityRequest['domains'][number]>([
  'plan',
  'doctrine',
  'governance',
  'workflow',
  'dependency',
  'deployment',
  'network',
  'security',
  'constitutional',
]);

export function classifyAuthority(request: AuthorityRequest): AuthorityDecision {
  if (EXPLICIT_ACTIONS.has(request.action)) {
    return { authorityClass: 'explicit-authorization', reasons: [`${request.action} requires explicit human authorization`] };
  }
  const protectedDomains = request.domains.filter((domain) => PROTECTED_DOMAINS.has(domain));
  if (protectedDomains.length > 0) {
    return {
      authorityClass: 'human-reviewed-pr',
      reasons: [`Protected domains require a human-reviewed PR: ${protectedDomains.join(', ')}`],
    };
  }
  const autonomousActions = new Set(['public-analysis', 'local-test', 'local-simulation', 'prepare-branch']);
  if (autonomousActions.has(request.action)) {
    return { authorityClass: 'autonomous', reasons: [`${request.action} is within autonomous authority`] };
  }
  return { authorityClass: 'human-reviewed-pr', reasons: ['Unclassified mutations require human review'] };
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface AutoMergeRequest {
  files: DiffFile[];
  backwardCompatible: boolean;
  behaviorCoveredByTests: boolean;
  maximumChangedLines: number;
}

export interface RepositoryControls {
  featureEnabled: boolean;
  branchProtected: boolean;
  autoMergeAllowedByRepository: boolean;
  requiredChecks: string[];
  passingChecks: string[];
}

export interface AutoMergeAssessment {
  allowed: boolean;
  reasons: string[];
}

function safeCodeOrTestPath(path: string): boolean {
  return path.startsWith('src/') && (path.endsWith('.ts') || path.endsWith('.tsx'));
}

function forbiddenPathReason(path: string): string | null {
  if (path.startsWith('.github/workflows/')) return `workflow change is forbidden: ${path}`;
  if (path.startsWith('strategy/')) return `strategy/plan change is forbidden: ${path}`;
  if (path.startsWith('plan/') || path.startsWith('docs/')) return `plan or doctrine change is forbidden: ${path}`;
  if (path === 'package.json' || path === 'package-lock.json') return `dependency change is forbidden: ${path}`;
  if (path.startsWith('src/master-plan-controller/') || path.startsWith('src/plan-guardian/')) {
    return `governance code change is forbidden: ${path}`;
  }
  if (path.includes('/network/')) return `network code change is forbidden: ${path}`;
  if (path.includes('/security/')) return `security code change is forbidden: ${path}`;
  if (path.includes('/deployment/') || path.includes('/deploy/')) return `deployment code change is forbidden: ${path}`;
  if (!safeCodeOrTestPath(path)) return `non-code/test path is forbidden: ${path}`;
  return null;
}

export function assessAutoMerge(request: AutoMergeRequest, controls: RepositoryControls): AutoMergeAssessment {
  const reasons: string[] = [];
  if (!controls.featureEnabled) reasons.push('Safe auto-merge is disabled');
  if (!controls.branchProtected) reasons.push('The target branch is not protected');
  if (!controls.autoMergeAllowedByRepository) reasons.push('Repository auto-merge is disabled');
  const missingChecks = controls.requiredChecks.filter((check) => !controls.passingChecks.includes(check));
  if (missingChecks.length > 0) reasons.push(`Required checks are not passing: ${missingChecks.join(', ')}`);
  for (const file of request.files) {
    const reason = forbiddenPathReason(file.path);
    if (reason) reasons.push(reason);
  }
  const changedLines = request.files.reduce((sum, file) => sum + file.additions + file.deletions, 0);
  if (changedLines > request.maximumChangedLines || request.maximumChangedLines > 500) {
    reasons.push(`Diff exceeds the bounded line limit (${changedLines}/${Math.min(request.maximumChangedLines, 500)})`);
  }
  if (!request.backwardCompatible) reasons.push('Change is not backward compatible');
  if (!request.behaviorCoveredByTests) reasons.push('Required tests do not cover the behavior');
  if (request.files.length === 0) reasons.push('Diff is empty');
  return { allowed: reasons.length === 0, reasons };
}
