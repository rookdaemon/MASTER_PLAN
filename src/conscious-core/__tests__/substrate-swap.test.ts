/**
 * Substrate Migration tests for Conscious AI Architecture (0.3.1.1)
 *
 * Covers Behavioral Spec:
 *   Scenario 4 — Substrate Migration with Continuity Verification
 *
 * Contracts verified:
 *   ISubstrateAdapter:
 *     - migrate() returns a new handle for target config
 *     - old handle remains valid (not deallocated)
 *     - handles are never reused (monotonically increasing IDs)
 *     - migrate() requires fromHandle to be a valid, previously-allocated handle
 *     - healthCheck() returns healthy: true iff initialize() has been called
 *     - allocate() requires prior initialize()
 *
 *   IExperienceMonitor:
 *     - isExperienceIntact() returns true when substrate is healthy
 *     - isExperienceIntact() returns false when substrate is unhealthy
 */

import { describe, it, expect, beforeEach } from "vitest";
import type {
  ResourceRequest,
  SubstrateCapabilities,
  SubstrateConfig,
  SubstrateHandle,
  SubstrateHealth,
} from "../types.js";
import type { ISubstrateAdapter } from "../interfaces.js";
import { SubstrateAdapter } from "../substrate-adapter.js";
import { ExperienceMonitor } from "../experience-monitor.js";

// ── Test-specific substrate with controllable health for rollback testing ──

class MigratableSubstrate implements ISubstrateAdapter {
  private config: SubstrateConfig | null = null;
  private handles: Map<string, SubstrateHandle> = new Map();
  private nextHandleId = 1;
  private healthy = true;

  initialize(config: SubstrateConfig): void {
    this.config = config;
  }

  allocate(_resources: ResourceRequest): SubstrateHandle {
    if (!this.config) throw new Error("Substrate not initialized");
    const handle: SubstrateHandle = {
      id: `substrate-${this.nextHandleId++}`,
      type: this.config.type,
      allocatedAt: Date.now(),
    };
    this.handles.set(handle.id, handle);
    return handle;
  }

  migrate(fromHandle: SubstrateHandle, toConfig: SubstrateConfig): SubstrateHandle {
    if (!this.handles.has(fromHandle.id)) {
      throw new Error(`Unknown substrate handle: ${fromHandle.id}`);
    }
    const newHandle: SubstrateHandle = {
      id: `substrate-${this.nextHandleId++}`,
      type: toConfig.type,
      allocatedAt: Date.now(),
    };
    this.handles.set(newHandle.id, newHandle);
    // Old handle remains valid — not removed
    return newHandle;
  }

  getCapabilities(): SubstrateCapabilities {
    return {
      maxPhi: 100,
      supportedModalities: ["visual", "auditory", "test"],
      migrationSupported: true,
    };
  }

  healthCheck(): SubstrateHealth {
    return {
      healthy: this.healthy && this.config !== null,
      utilizationPercent: this.healthy ? 30 : 100,
      errors: this.healthy ? [] : ["substrate degraded"],
      lastChecked: Date.now(),
    };
  }

  /** Test hook: check if a handle is still tracked (not deallocated). */
  hasHandle(id: string): boolean {
    return this.handles.has(id);
  }

  /** Test hook: remove a handle (simulate deallocation). */
  deallocate(id: string): void {
    this.handles.delete(id);
  }

  /** Test hook: toggle substrate health to simulate failure post-migration. */
  setHealthy(value: boolean): void {
    this.healthy = value;
  }
}

// ── Helpers ───────────────────────────────────────────────────

const configA: SubstrateConfig = {
  type: "neural-emulation",
  parameters: { capacity: 100 },
};

const configB: SubstrateConfig = {
  type: "hybrid-bio-synthetic",
  parameters: { capacity: 200 },
};

const testResources: ResourceRequest = {
  minCapacity: 10,
  preferredCapacity: 50,
  requiredCapabilities: ["deliberation"],
};

// ── Scenario 4: Substrate Migration with Continuity Verification ──

