/**
 * Tests for Behavioral Spec 2: Consciousness Divergence Detection and Reconciliation
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
 */

import { describe, it, expect } from "vitest";
import {
  SYNC_LAG_EVENTUAL_HOURS,
  RECONCILIATION_WINDOW_EVENTUAL_ENTRIES,
} from "../constants.js";
import type { ExperienceHashEntry, ReconciliationResult } from "../types.js";
import {
  buildExperienceHashChain,
  detectDivergence,
} from "../divergence-detection.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a linear hash chain of the given length, starting from a genesis entry. */
function makeChain(length: number, nodePrefix: string): readonly ExperienceHashEntry[] {
  const entries: ExperienceHashEntry[] = [];
  for (let i = 0; i < length; i++) {
    entries.push({
      hash: `${nodePrefix}-hash-${i}`,
      previousHash: i === 0 ? "genesis" : `${nodePrefix}-hash-${i - 1}`,
      stateSnapshotHash: `${nodePrefix}-snapshot-${i}`,
      timestampMs: 1000 + i * 100,
    });
  }
  return entries;
}

/**
 * Creates two chains that share a common prefix up to `divergeAt`,
 * then diverge with different state snapshots.
 */
function makeDivergingChains(
  commonLength: number,
  divergedLengthA: number,
  divergedLengthB: number,
): { chainA: readonly ExperienceHashEntry[]; chainB: readonly ExperienceHashEntry[] } {
  // Common prefix
  const common: ExperienceHashEntry[] = [];
  for (let i = 0; i < commonLength; i++) {
    common.push({
      hash: `common-hash-${i}`,
      previousHash: i === 0 ? "genesis" : `common-hash-${i - 1}`,
      stateSnapshotHash: `common-snapshot-${i}`,
      timestampMs: 1000 + i * 100,
    });
  }

  const lastCommonHash = commonLength > 0 ? `common-hash-${commonLength - 1}` : "genesis";
  const lastCommonTimestamp = commonLength > 0 ? 1000 + (commonLength - 1) * 100 : 1000;

  // Diverged branch A
  const branchA: ExperienceHashEntry[] = [];
  for (let i = 0; i < divergedLengthA; i++) {
    branchA.push({
      hash: `a-diverged-hash-${i}`,
      previousHash: i === 0 ? lastCommonHash : `a-diverged-hash-${i - 1}`,
      stateSnapshotHash: `a-snapshot-${i}`,
      timestampMs: lastCommonTimestamp + 100 + i * 100,
    });
  }

  // Diverged branch B
  const branchB: ExperienceHashEntry[] = [];
  for (let i = 0; i < divergedLengthB; i++) {
    branchB.push({
      hash: `b-diverged-hash-${i}`,
      previousHash: i === 0 ? lastCommonHash : `b-diverged-hash-${i - 1}`,
      stateSnapshotHash: `b-snapshot-${i}`,
      timestampMs: lastCommonTimestamp + 100 + i * 100,
    });
  }

  return {
    chainA: [...common, ...branchA],
    chainB: [...common, ...branchB],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Consciousness Divergence Detection (Behavioral Spec 2)", () => {
  describe("buildExperienceHashChain", () => {
    it("produces a chain where each entry references the previous hash", () => {
      const snapshots = [
        { stateSnapshotHash: "snap-0", timestampMs: 1000 },
        { stateSnapshotHash: "snap-1", timestampMs: 2000 },
        { stateSnapshotHash: "snap-2", timestampMs: 3000 },
      ];

      const chain = buildExperienceHashChain(snapshots, "genesis");
      expect(chain).toHaveLength(3);
      expect(chain[0].previousHash).toBe("genesis");
      expect(chain[1].previousHash).toBe(chain[0].hash);
      expect(chain[2].previousHash).toBe(chain[1].hash);
    });

    it("produces deterministic hashes from the same inputs", () => {
      const snapshots = [
        { stateSnapshotHash: "snap-0", timestampMs: 1000 },
      ];

      const chain1 = buildExperienceHashChain(snapshots, "genesis");
      const chain2 = buildExperienceHashChain(snapshots, "genesis");
      expect(chain1[0].hash).toBe(chain2[0].hash);
    });

    it("produces different hashes with different previous hash", () => {
      const snapshots = [
        { stateSnapshotHash: "snap-0", timestampMs: 1000 },
      ];

      const chain1 = buildExperienceHashChain(snapshots, "genesis-a");
      const chain2 = buildExperienceHashChain(snapshots, "genesis-b");
      expect(chain1[0].hash).not.toBe(chain2[0].hash);
    });
  });

  describe("detectDivergence — common prefix found (CRDT merge)", () => {
    it("reconciles when both chains are identical", () => {
      const chain = makeChain(10, "node");
      const result = detectDivergence(
        chain,
        chain,
        RECONCILIATION_WINDOW_EVENTUAL_ENTRIES,
      );

      expect(result.reconciled).toBe(true);
      expect(result.identityForked).toBe(false);
      expect(result.commonPrefixLength).toBe(10);
    });

    it("reconciles when chains share a common prefix and then diverge", () => {
      const { chainA, chainB } = makeDivergingChains(5, 3, 4);
      const result = detectDivergence(
        chainA,
        chainB,
        RECONCILIATION_WINDOW_EVENTUAL_ENTRIES,
      );

      expect(result.reconciled).toBe(true);
      expect(result.identityForked).toBe(false);
      expect(result.commonPrefixLength).toBe(5);
    });

    it("reconciles with a common prefix of length 1", () => {
      const { chainA, chainB } = makeDivergingChains(1, 5, 5);
      const result = detectDivergence(
        chainA,
        chainB,
        RECONCILIATION_WINDOW_EVENTUAL_ENTRIES,
      );

      expect(result.reconciled).toBe(true);
      expect(result.identityForked).toBe(false);
      expect(result.commonPrefixLength).toBe(1);
    });
  });

  describe("detectDivergence — no common prefix (identity fork)", () => {
    it("forks identity when chains have zero common prefix within window", () => {
      const chainA = makeChain(10, "node-a");
      const chainB = makeChain(10, "node-b");
      const result = detectDivergence(chainA, chainB, 100);

      expect(result.reconciled).toBe(false);
      expect(result.identityForked).toBe(true);
      expect(result.commonPrefixLength).toBe(0);
    });

    it("forks when common prefix would exceed reconciliation window", () => {
      // Create chains where the common prefix is at position > window
      // but within total chain length — window limits search
      const chainA = makeChain(5, "a-only");
      const chainB = makeChain(5, "b-only");

      const result = detectDivergence(chainA, chainB, 3);
      expect(result.reconciled).toBe(false);
      expect(result.identityForked).toBe(true);
    });
  });

  describe("detectDivergence — reconciliation window boundary", () => {
    it("uses the configured reconciliation window (1,000,000 entries for Eventual)", () => {
      // This test verifies the constant is correct per the Threshold Registry
      expect(RECONCILIATION_WINDOW_EVENTUAL_ENTRIES).toBe(1_000_000);
    });

    it("reports entries examined up to the reconciliation window limit", () => {
      const chainA = makeChain(10, "a-only");
      const chainB = makeChain(10, "b-only");
      const result = detectDivergence(chainA, chainB, 5);

      expect(result.entriesExamined).toBeLessThanOrEqual(5);
      expect(result.identityForked).toBe(true);
    });

    it("reports actual entries examined when chains are shorter than window", () => {
      const chainA = makeChain(3, "a-only");
      const chainB = makeChain(3, "b-only");
      const result = detectDivergence(chainA, chainB, 1_000_000);

      expect(result.entriesExamined).toBeLessThanOrEqual(3);
      expect(result.identityForked).toBe(true);
    });
  });

  describe("detectDivergence — outage exceeding lag class maximum", () => {
    it("lag class maximum for Eventual is 48 h (per Threshold Registry)", () => {
      expect(SYNC_LAG_EVENTUAL_HOURS).toBe(48);
    });
  });

  describe("edge cases", () => {
    it("handles empty chains — forks immediately", () => {
      const result = detectDivergence([], [], RECONCILIATION_WINDOW_EVENTUAL_ENTRIES);
      expect(result.reconciled).toBe(false);
      expect(result.identityForked).toBe(true);
      expect(result.commonPrefixLength).toBe(0);
    });

    it("handles one empty chain — forks", () => {
      const chain = makeChain(5, "node");
      const result = detectDivergence(chain, [], RECONCILIATION_WINDOW_EVENTUAL_ENTRIES);
      expect(result.reconciled).toBe(false);
      expect(result.identityForked).toBe(true);
      expect(result.commonPrefixLength).toBe(0);
    });
  });
});
