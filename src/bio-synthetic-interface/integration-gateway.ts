/**
 * Bio-Synthetic Interface — Integration Gateway (Layer 4)
 *
 * Top-level abstraction presenting a unified HybridCognitionBus to
 * external consumers (consciousness unity layer 0.2.2.4.2, hybrid
 * cognition orchestrator).
 *
 * Responsibilities:
 * - Multi-array multiplexing across cortical regions
 * - Unified logical interface regardless of physical array count
 * - Bandwidth allocation with non-starvation guarantee
 * - Health monitoring and degradation signals to 0.2.2.4.3
 *
 * Decision D3: Graceful scaling via modular arrays.
 * All timestamps are injected as parameters for testability (per CLAUDE.md).
 * All environment-specifics injected as abstractions (per CLAUDE.md).
 */

import {
  CORTICAL_COLUMN_BANDWIDTH,
  SIGNAL_DEGRADATION_THRESHOLD,
  type NeuralStateSnapshot,
  type SyntheticActivationRequest,
  type InterfaceHealthReport,
  type BandwidthAllocation,
  type ArrayHealthStatus,
} from "./types.js";

// ──────────────────────────────────────────────────────────────────────────────
// Injectable abstractions (per CLAUDE.md)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Adapter wrapping a physical interface array for use by the gateway.
 * Each physical array (Layers 1–3) exposes this interface to Layer 4.
 */
export interface ArrayAdapter {
  readonly arrayId: string;

  /** Whether the array has completed initial calibration. */
  isCalibrated(): boolean;

  /** The brain region this array covers. */
  getRegionId(): string;

  /** Current health report for this array. */
  getHealthReport(timestampUs: number): InterfaceHealthReport;

  /** Read the current neural state from this array. Returns null if unavailable. */
  readNeuralState(timestampUs: number): NeuralStateSnapshot | null;

  /** Dispatch a synthetic activation request to this array. Returns true if accepted. */
  dispatchActivationRequest(request: SyntheticActivationRequest): boolean;
}

/**
 * Notifier for the graceful degradation layer (0.2.2.4.3).
 * Receives health reports when arrays degrade.
 */
export interface DegradationNotifier {
  notifyDegradation(report: InterfaceHealthReport): void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Configuration (per CLAUDE.md: modularity and configurability)
// ──────────────────────────────────────────────────────────────────────────────

export interface IntegrationGatewayConfig {
  /** Minimum guaranteed bandwidth per region (Kbps). From Threshold Registry. */
  readonly minimumGuaranteedBandwidthKbps: number;
  /** Signal degradation threshold (%). From Threshold Registry. */
  readonly signalDegradationThresholdPercent: number;
  /**
   * Signal degradation percentage above which an array is marked degraded.
   * Behavioral Spec: > 50%.
   */
  readonly arrayDegradationPercentThreshold: number;
  /**
   * Percentage of channels that must be degraded to trigger array degradation.
   * Behavioral Spec: >= 80%.
   */
  readonly arrayDegradedChannelPercentThreshold: number;
}

/** Default configuration using Threshold Registry and Behavioral Spec constants. */
export const DEFAULT_INTEGRATION_GATEWAY_CONFIG: IntegrationGatewayConfig = {
  minimumGuaranteedBandwidthKbps: CORTICAL_COLUMN_BANDWIDTH,
  signalDegradationThresholdPercent: SIGNAL_DEGRADATION_THRESHOLD,
  arrayDegradationPercentThreshold: 50,
  arrayDegradedChannelPercentThreshold: 80,
};

// ──────────────────────────────────────────────────────────────────────────────
// Internal array tracking
// ──────────────────────────────────────────────────────────────────────────────

interface TrackedArray {
  adapter: ArrayAdapter;
  status: ArrayHealthStatus;
}

// ──────────────────────────────────────────────────────────────────────────────
// Integration Gateway
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Layer 4: Integration Gateway.
 *
 * Presents a unified HybridCognitionBus to external consumers.
 * Multiplexes multiple physical interface arrays, manages bandwidth
 * allocation, and provides health monitoring with degradation signals.
 *
 * Contract: HybridCognitionBus (Layer 4 → external consumers)
 *
 * Preconditions:
 * - At least one physical interface unit is operational and calibrated
 * - Integration Gateway has completed initial registration of all active arrays
 *
 * Postconditions:
 * - Unified bidirectional neural data stream presented to consumers
 * - NeuralStateSnapshot readable at configurable temporal resolution
 * - SyntheticActivationRequest dispatched to appropriate physical arrays
 * - Per-region health and bandwidth metrics available
 *
 * Invariants:
 * - Logical interface is stable regardless of number of underlying physical arrays
 * - Loss of a physical array triggers degradation signal but does not crash the bus
 * - Bandwidth allocation is non-starvation: every active region gets minimum guaranteed throughput
 */
export class IntegrationGateway {
  private readonly config: IntegrationGatewayConfig;
  private readonly degradationNotifier: DegradationNotifier;
  private readonly arrays: Map<string, TrackedArray> = new Map();

