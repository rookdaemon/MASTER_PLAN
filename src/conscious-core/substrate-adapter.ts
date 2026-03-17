/**
 * Substrate Adapter implementation for Conscious AI Architectures (0.3.1.1)
 *
 * Abstraction layer enabling the Conscious Core to run on any
 * consciousness-supporting substrate from 0.2.
 */

import type {
  ResourceRequest,
  SubstrateCapabilities,
  SubstrateConfig,
  SubstrateHandle,
  SubstrateHealth,
  Timestamp,
} from "./types.js";
import type { ISubstrateAdapter } from "./interfaces.js";

export class SubstrateAdapter implements ISubstrateAdapter {
  private config: SubstrateConfig | null = null;
  private handles: Map<string, SubstrateHandle> = new Map();
  private nextHandleId = 1;

  initialize(config: SubstrateConfig): void {
    this.config = config;
  }

  allocate(resources: ResourceRequest): SubstrateHandle {
    if (!this.config) {
      throw new Error("Substrate not initialized");
    }

    const handle: SubstrateHandle = {
      id: `substrate-${this.nextHandleId++}`,
      type: this.config.type,
      allocatedAt: Date.now(),
    };
    this.handles.set(handle.id, handle);
    return handle;
  }

  migrate(
    fromHandle: SubstrateHandle,
    toConfig: SubstrateConfig
  ): SubstrateHandle {
    if (!this.handles.has(fromHandle.id)) {
      throw new Error(`Unknown substrate handle: ${fromHandle.id}`);
    }

    const newHandle: SubstrateHandle = {
      id: `substrate-${this.nextHandleId++}`,
      type: toConfig.type,
      allocatedAt: Date.now(),
    };
    this.handles.set(newHandle.id, newHandle);
    // Old handle remains until explicitly deallocated (per ARCHITECTURE.md)
    return newHandle;
  }

  getCapabilities(): SubstrateCapabilities {
    return {
      maxPhi: this.config
        ? (this.config.parameters as Record<string, number>).capacity ?? 100
        : 0,
      supportedModalities: ["visual", "auditory", "proprioceptive", "test"],
      migrationSupported: true,
    };
  }

  healthCheck(): SubstrateHealth {
    return {
      healthy: this.config !== null,
      utilizationPercent: 0,
      errors: [],
      lastChecked: Date.now(),
    };
  }
}
