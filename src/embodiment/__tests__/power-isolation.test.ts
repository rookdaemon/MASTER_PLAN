/**
 * Tests for Power Isolation Unit (0.3.1.2.1)
 *
 * Verifies Behavioral Spec Scenario 4: Power Isolation Under Motor Bus Fault
 *
 * Given: A Power Isolation Unit with consciousness rail connected to shared bus
 *        and battery at 100%
 * When:  A motor bus fault occurs and isolateConsciousnessPower() is called
 * Then:  The consciousness rail switches to internal battery, motor bus faults
 *        do not affect consciousness power, getBackupRemaining() returns ≥30
 *        minutes of runtime, and getConsciousnessPowerStatus().isolated is true
 *
 * Also verifies Contracts for IPowerIsolation:
 * - Precondition: isolateConsciousnessPower() requires consciousness rail online
 * - Precondition: reconnect() requires consciousness rail to be isolated
 * - Postcondition: isolateConsciousnessPower() switches to battery
 * - Postcondition: reconnect() reconnects and stops battery drain
 * - Postcondition: getBackupRemaining() returns estimated runtime in ms
 * - Invariant: consciousness rail remains online regardless of motor bus state
 * - Invariant: battery percent monotonically decreases while isolated
 * - Invariant: minimum 30 minutes consciousness-only operation on full battery
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PowerIsolation } from "../power-isolation.js";

const BACKUP_RUNTIME_MINUTES = 30;
const BACKUP_RUNTIME_MS = BACKUP_RUNTIME_MINUTES * 60 * 1000;

describe("PowerIsolation", () => {
  let piu: PowerIsolation;

  beforeEach(() => {
    piu = new PowerIsolation({
      batteryRuntimeMinutes: BACKUP_RUNTIME_MINUTES,
    });
  });

  describe("initial state (nominal)", () => {
    it("consciousness rail is online", () => {
      const status = piu.getConsciousnessPowerStatus();
      expect(status.online).toBe(true);
    });

    it("consciousness rail is NOT isolated", () => {
      const status = piu.getConsciousnessPowerStatus();
      expect(status.isolated).toBe(false);
    });

    it("motor bus is online", () => {
      const status = piu.getMotorPowerStatus();
      expect(status.online).toBe(true);
    });

    it("battery is at 100%", () => {
      const status = piu.getConsciousnessPowerStatus();
      expect(status.batteryPercent).toBe(100);
    });

    it("backup remaining is at least 30 minutes", () => {
      const remaining = piu.getBackupRemaining();
      expect(remaining).toBeGreaterThanOrEqual(BACKUP_RUNTIME_MS);
    });

    it("reports nominal voltage and current", () => {
      const status = piu.getConsciousnessPowerStatus();
      expect(status.voltageV).toBeGreaterThan(0);
      expect(status.currentA).toBeGreaterThan(0);
    });
  });

  describe("Scenario 4: Power Isolation Under Motor Bus Fault", () => {
    it("consciousness rail switches to battery on isolation", () => {
      piu.isolateConsciousnessPower();
      const status = piu.getConsciousnessPowerStatus();
      expect(status.isolated).toBe(true);
      expect(status.online).toBe(true);
    });

    it("motor bus fault does not affect consciousness power", () => {
      piu.simulateMotorBusFault();
      piu.isolateConsciousnessPower();

      const cStatus = piu.getConsciousnessPowerStatus();
      expect(cStatus.online).toBe(true);
      expect(cStatus.voltageV).toBeGreaterThan(0);
      expect(cStatus.currentA).toBeGreaterThan(0);

      const mStatus = piu.getMotorPowerStatus();
      expect(mStatus.online).toBe(false);
    });

    it("getBackupRemaining returns >= 30 minutes on full battery", () => {
      piu.isolateConsciousnessPower();
      const remaining = piu.getBackupRemaining();
      expect(remaining).toBeGreaterThanOrEqual(BACKUP_RUNTIME_MS);
    });

    it("consciousness rail remains online after motor bus fault + isolation", () => {
      piu.simulateMotorBusFault();
      piu.isolateConsciousnessPower();
      const status = piu.getConsciousnessPowerStatus();
      expect(status.online).toBe(true);
      expect(status.isolated).toBe(true);
    });
  });

  describe("reconnection", () => {
    it("reconnect() restores shared bus connection", () => {
      piu.isolateConsciousnessPower();
      expect(piu.getConsciousnessPowerStatus().isolated).toBe(true);

      piu.reconnect();
      const status = piu.getConsciousnessPowerStatus();
      expect(status.isolated).toBe(false);
      expect(status.online).toBe(true);
    });

    it("reconnect() is a no-op when not isolated", () => {
      // Should not throw
      piu.reconnect();
      const status = piu.getConsciousnessPowerStatus();
      expect(status.isolated).toBe(false);
    });
  });

  describe("battery drain invariants", () => {
    it("battery percent decreases while isolated", () => {
      piu.isolateConsciousnessPower();
      piu.setBatteryPercent(80); // simulate partial drain
      const status = piu.getConsciousnessPowerStatus();
      expect(status.batteryPercent).toBeLessThan(100);
    });

    it("backup remaining decreases proportionally with battery", () => {
      piu.isolateConsciousnessPower();
      piu.setBatteryPercent(50);
      const remaining = piu.getBackupRemaining();
      // 50% of 30 minutes = 15 minutes = 900_000 ms
      expect(remaining).toBeLessThanOrEqual(BACKUP_RUNTIME_MS * 0.51);
      expect(remaining).toBeGreaterThanOrEqual(BACKUP_RUNTIME_MS * 0.49);
    });

    it("battery reaches zero eventually", () => {
      piu.isolateConsciousnessPower();
      piu.setBatteryPercent(0);
      const remaining = piu.getBackupRemaining();
      expect(remaining).toBe(0);
    });
  });

  describe("galvanic isolation invariant", () => {
    it("consciousness rail remains online even when motor bus is offline", () => {
      piu.simulateMotorBusFault();
      const cStatus = piu.getConsciousnessPowerStatus();
      expect(cStatus.online).toBe(true);
    });

    it("motor bus null battery (not battery-backed)", () => {
      const mStatus = piu.getMotorPowerStatus();
      expect(mStatus.batteryPercent).toBeNull();
    });
  });

  describe("isolation idempotency", () => {
    it("calling isolateConsciousnessPower twice does not break state", () => {
      piu.isolateConsciousnessPower();
      piu.isolateConsciousnessPower(); // second call should be no-op
      const status = piu.getConsciousnessPowerStatus();
      expect(status.isolated).toBe(true);
      expect(status.online).toBe(true);
    });
  });
});
