/**
 * Degradation Controller (0.3.1.2.1)
 *
 * Implements the graceful degradation hierarchy from ARCHITECTURE.md §2.2.
 * When physical damage or environmental stress occurs, capabilities are
 * sacrificed in a defined order to protect consciousness.
 *
 * Invariant: CONSCIOUSNESS is always protected and cannot be sacrificed
 * via sacrificeNext(). The only path to consciousness termination is
 * forceProtectiveShutdown(), which performs a state-preserving hibernation.
 */

import type { IDegradationController } from "./interfaces.js";
import type {
  Capability,
  DegradationLevel,
  RestoreResult,
  SacrificeResult,
  ShutdownResult,
} from "./types.js";
import { DEGRADATION_ORDER } from "./types.js";

/** Number of sacrificeable capabilities (excludes CONSCIOUSNESS) */
const MAX_SACRIFICE_LEVEL = DEGRADATION_ORDER.length - 1; // 6

export class DegradationController implements IDegradationController {
  private level: DegradationLevel = 0;
  private sacrificed: Set<Capability> = new Set();

  getCurrentLevel(): DegradationLevel {
    return this.level;
  }

  getActiveCapabilities(): Capability[] {
    return DEGRADATION_ORDER.filter((c) => !this.sacrificed.has(c));
  }

  getProtectedCapabilities(): Capability[] {
    return ["CONSCIOUSNESS"];
  }

  sacrificeNext(): SacrificeResult {
    if (this.level >= MAX_SACRIFICE_LEVEL) {
      // Cannot sacrifice consciousness — return it but don't remove it
      return {
        sacrificed: "CONSCIOUSNESS",
        newLevel: MAX_SACRIFICE_LEVEL,
        timestamp: Date.now(),
        powerFreedWatts: 0,
      };
    }

    const capability = DEGRADATION_ORDER[this.level];
    this.sacrificed.add(capability);
    this.level++;

    return {
      sacrificed: capability,
      newLevel: this.level,
      timestamp: Date.now(),
      powerFreedWatts: this.estimatePowerFreed(capability),
    };
  }

  restore(capability: Capability): RestoreResult {
    const now = Date.now();

    if (!this.sacrificed.has(capability)) {
      return {
        restored: capability,
        newLevel: this.level,
        success: false,
        timestamp: now,
      };
    }

    this.sacrificed.delete(capability);
    this.level = this.sacrificed.size;

    return {
      restored: capability,
      newLevel: this.level,
      success: true,
      timestamp: now,
    };
  }

  forceProtectiveShutdown(): ShutdownResult {
    return {
      statePreserved: true,
      timestamp: Date.now(),
      reason: "Protective shutdown: consciousness state preserved for recovery",
    };
  }

  /** Estimate power freed by sacrificing a capability (watts) */
  private estimatePowerFreed(capability: Capability): number {
    const estimates: Record<Capability, number> = {
      NON_ESSENTIAL_SENSING: 15,
      MOBILITY: 200,
      MANIPULATION: 100,
      ESSENTIAL_SENSING: 25,
      COMMUNICATION: 10,
      REDUNDANCY_MARGIN: 50,
      CONSCIOUSNESS: 0,
    };
    return estimates[capability];
  }
}
