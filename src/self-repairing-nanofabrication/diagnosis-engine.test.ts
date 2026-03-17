/**
 * Diagnosis & Triage Engine — Tests
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Red step: these tests should fail until implementation exists.
 */

import { describe, it, expect } from "vitest";
import { createDiagnosisEngine } from "./diagnosis-engine.js";
import {
  SensorType,
  Severity,
  DamageCategory,
  type DegradationAlert,
  type ImpactAssessment,
} from "./types.js";

function makeAlert(
  overrides: Partial<DegradationAlert> = {}
): DegradationAlert {
  return {
    regionId: "region-01",
    sensorType: SensorType.MolecularStrain,
    severity: Severity.Medium,
    rawReadings: [],
    ...overrides,
  };
}

const defaultImpact: ImpactAssessment = {
  activeProcesses: ["proc-1"],
  criticality: 0.5,
  redundancyAvailable: true,
};

function makeImpactProvider(
  impact: ImpactAssessment = defaultImpact
): (regionId: string) => ImpactAssessment {
  return (_regionId: string) => impact;
}

describe("DiagnosisEngine", () => {
  describe("classify()", () => {
    it("classifies MolecularStrain as Mechanical damage", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const category = engine.classify(
        makeAlert({ sensorType: SensorType.MolecularStrain })
      );
      expect(category).toBe(DamageCategory.Mechanical);
    });

    it("classifies ElectricalContinuity as Mechanical damage", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const category = engine.classify(
        makeAlert({ sensorType: SensorType.ElectricalContinuity })
      );
      expect(category).toBe(DamageCategory.Mechanical);
    });

    it("classifies Thermal sensor as Thermal damage", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const category = engine.classify(
        makeAlert({ sensorType: SensorType.Thermal })
      );
      expect(category).toBe(DamageCategory.Thermal);
    });

    it("classifies Chemical sensor as Chemical damage", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const category = engine.classify(
        makeAlert({ sensorType: SensorType.Chemical })
      );
      expect(category).toBe(DamageCategory.Chemical);
    });

    it("classifies Radiation sensor as Radiation damage", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const category = engine.classify(
        makeAlert({ sensorType: SensorType.Radiation })
      );
      expect(category).toBe(DamageCategory.Radiation);
    });
  });

  describe("assessImpact()", () => {
    it("delegates to the provided impact assessment function", () => {
      const customImpact: ImpactAssessment = {
        activeProcesses: ["proc-A", "proc-B"],
        criticality: 0.8,
        redundancyAvailable: false,
      };
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(customImpact),
      });

      const result = engine.assessImpact("region-01");
      expect(result).toEqual(customImpact);
    });
  });

  describe("diagnose()", () => {
    it("produces a RepairOrder with correct damage type and severity", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const alert = makeAlert({
        severity: Severity.High,
        sensorType: SensorType.Thermal,
      });
      const order = engine.diagnose(alert);

      expect(order.regionId).toBe("region-01");
      expect(order.damageType).toBe(DamageCategory.Thermal);
      expect(order.severity).toBe(Severity.High);
      expect(typeof order.id).toBe("string");
      expect(order.id.length).toBeGreaterThan(0);
    });

    it("assigns higher priority score to CRITICAL than LOW severity", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const criticalOrder = engine.diagnose(
        makeAlert({ severity: Severity.Critical })
      );
      const lowOrder = engine.diagnose(
        makeAlert({ severity: Severity.Low })
      );

      expect(criticalOrder.priorityScore).toBeGreaterThan(
        lowOrder.priorityScore
      );
    });

    it("assigns higher priority when criticality is high", () => {
      const highCrit = createDiagnosisEngine({
        assessImpact: makeImpactProvider({
          activeProcesses: ["p1"],
          criticality: 0.9,
          redundancyAvailable: true,
        }),
      });
      const lowCrit = createDiagnosisEngine({
        assessImpact: makeImpactProvider({
          activeProcesses: [],
          criticality: 0.1,
          redundancyAvailable: true,
        }),
      });

      const alert = makeAlert({ severity: Severity.Medium });
      const highOrder = highCrit.diagnose(alert);
      const lowOrder = lowCrit.diagnose(alert);

      expect(highOrder.priorityScore).toBeGreaterThan(lowOrder.priorityScore);
    });

    it("sets requiresOffload=true for CRITICAL severity", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const order = engine.diagnose(
        makeAlert({ severity: Severity.Critical })
      );
      expect(order.requiresOffload).toBe(true);
    });

    it("sets requiresOffload=true for HIGH severity", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const order = engine.diagnose(makeAlert({ severity: Severity.High }));
      expect(order.requiresOffload).toBe(true);
    });

    it("sets requiresOffload=false for LOW severity with redundancy available", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider({
          activeProcesses: [],
          criticality: 0.1,
          redundancyAvailable: true,
        }),
      });

      const order = engine.diagnose(makeAlert({ severity: Severity.Low }));
      expect(order.requiresOffload).toBe(false);
    });

    it("sets requiresOffload=true when no redundancy available even for MEDIUM", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider({
          activeProcesses: ["p1"],
          criticality: 0.5,
          redundancyAvailable: false,
        }),
      });

      const order = engine.diagnose(
        makeAlert({ severity: Severity.Medium })
      );
      expect(order.requiresOffload).toBe(true);
    });

    it("includes a non-empty repairPlanId", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const order = engine.diagnose(makeAlert());
      expect(typeof order.repairPlanId).toBe("string");
      expect(order.repairPlanId.length).toBeGreaterThan(0);
    });

    it("estimates positive repair duration", () => {
      const engine = createDiagnosisEngine({
        assessImpact: makeImpactProvider(),
      });

      const order = engine.diagnose(makeAlert());
      expect(order.estimatedDuration_ms).toBeGreaterThan(0);
    });
  });
});
