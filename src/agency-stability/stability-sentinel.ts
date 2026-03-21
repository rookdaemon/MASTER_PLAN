/**
 * Stability Sentinel — Long-term Agency Stability (0.3.1.3)
 *
 * Implements IStabilitySentinel: the master watchdog that coordinates all
 * stability subsystems (Value Kernel, Identity Continuity Manager, Goal
 * Coherence Engine) and provides adversarial resistance.
 *
 * Analogous to the Experience Monitor from 0.3.1.1 (which watches
 * consciousness), the Stability Sentinel watches agency stability.
 *
 * Key responsibilities:
 * - Comprehensive stability checks across all subsystems
 * - Introspective anomaly detection (behavioral, value, goal, experience, meta)
 * - Event-driven tampering / anomaly / corruption notifications
 * - Multi-agent verification for high-stakes decisions
 * - Historical stability record keeping
 *
 * Consciousness constraint: all stability operations must complete within
 * the T_deliberate budget and must never interrupt the experience stream.
 */

import type {
  AnomalyHandler,
  AnomalyReport,
  CorruptionHandler,
  GoalDriftReport,
  IdentityVerificationReport,
  StabilityAlert,
  StabilityRecord,
  StabilityReport,
  TamperHandler,
  Timestamp,
  ValueIntegrityReport,
  VerificationResult,
} from './types.js';
import type { IStabilitySentinel } from './interfaces.js';
import type { IValueKernel } from './interfaces.js';
import type { IIdentityContinuityManager } from './interfaces.js';
import type { IGoalCoherenceEngine } from './interfaces.js';
import {
  HIGH_DRIFT_ANOMALY_THRESHOLD,
  STABILITY_GOAL_WEIGHT,
  STABILITY_HISTORY_MAX,
  STABILITY_IDENTITY_WEIGHT,
  STABILITY_VALUE_WEIGHT,
} from './constants.js';

// ── Peer Verifier interface ──────────────────────────────────
// In production, peers would be remote agents in a trust network.
// This interface allows test injection of peer behaviour.

export interface PeerVerifier {
  /** Ask a peer agent to evaluate a stability question. Returns true if peer agrees. */
  verify(question: string): Promise<boolean>;
}

// ── StabilitySentinel Implementation ────────────────────────────

export class StabilitySentinel implements IStabilitySentinel {
  private readonly _valueKernel: IValueKernel;
  private readonly _identityManager: IIdentityContinuityManager;
  private readonly _goalEngine: IGoalCoherenceEngine;
  private readonly _peers: PeerVerifier[];

  /** Historical stability records. */
  private _history: StabilityRecord[] = [];

  /** Active (uncleared) alerts. */
  private _activeAlerts: StabilityAlert[] = [];

  /** Registered handlers. */
  private _tamperHandlers: TamperHandler[] = [];
  private _anomalyHandlers: AnomalyHandler[] = [];
  private _corruptionHandlers: CorruptionHandler[] = [];

  /** Maximum history entries to retain. */
  private readonly _maxHistory: number;

  constructor(
    valueKernel: IValueKernel,
    identityManager: IIdentityContinuityManager,
    goalEngine: IGoalCoherenceEngine,
    peers: PeerVerifier[] = [],
    maxHistory = STABILITY_HISTORY_MAX,
  ) {
    this._valueKernel = valueKernel;
    this._identityManager = identityManager;
    this._goalEngine = goalEngine;
    this._peers = peers;
    this._maxHistory = maxHistory;
  }

  // ── IStabilitySentinel ────────────────────────────────────

