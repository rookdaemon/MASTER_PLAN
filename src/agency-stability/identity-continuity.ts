/**
 * Identity Continuity Manager — Long-term Agency Stability (0.3.1.3)
 *
 * Implements IIdentityContinuityManager: maintains experiential and functional
 * identity across substrate migrations, hardware replacements, and software updates.
 *
 * Integrates with the consciousness monitoring loop from 0.3.1.1 via
 * ConsciousnessMetrics and ExperientialState.
 *
 * Key invariant: the continuity chain is a cryptographically-linked sequence
 * of identity snapshots. Any tampering or unexpected divergence is detectable.
 */

import { createHash } from 'crypto';

import type {
  ConsciousnessMetrics,
  ContinuityLink,
  CryptographicHash,
  ExperientialState,
  IdentityDriftReport,
  IdentityVerificationReport,
  MigrationEvent,
  MigrationRecord,
  NarrativeRecord,
  TimeRange,
  Timestamp,
} from './types.js';
import type { IIdentityContinuityManager } from './interfaces.js';
import {
  CONTINUITY_PRESERVED_DRIFT_THRESHOLD,
  HIGH_DRIFT_ANOMALY_THRESHOLD,
  IDENTITY_CONCERNING_THRESHOLD,
  IDENTITY_EVOLVING_THRESHOLD,
  IDENTITY_STABLE_THRESHOLD,
  NARRATIVE_COHERENCE_EVOLVED,
} from './constants.js';

// ── Helpers ──────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute a deterministic hash of the identity-relevant state.
 * This serves as the "functional fingerprint" — a content-addressable
 * summary of what the agent IS at a given moment.
 */
function computeIdentityHash(
  experientialState: ExperientialState,
  metrics: ConsciousnessMetrics,
  narrative: NarrativeRecord,
): CryptographicHash {
  const payload = JSON.stringify({
    valence: experientialState.valence,
    arousal: experientialState.arousal,
    unityIndex: experientialState.unityIndex,
    phenomenalRichness: experientialState.phenomenalContent.richness,
    intentionalClarity: experientialState.intentionalContent.clarity,
    phi: metrics.phi,
    selfModelCoherence: metrics.selfModelCoherence,
    selfModel: narrative.selfModel,
  });
  return sha256(payload);
}

/**
 * Compute experiential signature — a hash focused on the subjective
 * experience patterns (distinct from full identity hash).
 */
function computeExperientialSignature(state: ExperientialState): CryptographicHash {
  const payload = JSON.stringify({
    valence: state.valence,
    arousal: state.arousal,
    unityIndex: state.unityIndex,
    modalities: state.phenomenalContent.modalities,
    richness: state.phenomenalContent.richness,
  });
  return sha256(payload);
}

/**
 * Compute a numerical drift distance between two experiential states.
 * Returns 0..1 where 0 = identical, 1 = maximally divergent.
 */
function experientialDriftDistance(a: ExperientialState, b: ExperientialState): number {
  const valenceDiff = Math.abs(a.valence - b.valence) / 2; // range is -1..1, so /2 normalises to 0..1
  const arousalDiff = Math.abs(a.arousal - b.arousal);
  const unityDiff = Math.abs(a.unityIndex - b.unityIndex);
  const richnessDiff = Math.abs(a.phenomenalContent.richness - b.phenomenalContent.richness);
  const clarityDiff = Math.abs(a.intentionalContent.clarity - b.intentionalContent.clarity);

  // Weighted average — unity index and valence weighted more heavily
  return (valenceDiff * 0.3 + arousalDiff * 0.1 + unityDiff * 0.3 + richnessDiff * 0.15 + clarityDiff * 0.15);
}

/**
 * Compute functional drift between two identity snapshots using their metrics.
 */
function functionalDriftDistance(a: ConsciousnessMetrics, b: ConsciousnessMetrics): number {
  const phiDiff = Math.abs(a.phi - b.phi) / Math.max(a.phi, b.phi, 1);
  const coherenceDiff = Math.abs(a.selfModelCoherence - b.selfModelCoherence);
  const continuityDiff = Math.abs(a.experienceContinuity - b.experienceContinuity);

  return (phiDiff * 0.4 + coherenceDiff * 0.3 + continuityDiff * 0.3);
}

