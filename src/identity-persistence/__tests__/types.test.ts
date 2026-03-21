/**
 * Identity Persistence Verification — Type & Constant Tests
 *
 * Validates that all Threshold Registry constants match the card spec
 * and that type guards / contract invariants hold.
 *
 * Card 0.2.2.3: Identity Persistence Verification
 */
import { describe, it, expect } from "vitest";
import {
  OVERALL_CONFIDENCE_THRESHOLD,
  BASELINE_TEST_RETEST_MIN,
  BASELINE_MIN_OCCASIONS,
  DRIFT_WARNING_MULTIPLIER,
  DRIFT_CRITICAL_MULTIPLIER,
  INTER_RATER_RELIABILITY_MIN,
  SELF_COMPARISON_SCORE_FLOOR,
  DEFAULT_MONITORING_SCHEDULE,
} from "../types.js";

// ── Threshold Registry Constants ─────────────────────────────────────────────

describe("Threshold Registry", () => {
  it("overall_confidence_threshold = 0.95", () => {
    expect(OVERALL_CONFIDENCE_THRESHOLD).toBe(0.95);
  });

  it("baseline_test_retest_min = 0.8", () => {
    expect(BASELINE_TEST_RETEST_MIN).toBe(0.8);
  });

  it("baseline_min_occasions = 3", () => {
    expect(BASELINE_MIN_OCCASIONS).toBe(3);
  });

  it("drift_warning_multiplier = 1.5", () => {
    expect(DRIFT_WARNING_MULTIPLIER).toBe(1.5);
  });

  it("drift_critical_multiplier = 2.0", () => {
    expect(DRIFT_CRITICAL_MULTIPLIER).toBe(2.0);
  });

  it("inter_rater_reliability_min = 0.8", () => {
    expect(INTER_RATER_RELIABILITY_MIN).toBe(0.8);
  });

  it("self_comparison_score_floor = 0.95", () => {
    expect(SELF_COMPARISON_SCORE_FLOOR).toBe(0.95);
  });

  it("drift_critical_multiplier > drift_warning_multiplier", () => {
    expect(DRIFT_CRITICAL_MULTIPLIER).toBeGreaterThan(DRIFT_WARNING_MULTIPLIER);
  });

  it("all thresholds are within their valid ranges", () => {
    expect(OVERALL_CONFIDENCE_THRESHOLD).toBeGreaterThanOrEqual(0.9);
    expect(OVERALL_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(0.99);

    expect(BASELINE_TEST_RETEST_MIN).toBeGreaterThanOrEqual(0.7);
    expect(BASELINE_TEST_RETEST_MIN).toBeLessThanOrEqual(0.9);

    expect(BASELINE_MIN_OCCASIONS).toBeGreaterThanOrEqual(2);
    expect(BASELINE_MIN_OCCASIONS).toBeLessThanOrEqual(10);

    expect(DRIFT_WARNING_MULTIPLIER).toBeGreaterThanOrEqual(1.2);
    expect(DRIFT_WARNING_MULTIPLIER).toBeLessThanOrEqual(2.0);

    expect(DRIFT_CRITICAL_MULTIPLIER).toBeGreaterThanOrEqual(1.5);
    expect(DRIFT_CRITICAL_MULTIPLIER).toBeLessThanOrEqual(3.0);

    expect(INTER_RATER_RELIABILITY_MIN).toBeGreaterThanOrEqual(0.7);
    expect(INTER_RATER_RELIABILITY_MIN).toBeLessThanOrEqual(0.9);

    expect(SELF_COMPARISON_SCORE_FLOOR).toBeGreaterThanOrEqual(0.9);
    expect(SELF_COMPARISON_SCORE_FLOOR).toBeLessThanOrEqual(1.0);
  });
});

// ── Default Monitoring Schedule ──────────────────────────────────────────────

describe("Default Monitoring Schedule", () => {
  it("includes T+1d, T+1w, T+1m, T+1y intervals", () => {
    const intervals = DEFAULT_MONITORING_SCHEDULE.intervals;
    expect(intervals).toHaveLength(4);
    expect(intervals[0]).toEqual({ value: 1, unit: "day" });
    expect(intervals[1]).toEqual({ value: 1, unit: "week" });
    expect(intervals[2]).toEqual({ value: 1, unit: "month" });
    expect(intervals[3]).toEqual({ value: 1, unit: "year" });
  });
});
