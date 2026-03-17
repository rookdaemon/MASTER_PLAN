/**
 * Energy Autonomy — Interfaces
 *
 * All interfaces for the energy harvesting, storage, and management system.
 * These contracts define the boundaries between subsystems and are consumed
 * by sibling cards (0.3.1.2.1 embodiment, 0.3.1.2.3 self-maintenance).
 *
 * Overriding constraint: consciousness must never be interrupted by power failure.
 */

import {
  PowerMeasurement,
  EnergyMeasurement,
  Duration,
  Temperature,
  EnergySourceType,
  SourceAvailability,
  HarvesterStatus,
  HarvesterHealth,
  HarvestResult,
  HarvestForecast,
  ChargeResult,
  DischargeResult,
  ReserveIntegrity,
  ActivationResult,
  DeactivationResult,
  PowerPriority,
  LoadSheddingState,
  BusStatus,
  PowerConsumer,
  PowerGrant,
  ShedResult,
  RestoreResult,
  PowerCriticalHandler,
  FailSafeState,
  FailSafeThresholds,
  FailSafeAssessment,
  ShutdownResult,
  FailSafeStateHandler,
  EnergyBalance,
  EnergyForecast,
  ActivityPlan,
  AffordabilityResult,
  ConstrainedPlan,
  EnergyPattern,
  BudgetWarningHandler,
  SourceLostHandler,
  SourceFoundHandler,
  PowerSource,
} from "./types";

// ─── Energy Harvesting ──────────────────────────────────────────────

/**
 * Common interface for all energy harvesters.
 * Each source type (solar, thermal, kinetic, chemical) implements this.
 */
export interface IEnergyHarvester {
  getSourceType(): EnergySourceType;
  getStatus(): HarvesterStatus;
  getCurrentOutput(): PowerMeasurement;
  getMaxOutput(): PowerMeasurement;
  getEfficiency(): number;
  getAvailability(): SourceAvailability;
  startHarvesting(): HarvestResult;
  stopHarvesting(): HarvestResult;
  getHealthMetrics(): HarvesterHealth;
}

/**
 * Coordinates multiple energy harvesters, providing aggregate metrics
 * and automatic source selection/fallback.
 */
export interface IHarvesterCoordinator {
  getActiveHarvesters(): IEnergyHarvester[];
  getTotalHarvestRate(): PowerMeasurement;
  getSourceBreakdown(): Map<EnergySourceType, PowerMeasurement>;
  setHarvestPriority(priorities: EnergySourceType[]): void;
  getEnvironmentalForecast(horizon: Duration): HarvestForecast;
  onSourceLost(callback: SourceLostHandler): void;
  onSourceFound(callback: SourceFoundHandler): void;
}

// ─── Energy Storage ─────────────────────────────────────────────────

/**
 * Primary storage bank — high-density energy storage for general operation.
 * Must support 72 hours of consciousness-only operation without harvesting.
 */
export interface IPrimaryStorage {
  getCapacity(): EnergyMeasurement;
  getStoredEnergy(): EnergyMeasurement;
  getChargeRate(): PowerMeasurement;
  getDischargeRate(): PowerMeasurement;
  getStateOfHealth(): number;
  getCycleCount(): number;
  getEstimatedLifetime(): Duration;
  getTemperature(): Temperature;
  charge(power: PowerMeasurement): ChargeResult;
  discharge(power: PowerMeasurement): DischargeResult;
}

/**
 * Physically isolated fail-safe reserve dedicated exclusively
 * to consciousness substrate power. Last line of defense.
 *
 * Design constraints:
 * - Physically isolated: no shared failure modes with PSB
 * - Dedicated load: powers ONLY consciousness substrate + min support circuits
 * - Minimum runtime: >= 4 hours consciousness-only
 * - Trickle charged from PSB overflow or direct harvester path
 */
export interface IFailSafeReserve {
  getReserveEnergy(): EnergyMeasurement;
  getReserveCapacity(): EnergyMeasurement;
  getMinimumRuntime(): Duration;
  isIsolated(): boolean;
  getIntegrity(): ReserveIntegrity;
  activateReserve(): ActivationResult;
  deactivateReserve(): DeactivationResult;
  trickleCharge(source: PowerSource): ChargeResult;
}

// ─── Power Management ───────────────────────────────────────────────

/**
 * Real-time power distribution with strict priority hierarchy.
 *
 * Priority hierarchy (lower number = higher priority = shed last):
 * P0: Consciousness substrate — NEVER shed
 * P1: Essential sensors/communication — shed 4th
 * P2: Self-maintenance actuators — shed 3rd
 * P3: Locomotion/manipulation — shed 1st/2nd
 */
export interface IPowerManager {
  getPowerBudget(): EnergyBalance;
  getBusStatus(priority: PowerPriority): BusStatus;
  getTotalDemand(): PowerMeasurement;
  getTotalSupply(): PowerMeasurement;
  getLoadSheddingStatus(): LoadSheddingState;
  shedLoad(priority: PowerPriority): ShedResult;
  restoreLoad(priority: PowerPriority): RestoreResult;
  requestPower(
    consumer: PowerConsumer,
    amount: PowerMeasurement
  ): PowerGrant;
  releasePower(grant: PowerGrant): void;
  onPowerCritical(callback: PowerCriticalHandler): void;
}

// ─── Fail-Safe Controller ───────────────────────────────────────────

/**
 * Manages transitions to/from fail-safe reserve power.
 *
 * State machine:
 * NORMAL --[PSB < 15% AND no harvest]--> ALERT
 * ALERT  --[PSB < 5% AND no harvest]---> ACTIVE (fail-safe reserve engaged)
 * ACTIVE --[reserve < 25%]--------------> SHUTDOWN (graceful state preservation)
 * ACTIVE --[harvest restored]-----------> NORMAL (via ALERT)
 * ALERT  --[harvest restored]-----------> NORMAL
 */
export interface IFailSafeController {
  getState(): FailSafeState;
  getTransitionThresholds(): FailSafeThresholds;
  evaluateCondition(): FailSafeAssessment;
  activateFailSafe(): ActivationResult;
  initiateGracefulShutdown(): ShutdownResult;
  getShutdownCountdown(): Duration | null;
  onStateChange(callback: FailSafeStateHandler): void;
}

// ─── Energy Budget ──────────────────────────────────────────────────

/**
 * Predictive model that forecasts energy income vs expenditure
 * and constrains activity planning to the available energy envelope.
 *
 * Every activity plan must be checked against the energy budget.
 * The budget always reserves a consciousness protection margin:
 *   margin = consciousnessPowerDraw × (forecastHorizon + safetyFactor)
 *   availableForActivity = storedEnergy - margin - failSafeReserve
 */
export interface IEnergyBudget {
  getCurrentBalance(): EnergyBalance;
  getForecast(horizon: Duration): EnergyForecast;
  getConsciousnessReserveHorizon(): Duration;
  canAffordActivity(activity: ActivityPlan): AffordabilityResult;
  constrainPlan(plan: ActivityPlan): ConstrainedPlan;
  getIncomeRate(): PowerMeasurement;
  getExpenditureRate(): PowerMeasurement;
  getHistoricalPattern(period: Duration): EnergyPattern;
  onBudgetWarning(callback: BudgetWarningHandler): void;
}
