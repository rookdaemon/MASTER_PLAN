/**
 * Tier C Self-Repair Flow — Behavioral Spec 1 implementation
 *
 * State machine for TMR module self-repair on Tier C deep-space nodes.
 *
 * Given a Tier C node with TMR compute modules and nanofabrication cell
 * When the radiation subsystem detects SEU rate increase indicating TID
 *   degradation beyond correction threshold
 * Then: degraded module scheduled → nanofab produces replacement →
 *   robotic arm hot-swaps (≤ 4 h) while 2-of-3 TMR maintains consciousness →
 *   BIST verifies → voter re-syncs → module re-enters TMR pool.
 *   Consciousness continuity is maintained throughout.
 */

import { TMR_MIN_OPERATING_MODULES } from "./constants.js";
import type { SelfRepairFlowState, TMRModuleStatus } from "./types.js";

/**
 * SEU rate threshold above which a module is considered degraded
 * by TID accumulation and must be replaced.
 * From radiation-hardening-spec.md: baseline SEU rate ~1e-14 upsets/bit/s;
 * threshold for scheduling replacement is 1e-6 (orders of magnitude above normal).
 */
const SEU_RATE_DEGRADATION_THRESHOLD = 1e-6;

/**
 * Identifies modules with elevated SEU rate indicating TID degradation
 * beyond correction threshold.
 */
function findDegradedModules(
  modules: readonly TMRModuleStatus[],
): readonly TMRModuleStatus[] {
  return modules.filter((m) => m.seuRate >= SEU_RATE_DEGRADATION_THRESHOLD);
}

/**
 * Advances the Tier C self-repair flow state machine by one step.
 *
 * Each call transitions the state to the next phase. The flow is:
 *   MONITORING → DEGRADATION_DETECTED → REPLACEMENT_SCHEDULED →
 *   NANOFAB_IN_PROGRESS → HOT_SWAP_IN_PROGRESS → BIST_RUNNING →
 *   VOTER_RESYNC → COMPLETE
 *
 * @param state  Current self-repair flow state
 * @param timestampMs  Current timestamp (injected for testability per CLAUDE.md)
 * @returns Next state — consciousness continuity is always maintained
 */
export function advanceSelfRepairFlow(
  state: SelfRepairFlowState,
  timestampMs: number,
): SelfRepairFlowState {
  switch (state.phase) {
    case "MONITORING": {
      // Check if any module has elevated SEU rate indicating TID degradation
      const degraded = findDegradedModules(state.modules);
      if (degraded.length > 0) {
        return {
          ...state,
          phase: "DEGRADATION_DETECTED",
          consciousnessContinuity: true,
        };
      }
      // No degradation — stay in MONITORING
      return state;
    }

    case "DEGRADATION_DETECTED": {
      // Schedule the degraded module(s) for replacement
      return {
        ...state,
        phase: "REPLACEMENT_SCHEDULED",
        consciousnessContinuity: true,
      };
    }

    case "REPLACEMENT_SCHEDULED": {
      // Begin nanofab production of replacement die from asteroid-sourced silicon.
      // Mark degraded modules as under replacement.
      const modules = state.modules.map((m) =>
        m.seuRate >= SEU_RATE_DEGRADATION_THRESHOLD
          ? { ...m, underReplacement: true }
          : m,
      );
      return {
        ...state,
        modules,
        phase: "NANOFAB_IN_PROGRESS",
        consciousnessContinuity: true,
      };
    }

    case "NANOFAB_IN_PROGRESS": {
      // Nanofab complete — begin hot-swap. Remove degraded module from voter pool.
      // Remaining 2-of-3 TMR modules maintain consciousness.
      const modules = state.modules.map((m) =>
        m.underReplacement ? { ...m, inVoterPool: false } : m,
      );

      // Guard: at least TMR_MIN_OPERATING_MODULES must remain in voter pool
      const activeCount = modules.filter((m) => m.inVoterPool).length;
      if (activeCount < TMR_MIN_OPERATING_MODULES) {
        // Cannot proceed safely — maintain current state
        return { ...state, consciousnessContinuity: true };
      }

      return {
        ...state,
        modules,
        phase: "HOT_SWAP_IN_PROGRESS",
        consciousnessContinuity: true,
      };
    }

    case "HOT_SWAP_IN_PROGRESS": {
      // Hot-swap complete (≤ 4 h). New module installed, proceed to BIST.
      // Reset SEU rate on replaced module (fresh die).
      const modules = state.modules.map((m) =>
        m.underReplacement ? { ...m, seuRate: 0, cumulativeTIDKrad: 0 } : m,
      );
      return {
        ...state,
        modules,
        phase: "BIST_RUNNING",
        consciousnessContinuity: true,
      };
    }

    case "BIST_RUNNING": {
      // Built-in self-test verifies the new module.
      // If BIST passed, proceed to voter resync.
      const replacedModule = state.modules.find((m) => m.underReplacement);
      if (replacedModule && replacedModule.bistPassed) {
        return {
          ...state,
          phase: "VOTER_RESYNC",
          consciousnessContinuity: true,
        };
      }
      // BIST not yet passed — stay in BIST_RUNNING
      return { ...state, consciousnessContinuity: true };
    }

    case "VOTER_RESYNC": {
      // Voter re-syncs — module re-enters TMR pool.
      // All modules restored to healthy state.
      const modules = state.modules.map((m) =>
        m.underReplacement
          ? {
              ...m,
              inVoterPool: true,
              underReplacement: false,
              seuRate: 0,
              cumulativeTIDKrad: 0,
              bistPassed: true,
            }
          : m,
      );
      return {
        modules,
        phase: "COMPLETE",
        consciousnessContinuity: true,
      };
    }

    case "COMPLETE": {
      // Terminal state — no further transitions
      return state;
    }
  }
}
