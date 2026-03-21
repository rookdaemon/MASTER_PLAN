/**
 * Integration Gateway (Layer 4) — Tests
 *
 * Covers:
 * - HybridCognitionBus contract: preconditions, postconditions, invariants
 * - Multi-array registration and aggregation
 * - Graceful array loss (Behavioral Spec)
 * - Bandwidth allocation (non-starvation invariant)
 * - Health monitoring and reporting
 * - Threshold Registry constants (CORTICAL_COLUMN_BANDWIDTH, SIGNAL_DEGRADATION_THRESHOLD)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  IntegrationGateway,
  DEFAULT_INTEGRATION_GATEWAY_CONFIG,
  type IntegrationGatewayConfig,
  type ArrayAdapter,
  type DegradationNotifier,
} from "../integration-gateway.js";
import {
  CORTICAL_COLUMN_BANDWIDTH,
  SIGNAL_DEGRADATION_THRESHOLD,
  type NeuralStateSnapshot,
  type SyntheticActivationRequest,
  type InterfaceHealthReport,
  type BandwidthAllocation,
  type BrainAtlasCoordinate,
} from "../types.js";

// ──────────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeCoordinate(
  region: string,
  overrides?: Partial<BrainAtlasCoordinate>
): BrainAtlasCoordinate {
  return {
    region,
    layer: 4,
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
  };
}

function makeHealthReport(
  arrayId: string,
  overrides?: Partial<InterfaceHealthReport>
): InterfaceHealthReport {
  return {
    arrayId,
    timestampUs: 1000,
    activeChannelCount: 100,
    totalChannelCount: 100,
    averageImpedanceOhms: 1000,
    signalDegradationPercent: 0,
    seizureDetected: false,
    stimulationSuspended: false,
    overallStatus: "healthy",
    ...overrides,
  };
}

function makeSnapshot(
  regionId: string,
  overrides?: Partial<NeuralStateSnapshot>
): NeuralStateSnapshot {
  return {
    timestampUs: 1000,
    regionId,
    activeFiringRates: new Map([["n1", 10]]),
    populationVector: new Float64Array([10]),
    qualityScore: 0.9,
    ...overrides,
  };
}

function makeActivationRequest(
  overrides?: Partial<SyntheticActivationRequest>
): SyntheticActivationRequest {
  return {
    targetCoordinates: [makeCoordinate("V1")],
    desiredFiringRateHz: 20,
    desiredTimingPatternUs: [],
    priorityLevel: 1,
    timestampUs: 1000,
    ...overrides,
  };
}

/** Mock ArrayAdapter — simulates a physical interface array */
class MockArrayAdapter implements ArrayAdapter {
  public arrayId: string;
  public regionId: string;
  public calibrated: boolean;
  public snapshots: NeuralStateSnapshot[] = [];
  public dispatchedRequests: SyntheticActivationRequest[] = [];
  public healthReport: InterfaceHealthReport;

  constructor(
    arrayId: string,
    regionId: string,
    calibrated = true,
    healthReport?: InterfaceHealthReport
  ) {
    this.arrayId = arrayId;
    this.regionId = regionId;
    this.calibrated = calibrated;
    this.healthReport = healthReport ?? makeHealthReport(arrayId);
  }

  isCalibrated(): boolean {
    return this.calibrated;
  }

  getRegionId(): string {
    return this.regionId;
  }

  getHealthReport(timestampUs: number): InterfaceHealthReport {
    return { ...this.healthReport, timestampUs };
  }

  readNeuralState(timestampUs: number): NeuralStateSnapshot | null {
    if (this.snapshots.length === 0) return null;
    return { ...this.snapshots[0], timestampUs };
  }

  dispatchActivationRequest(request: SyntheticActivationRequest): boolean {
    this.dispatchedRequests.push(request);
    return true;
  }
}

/** Mock DegradationNotifier */
class MockDegradationNotifier implements DegradationNotifier {
  public notifications: InterfaceHealthReport[] = [];

