/**
 * Third-Party Verification Module (TPVM) — Independent replication framework
 *
 * Implements IThirdPartyVerification — enables independent observers to
 * reproducibly verify the correlation between a system's self-reports and
 * its independently-measured conscious states.
 *
 * All environment-specific concerns (DP execution, archive URL resolution)
 * are injected as dependencies per CLAUDE.md.
 *
 * See docs/machine-subjective-reports/ARCHITECTURE.md §Component 3
 */

import type {
  DistinguishabilityResult,
  Timestamp,
  VerificationRecord,
} from "./types.js";
import type { ICGRG, IThirdPartyVerification } from "./interfaces.js";

// ── Threshold Registry ─────────────────────────────────────
// From card §Threshold Registry. No unregistered magic numbers.

export const TPVM_THRESHOLDS = Object.freeze({
  /** Minimum independent replications for scientific credibility */
  REPLICATION_COUNT: 3,
});

// ── Injectable dependency interfaces ────────────────────────

/**
 * IProtocolRunner — abstraction over DP execution.
 * Injected so TPVM does not directly depend on DP infrastructure.
 */
export interface IProtocolRunner {
  run(system: ICGRG): Promise<DistinguishabilityResult>;
}

/**
 * IArchiveStore — abstraction over open-data archive storage and URL resolution.
 * Injected so TPVM does not depend on real network access.
 */
export interface IArchiveStore {
  store(
    systemId: string,
    labId: string,
  ): Promise<{ metricsStreamArchiveUrl: string; reportsArchiveUrl: string }>;
  isResolvable(url: string): Promise<boolean>;
}

/**
 * IClock — abstraction over timestamp generation.
 * Injected so tests can control time.
 */
export type IClock = () => Timestamp;

// ── Configuration ──────────────────────────────────────────

export interface ThirdPartyVerificationConfig {
  readonly protocolRunner: IProtocolRunner;
  readonly archiveStore: IArchiveStore;
  readonly clock: IClock;
}

// ── Implementation ──────────────────────────────────────────

export class ThirdPartyVerification implements IThirdPartyVerification {
  private readonly protocolRunner: IProtocolRunner;
  private readonly archiveStore: IArchiveStore;
  private readonly clock: IClock;

  constructor(config: ThirdPartyVerificationConfig) {
    this.protocolRunner = config.protocolRunner;
    this.archiveStore = config.archiveStore;
    this.clock = config.clock;
  }

  /**
   * Run the full TPVM procedure for a given system and lab.
   *
   * Preconditions:
   *   - system.isGrounded() must be true
   *   - labId must be a non-empty string
   *
   * Postconditions:
   *   - Returns a VerificationRecord with complete DP result and archive URLs
   *   - replicates === distinguishabilityResult.overallPassed
   *   - Archive URLs must be resolvable at creation time
   *
   * Invariant: returned record is immutable (frozen)
   */
  async verify(system: ICGRG, labId: string): Promise<VerificationRecord> {
    // Precondition guards
    if (!system.isGrounded()) {
      throw new Error(
        "System is not grounded: isGrounded() returned false. " +
          "System must have an active metric stream before verification.",
      );
    }
    if (!labId || labId.trim().length === 0) {
      throw new Error(
        "labId must be a non-empty string identifying an independent laboratory.",
      );
    }

    // Execute the distinguishability protocol
    const dpResult = await this.protocolRunner.run(system);

    // Archive metrics and reports as open data
    const { metricsStreamArchiveUrl, reportsArchiveUrl } =
      await this.archiveStore.store(system.generatorId, labId);

    // Invariant: archive URLs must be resolvable at record creation time
    const metricsResolvable =
      await this.archiveStore.isResolvable(metricsStreamArchiveUrl);
    const reportsResolvable =
      await this.archiveStore.isResolvable(reportsArchiveUrl);
    if (!metricsResolvable || !reportsResolvable) {
      throw new Error(
        "archive URL is not resolvable at record creation time. " +
          `metrics: ${metricsStreamArchiveUrl} (${metricsResolvable}), ` +
          `reports: ${reportsArchiveUrl} (${reportsResolvable})`,
      );
    }

    const record: VerificationRecord = {
      labId,
      systemId: system.generatorId,
      distinguishabilityResult: dpResult,
      metricsStreamArchiveUrl,
      reportsArchiveUrl,
      verifiedAt: this.clock(),
      replicates: dpResult.overallPassed,
    };

    // Invariant: records are immutable once produced
    return Object.freeze(record);
  }

  /**
   * Returns true if the minimum replication standard has been met:
   * at least REPLICATION_COUNT independent labs have produced passing
   * verification records (replicates === true).
   *
   * Postconditions:
   *   - Returns true iff results contains >= REPLICATION_COUNT records
   *     from distinct labId values where replicates === true
   *   - Duplicate lab IDs are not counted as distinct
   *   - Non-replicating records (replicates === false) are excluded
   */
  isReplicated(results: VerificationRecord[]): boolean {
    const distinctReplicatingLabs = new Set(
      results
        .filter((r) => r.replicates === true)
        .map((r) => r.labId),
    );
    return distinctReplicatingLabs.size >= TPVM_THRESHOLDS.REPLICATION_COUNT;
  }
}
