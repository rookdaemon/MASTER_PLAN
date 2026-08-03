import { describe, expect, it } from 'vitest';
import { assessHumanEscalation } from '../escalation-policy.js';

const ASSESSED_AT = '2026-08-03T12:00:00.000Z';
const EVIDENCE = new Map([
  ['evidence-1', { outcome: 'negative' as const, observedAt: '2026-08-03T09:00:00.000Z' }],
  ['evidence-2', { outcome: 'negative' as const, observedAt: '2026-08-03T10:30:00.000Z' }],
  ['evidence-same', { outcome: 'negative' as const, observedAt: '2026-08-03T09:00:00.000Z' }],
]);

describe('human servant-leader escalation policy', () => {
  it('escalates only intrinsically human decisions after automated alternatives are exhausted', () => {
    const cases = [
      ['owner-credential', 'provide-owner-credential'],
      ['physical-presence', 'perform-physical-act'],
      ['legal-consent', 'record-legal-consent'],
      ['constitutional-conflict', 'resolve-constitutional-conflict'],
    ] as const;
    for (const [kind, operation] of cases) {
      expect(assessHumanEscalation({
        kind,
        automationImpossibility: 'The required act is legally or physically bound to the repository owner.',
        automatedAttempts: [
          { description: 'primary automation', outcome: 'failed', attemptedAt: '2026-08-03T10:00:00.000Z', evidenceReference: 'evidence-1' },
          { description: 'independent fallback', outcome: 'failed', attemptedAt: '2026-08-03T11:00:00.000Z', evidenceReference: 'evidence-2' },
        ],
        decisionRequested: { operation, scope: 'packet-1 only', expectedOutput: 'One bounded authorization artifact.' },
      }, ASSESSED_AT, EVIDENCE)).toMatchObject({ escalate: true, authorityClass: 'human-escalation' });
    }
  });

  it('keeps automatable failures inside the automated body', () => {
    for (const kind of ['ci-failure', 'review-unavailable', 'uncertainty', 'novelty', 'high-risk'] as const) {
      expect(assessHumanEscalation({
        kind,
        automationImpossibility: 'Claimed impossible.',
        automatedAttempts: [{
          description: 'one attempt', outcome: 'failed', attemptedAt: '2026-08-03T10:00:00.000Z', evidenceReference: 'evidence-1',
        }],
        decisionRequested: { operation: 'provide-owner-credential', scope: 'packet-1', expectedOutput: 'Credential' },
      }, ASSESSED_AT, EVIDENCE)).toMatchObject({ escalate: false, authorityClass: 'agent-reviewed' });
    }
  });

  it('rejects premature or unauditable escalation requests', () => {
    expect(assessHumanEscalation({
      kind: 'owner-credential', automationImpossibility: '', automatedAttempts: [],
      decisionRequested: { operation: 'provide-owner-credential', scope: '', expectedOutput: '' },
    }, ASSESSED_AT, EVIDENCE).escalate).toBe(false);
  });

  it('rejects attempts that are duplicated, successful, future-dated, or request the wrong operation', () => {
    expect(assessHumanEscalation({
      kind: 'legal-consent',
      automationImpossibility: 'Consent requires the named person.',
      automatedAttempts: [
        { description: 'same', outcome: 'failed', attemptedAt: '2026-08-03T10:00:00.000Z', evidenceReference: 'evidence-same' },
        { description: 'same', outcome: 'succeeded', attemptedAt: '2026-08-04T10:00:00.000Z', evidenceReference: 'evidence-same' },
      ],
      decisionRequested: { operation: 'perform-physical-act', scope: '*', expectedOutput: 'Anything' },
    }, ASSESSED_AT, EVIDENCE).escalate).toBe(false);
  });

  it('rejects evidence observed after the claimed failed attempt', () => {
    const evidence = new Map(EVIDENCE).set('evidence-late', {
      outcome: 'negative' as const, observedAt: '2026-08-03T11:30:00.000Z',
    });
    expect(assessHumanEscalation({
      kind: 'legal-consent', automationImpossibility: 'Consent requires the named person.',
      automatedAttempts: [
        { description: 'primary automation', outcome: 'failed', attemptedAt: '2026-08-03T10:00:00.000Z', evidenceReference: 'evidence-1' },
        { description: 'fallback automation', outcome: 'failed', attemptedAt: '2026-08-03T11:00:00.000Z', evidenceReference: 'evidence-late' },
      ],
      decisionRequested: { operation: 'record-legal-consent', scope: 'packet-1', expectedOutput: 'Consent artifact.' },
    }, ASSESSED_AT, evidence).escalate).toBe(false);
  });
});
