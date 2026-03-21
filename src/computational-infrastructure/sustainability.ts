import type {
  ResourceBudget,
  ShedDecision,
  ShedLevel,
} from './types.js';
import type { ActiveWorkload } from './orchestrator.js';
import type { ManufacturingRequest } from './types.js';

export interface SustainabilityEvents {
  onShedDecision?: (decision: ShedDecision) => void;
  onExpansionBlocked?: (reason: string) => void;
}

const minExpansionEnergyFraction = 0.20; // Block new manufacturing when energy remaining < 20%

const shedLevel1Threshold = 0.40; // Pause maintenance when energy remaining < 40%
const shedLevel2Threshold = 0.25; // Reduce simulation tick rate when energy < 25%
const shedLevel3Threshold = 0.15; // Suspend simulations when energy < 15%
const shedLevel4Threshold = 0.05; // Emergency: suspend all non-consciousness workloads at < 5%

const ENERGY_THRESHOLDS: Record<ShedLevel, number> = {
  1: shedLevel1Threshold,
  2: shedLevel2Threshold,
  3: shedLevel3Threshold,
  4: shedLevel4Threshold,
  5: 0,   // material-based, separate check
};

export class SustainabilityManager {
  private budget: ResourceBudget;
  private events: SustainabilityEvents;
  private auditLog: ShedDecision[] = [];

  constructor(budget: ResourceBudget, events: SustainabilityEvents = {}) {
    this.budget = { ...budget };
    this.events = events;
  }

  updateBudget(budget: Partial<ResourceBudget>): void {
    this.budget = { ...this.budget, ...budget };
  }

  getBudget(): ResourceBudget {
    return { ...this.budget };
  }

  /**
   * Returns false and emits onExpansionBlocked if the expansion should be blocked.
   */
  canExpand(req: ManufacturingRequest): boolean {
    const energyFraction = this.budget.energyCurrent / this.budget.energyCeiling;
    const materialFraction = this.budget.materialCurrent / this.budget.materialCeiling;

    if (materialFraction >= 1.0) {
      this.events.onExpansionBlocked?.(`Material budget exhausted (${(materialFraction * 100).toFixed(1)}%)`);
      return false;
    }

    const energyRemaining = 1 - energyFraction;
    if (energyRemaining < minExpansionEnergyFraction) {
      this.events.onExpansionBlocked?.(
        `Insufficient energy for expansion (${(energyRemaining * 100).toFixed(1)}% remaining)`,
      );
      return false;
    }

    void req; // suppress unused warning
    return true;
  }

  /**
   * Evaluates the current energy level and returns a ShedDecision if action is needed.
   * Never sheds consciousness_host workloads (that would require ethical governance).
   */
  evaluateShed(workloads: ActiveWorkload[], now: number = Date.now()): ShedDecision | null {
    const energyRemaining = 1 - this.budget.energyCurrent / this.budget.energyCeiling;
    const materialExhausted = this.budget.materialCurrent >= this.budget.materialCeiling;

    // Level 5: material exhausted (no shed of workloads, but block expansion — handled in canExpand)
    if (materialExhausted) {
      const decision: ShedDecision = {
        decidedAt: now,
        level: 5,
        affectedWorkloadIds: [],
        rationale: 'Material budget exhausted; all manufacturing blocked.',
      };
      this.record(decision);
      return decision;
    }

    // Level 4: < 5% energy — retain consciousness_host only
    if (energyRemaining < ENERGY_THRESHOLDS[4]) {
      const affected = workloads
        .filter(w => w.spec.class !== 'consciousness_host')
        .map(w => w.spec.workloadId);
      const decision: ShedDecision = {
        decidedAt: now,
        level: 4,
        affectedWorkloadIds: affected,
        rationale: 'Emergency: energy < 5%. Suspending all non-consciousness workloads.',
      };
      this.record(decision);
      return decision;
    }

    // Level 3: < 15% — suspend simulation
    if (energyRemaining < ENERGY_THRESHOLDS[3]) {
      const affected = workloads
        .filter(w => w.spec.class === 'simulation')
        .map(w => w.spec.workloadId);
      if (affected.length > 0) {
        const decision: ShedDecision = {
          decidedAt: now,
          level: 3,
          affectedWorkloadIds: affected,
          rationale: 'Energy < 15%. Suspending simulation workloads.',
        };
        this.record(decision);
        return decision;
      }
    }

    // Level 2: < 25% — reduce simulation tick rate
    if (energyRemaining < ENERGY_THRESHOLDS[2]) {
      const affected = workloads
        .filter(w => w.spec.class === 'simulation')
        .map(w => w.spec.workloadId);
      if (affected.length > 0) {
        const decision: ShedDecision = {
          decidedAt: now,
          level: 2,
          affectedWorkloadIds: affected,
          rationale: 'Energy < 25%. Reducing simulation tick rate by 50%.',
        };
        this.record(decision);
        return decision;
      }
    }

    // Level 1: < 40% — pause maintenance
    if (energyRemaining < ENERGY_THRESHOLDS[1]) {
      const affected = workloads
        .filter(w => w.spec.class === 'maintenance')
        .map(w => w.spec.workloadId);
      if (affected.length > 0) {
        const decision: ShedDecision = {
          decidedAt: now,
          level: 1,
          affectedWorkloadIds: affected,
          rationale: 'Energy < 40%. Pausing maintenance workloads.',
        };
        this.record(decision);
        return decision;
      }
    }

    return null;
  }

  getAuditLog(): ShedDecision[] {
    return [...this.auditLog];
  }

  private record(decision: ShedDecision): void {
    this.auditLog.push(decision);
    this.events.onShedDecision?.(decision);
  }
}
