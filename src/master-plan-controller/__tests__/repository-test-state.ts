export const GENERATED_CANDIDATE_FAMILIES = [
  'packet-indicator-framework-comparison',
  'packet-preservation-mitigation-tabletop',
] as const;

export function isVersionedPacketFamilyMember(
  packetId: string,
  families: readonly string[] = GENERATED_CANDIDATE_FAMILIES,
): boolean {
  const match = /^(.*)-v[1-9]\d*$/.exec(packetId);
  return match !== null && families.includes(match[1]!);
}
