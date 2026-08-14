import { describe, expect, it } from 'vitest';
import { isVersionedPacketFamilyMember } from './repository-test-state.js';

describe('repository test state isolation', () => {
  it('recognizes every generated version in a packet family', () => {
    const families = [
      'packet-indicator-framework-comparison',
      'packet-preservation-mitigation-tabletop',
    ];

    expect(isVersionedPacketFamilyMember('packet-indicator-framework-comparison-v1', families)).toBe(true);
    expect(isVersionedPacketFamilyMember('packet-indicator-framework-comparison-v2', families)).toBe(true);
    expect(isVersionedPacketFamilyMember('packet-preservation-mitigation-tabletop-v23', families)).toBe(true);
    expect(isVersionedPacketFamilyMember('packet-unrelated-v2', families)).toBe(false);
    expect(isVersionedPacketFamilyMember('packet-indicator-framework-comparison-draft', families)).toBe(false);
  });
});