  constructor(
    config: IntegrationGatewayConfig,
    degradationNotifier: DegradationNotifier
  ) {
    this.config = config;
    this.degradationNotifier = degradationNotifier;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Array registration
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Register a physical interface array with the gateway.
   * Throws if an array with the same ID is already registered.
   */
  registerArray(adapter: ArrayAdapter): void {
    if (this.arrays.has(adapter.arrayId)) {
      throw new Error(
        `Array '${adapter.arrayId}' is already registered with the gateway`
      );
    }
    this.arrays.set(adapter.arrayId, {
      adapter,
      status: "healthy",
    });
  }

  /**
   * Unregister a physical interface array from the gateway.
   * No-op if array is not registered.
   */
  unregisterArray(arrayId: string): void {
    this.arrays.delete(arrayId);
  }

  /** Number of currently registered arrays. */
  getRegisteredArrayCount(): number {
    return this.arrays.size;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Operational status (Contract precondition check)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Check if the gateway is operational.
   * Contract precondition: at least one physical interface unit is
   * operational (healthy) and calibrated.
   */
  isOperational(): boolean {
    for (const tracked of this.arrays.values()) {
      if (tracked.status === "healthy" && tracked.adapter.isCalibrated()) {
        return true;
      }
    }
    return false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Read pathway: NeuralStateSnapshot
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Read the neural state for a brain region by aggregating data from
   * all healthy arrays covering that region.
   *
   * Returns null if gateway is not operational or no healthy arrays
   * cover the requested region.
   */
  readNeuralState(
    regionId: string,
    timestampUs: number
  ): NeuralStateSnapshot | null {
    if (!this.isOperational()) return null;

    const regionArrays = this.getHealthyArraysForRegion(regionId);
    if (regionArrays.length === 0) return null;

    // Collect snapshots from all healthy arrays for this region
    const snapshots: NeuralStateSnapshot[] = [];
    for (const tracked of regionArrays) {
      const snapshot = tracked.adapter.readNeuralState(timestampUs);
      if (snapshot !== null) {
        snapshots.push(snapshot);
      }
    }

    if (snapshots.length === 0) return null;
    if (snapshots.length === 1) return snapshots[0];

    // Aggregate multiple snapshots into a unified snapshot
    return this.aggregateSnapshots(snapshots, regionId, timestampUs);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Write pathway: SyntheticActivationRequest dispatch
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Dispatch a synthetic activation request to appropriate physical arrays.
   *
   * Routes to all healthy, non-suspended arrays covering the target regions.
   * Returns true if at least one array accepted the request.
   */
  dispatchActivationRequest(request: SyntheticActivationRequest): boolean {
    if (!this.isOperational()) return false;

    // Determine target regions from the request coordinates
    const targetRegions = new Set<string>();
    for (const coord of request.targetCoordinates) {
      targetRegions.add(coord.region);
    }

    let dispatched = false;
    for (const regionId of targetRegions) {
      const regionArrays = this.getHealthyArraysForRegion(regionId);
      for (const tracked of regionArrays) {
        // Check if stimulation is suspended on this array
        const report = tracked.adapter.getHealthReport(request.timestampUs);
        if (report.stimulationSuspended) continue;

        if (tracked.adapter.dispatchActivationRequest(request)) {
          dispatched = true;
        }
      }
    }

    return dispatched;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Health monitoring
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get health reports from all registered arrays.
   */
  getHealthReports(timestampUs: number): InterfaceHealthReport[] {
    const reports: InterfaceHealthReport[] = [];
    for (const tracked of this.arrays.values()) {
      reports.push(tracked.adapter.getHealthReport(timestampUs));
    }
    return reports;
  }

  /**
   * Evaluate the health of all registered arrays and update their status.
   *
   * Behavioral Spec (Graceful array loss):
   * When one array's InterfaceHealthReport indicates signal degradation > 50%
   * across >= 80% of its channels:
   * - Mark the array as degraded
   * - Notify the graceful degradation layer (0.2.2.4.3) via InterfaceHealthReport
   * - Redistribute bandwidth allocation among remaining arrays
   * - HybridCognitionBus continues operating with reduced coverage
   */
  evaluateArrayHealth(timestampUs: number): void {
    for (const [arrayId, tracked] of this.arrays) {
      const report = tracked.adapter.getHealthReport(timestampUs);

      const degradedChannelPercent =
        report.totalChannelCount > 0
          ? ((report.totalChannelCount - report.activeChannelCount) /
              report.totalChannelCount) *
            100
          : 0;

      const isDegraded =
        report.signalDegradationPercent >
          this.config.arrayDegradationPercentThreshold &&
        degradedChannelPercent >=
          this.config.arrayDegradedChannelPercentThreshold;

      if (isDegraded && tracked.status !== "degraded") {
        tracked.status = "degraded";
        this.degradationNotifier.notifyDegradation(report);
      } else if (!isDegraded && tracked.status === "degraded") {
        // Recovery
        tracked.status = "healthy";
      }
    }
  }

  /**
   * Get the current status of a specific array.
   * Returns null if array is not registered.
   */
  getArrayStatus(arrayId: string): ArrayHealthStatus | null {
    const tracked = this.arrays.get(arrayId);
    return tracked ? tracked.status : null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Bandwidth allocation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get current bandwidth allocations for all active regions.
   *
   * Contract invariant: non-starvation — every active region gets
   * minimum guaranteed throughput.
   *
   * Allocation = number of healthy arrays × CORTICAL_COLUMN_BANDWIDTH per region.
   * Minimum guaranteed = config.minimumGuaranteedBandwidthKbps.
   */
  getBandwidthAllocations(timestampUs: number): BandwidthAllocation[] {
    // Group healthy arrays by region
    const regionHealthyCount = new Map<string, number>();
    for (const tracked of this.arrays.values()) {
      const regionId = tracked.adapter.getRegionId();
      const current = regionHealthyCount.get(regionId) ?? 0;
      if (tracked.status === "healthy") {
        regionHealthyCount.set(regionId, current + 1);
      } else {
        // Ensure region exists even if all arrays are degraded
        if (!regionHealthyCount.has(regionId)) {
          regionHealthyCount.set(regionId, 0);
        }
      }
    }

    const allocations: BandwidthAllocation[] = [];
    for (const [regionId, healthyCount] of regionHealthyCount) {
      const allocatedKbps = Math.max(
        healthyCount * CORTICAL_COLUMN_BANDWIDTH,
        this.config.minimumGuaranteedBandwidthKbps
      );

      allocations.push({
        regionId,
        allocatedKbps,
        minimumGuaranteedKbps: this.config.minimumGuaranteedBandwidthKbps,
        currentUsageKbps: 0, // Usage tracking would be injected in production
        timestampUs,
      });
    }

    return allocations;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get all healthy (non-degraded) arrays covering a specific region.
   */
  private getHealthyArraysForRegion(regionId: string): TrackedArray[] {
    const result: TrackedArray[] = [];
    for (const tracked of this.arrays.values()) {
      if (
        tracked.adapter.getRegionId() === regionId &&
        tracked.status === "healthy"
      ) {
        result.push(tracked);
      }
    }
    return result;
  }

  /**
   * Aggregate multiple NeuralStateSnapshots into a single unified snapshot.
   * Merges firing rate maps and concatenates population vectors.
   * Quality score is the average across contributing snapshots.
   */
  private aggregateSnapshots(
    snapshots: NeuralStateSnapshot[],
    regionId: string,
    timestampUs: number
  ): NeuralStateSnapshot {
    const mergedRates = new Map<string, number>();
    const allVectors: number[] = [];
    let totalQuality = 0;

    for (const snapshot of snapshots) {
      for (const [neuronId, rate] of snapshot.activeFiringRates) {
        // If same neuron appears in multiple arrays, keep the higher rate
        const existing = mergedRates.get(neuronId);
        if (existing === undefined || rate > existing) {
          mergedRates.set(neuronId, rate);
        }
      }
      for (let i = 0; i < snapshot.populationVector.length; i++) {
        allVectors.push(snapshot.populationVector[i]);
      }
      totalQuality += snapshot.qualityScore;
    }

    return {
      timestampUs,
      regionId,
      activeFiringRates: mergedRates,
      populationVector: new Float64Array(allVectors),
      qualityScore: Math.min(1, totalQuality / snapshots.length),
    };
  }
}
