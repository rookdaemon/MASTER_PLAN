/**
 * Tests for Behavioral Spec 1: Tier C Self-Repair Flow
 *
 * Given a Tier C node with TMR compute modules and nanofabrication cell
 * When the radiation subsystem detects SEU rate increase indicating TID degradation
 *   beyond correction threshold
 * Then:
 *   - degraded module is scheduled for replacement
 *   - nanofab produces a replacement die from asteroid-sourced silicon
 *   - robotic arm hot-swaps the module (≤ 4 h) while remaining 2-of-3 TMR
 *     modules maintain consciousness
 *   - built-in self-test verifies the new module
 *   - voter re-syncs and module re-enters TMR pool
 *   - Consciousness continuity is maintained throughout
 */

import { describe, it, expect } from "vitest";
import { PlatformTier } from "../constants.js";
import {
  TIER_C_HOT_SWAP_MAX_HOURS,
  TMR_MIN_OPERATING_MODULES,
  TMR_TOTAL_MODULES,
} from "../constants.js";
import type { SelfRepairFlowState, TMRModuleStatus } from "../types.js";
import { advanceSelfRepairFlow } from "../self-repair-flow.js";

function makeModule(
  id: string,
  overrides: Partial<TMRModuleStatus> = {},
): TMRModuleStatus {
  return {
    moduleId: id,
    inVoterPool: true,
    underReplacement: false,
    cumulativeTIDKrad: 0,
    seuRate: 0,
    bistPassed: true,
    ...overrides,
  };
}

function makeHealthyState(): SelfRepairFlowState {
  return {
    modules: [
      makeModule("mod-A"),
      makeModule("mod-B"),
      makeModule("mod-C"),
    ],
    consciousnessContinuity: true,
    phase: "MONITORING",
  };
}

