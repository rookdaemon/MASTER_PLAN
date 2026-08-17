export function safeAutoMergeFeatureEnabled(
  recordedRepositoryPolicyEnabled: boolean,
  externalRepositorySwitch: boolean,
): boolean {
  return recordedRepositoryPolicyEnabled && externalRepositorySwitch;
}
