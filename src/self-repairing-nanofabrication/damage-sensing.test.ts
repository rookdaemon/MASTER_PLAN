/**
 * Damage Sensing Layer — Tests
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Red step: these tests should fail until implementation exists.
 */

import { describe, it, expect } from "vitest";
import { createDamageSensor } from "./damage-sensing.js";
import {
  SensorType,
  Severity,
  type SensorReading,
  type DegradationAlert,
} from "./types.js";

function makeReading(
  overrides: Partial<SensorReading> = {}
): SensorReading {
  return {
    regionId: "region-01",
    sensorType: SensorType.MolecularStrain,
    timestamp_ms: Date.now(),
    value: 1.0,
    baseline: 1.0,
    deviation: 0.0,
    ...overrides,
  };
}

describe("DamageSensor", () => {
  describe("read()", () => {
    it("returns a SensorReading for a known region", () => {
      const sensor = createDamageSensor({
        regions: ["region-01"],
        sensorType: SensorType.MolecularStrain,
      });

      const reading = sensor.read("region-01");

      expect(reading.regionId).toBe("region-01");
      expect(reading.sensorType).toBe(SensorType.MolecularStrain);
      expect(typeof reading.timestamp_ms).toBe("number");
      expect(typeof reading.value).toBe("number");
      expect(typeof reading.baseline).toBe("number");
      expect(typeof reading.deviation).toBe("number");
    });

    it("throws for an unknown region", () => {
      const sensor = createDamageSensor({
        regions: ["region-01"],
        sensorType: SensorType.Thermal,
      });

      expect(() => sensor.read("unknown-region")).toThrow();
    });
  });

  describe("evaluate()", () => {
    it("returns no alerts when all readings are within threshold", () => {
      const sensor = createDamageSensor({
        regions: ["region-01"],
        sensorType: SensorType.MolecularStrain,
        thresholds: { low: 0.1, medium: 0.3, high: 0.6, critical: 0.9 },
      });

      const readings: SensorReading[] = [
        makeReading({ deviation: 0.05 }),
      ];

      const alerts = sensor.evaluate(readings);
      expect(alerts).toEqual([]);
    });

    it("returns LOW alert when deviation exceeds low threshold", () => {
      const sensor = createDamageSensor({
        regions: ["region-01"],
        sensorType: SensorType.MolecularStrain,
        thresholds: { low: 0.1, medium: 0.3, high: 0.6, critical: 0.9 },
      });

      const readings: SensorReading[] = [
        makeReading({ deviation: 0.15 }),
      ];

      const alerts = sensor.evaluate(readings);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe(Severity.Low);
      expect(alerts[0].regionId).toBe("region-01");
      expect(alerts[0].rawReadings).toEqual(readings);
    });

    it("returns MEDIUM alert when deviation exceeds medium threshold", () => {
      const sensor = createDamageSensor({
        regions: ["region-01"],
        sensorType: SensorType.ElectricalContinuity,
        thresholds: { low: 0.1, medium: 0.3, high: 0.6, critical: 0.9 },
      });

      const readings: SensorReading[] = [
        makeReading({
          sensorType: SensorType.ElectricalContinuity,
          deviation: 0.45,
        }),
      ];

      const alerts = sensor.evaluate(readings);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe(Severity.Medium);
    });

    it("returns HIGH alert when deviation exceeds high threshold", () => {
      const sensor = createDamageSensor({
        regions: ["region-01"],
        sensorType: SensorType.Thermal,
        thresholds: { low: 0.1, medium: 0.3, high: 0.6, critical: 0.9 },
      });

      const alerts = sensor.evaluate([
        makeReading({ sensorType: SensorType.Thermal, deviation: 0.75 }),
      ]);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe(Severity.High);
    });

    it("returns CRITICAL alert when deviation exceeds critical threshold", () => {
      const sensor = createDamageSensor({
        regions: ["region-01"],
        sensorType: SensorType.Chemical,
        thresholds: { low: 0.1, medium: 0.3, high: 0.6, critical: 0.9 },
      });

      const alerts = sensor.evaluate([
        makeReading({ sensorType: SensorType.Chemical, deviation: 0.95 }),
      ]);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe(Severity.Critical);
    });

    it("groups multiple readings per region into a single alert at highest severity", () => {
      const sensor = createDamageSensor({
        regions: ["region-01"],
        sensorType: SensorType.MolecularStrain,
        thresholds: { low: 0.1, medium: 0.3, high: 0.6, critical: 0.9 },
      });

      const readings: SensorReading[] = [
        makeReading({ deviation: 0.15 }),  // LOW
        makeReading({ deviation: 0.45 }),  // MEDIUM
      ];

      const alerts = sensor.evaluate(readings);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe(Severity.Medium);
      expect(alerts[0].rawReadings).toHaveLength(2);
    });

    it("produces separate alerts for different regions", () => {
      const sensor = createDamageSensor({
        regions: ["region-01", "region-02"],
        sensorType: SensorType.MolecularStrain,
        thresholds: { low: 0.1, medium: 0.3, high: 0.6, critical: 0.9 },
      });

      const readings: SensorReading[] = [
        makeReading({ regionId: "region-01", deviation: 0.15 }),
        makeReading({ regionId: "region-02", deviation: 0.65 }),
      ];

      const alerts = sensor.evaluate(readings);
      expect(alerts).toHaveLength(2);

      const alert01 = alerts.find((a) => a.regionId === "region-01")!;
      const alert02 = alerts.find((a) => a.regionId === "region-02")!;
      expect(alert01.severity).toBe(Severity.Low);
      expect(alert02.severity).toBe(Severity.High);
    });
  });
});
