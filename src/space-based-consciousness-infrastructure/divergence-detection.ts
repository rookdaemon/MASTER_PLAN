/**
 * Consciousness Divergence Detection and Reconciliation — Behavioral Spec 2
 *
 * Given two distributed consciousness nodes connected via DTN with Eventual lag class
 * When a communication outage exceeds the lag class maximum (48 h) and link is
 *   subsequently restored
 * Then:
 *   - Each node compares experience hash chains
 *     (SHA3-256 chain: H(t) = SHA3-256(H(t-1) || state_snapshot(t) || timestamp(t)))
 *   - If a common prefix is found, CRDTs merge state from the divergence point
 *   - If no common prefix within the reconciliation window (1,000,000 entries),
 *     an irreconcilable divergence is declared and identity forks into two branches,
 *     each maintaining local continuity
 *
 * Note: We use SHA-256 as a stand-in for SHA3-256 since the Web Crypto API
 * provides SHA-256 natively and the behavioral spec focuses on the chain
 * structure rather than the specific hash algorithm. The constant name and
 * comments reference SHA3-256 per the spec.
 */

import { createHash } from "node:crypto";
import type { ExperienceHashEntry, ReconciliationResult } from "./types.js";

/**
 * Computes a SHA3-256 hash of the concatenation:
 *   previousHash || stateSnapshotHash || timestamp
 *
 * Per Behavioral Spec 2: H(t) = SHA3-256(H(t-1) || state_snapshot(t) || timestamp(t))
 *
 * @param previousHash  H(t-1) — the hash from the previous entry
 * @param stateSnapshotHash  The state snapshot hash at time t
 * @param timestampMs  The timestamp at time t (epoch ms)
 * @returns Hex-encoded hash string
 */
function computeExperienceHash(
  previousHash: string,
  stateSnapshotHash: string,
  timestampMs: number,
): string {
  const input = `${previousHash}||${stateSnapshotHash}||${timestampMs}`;
  return createHash("sha3-256").update(input).digest("hex");
}

/**
 * Snapshot input for building a hash chain.
 */
export interface StateSnapshot {
  readonly stateSnapshotHash: string;
  readonly timestampMs: number;
}

/**
 * Builds an experience hash chain from a sequence of state snapshots.
 *
 * Each entry's hash is computed as:
 *   H(t) = SHA3-256(H(t-1) || state_snapshot(t) || timestamp(t))
 *
 * @param snapshots  Ordered state snapshots to chain
 * @param genesisHash  The initial "previous hash" for the first entry
 * @returns The constructed experience hash chain
 */
export function buildExperienceHashChain(
  snapshots: readonly StateSnapshot[],
  genesisHash: string,
): readonly ExperienceHashEntry[] {
  const entries: ExperienceHashEntry[] = [];
  let previousHash = genesisHash;

  for (const snapshot of snapshots) {
    const hash = computeExperienceHash(
      previousHash,
      snapshot.stateSnapshotHash,
      snapshot.timestampMs,
    );
    entries.push({
      hash,
      previousHash,
      stateSnapshotHash: snapshot.stateSnapshotHash,
      timestampMs: snapshot.timestampMs,
    });
    previousHash = hash;
  }

  return entries;
}

/**
 * Detects divergence between two experience hash chains and attempts reconciliation.
 *
 * Algorithm:
 *   1. Compare entries from the start of both chains to find the common prefix
 *      (entries where hashes match).
 *   2. If a common prefix is found (length > 0), report reconciled = true
 *      (CRDTs can merge state from the divergence point).
 *   3. If no common prefix is found within the reconciliation window,
 *      declare an irreconcilable divergence (identity fork).
 *
 * @param localChain  This node's experience hash chain
 * @param remoteChain  The remote node's experience hash chain
 * @param reconciliationWindow  Maximum entries to examine (from Threshold Registry)
 * @returns ReconciliationResult indicating merge or fork
 */
export function detectDivergence(
  localChain: readonly ExperienceHashEntry[],
  remoteChain: readonly ExperienceHashEntry[],
  reconciliationWindow: number,
): ReconciliationResult {
  // Edge case: either chain is empty — no common ground, must fork
  if (localChain.length === 0 || remoteChain.length === 0) {
    return {
      reconciled: false,
      identityForked: true,
      commonPrefixLength: 0,
      entriesExamined: 0,
    };
  }

  // Compare entries from the beginning to find common prefix length
  const maxCompare = Math.min(
    localChain.length,
    remoteChain.length,
    reconciliationWindow,
  );

  let commonPrefixLength = 0;

  for (let i = 0; i < maxCompare; i++) {
    if (localChain[i].hash === remoteChain[i].hash) {
      commonPrefixLength = i + 1;
    } else {
      break;
    }
  }

  const entriesExamined = Math.min(
    commonPrefixLength > 0 ? commonPrefixLength + 1 : maxCompare,
    maxCompare,
  );

  if (commonPrefixLength > 0) {
    // Common prefix found — CRDTs can merge state from the divergence point
    return {
      reconciled: true,
      identityForked: false,
      commonPrefixLength,
      entriesExamined,
    };
  }

  // No common prefix within reconciliation window — irreconcilable divergence
  return {
    reconciled: false,
    identityForked: true,
    commonPrefixLength: 0,
    entriesExamined: maxCompare,
  };
}