  notifyDegradation(report: InterfaceHealthReport): void {
    this.notifications.push(report);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("IntegrationGateway", () => {
  let gateway: IntegrationGateway;
  let notifier: MockDegradationNotifier;
  let config: IntegrationGatewayConfig;

  beforeEach(() => {
    notifier = new MockDegradationNotifier();
    config = { ...DEFAULT_INTEGRATION_GATEWAY_CONFIG };
    gateway = new IntegrationGateway(config, notifier);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Configuration / Threshold Registry
  // ────────────────────────────────────────────────────────────────────────

  describe("Threshold Registry", () => {
    it("default config uses CORTICAL_COLUMN_BANDWIDTH for minimum guaranteed bandwidth", () => {
      expect(config.minimumGuaranteedBandwidthKbps).toBe(
        CORTICAL_COLUMN_BANDWIDTH
      );
    });

    it("default config uses SIGNAL_DEGRADATION_THRESHOLD", () => {
      expect(config.signalDegradationThresholdPercent).toBe(
        SIGNAL_DEGRADATION_THRESHOLD
      );
    });

    it("uses CORTICAL_COLUMN_BANDWIDTH constant value of 200", () => {
      expect(CORTICAL_COLUMN_BANDWIDTH).toBe(200);
    });

    it("uses SIGNAL_DEGRADATION_THRESHOLD constant value of 20", () => {
      expect(SIGNAL_DEGRADATION_THRESHOLD).toBe(20);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // HybridCognitionBus Contract — Preconditions
  // ────────────────────────────────────────────────────────────────────────

  describe("Preconditions", () => {
    it("rejects operations when no arrays are registered", () => {
      expect(gateway.isOperational()).toBe(false);
    });

    it("rejects operations when arrays are registered but none are calibrated", () => {
      const uncalibrated = new MockArrayAdapter("arr-1", "V1", false);
      gateway.registerArray(uncalibrated);
      expect(gateway.isOperational()).toBe(false);
    });

    it("becomes operational when at least one calibrated array is registered", () => {
      const arr = new MockArrayAdapter("arr-1", "V1", true);
      gateway.registerArray(arr);
      expect(gateway.isOperational()).toBe(true);
    });

    it("readNeuralState returns null when gateway is not operational", () => {
      const result = gateway.readNeuralState("V1", 1000);
      expect(result).toBeNull();
    });

    it("dispatchActivationRequest returns false when gateway is not operational", () => {
      const req = makeActivationRequest();
      expect(gateway.dispatchActivationRequest(req)).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // HybridCognitionBus Contract — Postconditions
  // ────────────────────────────────────────────────────────────────────────

  describe("Postconditions", () => {
    it("provides unified NeuralStateSnapshot via readNeuralState", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      arr.snapshots.push(makeSnapshot("V1"));
      gateway.registerArray(arr);

      const result = gateway.readNeuralState("V1", 2000);
      expect(result).not.toBeNull();
      expect(result!.regionId).toBe("V1");
      expect(result!.timestampUs).toBe(2000);
    });

    it("dispatches SyntheticActivationRequest to appropriate arrays", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      gateway.registerArray(arr);

      const req = makeActivationRequest({
        targetCoordinates: [makeCoordinate("V1")],
      });
      const result = gateway.dispatchActivationRequest(req);
      expect(result).toBe(true);
      expect(arr.dispatchedRequests).toHaveLength(1);
    });

    it("dispatches request to multiple arrays covering the same region", () => {
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      const arr2 = new MockArrayAdapter("arr-2", "V1");
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      const req = makeActivationRequest({
        targetCoordinates: [makeCoordinate("V1")],
      });
      gateway.dispatchActivationRequest(req);
      expect(arr1.dispatchedRequests).toHaveLength(1);
      expect(arr2.dispatchedRequests).toHaveLength(1);
    });

    it("provides InterfaceHealthReport per array via getHealthReports", () => {
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      const arr2 = new MockArrayAdapter("arr-2", "M1");
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      const reports = gateway.getHealthReports(5000);
      expect(reports).toHaveLength(2);
      expect(reports.map((r) => r.arrayId).sort()).toEqual(["arr-1", "arr-2"]);
    });

    it("provides bandwidth allocation per region", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      gateway.registerArray(arr);

      const allocations = gateway.getBandwidthAllocations(1000);
      expect(allocations).toHaveLength(1);
      expect(allocations[0].regionId).toBe("V1");
      expect(allocations[0].minimumGuaranteedKbps).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // HybridCognitionBus Contract — Invariants
  // ────────────────────────────────────────────────────────────────────────

  describe("Invariants", () => {
    it("logical interface is stable regardless of number of underlying arrays", () => {
      // Start with 2 arrays
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      arr1.snapshots.push(makeSnapshot("V1"));
      const arr2 = new MockArrayAdapter("arr-2", "V1");
      arr2.snapshots.push(makeSnapshot("V1"));
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      // Read works with 2 arrays
      expect(gateway.readNeuralState("V1", 1000)).not.toBeNull();

      // Unregister one array — should still work
      gateway.unregisterArray("arr-2");
      expect(gateway.readNeuralState("V1", 2000)).not.toBeNull();
      expect(gateway.isOperational()).toBe(true);
    });

    it("loss of a physical array does not crash the bus", () => {
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      arr1.snapshots.push(makeSnapshot("V1"));
      const arr2 = new MockArrayAdapter("arr-2", "M1");
      arr2.snapshots.push(makeSnapshot("M1"));
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      // Mark arr2 as severely degraded
      arr2.healthReport = makeHealthReport("arr-2", {
        signalDegradationPercent: 60,
        activeChannelCount: 10,
        totalChannelCount: 100,
        overallStatus: "degraded",
      });

      // Evaluate health — should detect degradation and mark array
      gateway.evaluateArrayHealth(3000);

      // Bus continues operating
      expect(gateway.isOperational()).toBe(true);
      expect(gateway.readNeuralState("V1", 4000)).not.toBeNull();
    });

    it("bandwidth allocation is non-starvation: every active region gets minimum guaranteed throughput", () => {
      // Register arrays for 3 different regions
      gateway.registerArray(new MockArrayAdapter("arr-1", "V1"));
      gateway.registerArray(new MockArrayAdapter("arr-2", "M1"));
      gateway.registerArray(new MockArrayAdapter("arr-3", "S1"));

      const allocations = gateway.getBandwidthAllocations(1000);
      expect(allocations).toHaveLength(3);

      for (const alloc of allocations) {
        expect(alloc.minimumGuaranteedKbps).toBeGreaterThanOrEqual(
          config.minimumGuaranteedBandwidthKbps
        );
        expect(alloc.allocatedKbps).toBeGreaterThanOrEqual(
          alloc.minimumGuaranteedKbps
        );
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Behavioral Spec: Graceful array loss
  // ────────────────────────────────────────────────────────────────────────

  describe("Behavioral Spec: Graceful array loss", () => {
    it("marks array as degraded when signal degradation > 50% across >= 80% of channels", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      arr.healthReport = makeHealthReport("arr-1", {
        signalDegradationPercent: 55,
        activeChannelCount: 15, // 15% active = 85% degraded channels
        totalChannelCount: 100,
        overallStatus: "healthy", // adapter reports healthy, gateway should override
      });
      gateway.registerArray(arr);

      gateway.evaluateArrayHealth(2000);

      const reports = gateway.getHealthReports(3000);
      const arrReport = reports.find((r) => r.arrayId === "arr-1");
      expect(arrReport).toBeDefined();
      // Gateway should mark as degraded
      expect(gateway.getArrayStatus("arr-1")).toBe("degraded");
    });

    it("notifies degradation layer (0.2.2.4.3) via InterfaceHealthReport", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      arr.healthReport = makeHealthReport("arr-1", {
        signalDegradationPercent: 60,
        activeChannelCount: 10,
        totalChannelCount: 100,
        overallStatus: "degraded",
      });
      gateway.registerArray(arr);

      gateway.evaluateArrayHealth(2000);

      expect(notifier.notifications).toHaveLength(1);
      expect(notifier.notifications[0].arrayId).toBe("arr-1");
    });

    it("redistributes bandwidth allocation among remaining arrays after degradation", () => {
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      const arr2 = new MockArrayAdapter("arr-2", "V1");
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      const beforeAllocations = gateway.getBandwidthAllocations(1000);
      const beforeV1 = beforeAllocations.find((a) => a.regionId === "V1");
      expect(beforeV1).toBeDefined();

      // Degrade arr2
      arr2.healthReport = makeHealthReport("arr-2", {
        signalDegradationPercent: 60,
        activeChannelCount: 10,
        totalChannelCount: 100,
        overallStatus: "degraded",
      });
      gateway.evaluateArrayHealth(2000);

      // Bandwidth should still be allocated to V1 via arr1
      const afterAllocations = gateway.getBandwidthAllocations(3000);
      const afterV1 = afterAllocations.find((a) => a.regionId === "V1");
      expect(afterV1).toBeDefined();
      expect(afterV1!.allocatedKbps).toBeGreaterThanOrEqual(
        config.minimumGuaranteedBandwidthKbps
      );
    });

    it("HybridCognitionBus continues operating with reduced coverage", () => {
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      arr1.snapshots.push(makeSnapshot("V1"));
      const arr2 = new MockArrayAdapter("arr-2", "M1");
      arr2.snapshots.push(makeSnapshot("M1"));
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      // Degrade arr2
      arr2.healthReport = makeHealthReport("arr-2", {
        signalDegradationPercent: 60,
        activeChannelCount: 10,
        totalChannelCount: 100,
        overallStatus: "degraded",
      });
      gateway.evaluateArrayHealth(2000);

      // V1 still works, M1 returns null (degraded array excluded from reads)
      expect(gateway.readNeuralState("V1", 3000)).not.toBeNull();
      expect(gateway.isOperational()).toBe(true);
    });

    it("does not mark array as degraded when degradation is below threshold", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      arr.healthReport = makeHealthReport("arr-1", {
        signalDegradationPercent: 10,
        activeChannelCount: 95,
        totalChannelCount: 100,
        overallStatus: "healthy",
      });
      gateway.registerArray(arr);

      gateway.evaluateArrayHealth(2000);
      expect(gateway.getArrayStatus("arr-1")).toBe("healthy");
      expect(notifier.notifications).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Multi-array aggregation
  // ────────────────────────────────────────────────────────────────────────

  describe("Multi-array aggregation", () => {
    it("aggregates snapshots from multiple arrays for the same region", () => {
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      arr1.snapshots.push(
        makeSnapshot("V1", {
          activeFiringRates: new Map([["n1", 10]]),
          populationVector: new Float64Array([10]),
          qualityScore: 0.8,
        })
      );
      const arr2 = new MockArrayAdapter("arr-2", "V1");
      arr2.snapshots.push(
        makeSnapshot("V1", {
          activeFiringRates: new Map([["n2", 20]]),
          populationVector: new Float64Array([20]),
          qualityScore: 0.9,
        })
      );
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      const result = gateway.readNeuralState("V1", 5000);
      expect(result).not.toBeNull();
      expect(result!.regionId).toBe("V1");
      // Aggregated snapshot should include data from both arrays
      expect(result!.activeFiringRates.size).toBe(2);
      expect(result!.activeFiringRates.get("n1")).toBe(10);
      expect(result!.activeFiringRates.get("n2")).toBe(20);
    });

    it("returns null for a region with no registered arrays", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      arr.snapshots.push(makeSnapshot("V1"));
      gateway.registerArray(arr);

      expect(gateway.readNeuralState("M1", 1000)).toBeNull();
    });

    it("skips degraded arrays when reading neural state", () => {
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      arr1.snapshots.push(
        makeSnapshot("V1", {
          activeFiringRates: new Map([["n1", 10]]),
          qualityScore: 0.9,
        })
      );
      const arr2 = new MockArrayAdapter("arr-2", "V1");
      arr2.snapshots.push(
        makeSnapshot("V1", {
          activeFiringRates: new Map([["n2", 20]]),
          qualityScore: 0.5,
        })
      );
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      // Degrade arr2
      arr2.healthReport = makeHealthReport("arr-2", {
        signalDegradationPercent: 60,
        activeChannelCount: 10,
        totalChannelCount: 100,
        overallStatus: "degraded",
      });
      gateway.evaluateArrayHealth(2000);

      const result = gateway.readNeuralState("V1", 3000);
      expect(result).not.toBeNull();
      // Only arr1's data should be included
      expect(result!.activeFiringRates.size).toBe(1);
      expect(result!.activeFiringRates.has("n1")).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Array registration and lifecycle
  // ────────────────────────────────────────────────────────────────────────

  describe("Array registration", () => {
    it("registers and tracks multiple arrays", () => {
      gateway.registerArray(new MockArrayAdapter("arr-1", "V1"));
      gateway.registerArray(new MockArrayAdapter("arr-2", "M1"));
      expect(gateway.getRegisteredArrayCount()).toBe(2);
    });

    it("rejects duplicate array registration", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      gateway.registerArray(arr);
      expect(() => gateway.registerArray(arr)).toThrow();
    });

    it("unregisters arrays cleanly", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      gateway.registerArray(arr);
      gateway.unregisterArray("arr-1");
      expect(gateway.getRegisteredArrayCount()).toBe(0);
    });

    it("handles unregistering non-existent array gracefully", () => {
      // Should not throw
      expect(() => gateway.unregisterArray("nonexistent")).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Bandwidth allocation
  // ────────────────────────────────────────────────────────────────────────

  describe("Bandwidth allocation", () => {
    it("allocates minimum guaranteed bandwidth to each region", () => {
      gateway.registerArray(new MockArrayAdapter("arr-1", "V1"));
      gateway.registerArray(new MockArrayAdapter("arr-2", "M1"));

      const allocations = gateway.getBandwidthAllocations(1000);
      for (const alloc of allocations) {
        expect(alloc.minimumGuaranteedKbps).toBe(
          config.minimumGuaranteedBandwidthKbps
        );
      }
    });

    it("allocated bandwidth equals sum of arrays in region times column bandwidth", () => {
      gateway.registerArray(new MockArrayAdapter("arr-1", "V1"));
      gateway.registerArray(new MockArrayAdapter("arr-2", "V1"));

      const allocations = gateway.getBandwidthAllocations(1000);
      const v1 = allocations.find((a) => a.regionId === "V1");
      expect(v1).toBeDefined();
      // 2 healthy arrays → 2x column bandwidth
      expect(v1!.allocatedKbps).toBe(2 * CORTICAL_COLUMN_BANDWIDTH);
    });

    it("reduces allocation when array is degraded", () => {
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      const arr2 = new MockArrayAdapter("arr-2", "V1");
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      // Degrade arr2
      arr2.healthReport = makeHealthReport("arr-2", {
        signalDegradationPercent: 60,
        activeChannelCount: 10,
        totalChannelCount: 100,
        overallStatus: "degraded",
      });
      gateway.evaluateArrayHealth(2000);

      const allocations = gateway.getBandwidthAllocations(3000);
      const v1 = allocations.find((a) => a.regionId === "V1");
      expect(v1).toBeDefined();
      // Only 1 healthy array → 1x column bandwidth
      expect(v1!.allocatedKbps).toBe(CORTICAL_COLUMN_BANDWIDTH);
    });

    it("validates BandwidthAllocation: allocated >= minimum", () => {
      gateway.registerArray(new MockArrayAdapter("arr-1", "V1"));

      const allocations = gateway.getBandwidthAllocations(1000);
      for (const alloc of allocations) {
        expect(alloc.allocatedKbps).toBeGreaterThanOrEqual(
          alloc.minimumGuaranteedKbps
        );
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Health monitoring
  // ────────────────────────────────────────────────────────────────────────

  describe("Health monitoring", () => {
    it("reports seizure status from array adapters", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      arr.healthReport = makeHealthReport("arr-1", {
        seizureDetected: true,
        stimulationSuspended: true,
      });
      gateway.registerArray(arr);

      const reports = gateway.getHealthReports(1000);
      expect(reports[0].seizureDetected).toBe(true);
      expect(reports[0].stimulationSuspended).toBe(true);
    });

    it("does not dispatch activation requests to arrays with suspended stimulation", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      arr.healthReport = makeHealthReport("arr-1", {
        stimulationSuspended: true,
      });
      gateway.registerArray(arr);

      const req = makeActivationRequest({
        targetCoordinates: [makeCoordinate("V1")],
      });
      const result = gateway.dispatchActivationRequest(req);
      // Should still return true if dispatched to at least one array, false if none
      expect(result).toBe(false);
      expect(arr.dispatchedRequests).toHaveLength(0);
    });

    it("evaluateArrayHealth detects degradation based on channel percentage", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      // 80% channels degraded = 20 active out of 100
      arr.healthReport = makeHealthReport("arr-1", {
        signalDegradationPercent: 55,
        activeChannelCount: 20,
        totalChannelCount: 100,
      });
      gateway.registerArray(arr);

      gateway.evaluateArrayHealth(2000);
      expect(gateway.getArrayStatus("arr-1")).toBe("degraded");
    });

    it("does not degrade array when channels are mostly active", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      arr.healthReport = makeHealthReport("arr-1", {
        signalDegradationPercent: 10,
        activeChannelCount: 90,
        totalChannelCount: 100,
      });
      gateway.registerArray(arr);

      gateway.evaluateArrayHealth(2000);
      expect(gateway.getArrayStatus("arr-1")).toBe("healthy");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ────────────────────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("handles all arrays degraded — gateway reports not operational but does not crash", () => {
      const arr = new MockArrayAdapter("arr-1", "V1");
      arr.healthReport = makeHealthReport("arr-1", {
        signalDegradationPercent: 80,
        activeChannelCount: 5,
        totalChannelCount: 100,
        overallStatus: "degraded",
      });
      gateway.registerArray(arr);
      gateway.evaluateArrayHealth(2000);

      // All arrays degraded — no healthy calibrated array
      expect(gateway.isOperational()).toBe(false);
      expect(gateway.readNeuralState("V1", 3000)).toBeNull();
    });

    it("dispatches to non-degraded arrays only", () => {
      const arr1 = new MockArrayAdapter("arr-1", "V1");
      const arr2 = new MockArrayAdapter("arr-2", "V1");
      gateway.registerArray(arr1);
      gateway.registerArray(arr2);

      // Degrade arr2
      arr2.healthReport = makeHealthReport("arr-2", {
        signalDegradationPercent: 60,
        activeChannelCount: 10,
        totalChannelCount: 100,
        overallStatus: "degraded",
      });
      gateway.evaluateArrayHealth(2000);

      const req = makeActivationRequest({
        targetCoordinates: [makeCoordinate("V1")],
      });
      gateway.dispatchActivationRequest(req);

      expect(arr1.dispatchedRequests).toHaveLength(1);
      expect(arr2.dispatchedRequests).toHaveLength(0);
    });

    it("getArrayStatus returns null for unknown array", () => {
      expect(gateway.getArrayStatus("unknown")).toBeNull();
    });

    it("supports configurable degradation thresholds", () => {
      const customConfig: IntegrationGatewayConfig = {
        ...DEFAULT_INTEGRATION_GATEWAY_CONFIG,
        arrayDegradationPercentThreshold: 70,
        arrayDegradedChannelPercentThreshold: 90,
      };
      const customGateway = new IntegrationGateway(customConfig, notifier);

      const arr = new MockArrayAdapter("arr-1", "V1");
      // 80% degraded channels with 60% signal degradation
      arr.healthReport = makeHealthReport("arr-1", {
        signalDegradationPercent: 60,
        activeChannelCount: 20,
        totalChannelCount: 100,
      });
      customGateway.registerArray(arr);
      customGateway.evaluateArrayHealth(2000);

      // With stricter thresholds (70% signal, 90% channel), this should still be healthy
      expect(customGateway.getArrayStatus("arr-1")).toBe("healthy");
    });
  });
});