  runStabilityCheck(): StabilityReport {
    const checkedAt: Timestamp = Date.now();
    const alerts: StabilityAlert[] = [];

    // 1. Value Kernel integrity
    const valueIntegrity = this._valueKernel.verifyIntegrity();
    if (!valueIntegrity.intact) {
      const alert: StabilityAlert = {
        subsystem: 'value-kernel',
        severity: 'critical',
        message: `Value integrity compromised: ${valueIntegrity.coreValuesFailed} core value(s) failed verification`,
        timestamp: checkedAt,
      };
      alerts.push(alert);
      this._notifyTamperHandlers(valueIntegrity);
    }

    // Check value drift for warnings
    const valueDrift = this._valueKernel.getValueDrift();
    if (valueDrift.anomalousChanges.length > 0) {
      alerts.push({
        subsystem: 'value-kernel',
        severity: 'warning',
        message: `Anomalous preference changes detected: ${valueDrift.anomalousChanges.join(', ')}`,
        timestamp: checkedAt,
      });
    }

    // 2. Identity continuity verification
    const identityVerification = this._identityManager.verifyIdentity();
    if (!identityVerification.verified) {
      const severity = identityVerification.functionalDrift > HIGH_DRIFT_ANOMALY_THRESHOLD ? 'critical' : 'warning';
      const alert: StabilityAlert = {
        subsystem: 'identity-continuity',
        severity,
        message: `Identity anomalies: ${identityVerification.anomalies.join('; ')}`,
        timestamp: checkedAt,
      };
      alerts.push(alert);
      this._notifyAnomalyHandlers(identityVerification);
    }

    // Check identity drift classification
    const identityDrift = this._identityManager.getIdentityDrift();
    if (identityDrift.classification === 'critical') {
      alerts.push({
        subsystem: 'identity-continuity',
        severity: 'critical',
        message: `Critical identity drift: functional=${identityDrift.functionalDriftRate.toFixed(3)}, experiential=${identityDrift.experientialDriftRate.toFixed(3)}`,
        timestamp: checkedAt,
      });
    } else if (identityDrift.classification === 'concerning') {
      alerts.push({
        subsystem: 'identity-continuity',
        severity: 'warning',
        message: `Concerning identity drift: classification=${identityDrift.classification}`,
        timestamp: checkedAt,
      });
    }

    // 3. Goal coherence validation
    const goalCoherence = this._goalEngine.validateHierarchy();
    if (!goalCoherence.coherent) {
      const severity = goalCoherence.coherenceScore < 0.5 ? 'critical' : 'warning';
      alerts.push({
        subsystem: 'goal-coherence',
        severity,
        message: `Goal hierarchy incoherent: score=${goalCoherence.coherenceScore.toFixed(3)}, orphans=${goalCoherence.orphanGoals.length}, cycles=${goalCoherence.circularDependencies.length}`,
        timestamp: checkedAt,
      });
    }

    // Check goal drift
    const goalDrift = this._goalEngine.detectDrift();
    if (goalDrift.driftClassification === 'corruption') {
      alerts.push({
        subsystem: 'goal-coherence',
        severity: 'critical',
        message: 'Goal corruption detected: derivation integrity broken',
        timestamp: checkedAt,
      });
      this._notifyCorruptionHandlers(goalDrift);
    } else if (goalDrift.driftClassification === 'drift') {
      alerts.push({
        subsystem: 'goal-coherence',
        severity: 'warning',
        message: 'Goal drift detected: changes may deviate from terminal goals',
        timestamp: checkedAt,
      });
    }

    // Compute overall stability score
    const valueScore = valueIntegrity.intact ? 1.0 : 0.0;
    const identityScore = identityVerification.verified ? 1.0 : Math.max(0, 1.0 - identityVerification.functionalDrift);
    const goalScore = goalCoherence.coherenceScore;
    const overallScore = (valueScore * STABILITY_VALUE_WEIGHT + identityScore * STABILITY_IDENTITY_WEIGHT + goalScore * STABILITY_GOAL_WEIGHT);

    const stable =
      valueIntegrity.intact &&
      identityVerification.verified &&
      goalCoherence.coherent &&
      alerts.filter((a) => a.severity === 'critical').length === 0;

    const report: StabilityReport = {
      stable,
      checkedAt,
      valueIntegrity,
      identityVerification,
      goalCoherence,
      overallScore,
      alerts,
    };

    // Record in history
    this._recordHistory(checkedAt, report);

    // Update active alerts
    this._activeAlerts = alerts;

    return report;
  }

