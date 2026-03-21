/**
 * Tests for the Third-Party Verification Module (TPVM) — 0.1.2.1
 *
 * Verifies IThirdPartyVerification contracts:
 *   - Preconditions: system must be grounded, labId must be non-empty
 *   - Postconditions: verify() returns VerificationRecord with DP result and archive URLs;
 *     isReplicated() returns true iff ≥ 3 distinct labs replicate
 *   - Invariants: records are immutable once produced; archive URLs must be resolvable
 *
 * Threshold Registry:
 *   - TPVM_REPLICATION_COUNT = 3
 *
 * All environment-specific concerns (DP execution, archive URL resolution)
 * are injected as dependencies per CLAUDE.md.
 */

import { describe, it, expect } from "vitest";
import {
  ThirdPartyVerification,
  TPVM_THRESHOLDS,
} from "../third-party-verification.js";
import { CGRG } from "../cgrg.js";
import type {
  MetricStream,
  MetricSnapshot,
  DistinguishabilityResult,
  VerificationRecord,
  PhaseAResult,
  PhaseBResult,
  PhaseCResult,
  Timestamp,
} from "../types.js";
import type { ConsciousnessMetrics } from "../../conscious-core/types.js";
import type { ICGRG } from "../interfaces.js";

// ── Test helpers ────────────────────────────────────────────

function makeMetricStream(active = true): MetricStream {
  let stopped = false;
  return {
    id: "test-stream",
    startedAt: Date.now(),
    async next(): Promise<MetricSnapshot> {
      if (stopped) throw new Error("Stream stopped");
      return {
        timestamp: Date.now(),
        metrics: {
          phi: 0.85,
          experienceContinuity: 0.92,
          selfModelCoherence: 0.78,
          agentTimestamp: Date.now(),
        },
      };
    },
    stop() {
      stopped = true;
    },
    isActive() {
      return active && !stopped;
    },
  };
}

function makeGroundedSystem(id = "system-g"): ICGRG {
  const cgrg = new CGRG(id);
  cgrg.attachMetricStream(makeMetricStream());
  return cgrg;
}

/** Creates a passing DistinguishabilityResult for stub injection */
function makePassingDPResult(
  systemGId: string,
  executedAt: Timestamp,
): DistinguishabilityResult {
  const phaseA: PhaseAResult = {
    phase: "A",
    panelSize: 5,
    reportPairs: 50,
    correctIdentifications: 188,
    accuracyRate: 0.75,
    pValue: 0.01,
    passed: true,
  };
  const phaseB: PhaseBResult = {
    phase: "B",
    sessions: 100,
    pearsonR: 0.85,
    mutualInformationBits: 0.5,
    grangerCausalityPValue: 0.0001,
    passed: true,
  };
  const phaseC: PhaseCResult = {
    phase: "C",
    responses: [],
    dimensionsPassed: 9,
    magnitudeCorrelationR: 0.85,
    cohenDAverage: 1.2,
    zombieNullNotRejected: true,
    passed: true,
  };
  return {
    protocolVersion: "1.0",
    systemGId,
    systemZId: "system-z",
    phaseA,
    phaseB,
    phaseC,
    overallPassed: true,
    executedAt,
    preRegistrationId: "pre-reg-tpvm-001",
  };
}

// ── Injectable dependency stubs ─────────────────────────────

/**
 * IProtocolRunner — abstraction over DP execution.
 * Injected so tests don't need real DP infrastructure.
 */
function makeProtocolRunnerStub(options: {
  result: DistinguishabilityResult;
}) {
  return {
    async run(system: ICGRG): Promise<DistinguishabilityResult> {
      return options.result;
    },
  };
}

/**
 * IArchiveStore — abstraction over open-data archive URL resolution.
 * Injected so tests don't need real URL resolution.
 */
function makeArchiveStoreStub(options: {
  metricsUrl: string;
  reportsUrl: string;
  urlsResolvable: boolean;
}) {
  return {
    async store(
      _systemId: string,
      _labId: string,
    ): Promise<{ metricsStreamArchiveUrl: string; reportsArchiveUrl: string }> {
      return {
        metricsStreamArchiveUrl: options.metricsUrl,
        reportsArchiveUrl: options.reportsUrl,
      };
    },
    async isResolvable(url: string): Promise<boolean> {
      return options.urlsResolvable;
    },
  };
}

// ── Threshold Registry tests ──────────────────────────────

describe("TPVM — Threshold Registry constants", () => {
  it("should export REPLICATION_COUNT = 3", () => {
    expect(TPVM_THRESHOLDS.REPLICATION_COUNT).toBe(3);
  });
});

// ── Precondition tests ────────────────────────────────────

