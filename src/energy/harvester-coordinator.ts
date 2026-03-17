/**
 * Harvester Coordinator
 *
 * Coordinates multiple energy harvesters, providing aggregate metrics,
 * automatic source selection, and graceful fallback when sources are lost.
 */

import { IEnergyHarvester, IHarvesterCoordinator } from "./interfaces";
import {
  Duration,
  EnergySourceType,
  HarvestForecast,
  HarvesterStatus,
  PowerMeasurement,
  SourceAvailability,
  SourceFoundHandler,
  SourceLostHandler,
  watts,
} from "./types";

export class HarvesterCoordinator implements IHarvesterCoordinator {
  private harvesters: Map<EnergySourceType, IEnergyHarvester> = new Map();
  private priorities: EnergySourceType[] = [
    EnergySourceType.SOLAR,
    EnergySourceType.CHEMICAL,
    EnergySourceType.KINETIC,
    EnergySourceType.THERMAL,
  ];
  private sourceLostHandlers: SourceLostHandler[] = [];
  private sourceFoundHandlers: SourceFoundHandler[] = [];
  private previouslyActive: Set<EnergySourceType> = new Set();

  /**
   * Register a harvester with the coordinator.
   */
  registerHarvester(harvester: IEnergyHarvester): void {
    this.harvesters.set(harvester.getSourceType(), harvester);
  }

  /**
   * Scan all registered harvesters and activate those with available energy.
   * Deactivate those whose source has become unavailable.
   * Fire source-lost/found callbacks as appropriate.
   */
  updateHarvesters(): void {
    const currentlyActive = new Set<EnergySourceType>();

    for (const sourceType of this.priorities) {
      const harvester = this.harvesters.get(sourceType);
      if (!harvester) continue;

      const availability = harvester.getAvailability();
      const status = harvester.getStatus();

      if (availability !== SourceAvailability.NONE && status !== HarvesterStatus.FAULT) {
        if (status !== HarvesterStatus.ACTIVE) {
          harvester.startHarvesting();
        }
        if (harvester.getStatus() === HarvesterStatus.ACTIVE) {
          currentlyActive.add(sourceType);
        }
      } else if (status === HarvesterStatus.ACTIVE) {
        harvester.stopHarvesting();
      }
    }

    // Detect sources lost
    for (const source of this.previouslyActive) {
      if (!currentlyActive.has(source)) {
        for (const handler of this.sourceLostHandlers) {
          handler(source);
        }
      }
    }

    // Detect sources found
    for (const source of currentlyActive) {
      if (!this.previouslyActive.has(source)) {
        for (const handler of this.sourceFoundHandlers) {
          handler(source);
        }
      }
    }

    this.previouslyActive = currentlyActive;
  }

  getActiveHarvesters(): IEnergyHarvester[] {
    const active: IEnergyHarvester[] = [];
    for (const harvester of this.harvesters.values()) {
      if (harvester.getStatus() === HarvesterStatus.ACTIVE) {
        active.push(harvester);
      }
    }
    return active;
  }

  getTotalHarvestRate(): PowerMeasurement {
    let total = 0;
    for (const harvester of this.harvesters.values()) {
      if (harvester.getStatus() === HarvesterStatus.ACTIVE) {
        total += harvester.getCurrentOutput().watts;
      }
    }
    return watts(total);
  }

  getSourceBreakdown(): Map<EnergySourceType, PowerMeasurement> {
    const breakdown = new Map<EnergySourceType, PowerMeasurement>();
    for (const [type, harvester] of this.harvesters) {
      breakdown.set(type, harvester.getCurrentOutput());
    }
    return breakdown;
  }

  setHarvestPriority(priorities: EnergySourceType[]): void {
    this.priorities = [...priorities];
  }

  getEnvironmentalForecast(horizon: Duration): HarvestForecast {
    // Simple forecast: assume current rates persist for the horizon
    const breakdown = new Map<EnergySourceType, PowerMeasurement>();
    let totalWatts = 0;

    for (const [type, harvester] of this.harvesters) {
      const output = harvester.getCurrentOutput();
      breakdown.set(type, output);
      totalWatts += output.watts;
    }

    return {
      horizon,
      expectedOutput: watts(totalWatts),
      confidence: 0.6, // Simple persistence forecast = moderate confidence
      breakdown,
    };
  }

  onSourceLost(callback: SourceLostHandler): void {
    this.sourceLostHandlers.push(callback);
  }

  onSourceFound(callback: SourceFoundHandler): void {
    this.sourceFoundHandlers.push(callback);
  }

  /**
   * Check if any harvest is currently active.
   */
  isHarvestActive(): boolean {
    return this.getTotalHarvestRate().watts > 0;
  }
}