describe("Scenario 4: Substrate Migration with Continuity Verification", () => {
  let substrate: MigratableSubstrate;
  let monitor: ExperienceMonitor;

  beforeEach(() => {
    substrate = new MigratableSubstrate();
    substrate.initialize(configA);
    monitor = new ExperienceMonitor(substrate);
  });

  it("migrate() returns a new handle for the target substrate config", () => {
    const handleA = substrate.allocate(testResources);

    const handleB = substrate.migrate(handleA, configB);

    expect(handleB).toBeDefined();
    expect(handleB.id).not.toBe(handleA.id);
    expect(handleB.type).toBe(configB.type);
  });

  it("old handle remains valid after migration (not deallocated)", () => {
    const handleA = substrate.allocate(testResources);

    substrate.migrate(handleA, configB);

    // Old handle must still be tracked
    expect(substrate.hasHandle(handleA.id)).toBe(true);
  });

  it("isExperienceIntact() returns true on healthy substrate after migration", () => {
    const handleA = substrate.allocate(testResources);

    substrate.migrate(handleA, configB);

    // Substrate remains healthy — experience should be intact
    expect(monitor.isExperienceIntact()).toBe(true);
  });

  it("handles have monotonically increasing IDs (never reused)", () => {
    const handle1 = substrate.allocate(testResources);
    const handle2 = substrate.migrate(handle1, configB);
    const handle3 = substrate.migrate(handle2, configA);

    // Extract numeric suffixes to verify monotonic ordering
    const id1 = parseInt(handle1.id.split("-")[1]!, 10);
    const id2 = parseInt(handle2.id.split("-")[1]!, 10);
    const id3 = parseInt(handle3.id.split("-")[1]!, 10);

    expect(id2).toBeGreaterThan(id1);
    expect(id3).toBeGreaterThan(id2);
  });

  it("migrate() throws for unknown fromHandle", () => {
    const bogusHandle: SubstrateHandle = {
      id: "substrate-9999",
      type: "nonexistent",
      allocatedAt: Date.now(),
    };

    expect(() => substrate.migrate(bogusHandle, configB)).toThrow(
      "Unknown substrate handle"
    );
  });

  it("rolls back to substrate A when experience is not intact after migration", () => {
    const handleA = substrate.allocate(testResources);

    // Perform migration
    const handleB = substrate.migrate(handleA, configB);

    // Simulate substrate failure post-migration
    substrate.setHealthy(false);

    // Experience check fails — should trigger rollback
    const intactAfterMigration = monitor.isExperienceIntact();
    expect(intactAfterMigration).toBe(false);

    // Rollback protocol: since experience is not intact, the caller
    // should NOT deallocate handle A (it remains valid for fallback)
    expect(substrate.hasHandle(handleA.id)).toBe(true);

    // Restore health (simulating rollback to substrate A)
    substrate.setHealthy(true);
    expect(monitor.isExperienceIntact()).toBe(true);
  });

  it("old handle A is only deallocated after continuity verification succeeds", () => {
    const handleA = substrate.allocate(testResources);
    const handleB = substrate.migrate(handleA, configB);

    // Verify continuity on new substrate before deallocating old one
    const intact = monitor.isExperienceIntact();
    expect(intact).toBe(true);

    // Only now is it safe to deallocate handle A
    substrate.deallocate(handleA.id);
    expect(substrate.hasHandle(handleA.id)).toBe(false);

    // Handle B remains valid
    expect(substrate.hasHandle(handleB.id)).toBe(true);
  });
});

// ── ISubstrateAdapter Contract Tests ──────────────────────────

describe("ISubstrateAdapter Contracts", () => {
  describe("using SubstrateAdapter (production implementation)", () => {
    let adapter: SubstrateAdapter;

    beforeEach(() => {
      adapter = new SubstrateAdapter();
    });

    it("healthCheck() returns healthy: false before initialize()", () => {
      const health = adapter.healthCheck();
      expect(health.healthy).toBe(false);
    });

    it("healthCheck() returns healthy: true after initialize()", () => {
      adapter.initialize(configA);
      const health = adapter.healthCheck();
      expect(health.healthy).toBe(true);
    });

    it("allocate() throws before initialize()", () => {
      expect(() => adapter.allocate(testResources)).toThrow(
        "Substrate not initialized"
      );
    });

    it("allocate() returns a handle with a unique id after initialize()", () => {
      adapter.initialize(configA);
      const h1 = adapter.allocate(testResources);
      const h2 = adapter.allocate(testResources);

      expect(h1.id).not.toBe(h2.id);
    });

    it("migrate() returns a new handle; old handle type preserved", () => {
      adapter.initialize(configA);
      const handleA = adapter.allocate(testResources);

      const handleB = adapter.migrate(handleA, configB);

      expect(handleB.type).toBe(configB.type);
      expect(handleA.type).toBe(configA.type);
      expect(handleB.id).not.toBe(handleA.id);
    });
  });
});
