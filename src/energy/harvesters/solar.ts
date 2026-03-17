/**
 * Solar Energy Harvester
 *
 * Photovoltaic energy capture from body-integrated solar panels.
 * Typical output: 50–200W depending on surface area and conditions.
 */

import { IEnergyHarvester } from "../interfaces";
import {
  EnergySourceType,
  HarvesterStatus,
  HarvesterHealth,
  HarvestResult,
  PowerMeasurement,
  SourceAvailability,
  Temperature,
  watts,
  celsius,
} from "../types";

export class SolarHarvester implements IEnergyHarvester {
  private status: HarvesterStatus = HarvesterStatus.IDLE;
  private availability: SourceAvailability = SourceAvailability.NONE;
  private currentOutput: PowerMeasurement = watts(0);
  private maxOutput: PowerMeasurement;
  private efficiency: number;
  private degradation: number;
  private temperature: Temperature;
  private faultCount = 0;
  private lastFaultTimestamp: number | null = null;

  constructor(
    maxOutputWatts = 200,
    initialEfficiency = 0.85,
    initialDegradation = 0
  ) {
    this.maxOutput = watts(maxOutputWatts);
    this.efficiency = initialEfficiency;
    this.degradation = initialDegradation;
    this.temperature = celsius(25);
  }

  getSourceType(): EnergySourceType {
    return EnergySourceType.SOLAR;
  }

  getStatus(): HarvesterStatus {
    return this.status;
  }

  getCurrentOutput(): PowerMeasurement {
    return this.currentOutput;
  }

  getMaxOutput(): PowerMeasurement {
    return watts(this.maxOutput.watts * this.getEffectiveEfficiency());
  }

  getEfficiency(): number {
    return this.efficiency * (1 - this.degradation);
  }

  getAvailability(): SourceAvailability {
    return this.availability;
  }

  startHarvesting(): HarvestResult {
    if (this.status === HarvesterStatus.FAULT) {
      return {
        success: false,
        sourceType: EnergySourceType.SOLAR,
        error: "Harvester is in fault state",
      };
    }

    if (this.availability === SourceAvailability.NONE) {
      this.status = HarvesterStatus.IDLE;
      this.currentOutput = watts(0);
      return {
        success: false,
        sourceType: EnergySourceType.SOLAR,
        error: "No solar energy available",
      };
    }

    this.status = HarvesterStatus.ACTIVE;
    this.currentOutput = watts(
      this.maxOutput.watts * this.getEffectiveEfficiency() * this.availabilityFactor()
    );
    return { success: true, sourceType: EnergySourceType.SOLAR };
  }

  stopHarvesting(): HarvestResult {
    this.status = HarvesterStatus.IDLE;
    this.currentOutput = watts(0);
    return { success: true, sourceType: EnergySourceType.SOLAR };
  }

  getHealthMetrics(): HarvesterHealth {
    return {
      sourceType: EnergySourceType.SOLAR,
      efficiency: this.getEfficiency(),
      degradation: this.degradation,
      temperature: this.temperature,
      faultCount: this.faultCount,
      lastFaultTimestamp: this.lastFaultTimestamp,
      needsMaintenance: this.degradation > 0.2 || this.faultCount > 3,
    };
  }

  // ─── Simulation / Test Helpers ──────────────────────────────────────

  /** Set environmental availability (simulates day/night, cloud cover) */
  setAvailability(availability: SourceAvailability): void {
    this.availability = availability;
    if (this.status === HarvesterStatus.ACTIVE) {
      if (availability === SourceAvailability.NONE) {
        this.status = HarvesterStatus.IDLE;
        this.currentOutput = watts(0);
      } else {
        this.currentOutput = watts(
          this.maxOutput.watts * this.getEffectiveEfficiency() * this.availabilityFactor()
        );
      }
    }
  }

  /** Inject a fault (simulates panel damage, connection failure) */
  injectFault(): void {
    this.status = HarvesterStatus.FAULT;
    this.currentOutput = watts(0);
    this.faultCount++;
    this.lastFaultTimestamp = Date.now();
  }

  /** Clear fault state */
  clearFault(): void {
    if (this.status === HarvesterStatus.FAULT) {
      this.status = HarvesterStatus.IDLE;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────

  private getEffectiveEfficiency(): number {
    return this.efficiency * (1 - this.degradation);
  }

  private availabilityFactor(): number {
    switch (this.availability) {
      case SourceAvailability.HIGH:
        return 1.0;
      case SourceAvailability.MEDIUM:
        return 0.5;
      case SourceAvailability.LOW:
        return 0.2;
      case SourceAvailability.NONE:
        return 0.0;
    }
  }
}
