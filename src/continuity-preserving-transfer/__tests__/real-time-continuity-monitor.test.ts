import { describe, it, expect } from "vitest";
import { RealTimeContinuityMonitorImpl } from "../real-time-continuity-monitor.js";
import {
  AlertLevel,
  PSI_GREEN_MULTIPLIER,
  type SubjectProfile,
  type PsiMetric,
} from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSubject(overrides: Partial<SubjectProfile> = {}): SubjectProfile {
  return {
    id: "subject-001",
    totalNeurons: 86_000_000_000,
    psiThreshold: 2.0,
    phiBaseline: 1.5,
    baselinePsi: [],
    ...overrides,
  };
}

function makePsi(value: number, threshold: number, timestamp_ms?: number): PsiMetric {
  const ts = timestamp_ms ?? Date.now();
  return {
    value,
    threshold,
    phi: { value: 3.0, baseline: 2.0, timestamp_ms: ts },
    causalContinuity: { intact: true, chainLength: 100, lastVerified_ms: ts },
    experientialBinding: { coherence: 0.95, fragmentCount: 1, timestamp_ms: ts },
    timestamp_ms: ts,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("RealTimeContinuityMonitorImpl", () => {
  describe("startMonitoring", () => {
    it("initializes monitoring for a subject", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      const subject = makeSubject();
      monitor.startMonitoring(subject);
      // Should not throw; monitor is now active
      expect(monitor.getHistory()).toEqual([]);
    });

    it("throws if already monitoring", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject());
      expect(() => monitor.startMonitoring(makeSubject())).toThrow("already monitoring");
    });
  });

  describe("recordMeasurement", () => {
    it("records a Ψ measurement", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));

      const psi = makePsi(3.5, 2.0);
      monitor.recordMeasurement(psi);

      expect(monitor.getHistory()).toHaveLength(1);
    });

    it("throws if not monitoring", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      expect(() => monitor.recordMeasurement(makePsi(3.0, 2.0))).toThrow("not monitoring");
    });
  });

  describe("getCurrentPsi", () => {
    it("returns the most recent measurement", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));

      const psi1 = makePsi(3.0, 2.0, 1000);
      const psi2 = makePsi(2.5, 2.0, 2000);
      monitor.recordMeasurement(psi1);
      monitor.recordMeasurement(psi2);

      expect(monitor.getCurrentPsi().value).toBe(2.5);
    });

    it("throws if no measurements recorded", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject());
      expect(() => monitor.getCurrentPsi()).toThrow("no measurements");
    });
  });

  describe("getAlertLevel", () => {
    it("returns GREEN when Ψ is well above threshold", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));
      monitor.recordMeasurement(makePsi(4.0, 2.0));

      expect(monitor.getAlertLevel()).toBe(AlertLevel.GREEN);
    });

    it("returns YELLOW when Ψ is between threshold and green zone", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));
      monitor.recordMeasurement(makePsi(2.5, 2.0));

      expect(monitor.getAlertLevel()).toBe(AlertLevel.YELLOW);
    });

    it("returns RED when Ψ is below threshold", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));
      monitor.recordMeasurement(makePsi(1.5, 2.0));

      expect(monitor.getAlertLevel()).toBe(AlertLevel.RED);
    });
  });

  describe("checkThreshold", () => {
    it("returns safe=true with positive margin when above threshold", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));
      monitor.recordMeasurement(makePsi(3.0, 2.0));

      const result = monitor.checkThreshold();
      expect(result.safe).toBe(true);
      expect(result.margin).toBe(1.0); // 3.0 - 2.0
    });

    it("returns safe=true with zero margin at exactly threshold", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));
      monitor.recordMeasurement(makePsi(2.0, 2.0));

      const result = monitor.checkThreshold();
      expect(result.safe).toBe(true);
      expect(result.margin).toBe(0);
    });

    it("returns safe=false with negative margin below threshold", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));
      monitor.recordMeasurement(makePsi(1.5, 2.0));

      const result = monitor.checkThreshold();
      expect(result.safe).toBe(false);
      expect(result.margin).toBeCloseTo(-0.5);
    });
  });

  describe("onThresholdBreach", () => {
    it("fires callback when RED measurement is recorded", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));

      let breachAlert: AlertLevel | null = null;
      let breachPsi: PsiMetric | null = null;
      monitor.onThresholdBreach((alert, psi) => {
        breachAlert = alert;
        breachPsi = psi;
      });

      const psi = makePsi(1.5, 2.0);
      monitor.recordMeasurement(psi);

      expect(breachAlert).toBe(AlertLevel.RED);
      expect(breachPsi).toBe(psi);
    });

    it("does not fire callback for GREEN or YELLOW measurements", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));

      let callCount = 0;
      monitor.onThresholdBreach(() => { callCount++; });

      monitor.recordMeasurement(makePsi(4.0, 2.0)); // GREEN
      monitor.recordMeasurement(makePsi(2.5, 2.0)); // YELLOW

      expect(callCount).toBe(0);
    });

    it("supports multiple callbacks", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));

      let count1 = 0;
      let count2 = 0;
      monitor.onThresholdBreach(() => { count1++; });
      monitor.onThresholdBreach(() => { count2++; });

      monitor.recordMeasurement(makePsi(1.0, 2.0)); // RED

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });
  });

  describe("getHistory", () => {
    it("returns all recorded measurements in order", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));

      monitor.recordMeasurement(makePsi(3.0, 2.0, 100));
      monitor.recordMeasurement(makePsi(2.8, 2.0, 200));
      monitor.recordMeasurement(makePsi(3.2, 2.0, 300));

      const history = monitor.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].timestamp_ms).toBe(100);
      expect(history[2].timestamp_ms).toBe(300);
    });

    it("returns a copy — mutations don't affect internal state", () => {
      const monitor = new RealTimeContinuityMonitorImpl();
      monitor.startMonitoring(makeSubject({ psiThreshold: 2.0 }));

      monitor.recordMeasurement(makePsi(3.0, 2.0));
      const history = monitor.getHistory();
      history.length = 0;

      expect(monitor.getHistory()).toHaveLength(1);
    });
  });
});
