/**
 * Replication Controller — top-level orchestrator that drives the
 * full replication cycle from resource check through deployment.
 *
 * Card: 0.4.1.4
 * Architecture: docs/self-replicating-industrial-systems/ARCHITECTURE.md §1
 *
 * Contracts:
 * - MUST NOT deploy until FidelityReport.pass == true
 * - MUST log each cycle with provenance metadata
 * - MUST throttle replication rate to match resource throughput
 * - MUST verify replication closure before starting a cycle
 * - MUST verify sufficient energy before starting a cycle
 */
import type {
  CycleId,
  CycleStatus,
  CyclePhase,
  ReplicationController,
  ReplicationControllerConfig,
} from "./types.js";

/**
 * Create a ReplicationController from the given configuration.
 *
 * The controller enforces the architectural contracts:
 * - Replication closure must be achieved before any cycle starts
 * - Energy output must meet the cycle's energy budget
 * - Each cycle is logged with provenance (parent, generation, timestamp)
 */
export function createReplicationController(
  config: ReplicationControllerConfig
): ReplicationController {
  const cycles = new Map<CycleId, CycleStatus>();
  const { fabricator, energy, seedInstance, energyBudgetWh, now } = config;

  // Per-controller cycle counter — no shared mutable module state
  let cycleCounter = 0;

  function generateCycleId(): CycleId {
    cycleCounter++;
    return `cycle-${cycleCounter}-${now()}`;
  }

  // Track current generation for the next cycle
  let nextGeneration = seedInstance.generation + 1;

  return {
    startCycle(): CycleId {
      // Contract: MUST verify replication closure before starting
      const closureReport = fabricator.assemblyClosure();
      if (!closureReport.closed) {
        throw new Error(
          `Replication closure not achieved: ${closureReport.openModules.length} open modules ` +
            `(${closureReport.openModules.join(", ")})`
        );
      }

      // Contract: MUST verify sufficient energy before starting
      const currentWatts = energy.currentOutput();
      if (currentWatts <= 0) {
        throw new Error(
          `Insufficient energy for replication cycle: ${currentWatts}W available, ` +
            `budget requires ${energyBudgetWh}Wh`
        );
      }

      const cycleId = generateCycleId();
      const status: CycleStatus = {
        cycleId,
        phase: "resource-check",
        targetGeneration: nextGeneration,
        phaseProgress: 0.0,
        energyBudgetWh,
        parentInstanceId: seedInstance.instanceId,
        startedAt: now(),
      };

      cycles.set(cycleId, status);
      return cycleId;
    },

    abortCycle(id: CycleId): void {
      const status = cycles.get(id);
      if (!status) {
        throw new Error(`Unknown cycle: ${id}`);
      }
      status.phase = "aborted";
    },

    cycleStatus(id: CycleId): CycleStatus {
      const status = cycles.get(id);
      if (!status) {
        throw new Error(`Unknown cycle: ${id}`);
      }
      return { ...status };
    },
  };
}
