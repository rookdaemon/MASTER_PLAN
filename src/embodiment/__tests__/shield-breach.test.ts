/**
 * Tests for the Environment Shield Module (0.3.1.2.1)
 *
 * Verifies shielding behavior from ARCHITECTURE.md §1.3:
 * - EMI, vibration, thermal, and radiation breach detection and reporting
 * - Shield integrity tracking across all threat vectors
 * - Nominal operation within defined tolerances
 * - Breach response degrades shielding state correctly
 */
import { describe, it, expect, beforeEach } from "vitest";
import { EnvironmentShield } from "../environment-shield.js";

describe("EnvironmentShield", () => {
  let shield: EnvironmentShield;

  beforeEach(() => {
    shield = new EnvironmentShield();
  });

  describe("nominal operation", () => {
    it("starts with EMI well below threshold", () => {
      const emi = shield.getEMILevel();
      expect(emi.levelDb).toBeLessThan(0); // below threshold
    });

    it("starts with vibration below 0.01g RMS limit", () => {
      const vib = shield.getVibrationAtSubstrate();
      expect(vib.rmsG).toBeLessThan(0.01);
    });

    it("starts with thermal status within tolerance", () => {
      const thermal = shield.getThermalStatus();
      expect(thermal.withinTolerance).toBe(true);
      expect(thermal.coolingActive).toBe(true);
    });

    it("starts with full shield integrity", () => {
      const health = shield.getShieldIntegrity();
      expect(health.overallIntegrity).toBe(1);
      expect(health.breaches).toEqual([]);
      expect(health.faradayCageIntact).toBe(true);
      expect(health.dampingActive).toBe(true);
      expect(health.thermalBarrierIntact).toBe(true);
    });
  });

  describe("EMI breach", () => {
    it("records EMI breach and degrades faraday cage", () => {
      shield.reportBreach("emi");
      const health = shield.getShieldIntegrity();
      expect(health.breaches).toContain("emi");
      expect(health.faradayCageIntact).toBe(false);
    });

    it("EMI level rises above threshold after breach", () => {
      shield.reportBreach("emi");
      const emi = shield.getEMILevel();
      expect(emi.levelDb).toBeGreaterThan(0);
    });

    it("reduces overall integrity on EMI breach", () => {
      shield.reportBreach("emi");
      const health = shield.getShieldIntegrity();
      expect(health.overallIntegrity).toBeLessThan(1);
    });
  });

  describe("vibration breach", () => {
    it("records vibration breach and disables damping", () => {
      shield.reportBreach("vibration");
      const health = shield.getShieldIntegrity();
      expect(health.breaches).toContain("vibration");
      expect(health.dampingActive).toBe(false);
    });

    it("vibration exceeds 0.01g RMS limit after breach", () => {
      shield.reportBreach("vibration");
      const vib = shield.getVibrationAtSubstrate();
      expect(vib.rmsG).toBeGreaterThan(0.01);
    });

    it("peak vibration exceeds 5g after impact breach", () => {
      shield.reportBreach("impact");
      const vib = shield.getVibrationAtSubstrate();
      expect(vib.peakG).toBeGreaterThan(5);
    });
  });

  describe("thermal breach", () => {
    it("records thermal breach and degrades thermal barrier", () => {
      shield.reportBreach("thermal");
      const health = shield.getShieldIntegrity();
      expect(health.breaches).toContain("thermal");
      expect(health.thermalBarrierIntact).toBe(false);
    });

    it("thermal status falls outside tolerance after breach", () => {
      shield.reportBreach("thermal");
      const thermal = shield.getThermalStatus();
      expect(thermal.withinTolerance).toBe(false);
    });
  });

  describe("multiple breaches", () => {
    it("tracks multiple concurrent breaches", () => {
      shield.reportBreach("emi");
      shield.reportBreach("thermal");
      const health = shield.getShieldIntegrity();
      expect(health.breaches).toContain("emi");
      expect(health.breaches).toContain("thermal");
      expect(health.overallIntegrity).toBeLessThan(0.5);
    });

    it("all breaches reduce integrity to minimum", () => {
      shield.reportBreach("emi");
      shield.reportBreach("vibration");
      shield.reportBreach("thermal");
      const health = shield.getShieldIntegrity();
      expect(health.overallIntegrity).toBe(0);
    });
  });

  describe("breach recovery", () => {
    it("clears all breaches and restores nominal state", () => {
      shield.reportBreach("emi");
      shield.reportBreach("vibration");
      shield.clearBreaches();

      const health = shield.getShieldIntegrity();
      expect(health.overallIntegrity).toBe(1);
      expect(health.breaches).toEqual([]);
      expect(health.faradayCageIntact).toBe(true);
      expect(health.dampingActive).toBe(true);
    });
  });

  describe("simulation helpers", () => {
    it("setEMILevel updates reported EMI", () => {
      shield.setEMILevel(5);
      expect(shield.getEMILevel().levelDb).toBe(5);
    });

    it("setVibrationLevel updates reported vibration", () => {
      shield.setVibrationLevel(0.03, 2.0);
      const vib = shield.getVibrationAtSubstrate();
      expect(vib.rmsG).toBe(0.03);
      expect(vib.peakG).toBe(2.0);
    });

    it("setSubstrateTemperature affects thermal tolerance", () => {
      shield.setSubstrateTemperature(30); // well outside ±0.5°C of 25°C
      const thermal = shield.getThermalStatus();
      expect(thermal.withinTolerance).toBe(false);
    });
  });
});