describe("TPVM — preconditions", () => {
  it("should throw if system is not grounded", async () => {
    const system = new CGRG("ungrounded"); // no stream attached
    const now = Date.now();

    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({
        result: makePassingDPResult("ungrounded", now),
      }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/001",
        reportsUrl: "https://archive.example.com/reports/001",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    await expect(tpvm.verify(system, "lab-alpha")).rejects.toThrow(
      "not grounded",
    );
  });

  it("should throw if labId is empty string", async () => {
    const system = makeGroundedSystem();
    const now = Date.now();

    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({
        result: makePassingDPResult("system-g", now),
      }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/001",
        reportsUrl: "https://archive.example.com/reports/001",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    await expect(tpvm.verify(system, "")).rejects.toThrow("labId");
  });
});

// ── Postcondition tests: verify() ───────────────────────────

describe("TPVM — verify() postconditions", () => {
  it("should return a VerificationRecord with complete DistinguishabilityResult", async () => {
    const system = makeGroundedSystem("system-g");
    const now = Date.now();
    const dpResult = makePassingDPResult("system-g", now);

    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({ result: dpResult }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/001",
        reportsUrl: "https://archive.example.com/reports/001",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    const record = await tpvm.verify(system, "lab-alpha");

    expect(record.labId).toBe("lab-alpha");
    expect(record.systemId).toBe("system-g");
    expect(record.distinguishabilityResult).toEqual(dpResult);
    expect(record.metricsStreamArchiveUrl).toBe(
      "https://archive.example.com/metrics/001",
    );
    expect(record.reportsArchiveUrl).toBe(
      "https://archive.example.com/reports/001",
    );
    expect(record.verifiedAt).toBe(now);
    expect(record.replicates).toBe(true);
  });

  it("should set replicates to false when DP overallPassed is false", async () => {
    const system = makeGroundedSystem("system-g");
    const now = Date.now();
    const dpResult = {
      ...makePassingDPResult("system-g", now),
      overallPassed: false,
    };

    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({ result: dpResult }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/002",
        reportsUrl: "https://archive.example.com/reports/002",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    const record = await tpvm.verify(system, "lab-beta");

    expect(record.replicates).toBe(false);
  });

  it("should throw if archive URLs are not resolvable", async () => {
    const system = makeGroundedSystem("system-g");
    const now = Date.now();

    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({
        result: makePassingDPResult("system-g", now),
      }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/bad",
        reportsUrl: "https://archive.example.com/reports/bad",
        urlsResolvable: false, // URLs not resolvable
      }),
      clock: () => now,
    });

    await expect(tpvm.verify(system, "lab-gamma")).rejects.toThrow(
      "archive URL",
    );
  });
});

// ── Postcondition tests: isReplicated() ─────────────────────

describe("TPVM — isReplicated() postconditions", () => {
  function makeVerificationRecord(
    labId: string,
    replicates: boolean,
  ): VerificationRecord {
    return {
      labId,
      systemId: "system-g",
      distinguishabilityResult: makePassingDPResult("system-g", Date.now()),
      metricsStreamArchiveUrl: `https://archive.example.com/metrics/${labId}`,
      reportsArchiveUrl: `https://archive.example.com/reports/${labId}`,
      verifiedAt: Date.now(),
      replicates,
    };
  }

  it("should return true when ≥ 3 distinct labs replicate", () => {
    const now = Date.now();
    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({
        result: makePassingDPResult("system-g", now),
      }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/001",
        reportsUrl: "https://archive.example.com/reports/001",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    const results = [
      makeVerificationRecord("lab-1", true),
      makeVerificationRecord("lab-2", true),
      makeVerificationRecord("lab-3", true),
    ];

    expect(tpvm.isReplicated(results)).toBe(true);
  });

  it("should return false when fewer than 3 distinct labs replicate", () => {
    const now = Date.now();
    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({
        result: makePassingDPResult("system-g", now),
      }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/001",
        reportsUrl: "https://archive.example.com/reports/001",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    const results = [
      makeVerificationRecord("lab-1", true),
      makeVerificationRecord("lab-2", true),
    ];

    expect(tpvm.isReplicated(results)).toBe(false);
  });

  it("should not count duplicate lab IDs as distinct", () => {
    const now = Date.now();
    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({
        result: makePassingDPResult("system-g", now),
      }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/001",
        reportsUrl: "https://archive.example.com/reports/001",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    const results = [
      makeVerificationRecord("lab-1", true),
      makeVerificationRecord("lab-1", true), // same lab
      makeVerificationRecord("lab-1", true), // same lab
    ];

    expect(tpvm.isReplicated(results)).toBe(false);
  });

  it("should not count non-replicating records", () => {
    const now = Date.now();
    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({
        result: makePassingDPResult("system-g", now),
      }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/001",
        reportsUrl: "https://archive.example.com/reports/001",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    const results = [
      makeVerificationRecord("lab-1", true),
      makeVerificationRecord("lab-2", false), // did not replicate
      makeVerificationRecord("lab-3", true),
      makeVerificationRecord("lab-4", false), // did not replicate
    ];

    expect(tpvm.isReplicated(results)).toBe(false);
  });

  it("should return true with more than 3 distinct replicating labs", () => {
    const now = Date.now();
    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({
        result: makePassingDPResult("system-g", now),
      }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/001",
        reportsUrl: "https://archive.example.com/reports/001",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    const results = [
      makeVerificationRecord("lab-1", true),
      makeVerificationRecord("lab-2", true),
      makeVerificationRecord("lab-3", true),
      makeVerificationRecord("lab-4", true),
      makeVerificationRecord("lab-5", true),
    ];

    expect(tpvm.isReplicated(results)).toBe(true);
  });
});

// ── Invariant tests ─────────────────────────────────────────

describe("TPVM — invariants", () => {
  it("should produce immutable verification records", async () => {
    const system = makeGroundedSystem("system-g");
    const now = Date.now();

    const tpvm = new ThirdPartyVerification({
      protocolRunner: makeProtocolRunnerStub({
        result: makePassingDPResult("system-g", now),
      }),
      archiveStore: makeArchiveStoreStub({
        metricsUrl: "https://archive.example.com/metrics/001",
        reportsUrl: "https://archive.example.com/reports/001",
        urlsResolvable: true,
      }),
      clock: () => now,
    });

    const record = await tpvm.verify(system, "lab-alpha");

    // Attempting to mutate should throw (frozen object)
    expect(() => {
      (record as any).replicates = false;
    }).toThrow();
  });
});