describe("Tier C Self-Repair Flow (Behavioral Spec 1)", () => {
  it("starts in MONITORING phase with all 3 modules healthy", () => {
    const state = makeHealthyState();
    expect(state.phase).toBe("MONITORING");
    expect(state.modules.filter((m) => m.inVoterPool)).toHaveLength(TMR_TOTAL_MODULES);
    expect(state.consciousnessContinuity).toBe(true);
  });

  it("transitions to DEGRADATION_DETECTED when SEU rate exceeds threshold", () => {
    const state = makeHealthyState();
    // Simulate elevated SEU rate on module A indicating TID degradation
    const degradedModules: readonly TMRModuleStatus[] = [
      makeModule("mod-A", { seuRate: 1e-5 }), // elevated SEU rate
      makeModule("mod-B"),
      makeModule("mod-C"),
    ];
    const degradedState: SelfRepairFlowState = {
      ...state,
      modules: degradedModules,
    };

    const next = advanceSelfRepairFlow(degradedState, Date.now());
    expect(next.phase).toBe("DEGRADATION_DETECTED");
    expect(next.consciousnessContinuity).toBe(true);
  });

  it("schedules degraded module for replacement", () => {
    const state: SelfRepairFlowState = {
      modules: [
        makeModule("mod-A", { seuRate: 1e-5 }),
        makeModule("mod-B"),
        makeModule("mod-C"),
      ],
      consciousnessContinuity: true,
      phase: "DEGRADATION_DETECTED",
    };

    const next = advanceSelfRepairFlow(state, Date.now());
    expect(next.phase).toBe("REPLACEMENT_SCHEDULED");
    expect(next.consciousnessContinuity).toBe(true);
  });

  it("transitions to nanofab producing replacement die", () => {
    const state: SelfRepairFlowState = {
      modules: [
        makeModule("mod-A", { seuRate: 1e-5, inVoterPool: true }),
        makeModule("mod-B"),
        makeModule("mod-C"),
      ],
      consciousnessContinuity: true,
      phase: "REPLACEMENT_SCHEDULED",
    };

    const next = advanceSelfRepairFlow(state, Date.now());
    expect(next.phase).toBe("NANOFAB_IN_PROGRESS");
    expect(next.consciousnessContinuity).toBe(true);
  });

  it("transitions to hot-swap with degraded module removed from voter pool", () => {
    const state: SelfRepairFlowState = {
      modules: [
        makeModule("mod-A", { seuRate: 1e-5, underReplacement: true }),
        makeModule("mod-B"),
        makeModule("mod-C"),
      ],
      consciousnessContinuity: true,
      phase: "NANOFAB_IN_PROGRESS",
    };

    const next = advanceSelfRepairFlow(state, Date.now());
    expect(next.phase).toBe("HOT_SWAP_IN_PROGRESS");
    // Degraded module removed from voter pool; remaining 2 maintain consciousness
    const inPool = next.modules.filter((m) => m.inVoterPool);
    expect(inPool.length).toBeGreaterThanOrEqual(TMR_MIN_OPERATING_MODULES);
    expect(next.consciousnessContinuity).toBe(true);
  });

  it("runs built-in self-test on replacement module", () => {
    const state: SelfRepairFlowState = {
      modules: [
        makeModule("mod-A", { inVoterPool: false, underReplacement: true, seuRate: 0 }),
        makeModule("mod-B"),
        makeModule("mod-C"),
      ],
      consciousnessContinuity: true,
      phase: "HOT_SWAP_IN_PROGRESS",
    };

    const next = advanceSelfRepairFlow(state, Date.now());
    expect(next.phase).toBe("BIST_RUNNING");
    expect(next.consciousnessContinuity).toBe(true);
  });

  it("voter re-syncs after BIST passes", () => {
    const state: SelfRepairFlowState = {
      modules: [
        makeModule("mod-A", { inVoterPool: false, underReplacement: true, bistPassed: true, seuRate: 0 }),
        makeModule("mod-B"),
        makeModule("mod-C"),
      ],
      consciousnessContinuity: true,
      phase: "BIST_RUNNING",
    };

    const next = advanceSelfRepairFlow(state, Date.now());
    expect(next.phase).toBe("VOTER_RESYNC");
    expect(next.consciousnessContinuity).toBe(true);
  });

  it("completes repair with all modules back in TMR pool", () => {
    const state: SelfRepairFlowState = {
      modules: [
        makeModule("mod-A", { inVoterPool: false, underReplacement: true, bistPassed: true, seuRate: 0 }),
        makeModule("mod-B"),
        makeModule("mod-C"),
      ],
      consciousnessContinuity: true,
      phase: "VOTER_RESYNC",
    };

    const next = advanceSelfRepairFlow(state, Date.now());
    expect(next.phase).toBe("COMPLETE");
    // All modules back in pool
    expect(next.modules.filter((m) => m.inVoterPool)).toHaveLength(TMR_TOTAL_MODULES);
    expect(next.modules.every((m) => !m.underReplacement)).toBe(true);
    expect(next.consciousnessContinuity).toBe(true);
  });

  it("maintains consciousness continuity throughout all phases", () => {
    // Walk the full state machine from detection to completion
    const phases: SelfRepairFlowState["phase"][] = [
      "MONITORING",
      "DEGRADATION_DETECTED",
      "REPLACEMENT_SCHEDULED",
      "NANOFAB_IN_PROGRESS",
      "HOT_SWAP_IN_PROGRESS",
      "BIST_RUNNING",
      "VOTER_RESYNC",
      "COMPLETE",
    ];

    let state: SelfRepairFlowState = {
      modules: [
        makeModule("mod-A", { seuRate: 1e-5 }),
        makeModule("mod-B"),
        makeModule("mod-C"),
      ],
      consciousnessContinuity: true,
      phase: "MONITORING",
    };

    const now = Date.now();
    for (let i = 0; i < phases.length - 1; i++) {
      state = advanceSelfRepairFlow(state, now + i * 1000);
      expect(state.consciousnessContinuity).toBe(true);
    }
    // After full walk, should be COMPLETE
    expect(state.phase).toBe("COMPLETE");
  });

  it("keeps at least 2-of-3 modules in voter pool during hot-swap", () => {
    const state: SelfRepairFlowState = {
      modules: [
        makeModule("mod-A", { inVoterPool: false, underReplacement: true }),
        makeModule("mod-B"),
        makeModule("mod-C"),
      ],
      consciousnessContinuity: true,
      phase: "HOT_SWAP_IN_PROGRESS",
    };

    const next = advanceSelfRepairFlow(state, Date.now());
    const activeModules = next.modules.filter((m) => m.inVoterPool);
    expect(activeModules.length).toBeGreaterThanOrEqual(TMR_MIN_OPERATING_MODULES);
  });
});