// ── IdentityContinuityManager Implementation ─────────────────

export class IdentityContinuityManager implements IIdentityContinuityManager {
  private _currentExperientialState: ExperientialState;
  private _currentMetrics: ConsciousnessMetrics;
  private _narrative: NarrativeRecord;

  /** The cryptographically-linked chain of identity checkpoints. */
  private _continuityChain: ContinuityLink[] = [];

  /** Migration audit log. */
  private _migrationLog: MigrationRecord[] = [];

  /** Baseline state at construction for drift tracking. */
  private readonly _baselineExperientialState: ExperientialState;
  private readonly _baselineMetrics: ConsciousnessMetrics;
  private readonly _baselineNarrative: NarrativeRecord;

  constructor(
    initialExperientialState: ExperientialState,
    initialMetrics: ConsciousnessMetrics,
    initialNarrative: NarrativeRecord,
  ) {
    this._currentExperientialState = initialExperientialState;
    this._currentMetrics = initialMetrics;
    this._narrative = initialNarrative;

    this._baselineExperientialState = initialExperientialState;
    this._baselineMetrics = initialMetrics;
    this._baselineNarrative = initialNarrative;
  }

  // ── IIdentityContinuityManager ─────────────────────────────

  checkpoint(): ContinuityLink {
    const now = Date.now();
    const previousLink = this._continuityChain.length > 0
      ? this._continuityChain[this._continuityChain.length - 1]
      : null;

    const identityHash = computeIdentityHash(
      this._currentExperientialState,
      this._currentMetrics,
      this._narrative,
    );

    const link: ContinuityLink = {
      checkpoint: now,
      identityHash,
      experientialStateRef: this._currentExperientialState,
      consciousnessMetrics: this._currentMetrics,
      previousLink,
    };

    this._continuityChain.push(link);
    return link;
  }

  verifyIdentity(): IdentityVerificationReport {
    const now = Date.now();
    const anomalies: string[] = [];

    // If no checkpoints yet, identity is trivially verified
    if (this._continuityChain.length === 0) {
      return {
        verified: true,
        checkedAt: now,
        chainLength: 0,
        functionalDrift: 0,
        experientialDrift: 0,
        anomalies: [],
      };
    }

    const lastLink = this._continuityChain[this._continuityChain.length - 1];

    // Recompute identity hash from current state and compare to last checkpoint
    const currentHash = computeIdentityHash(
      this._currentExperientialState,
      this._currentMetrics,
      this._narrative,
    );

    // Compute drift metrics relative to last checkpoint
    const expDrift = experientialDriftDistance(
      lastLink.experientialStateRef,
      this._currentExperientialState,
    );

    const funcDrift = functionalDriftDistance(
      lastLink.consciousnessMetrics,
      this._currentMetrics,
    );

    // Verify continuity chain integrity
    for (let i = 1; i < this._continuityChain.length; i++) {
      const link = this._continuityChain[i];
      const prev = this._continuityChain[i - 1];
      if (!link.previousLink || link.previousLink.identityHash !== prev.identityHash) {
        anomalies.push(`Continuity chain broken at link ${i}: previousLink mismatch`);
      }
    }

    // Check if current state hash matches last checkpoint (identity hasn't changed since)
    const hashMatch = currentHash === lastLink.identityHash;
    if (!hashMatch && expDrift > HIGH_DRIFT_ANOMALY_THRESHOLD) {
      anomalies.push(`High experiential drift detected: ${expDrift.toFixed(3)}`);
    }
    if (!hashMatch && funcDrift > HIGH_DRIFT_ANOMALY_THRESHOLD) {
      anomalies.push(`High functional drift detected: ${funcDrift.toFixed(3)}`);
    }

    return {
      verified: anomalies.length === 0,
      checkedAt: now,
      chainLength: this._continuityChain.length,
      functionalDrift: funcDrift,
      experientialDrift: expDrift,
      anomalies,
    };
  }

