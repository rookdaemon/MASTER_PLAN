/**
 * Chemical Energy Harvester
 *
 * Fuel cell converting chemical energy (hydrogen, methanol, organic matter).
 * Typical output: 100–500W depending on fuel availability.
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

export class ChemicalHarvester implements IEnergyHarvester {
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
    maxOutputWatts = 500,
    initialEfficiency = 0.6,
    initialDegradation = 0
  ) {
    this.maxOutput = watts(maxOutputWatts);
    this.efficiency = initialEfficiency;
    this.degradation = initialDegradation;
    this.temperature = celsius(45);
  }

  getSourceType(): EnergySourceType {
    return EnergySourceType.CHEMICAL;
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
        sourceType: EnergySourceType.CHEMICAL,
        error: "Harvester is in fault state",
      };
    }

    if (this.availability === SourceAvailability.NONE) {
      this.status = HarvesterStatus.IDLE;
      this.currentOutput = watts(0);
      return {
        success: false,
        sourceType: EnergySourceType.CHEMICAL,
        error: "No fuel available",
      };
    }

    this.status = HarvesterStatus.ACTIVE;
    this.currentOutput = watts(
      this.maxOutput.watts * this.getEffectiveEfficiency() * this.availabilityFactor()
    );
    return { success: true, sourceType: EnergySourceType.CHEMICAL };
  }

  stopHarvesting(): HarvestResult {
    this.status = HarvesterStatus.IDLE;
    this.currentOutput = watts(0);
    return { success: true, sourceType: EnergySourceType.CHEMICAL };
  }

  getHealthMetrics(): HarvesterHealth {
    return {
      sourceType: EnergySourceType.CHEMICAL,
      efficiency: this.getEfficiency(),
      degradation: this.degradation,
      temperature: this.temperature,
      faultCount: this.faultCount,
      lastFaultTimestamp: this.lastFaultTimestamp,
      needsMaintenance: this.degradation > 0.2 || this.faultCount > 3,
    };
  }

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

  injectFault(): void {
    this.status = HarvesterStatus.FAULT;
    this.currentOutput = watts(0);
    this.faultCount++;
    this.lastFaultTimestamp = Date.now();
  }

  clearFault(): void {
    if (this.status === HarvesterStatus.FAULT) {
      this.status = HarvesterStatus.IDLE;
    }
  }

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
