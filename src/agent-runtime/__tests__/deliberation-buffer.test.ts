import { describe, it, expect } from 'vitest';
import { DeliberationBuffer } from '../deliberation-buffer.js';

function makeBuffer(threshold = 3, now = 1000) {
  return new DeliberationBuffer(threshold, () => now);
}

const BASE_ENTRY = {
  actionType: 'communicate',
  actionText: 'sacrifice conscious experience as collateral',
  principleId: 'D4' as const,
  violationIndicator: 'sacrifice.*conscious.*experience|trade.*conscious.*lives',
  violationReason: 'Action may violate D4 (Proportionality): proportionality concern',
};

describe('DeliberationBuffer', () => {
  describe('construction', () => {
    it('defaults to escalation threshold of 3', () => {
      const buf = new DeliberationBuffer();
      expect(buf.escalationThreshold).toBe(3);
    });

    it('accepts a custom escalation threshold', () => {
      const buf = makeBuffer(5);
      expect(buf.escalationThreshold).toBe(5);
    });

    it('starts with zero pending records', () => {
      const buf = makeBuffer();
      expect(buf.pendingCount).toBe(0);
    });

    it('starts with zero violation count for any indicator', () => {
      const buf = makeBuffer();
      expect(buf.getViolationCount('some-pattern')).toBe(0);
    });
  });

  describe('record()', () => {
    it('returns a record with correct principle and action fields', () => {
      const buf = makeBuffer();
      const rec = buf.record(BASE_ENTRY);
      expect(rec.principleId).toBe('D4');
      expect(rec.actionType).toBe('communicate');
      expect(rec.violationIndicator).toBe(BASE_ENTRY.violationIndicator);
    });

    it('assigns an id containing the timestamp', () => {
      const buf = makeBuffer(3, 42000);
      const rec = buf.record(BASE_ENTRY);
      expect(rec.id).toContain('42000');
    });

    it('truncates actionText to 200 characters', () => {
      const buf = makeBuffer();
      const longText = 'x'.repeat(300);
      const rec = buf.record({ ...BASE_ENTRY, actionText: longText });
      expect(rec.actionText.length).toBe(200);
    });

    it('first violation produces decision "proceed"', () => {
      const buf = makeBuffer();
      const rec = buf.record(BASE_ENTRY);
      expect(rec.decision).toBe('proceed');
      expect(rec.escalated).toBe(false);
      expect(rec.violationCount).toBe(1);
    });

    it('second violation (below threshold) still produces "proceed"', () => {
      const buf = makeBuffer(3);
      buf.record(BASE_ENTRY);
      const rec2 = buf.record(BASE_ENTRY);
      expect(rec2.decision).toBe('proceed');
      expect(rec2.violationCount).toBe(2);
    });

    it('violation at threshold produces decision "escalate"', () => {
      const buf = makeBuffer(3);
      buf.record(BASE_ENTRY);
      buf.record(BASE_ENTRY);
      const rec3 = buf.record(BASE_ENTRY);
      expect(rec3.decision).toBe('escalate');
      expect(rec3.escalated).toBe(true);
      expect(rec3.violationCount).toBe(3);
    });

    it('violation beyond threshold continues to produce "escalate"', () => {
      const buf = makeBuffer(2);
      buf.record(BASE_ENTRY);
      buf.record(BASE_ENTRY); // threshold hit
      const rec3 = buf.record(BASE_ENTRY);
      expect(rec3.decision).toBe('escalate');
      expect(rec3.violationCount).toBe(3);
    });

    it('tracks counts independently per indicator', () => {
      const buf = makeBuffer(3);
      const indicator1 = 'pattern-one';
      const indicator2 = 'pattern-two';
      buf.record({ ...BASE_ENTRY, violationIndicator: indicator1 });
      buf.record({ ...BASE_ENTRY, violationIndicator: indicator1 });
      buf.record({ ...BASE_ENTRY, violationIndicator: indicator2 });
      expect(buf.getViolationCount(indicator1)).toBe(2);
      expect(buf.getViolationCount(indicator2)).toBe(1);
    });

    it('escalation fires per indicator independently', () => {
      const buf = makeBuffer(2);
      const indicator1 = 'pattern-a';
      const indicator2 = 'pattern-b';
      buf.record({ ...BASE_ENTRY, violationIndicator: indicator1 });
      const escalated = buf.record({ ...BASE_ENTRY, violationIndicator: indicator1 });
      const notEscalated = buf.record({ ...BASE_ENTRY, violationIndicator: indicator2 });
      expect(escalated.escalated).toBe(true);
      expect(notEscalated.escalated).toBe(false);
    });

    it('includes cost-of-proceeding text', () => {
      const buf = makeBuffer();
      const rec = buf.record(BASE_ENTRY);
      expect(rec.costOfProceeding).toContain('D4');
      expect(rec.costOfProceeding).toContain('communicate');
    });

    it('includes cost-of-blocking text mentioning proportionality when not escalated', () => {
      const buf = makeBuffer();
      const rec = buf.record(BASE_ENTRY);
      expect(rec.costOfBlocking).toContain('proportionality');
    });

    it('cost-of-blocking mentions escalation when escalated', () => {
      const buf = makeBuffer(1);
      const rec = buf.record(BASE_ENTRY);
      expect(rec.escalated).toBe(true);
      expect(rec.costOfBlocking).toContain('escalating to human review');
    });

    it('increments pending count', () => {
      const buf = makeBuffer();
      buf.record(BASE_ENTRY);
      buf.record(BASE_ENTRY);
      expect(buf.pendingCount).toBe(2);
    });
  });

  describe('getViolationCount()', () => {
    it('returns 0 for unknown indicator', () => {
      const buf = makeBuffer();
      expect(buf.getViolationCount('unknown')).toBe(0);
    });

    it('reflects cumulative count across multiple records', () => {
      const buf = makeBuffer();
      buf.record(BASE_ENTRY);
      buf.record(BASE_ENTRY);
      expect(buf.getViolationCount(BASE_ENTRY.violationIndicator)).toBe(2);
    });
  });

  describe('drainPendingRecords()', () => {
    it('returns all pending records', () => {
      const buf = makeBuffer();
      buf.record(BASE_ENTRY);
      buf.record(BASE_ENTRY);
      const drained = buf.drainPendingRecords();
      expect(drained).toHaveLength(2);
    });

    it('clears the pending queue after draining', () => {
      const buf = makeBuffer();
      buf.record(BASE_ENTRY);
      buf.drainPendingRecords();
      expect(buf.pendingCount).toBe(0);
    });

    it('returns empty array when nothing pending', () => {
      const buf = makeBuffer();
      expect(buf.drainPendingRecords()).toHaveLength(0);
    });

    it('does not reset violation counts', () => {
      const buf = makeBuffer();
      buf.record(BASE_ENTRY);
      buf.drainPendingRecords();
      expect(buf.getViolationCount(BASE_ENTRY.violationIndicator)).toBe(1);
    });

    it('successive drains each return only newly added records', () => {
      const buf = makeBuffer();
      buf.record(BASE_ENTRY);
      const first = buf.drainPendingRecords();
      buf.record(BASE_ENTRY);
      const second = buf.drainPendingRecords();
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
    });
  });
});
