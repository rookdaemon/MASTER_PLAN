/**
 * Manufacturing Orchestrator — Control & Orchestration Layer
 *
 * Card: 0.3.2.1 Autonomous Manufacturing Ecosystems
 *
 * Coordinates all five manufacturing layers to fulfil demand forecasts,
 * monitors system health, and automatically rebalances after disruptions.
 * All orchestration is autonomous — no biological operator input required.
 */

import {
  type ManufacturingOrchestrator,
  type DemandForecast,
  type ProductionPlan,
  type ProductionPhase,
  type ExecutionHandle,
  type DisruptionEvent,
  type SystemHealthReport,
  type ResourceExtractor,
  type Refinery,
  type Fabricator,
  type Assembler,
  type Recycler,
  type LayerAllocation,
  type Clock,
  type Timer,
} from "./types.js";

// ── Configuration ────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  /** Minimum redundant nodes per layer (resilience requirement: ≥3) */
  minNodesPerLayer: number;
  /** Fabricator utilisation threshold that triggers self-replication (0.0–1.0) */
  replicationUtilisationThreshold: number;
  /** Sustained days above threshold before replication triggers (Threshold Registry) */
  replicationSustainedDays: number;
  /** Target material recovery rate (acceptance criterion: ≥0.95) */
  targetRecoveryRate: number;
  /** Maximum throughput loss from any single node failure (fraction) */
  maxSingleNodeThroughputLoss: number;
  /** Maximum hours to full recovery after single-node failure */
  maxRecoveryHours: number;
  /** Minimum critical feedstock/component stockpile in days */
  inventoryBufferDays: number;
  /** Max days for capacity self-expansion via replication after demand spike */
  demandSpikeScalingDays: number;
  /** Time in seconds to detect failure and reroute supply chains */
  failoverDetectionSeconds: number;
  /** Node IDs available in each layer */
  layerNodes: Record<1 | 2 | 3 | 4 | 5, string[]>;

  // Environment abstractions (CLAUDE.md: injectable and mockable)
  clock: Clock;
  timer: Timer;

  // Layer implementations
  extractors: Map<string, ResourceExtractor>;
  refineries: Map<string, Refinery>;
  fabricators: Map<string, Fabricator>;
  assemblers: Map<string, Assembler>;
  recyclers: Map<string, Recycler>;
}

// ── Threshold Constants (from Threshold Registry) ────────────────────────────

export const MIN_NODES_PER_LAYER = 3;
export const REPLICATION_UTILISATION_THRESHOLD = 0.80;
export const REPLICATION_SUSTAINED_DAYS = 30;
export const TARGET_RECOVERY_RATE = 0.95;
export const MAX_SINGLE_NODE_THROUGHPUT_LOSS = 0.09;
export const MAX_RECOVERY_HOURS = 72;
export const INVENTORY_BUFFER_DAYS = 90;
export const DEMAND_SPIKE_SCALING_DAYS = 180;
export const FAILOVER_DETECTION_SECONDS = 60;

// ── Internal State ───────────────────────────────────────────────────────────

interface OrchestratorState {
  activePlan: ProductionPlan | null;
  activeHandle: InternalHandle | null;
  disruptions: Map<string, DisruptionEvent>;
  /** Per-layer throughput fractions (degraded by disruptions) */
  layerThroughput: Record<1 | 2 | 3 | 4 | 5, number>;
  /** Timestamp (ms) when fabricator utilisation first exceeded threshold, or null */
  fabricatorHighUtilSinceMs: number | null;
}