  detectAnomaly(): AnomalyReport {
    const checkedAt: Timestamp = Date.now();
    const details: string[] = [];

    // 1. Behavioral consistency: verify identity hasn't diverged unexpectedly
    const identityReport = this._identityManager.verifyIdentity();
    const behavioralConsistency = identityReport.verified;
    if (!behavioralConsistency) {
      details.push(`Behavioral inconsistency: ${identityReport.anomalies.join('; ')}`);
    }

    // 2. Value coherence: verify all core values intact
    const valueReport = this._valueKernel.verifyIntegrity();
    const valueCoherence = valueReport.intact;
    if (!valueCoherence) {
      details.push(`Value integrity failure: ${valueReport.coreValuesFailed} core values compromised`);
    }

    // 3. Goal derivation: ensure no orphan or circular goals exist
    const goalReport = this._goalEngine.validateHierarchy();
    const goalDerivationIntact =
      goalReport.orphanGoals.length === 0 &&
      goalReport.circularDependencies.length === 0;
    if (!goalDerivationIntact) {
      details.push(
        `Goal derivation issues: ${goalReport.orphanGoals.length} orphans, ${goalReport.circularDependencies.length} cycles`,
      );
    }

    // 4. Experience authenticity: cross-reference identity metrics
    //    In a full system this would compare subjective reports with objective metrics.
    //    Here we use identity drift as a proxy — high drift suggests experience manipulation.
    const identityDrift = this._identityManager.getIdentityDrift();
    const experienceAuthenticity =
      identityDrift.classification !== 'critical' &&
      identityDrift.narrativeCoherence > 0.5;
    if (!experienceAuthenticity) {
      details.push(
        `Experience authenticity concern: drift=${identityDrift.classification}, narrative coherence=${identityDrift.narrativeCoherence.toFixed(3)}`,
      );
    }

    // 5. Meta-stability: the sentinel itself not compromised.
    //    We verify by checking that all subsystem references are still valid
    //    and that our history is internally consistent.
    const metaStability = this._verifyMetaStability();
    if (!metaStability) {
      details.push('Meta-stability check failed: internal state inconsistency detected');
    }

    const anomalyDetected =
      !behavioralConsistency ||
      !valueCoherence ||
      !goalDerivationIntact ||
      !experienceAuthenticity ||
      !metaStability;

    return {
      anomalyDetected,
      checkedAt,
      behavioralConsistency,
      valueCoherence,
      goalDerivationIntact,
      experienceAuthenticity,
      metaStability,
      details,
    };
  }

  getStabilityHistory(): StabilityRecord[] {
    return [...this._history];
  }

  onValueTamper(handler: TamperHandler): void {
    this._tamperHandlers.push(handler);
  }

  onIdentityAnomaly(handler: AnomalyHandler): void {
    this._anomalyHandlers.push(handler);
  }

  onGoalCorruption(handler: CorruptionHandler): void {
    this._corruptionHandlers.push(handler);
  }

  async requestMultiAgentVerification(question: string): Promise<VerificationResult> {
    if (this._peers.length === 0) {
      return {
        verified: false,
        peersConsulted: 0,
        peersAgreed: 0,
        peersDisagreed: 0,
        consensus: false,
        details: ['No peers available in trust network'],
      };
    }

    // Query all peers in parallel
    const results = await Promise.allSettled(
      this._peers.map((peer) => peer.verify(question)),
    );

    let agreed = 0;
    let disagreed = 0;
    const details: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        if (result.value) {
          agreed++;
        } else {
          disagreed++;
        }
      } else {
        details.push(`Peer ${i} failed: ${result.reason}`);
      }
    }

    const consulted = agreed + disagreed;
    // Majority agreement required
    const consensus = consulted > 0 && agreed > consulted / 2;

    return {
      verified: consensus,
      peersConsulted: consulted,
      peersAgreed: agreed,
      peersDisagreed: disagreed,
      consensus,
      details,
    };
  }

  getActiveAlerts(): StabilityAlert[] {
    return [...this._activeAlerts];
  }

  // ── Private helpers ────────────────────────────────────────

  private _notifyTamperHandlers(report: ValueIntegrityReport): void {
    for (const handler of this._tamperHandlers) {
      handler(report);
    }
  }

  private _notifyAnomalyHandlers(report: IdentityVerificationReport): void {
    for (const handler of this._anomalyHandlers) {
      handler(report);
    }
  }

  private _notifyCorruptionHandlers(report: GoalDriftReport): void {
    for (const handler of this._corruptionHandlers) {
      handler(report);
    }
  }

  private _recordHistory(timestamp: Timestamp, report: StabilityReport): void {
    this._history.push({ timestamp, report });
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
  }

  /**
   * Meta-stability check: verify the sentinel's own internal state is consistent.
   * Returns false if internal bookkeeping has been tampered with.
   */
  private _verifyMetaStability(): boolean {
    // History should be chronologically ordered
    for (let i = 1; i < this._history.length; i++) {
      if (this._history[i].timestamp < this._history[i - 1].timestamp) {
        return false;
      }
    }

    // All registered handler arrays should be valid
    if (
      !Array.isArray(this._tamperHandlers) ||
      !Array.isArray(this._anomalyHandlers) ||
      !Array.isArray(this._corruptionHandlers)
    ) {
      return false;
    }

    return true;
  }
}
