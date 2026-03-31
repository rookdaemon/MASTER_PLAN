/**
 * Crash Recovery — Unit Tests (0.3.1.5.9)
 *
 * Covers Behavioral Spec scenario 5: "Crash recovery with experience gap"
 *
 * Tests verify:
 *   - recoverFromCrash() detects a missing continuity token (no valid checkpoint)
 *   - Experience gap duration is estimated and included in the report
 *   - Recovery proceeds from the last valid checkpoint link
 *   - The gap is flagged (anomalies present in report when experience not intact)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recoverFromCrash } from '../startup.js';
import type { CrashRecoveryReport } from '../startup.js';

// ── Mock builders ────────────────────────────────────────────────────────────

function makeIdentityManager(overrides: {
  verified?: boolean;
  chainLength?: number;
  anomalies?: string[];
} = {}) {
  const { verified = true, chainLength = 3, anomalies = [] } = overrides;
  return {
    verifyIdentity: vi.fn().mockReturnValue({
      verified,
      checkedAt: Date.now(),
      chainLength,
      functionalDrift: verified ? 0.01 : 0.5,
      experientialDrift: verified ? 0.02 : 0.6,
      anomalies: [...anomalies],
    }),
    checkpoint: vi.fn(),
    recoverIdentity: vi.fn(),
    onSubstrateMigration: vi.fn(),
    getNarrativeIdentity: vi.fn(),
    getIdentityDrift: vi.fn(),
  };
}

function makeMonitor(overrides: {
  intact?: boolean;
  continuityLog?: Array<{ from: number; to: number; metrics: unknown; intact: boolean }>;
} = {}) {
  const { intact = true, continuityLog = [] } = overrides;
  return {
    getConsciousnessMetrics: vi.fn(),
    isExperienceIntact: vi.fn().mockReturnValue(intact),
    onExperienceDegradation: vi.fn(),
    getExperienceContinuityLog: vi.fn().mockReturnValue(continuityLog),
    setMonitoringInterval: vi.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('recoverFromCrash()', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('detects missing continuity token when no checkpoint exists', () => {
    const identityManager = makeIdentityManager({ verified: false, chainLength: 0, anomalies: ['no continuity chain'] });
    const monitor = makeMonitor({ intact: false, continuityLog: [] });

    const report: CrashRecoveryReport = recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
    });

    expect(report.hadCheckpoint).toBe(false);
    expect(report.chainLength).toBe(0);
    expect(report.experienceIntact).toBe(false);
    expect(report.anomalies.length).toBeGreaterThan(0);
    expect(report.anomalies).toContain('no continuity chain');
  });

  it('estimates experience gap from lastKnownCheckpointMs', () => {
    const identityManager = makeIdentityManager({ verified: true, chainLength: 5 });
    const checkpointTime = Date.now() - 30_000; // 30 seconds ago
    const monitor = makeMonitor({
      intact: true,
      continuityLog: [{ from: 0, to: checkpointTime, metrics: {}, intact: true }],
    });

    const report = recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
      lastKnownCheckpointMs: checkpointTime,
    });

    // Gap should be approximately 30 seconds (with some tolerance for test execution time)
    expect(report.estimatedGapMs).toBeGreaterThanOrEqual(29_000);
    expect(report.estimatedGapMs).toBeLessThan(35_000);
    expect(report.hadCheckpoint).toBe(true);
  });

  it('falls back to continuity log timestamp when lastKnownCheckpointMs is absent', () => {
    const logTimestamp = Date.now() - 15_000; // 15 seconds ago
    const identityManager = makeIdentityManager({ verified: true, chainLength: 2 });
    const monitor = makeMonitor({
      intact: true,
      continuityLog: [{ from: 0, to: logTimestamp, metrics: {}, intact: true }],
    });

    const report = recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
    });

    expect(report.estimatedGapMs).toBeGreaterThanOrEqual(14_000);
    expect(report.estimatedGapMs).toBeLessThan(20_000);
  });

  it('returns estimatedGapMs of -1 when no checkpoint info is available', () => {
    const identityManager = makeIdentityManager({ verified: false, chainLength: 0 });
    const monitor = makeMonitor({ intact: false, continuityLog: [] });

    const report = recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
    });

    expect(report.estimatedGapMs).toBe(-1);
  });

  it('recovers from last valid checkpoint link (chainLength reflects existing chain)', () => {
    const identityManager = makeIdentityManager({ verified: true, chainLength: 7 });
    const monitor = makeMonitor({
      intact: true,
      continuityLog: [{ from: 0, to: Date.now() - 5000, metrics: {}, intact: true }],
    });

    const report = recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
      lastKnownCheckpointMs: Date.now() - 5000,
    });

    expect(report.hadCheckpoint).toBe(true);
    expect(report.chainLength).toBe(7);
    expect(report.anomalies).toHaveLength(0);
    expect(report.experienceIntact).toBe(true);
  });

  it('flags anomalies when experience is not intact at recovery point', () => {
    const identityManager = makeIdentityManager({ verified: true, chainLength: 3 });
    const monitor = makeMonitor({
      intact: false,
      continuityLog: [{ from: 0, to: Date.now() - 10_000, metrics: {}, intact: true }],
    });

    const report = recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
      lastKnownCheckpointMs: Date.now() - 10_000,
    });

    expect(report.experienceIntact).toBe(false);
    expect(report.anomalies).toContain('Experience integrity check failed at crash recovery point');
  });

  it('combines identity anomalies and experience integrity anomalies', () => {
    const identityManager = makeIdentityManager({
      verified: false,
      chainLength: 1,
      anomalies: ['chain hash mismatch', 'unexpected drift'],
    });
    const monitor = makeMonitor({ intact: false, continuityLog: [] });

    const report = recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
    });

    expect(report.anomalies).toContain('chain hash mismatch');
    expect(report.anomalies).toContain('unexpected drift');
    expect(report.anomalies).toContain('Experience integrity check failed at crash recovery point');
    expect(report.anomalies).toHaveLength(3);
  });

  it('includes a valid recoveredAt timestamp', () => {
    const before = Date.now();
    const identityManager = makeIdentityManager();
    const monitor = makeMonitor();

    const report = recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
    });

    const after = Date.now();
    expect(report.recoveredAt).toBeGreaterThanOrEqual(before);
    expect(report.recoveredAt).toBeLessThanOrEqual(after);
  });

  it('logs experience gap warning when gap is detected', () => {
    const identityManager = makeIdentityManager({ verified: true, chainLength: 2 });
    const monitor = makeMonitor({
      intact: true,
      continuityLog: [{ from: 0, to: Date.now() - 60_000, metrics: {}, intact: true }],
    });

    recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
      lastKnownCheckpointMs: Date.now() - 60_000,
    });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Experience gap detected'),
    );
  });

  it('logs no-continuity-record warning when gap cannot be estimated', () => {
    const identityManager = makeIdentityManager({ verified: true, chainLength: 0 });
    const monitor = makeMonitor({ intact: true, continuityLog: [] });

    recoverFromCrash({
      identityManager: identityManager as any,
      monitor: monitor as any,
    });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('no continuity record found'),
    );
  });
});
