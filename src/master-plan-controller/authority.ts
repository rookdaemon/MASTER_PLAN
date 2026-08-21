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

const CONSEQUENTIAL_ACTIONS = new Set<AuthorityRequest['action']>([
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
  if (request.action === 'human-subjects') {
    return {
      authorityClass: 'human-escalation',
      reasons: ['Human-subject work requires legally valid consent bound to a qualified escalation record'],
    };
  }
  if (CONSEQUENTIAL_ACTIONS.has(request.action)) {
    return {
      authorityClass: 'agent-reviewed',
      reasons: [`${request.action} requires bounded agent review and escalation only for a proven unautomatable issue`],
    };
  }
  const protectedDomains = request.domains.filter((domain) => PROTECTED_DOMAINS.has(domain));
  if (protectedDomains.length > 0) {
    return {
      authorityClass: 'agent-reviewed',
      reasons: [`Protected domains require independent agent review: ${protectedDomains.join(', ')}`],
    };
  }
  const autonomousActions = new Set(['public-analysis', 'local-test', 'local-simulation', 'prepare-branch']);
  if (autonomousActions.has(request.action)) {
    return { authorityClass: 'autonomous', reasons: [`${request.action} is within autonomous authority`] };
  }
  return { authorityClass: 'agent-reviewed', reasons: ['Unclassified mutations require independent agent review'] };
}
