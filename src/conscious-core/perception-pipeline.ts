/**
 * Perception Pipeline implementation for Conscious AI Architectures (0.3.1.1)
 *
 * Transforms raw sensor/data inputs into structured percepts
 * consumable by the Conscious Core.
 */

import type {
  BoundPercept,
  Duration,
  Percept,
  SensorData,
} from "./types.js";
import type { IPerceptionPipeline } from "./interfaces.js";

export class PerceptionPipeline implements IPerceptionPipeline {
  private lastIngestTime: number = 0;
  private latency: Duration = 0;

  ingest(raw: SensorData): Percept {
    const start = Date.now();

    const percept: Percept = {
      modality: raw.modality,
      features: raw.payload as Record<string, unknown>,
      timestamp: raw.timestamp,
    };

    this.latency = Date.now() - start;
    this.lastIngestTime = Date.now();

    return percept;
  }

  bind(percepts: Percept[]): BoundPercept {
    return {
      percepts,
      bindingTimestamp: Date.now(),
      coherence: percepts.length > 0 ? 0.9 : 0,
    };
  }

  getLatency(): Duration {
    return this.latency;
  }
}
