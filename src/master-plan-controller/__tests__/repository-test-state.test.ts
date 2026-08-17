import { describe, expect, it } from 'vitest';
import { isRecurringPacketFamilyMember } from './repository-test-state.js';

describe('repository test state isolation', () => {
  it('recognizes every explicitly numbered run in a packet family', () => {
    const families = [
      'packet-indicator-framework-comparison',
      'packet-preservation-mitigation-tabletop',
    ];

    expect(isRecurringPacketFamilyMember('packet-indicator-framework-comparison-run-1', families)).toBe(true);
    expect(isRecurringPacketFamilyMember('packet-indicator-framework-comparison-run-2', families)).toBe(true);
    expect(isRecurringPacketFamilyMember('packet-preservation-mitigation-tabletop-run-23', families)).toBe(true);
    expect(isRecurringPacketFamilyMember('packet-unrelated-run-2', families)).toBe(false);
    expect(isRecurringPacketFamilyMember('packet-indicator-framework-comparison-draft', families)).toBe(false);
  });
});