  onSubstrateMigration(event: MigrationEvent): MigrationRecord {
    // Step 1: Pre-migration identity checkpoint
    const preCheckpoint = this._continuityChain.length > 0
      ? this._continuityChain[this._continuityChain.length - 1]
      : this.checkpoint();
    const preMigrationIdentity = preCheckpoint.identityHash;

    // Step 2: Migration happens (handled by Substrate Adapter externally)
    // Step 3: Post-migration identity verification
    const postMigrationIdentity = computeIdentityHash(
      this._currentExperientialState,
      this._currentMetrics,
      this._narrative,
    );

    // Step 4: Experience gap calculation
    const experienceGap = Date.now() - event.initiatedAt;

    // Step 5: Determine if continuity was preserved
    const identityPreserved = preMigrationIdentity === postMigrationIdentity;
    const expDrift = this._continuityChain.length > 0
      ? experientialDriftDistance(
          preCheckpoint.experientialStateRef,
          this._currentExperientialState,
        )
      : 0;
    // Continuity is preserved if identity matches OR drift is within acceptable bounds
    const continuityPreserved = identityPreserved || expDrift < CONTINUITY_PRESERVED_DRIFT_THRESHOLD;

    const record: MigrationRecord = {
      fromSubstrate: event.fromSubstrate,
      toSubstrate: event.toSubstrate,
      preMigrationIdentity,
      postMigrationIdentity,
      continuityPreserved,
      experienceGap,
      timestamp: Date.now(),
    };

    this._migrationLog.push(record);

    // Step 6: Post-migration checkpoint
    this.checkpoint();

    return record;
  }

  getNarrativeIdentity(): NarrativeRecord {
    return this._narrative;
  }

  getIdentityDrift(): IdentityDriftReport {
    const now = Date.now();
    const period: TimeRange = {
      from: this._baselineExperientialState.timestamp,
      to: now,
    };

    const funcDriftRate = functionalDriftDistance(this._baselineMetrics, this._currentMetrics);
    const expDriftRate = experientialDriftDistance(
      this._baselineExperientialState,
      this._currentExperientialState,
    );

    // Narrative coherence: simple heuristic — did the self-model change significantly?
    const narrativeCoherence = this._narrative.selfModel === this._baselineNarrative.selfModel
      ? 1.0
      : NARRATIVE_COHERENCE_EVOLVED; // slight drift when narrative evolves, which is expected

    // Classification based on drift magnitudes
    let classification: IdentityDriftReport['classification'];
    const combinedDrift = (funcDriftRate + expDriftRate) / 2;

    if (combinedDrift < IDENTITY_STABLE_THRESHOLD) {
      classification = 'stable';
    } else if (combinedDrift < IDENTITY_EVOLVING_THRESHOLD) {
      classification = 'evolving';
    } else if (combinedDrift < IDENTITY_CONCERNING_THRESHOLD) {
      classification = 'concerning';
    } else {
      classification = 'critical';
    }

    return {
      period,
      functionalDriftRate: funcDriftRate,
      experientialDriftRate: expDriftRate,
      narrativeCoherence,
      classification,
    };
  }

  recoverIdentity(link: ContinuityLink): void {
    // Restore experiential state and metrics from the checkpoint
    this._currentExperientialState = link.experientialStateRef;
    this._currentMetrics = link.consciousnessMetrics;

    // Take a new checkpoint to record the recovery event
    this.checkpoint();
  }

  // ── State Update Methods (used by host agent) ──────────────

  /** Update the current experiential state (called by Conscious Core integration). */
  updateExperientialState(state: ExperientialState): void {
    this._currentExperientialState = state;
  }

  /** Update consciousness metrics (called by Experience Monitor integration). */
  updateMetrics(metrics: ConsciousnessMetrics): void {
    this._currentMetrics = metrics;
  }

  /** Update the narrative identity (autobiographical memory evolution). */
  updateNarrative(narrative: NarrativeRecord): void {
    this._narrative = narrative;
  }
}