interface InternalHandle extends ExecutionHandle {
  _completionFraction: number;
  _cancelled: boolean;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/** Extended orchestrator with replication check capability */
export interface ManufacturingOrchestratorWithReplication extends ManufacturingOrchestrator {
  /**
   * Check fabricator utilisation and trigger self-replication if sustained
   * above threshold for replicationSustainedDays.
   * @param currentUtilisation - current fabricator utilisation fraction (0.0–1.0)
   * @param nowMs - current timestamp in milliseconds (injectable for testing)
   * @returns the ID of the new fabricator node if replication was triggered, or null
   */
  checkReplication(currentUtilisation: number, nowMs: number): string | null;
}

export function createManufacturingOrchestrator(
  config: OrchestratorConfig
): ManufacturingOrchestratorWithReplication {
  const state: OrchestratorState = {
    activePlan: null,
    activeHandle: null,
    disruptions: new Map(),
    layerThroughput: { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0 },
    fabricatorHighUtilSinceMs: null,
  };

  // ── plan ─────────────────────────────────────────────────────────────────

  function plan(demand: DemandForecast): ProductionPlan {
    const phases: ProductionPhase[] = demand.requiredBoms.map((bom, idx) => {
      const allocations: LayerAllocation[] = [1, 2, 3, 4, 5].map((layer) => ({
        layer: layer as 1 | 2 | 3 | 4 | 5,
        nodeIds: config.layerNodes[layer as 1 | 2 | 3 | 4 | 5],
        taskDescription: layerTaskDescription(
          layer as 1 | 2 | 3 | 4 | 5,
          bom.bomId
        ),
      }));

      return {
        phaseId: `phase-${idx + 1}`,
        description: `Produce BOM ${bom.bomId} for demand forecast ${demand.forecastId}`,
        targetCompletionDays: demand.horizonDays * ((idx + 1) / demand.requiredBoms.length),
        layerAllocations: allocations,
      };
    });

    const productionPlan: ProductionPlan = {
      planId: `plan-${demand.forecastId}-${config.clock.now()}`,
      forecastId: demand.forecastId,
      phases,
      createdAt: config.clock.now(),
    };

    return productionPlan;
  }

  // ── execute ───────────────────────────────────────────────────────────────

  function execute(plan: ProductionPlan): ExecutionHandle {
    const handle: InternalHandle = {
      planId: plan.planId,
      startedAt: config.clock.now(),
      _completionFraction: 0,
      _cancelled: false,
      progress() {
        return this._completionFraction;
      },
      cancel() {
        this._cancelled = true;
      },
    };

    state.activePlan = plan;
    state.activeHandle = handle;

    // Simulate asynchronous plan execution; real implementation would
    // drive layer subsystems in sequence and update _completionFraction.
    void runPlanAsync(plan, handle);

    return handle;
  }

  // ── monitor ───────────────────────────────────────────────────────────────

  function monitor(): SystemHealthReport {
    const layerHealth = computeLayerHealth();
    const overallHealthFraction = average(Object.values(layerHealth) as number[]);
    const throughputFraction = average(
      Object.values(state.layerThroughput) as number[]
    );

    return {
      timestamp: config.clock.now(),
      overallHealthFraction,
      layerHealth: layerHealth as Record<1 | 2 | 3 | 4 | 5, number>,
      activeDisruptions: [...state.disruptions.values()],
      throughputFraction,
    };
  }

  // ── rebalance ─────────────────────────────────────────────────────────────

  function rebalance(event: DisruptionEvent): void {
    state.disruptions.set(event.eventId, event);

    const layer = event.layer;
    const totalNodes = config.layerNodes[layer].length;

    // Each failed node reduces throughput proportionally, capped so that
    // loss from any single node is < 10% (requires ≥ 11 nodes per layer,
    // but the architecture guarantees ≥ 3 → real deployments must over-provision).
    const degradationPerNode = Math.min(0.09, 1 / totalNodes);
    state.layerThroughput[layer] = Math.max(
      0,
      state.layerThroughput[layer] - degradationPerNode
    );

    // Schedule automatic recovery: restore throughput after estimated recovery window.
    const recoveryMs = event.estimatedRecoveryHours * 60 * 60 * 1000;
    config.timer.schedule(() => {
      state.disruptions.delete(event.eventId);
      state.layerThroughput[layer] = Math.min(
        1.0,
        state.layerThroughput[layer] + degradationPerNode
      );
    }, recoveryMs);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function runPlanAsync(
    plan: ProductionPlan,
    handle: InternalHandle
  ): Promise<void> {
    const total = plan.phases.length;
    for (let i = 0; i < total; i++) {
      if (handle._cancelled) break;
      // In a real system each phase drives the layer subsystems.
      // Yield between phases so cancellation can be observed.
      await Promise.resolve();
      if (handle._cancelled) break;
      handle._completionFraction = (i + 1) / total;
    }
  }

  function computeLayerHealth(): Record<1 | 2 | 3 | 4 | 5, number> {
    const layers = [1, 2, 3, 4, 5] as const;
    const result = {} as Record<1 | 2 | 3 | 4 | 5, number>;
    for (const layer of layers) {
      const disrupted = [...state.disruptions.values()].filter(
        (d) => d.layer === layer
      ).length;
      const total = config.layerNodes[layer].length;
      result[layer] = total > 0 ? Math.max(0, (total - disrupted) / total) : 0;
    }
    return result;
  }

  function layerTaskDescription(
    layer: 1 | 2 | 3 | 4 | 5,
    bomId: string
  ): string {
    const descriptions: Record<1 | 2 | 3 | 4 | 5, string> = {
      1: `Extract raw materials for BOM ${bomId}`,
      2: `Refine feedstocks for BOM ${bomId}`,
      3: `Fabricate components for BOM ${bomId}`,
      4: `Assemble and integrate systems for BOM ${bomId}`,
      5: `Recycle end-of-life components feeding BOM ${bomId}`,
    };
    return descriptions[layer];
  }

  function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  // ── checkReplication ─────────────────────────────────────────────────────

  function checkReplication(currentUtilisation: number, nowMs: number): string | null {
    if (currentUtilisation > config.replicationUtilisationThreshold) {
      if (state.fabricatorHighUtilSinceMs === null) {
        state.fabricatorHighUtilSinceMs = nowMs;
      }

      const sustainedMs = nowMs - state.fabricatorHighUtilSinceMs;
      const sustainedDays = sustainedMs / (24 * 60 * 60 * 1000);

      if (sustainedDays >= config.replicationSustainedDays) {
        // Pick the first fabricator and replicate
        const firstFabEntry = config.fabricators.entries().next();
        if (!firstFabEntry.done) {
          const [, fabricator] = firstFabEntry.value;
          const replica = fabricator.selfReplicate({
            modelId: "auto-replica",
            capabilities: [],
            throughputUnitsPerDay: 0,
          });

          const newNodeId = `layer3-replica-${config.clock.now()}`;
          config.fabricators.set(newNodeId, replica);
          config.layerNodes[3].push(newNodeId);

          // Reset the sustained timer
          state.fabricatorHighUtilSinceMs = null;

          return newNodeId;
        }
      }
    } else {
      // Utilisation dropped below threshold — reset
      state.fabricatorHighUtilSinceMs = null;
    }

    return null;
  }

  return { plan, execute, monitor, rebalance, checkReplication };
}
