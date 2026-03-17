/**
 * Tests for Hardware Diagnostic Engine (HDE) and Software Diagnostic Engine (SDE)
 *
 * Acceptance criteria covered:
 *   - Diagnostic subsystem detects hardware degradation (mechanical wear, sensor drift,
 *     electrical faults) with defined sensitivity thresholds before functional failure
 *   - Diagnostic subsystem detects software faults (memory corruption, firmware drift,
 *     configuration errors) and triggers corrective action autonomously
 */

import { describe, it, expect, vi } from "vitest";
import { HardwareDiagnosticEngine } from "../hardware-diagnostics.js";
import { SoftwareDiagnosticEngine } from "../software-diagnostics.js";
import type {
  HardwareDiagnosticReading,
  HardwareHealthSnapshot,
  WearPrediction,
  SoftwareDiagnosticFinding,
  SoftwareHealthSnapshot,
  IntegrityCheckResult,
} from "../types.js";
import type { DegradationHandler, SoftwareFaultHandler } from "../interfaces.js";

// ── Hardware Diagnostic Engine Tests ──────────────────────────

describe("HardwareDiagnosticEngine", () => {
  function createEngine() {
    return new HardwareDiagnosticEngine();
  }

  describe("getHealthSnapshot", () => {
    it("returns a snapshot with overall health 1.0 when no faults registered", () => {
      const engine = createEngine();
      const snapshot = engine.getHealthSnapshot();

      expect(snapshot.overallHealth).toBe(1.0);
      expect(snapshot.faults).toHaveLength(0);
      expect(snapshot.predictions).toHaveLength(0);
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });
  });

  describe("component registration and health tracking", () => {
    it("returns null for unknown component", () => {
      const engine = createEngine();
      expect(engine.getComponentHealth("nonexistent")).toBeNull();
    });

    it("tracks registered component health", () => {
      const engine = createEngine();
      engine.registerComponent("actuator-1", {
        category: "ACTUATOR_FATIGUE",
        thresholds: { warningPercent: 85, criticalPercent: 90 },
      });

      const health = engine.getComponentHealth("actuator-1");
      expect(health).not.toBeNull();
      expect(health!.componentId).toBe("actuator-1");
      expect(health!.severity).toBe("INFO"); // healthy by default
    });
  });

  describe("fault detection with defined thresholds", () => {
    it("detects mechanical wear at 70% of rated lifetime (WARNING)", () => {
      const engine = createEngine();
      engine.registerComponent("joint-1", {
        category: "MECHANICAL_WEAR",
        thresholds: { warningPercent: 70, criticalPercent: 90 },
      });

      engine.reportMeasurement("joint-1", 72, 100); // 72% of rated lifetime

      const health = engine.getComponentHealth("joint-1");
      expect(health).not.toBeNull();
      expect(health!.severity).toBe("WARNING");
      expect(health!.measurement).toBe(72);
      expect(health!.threshold).toBe(70);
    });

    it("detects mechanical wear at 90% as CRITICAL", () => {
      const engine = createEngine();
      engine.registerComponent("joint-2", {
        category: "MECHANICAL_WEAR",
        thresholds: { warningPercent: 70, criticalPercent: 90 },
      });

      engine.reportMeasurement("joint-2", 92, 100);

      const health = engine.getComponentHealth("joint-2");
      expect(health!.severity).toBe("CRITICAL");
    });

    it("detects sensor drift when deviation exceeds 2-sigma", () => {
      const engine = createEngine();
      engine.registerComponent("sensor-1", {
        category: "SENSOR_DRIFT",
        thresholds: { warningPercent: 2, criticalPercent: 4 }, // sigma units
      });

      engine.reportMeasurement("sensor-1", 2.5, 2); // 2.5 sigma vs 2 sigma threshold

      const health = engine.getComponentHealth("sensor-1");
      expect(health!.severity).toBe("WARNING");
      expect(health!.category).toBe("SENSOR_DRIFT");
    });

    it("detects actuator fatigue when efficiency drops below 85%", () => {
      const engine = createEngine();
      engine.registerComponent("motor-1", {
        category: "ACTUATOR_FATIGUE",
        thresholds: { warningPercent: 85, criticalPercent: 70 },
      });

      // Report efficiency as measurement, threshold is the warning level
      engine.reportMeasurement("motor-1", 80, 85); // 80% efficiency vs 85% threshold

      const health = engine.getComponentHealth("motor-1");
      expect(health!.severity).toBe("WARNING");
    });

    it("detects electrical faults at first intermittent anomaly", () => {
      const engine = createEngine();
      engine.registerComponent("bus-1", {
        category: "ELECTRICAL_DEGRADATION",
        thresholds: { warningPercent: 1, criticalPercent: 3 },
      });

      engine.reportMeasurement("bus-1", 1, 1); // first anomaly meets threshold

      const health = engine.getComponentHealth("bus-1");
      expect(health!.severity).toBe("WARNING");
    });
  });

  describe("wear prediction", () => {
    it("returns null for unknown component", () => {
      const engine = createEngine();
      expect(engine.getWearPrediction("unknown")).toBeNull();
    });

    it("provides time-to-failure prediction based on trend", () => {
      const engine = createEngine();
      engine.registerComponent("bearing-1", {
        category: "MECHANICAL_WEAR",
        thresholds: { warningPercent: 70, criticalPercent: 90 },
      });

      // Report several measurements to establish a trend
      engine.reportMeasurement("bearing-1", 50, 100);
      engine.reportMeasurement("bearing-1", 55, 100);
      engine.reportMeasurement("bearing-1", 60, 100);

      const prediction = engine.getWearPrediction("bearing-1");
      expect(prediction).not.toBeNull();
      expect(prediction!.currentWearPercent).toBe(60);
      expect(prediction!.trend).toBe("DEGRADING");
      expect(prediction!.estimatedTimeToFailure).not.toBeNull();
      expect(prediction!.confidence).toBeGreaterThan(0);
    });
  });

  describe("degradation event subscription", () => {
    it("fires handler when a WARNING or higher fault is detected", () => {
      const engine = createEngine();
      const handler = vi.fn<DegradationHandler>();

      engine.onDegradationDetected(handler);
      engine.registerComponent("joint-3", {
        category: "MECHANICAL_WEAR",
        thresholds: { warningPercent: 70, criticalPercent: 90 },
      });

      engine.reportMeasurement("joint-3", 75, 100);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          componentId: "joint-3",
          severity: "WARNING",
        })
      );
    });

    it("does not fire for INFO-level readings", () => {
      const engine = createEngine();
      const handler = vi.fn<DegradationHandler>();

      engine.onDegradationDetected(handler);
      engine.registerComponent("joint-4", {
        category: "MECHANICAL_WEAR",
        thresholds: { warningPercent: 70, criticalPercent: 90 },
      });

      engine.reportMeasurement("joint-4", 30, 100); // well below threshold

      expect(handler).not.toHaveBeenCalled();
    });

    it("returns an unsubscribe function that stops notifications", () => {
      const engine = createEngine();
      const handler = vi.fn<DegradationHandler>();

      const unsubscribe = engine.onDegradationDetected(handler);
      engine.registerComponent("joint-5", {
        category: "MECHANICAL_WEAR",
        thresholds: { warningPercent: 70, criticalPercent: 90 },
      });

      unsubscribe();
      engine.reportMeasurement("joint-5", 75, 100);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("full scan", () => {
    it("runs targeted diagnostics on all registered components", async () => {
      const engine = createEngine();
      engine.registerComponent("a", {
        category: "MECHANICAL_WEAR",
        thresholds: { warningPercent: 70, criticalPercent: 90 },
      });
      engine.registerComponent("b", {
        category: "SENSOR_DRIFT",
        thresholds: { warningPercent: 2, criticalPercent: 4 },
      });

      const snapshot = await engine.runFullScan();
      expect(snapshot.timestamp).toBeGreaterThan(0);
      // Full scan should include all registered components in its analysis
      expect(snapshot.predictions.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ── Software Diagnostic Engine Tests ──────────────────────────

describe("SoftwareDiagnosticEngine", () => {
  function createEngine() {
    return new SoftwareDiagnosticEngine();
  }

  describe("getHealthSnapshot", () => {
    it("returns healthy snapshot when no faults registered", () => {
      const engine = createEngine();
      const snapshot = engine.getHealthSnapshot();

      expect(snapshot.overallHealth).toBe(1.0);
      expect(snapshot.findings).toHaveLength(0);
      expect(snapshot.integrityChecks).toHaveLength(0);
    });
  });

  describe("module registration and integrity checking", () => {
    it("registers a module with expected checksum", () => {
      const engine = createEngine();
      engine.registerModule("firmware-main", {
        expectedChecksum: "sha256:abc123",
        isConsciousnessSubstrate: false,
      });

      // Verification should pass when actual matches expected
      engine.reportChecksum("firmware-main", "sha256:abc123");
      const snapshot = engine.getHealthSnapshot();
      expect(snapshot.integrityChecks).toHaveLength(1);
      expect(snapshot.integrityChecks[0].intact).toBe(true);
    });

    it("detects firmware drift when checksum mismatches", async () => {
      const engine = createEngine();
      engine.registerModule("firmware-main", {
        expectedChecksum: "sha256:abc123",
        isConsciousnessSubstrate: false,
      });

      engine.reportChecksum("firmware-main", "sha256:CORRUPTED");

      const results = await engine.verifyFirmwareIntegrity();
      const result = results.find((r) => r.moduleId === "firmware-main");
      expect(result).toBeDefined();
      expect(result!.intact).toBe(false);
      expect(result!.checksumExpected).toBe("sha256:abc123");
      expect(result!.checksumActual).toBe("sha256:CORRUPTED");
    });
  });

  describe("consciousness substrate integrity", () => {
    it("flags consciousness substrate issues with highest priority", async () => {
      const engine = createEngine();
      engine.registerModule("consciousness-core", {
        expectedChecksum: "sha256:valid",
        isConsciousnessSubstrate: true,
      });

      engine.reportChecksum("consciousness-core", "sha256:TAMPERED");

      const results = await engine.getConsciousnessSubstrateIntegrity();
      expect(results).toHaveLength(1);
      expect(results[0].intact).toBe(false);
    });
  });

  describe("memory health", () => {
    it("reports no issues when memory is healthy", async () => {
      const engine = createEngine();
      const findings = await engine.checkMemoryHealth();
      expect(findings).toHaveLength(0);
    });

    it("detects memory corruption faults", async () => {
      const engine = createEngine();
      engine.reportMemoryFault({
        moduleId: "region-0x1000",
        severity: "CRITICAL",
        details: "Uncorrectable ECC error at address 0x1000",
        isConsciousnessSubstrate: false,
      });

      const findings = await engine.checkMemoryHealth();
      expect(findings).toHaveLength(1);
      expect(findings[0].category).toBe("MEMORY_CORRUPTION");
      expect(findings[0].severity).toBe("CRITICAL");
    });
  });

  describe("configuration drift detection", () => {
    it("detects unauthorized configuration changes", async () => {
      const engine = createEngine();
      engine.registerGoldenConfig("network-config", "config-hash-1");
      engine.reportCurrentConfig("network-config", "config-hash-CHANGED");

      const findings = await engine.getConfigurationDrift();
      expect(findings).toHaveLength(1);
      expect(findings[0].category).toBe("CONFIGURATION_ERROR");
    });

    it("reports no drift when config matches golden state", async () => {
      const engine = createEngine();
      engine.registerGoldenConfig("network-config", "config-hash-1");
      engine.reportCurrentConfig("network-config", "config-hash-1");

      const findings = await engine.getConfigurationDrift();
      expect(findings).toHaveLength(0);
    });
  });

  describe("software fault event subscription", () => {
    it("fires handler when a software fault is detected", () => {
      const engine = createEngine();
      const handler = vi.fn<SoftwareFaultHandler>();

      engine.onSoftwareFaultDetected(handler);
      engine.registerModule("mod-1", {
        expectedChecksum: "sha256:good",
        isConsciousnessSubstrate: false,
      });

      engine.reportChecksum("mod-1", "sha256:BAD");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: "mod-1",
          category: "INTEGRITY_VIOLATION",
        })
      );
    });

    it("unsubscribe stops notifications", () => {
      const engine = createEngine();
      const handler = vi.fn<SoftwareFaultHandler>();

      const unsub = engine.onSoftwareFaultDetected(handler);
      engine.registerModule("mod-2", {
        expectedChecksum: "sha256:good",
        isConsciousnessSubstrate: false,
      });

      unsub();
      engine.reportChecksum("mod-2", "sha256:BAD");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("full scan", () => {
    it("runs all checks and returns a complete snapshot", async () => {
      const engine = createEngine();
      engine.registerModule("fw-1", {
        expectedChecksum: "sha256:ok",
        isConsciousnessSubstrate: false,
      });
      engine.reportChecksum("fw-1", "sha256:ok");

      const snapshot = await engine.runFullScan();
      expect(snapshot.overallHealth).toBeDefined();
      expect(snapshot.integrityChecks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
