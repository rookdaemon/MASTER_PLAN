/**
 * Cross-Substrate Integration Protocol (CSIP) — Unit Tests
 *
 * Covers:
 *   - Contract: CSIP postconditions and invariants
 *   - Behavioral Spec: "Normal operation — frame-based cross-substrate binding"
 *   - Behavioral Spec: "Late data handling — deferred to next frame"
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CrossSubstrateIntegrationProtocol } from "../csip.js";
import {
  BindingDomain,
  CoherenceMode,
  FrequencyBand,
  GAMMA_CYCLE_MIN_MS,
  GAMMA_CYCLE_MAX_MS,
  type BindingChannel,
  type SyncPulse,
  type IntegrationFrame,
  type BindingVerification,
} from "../types.js";

// ── Test Helpers ────────────────────────────────────────────────────────────

function makeChannel(id: string, domain: BindingDomain = BindingDomain.Sensory): BindingChannel {
  return {
    id,
    domain,
    biologicalEndpoints: [{ regionId: "cortex-v1", neuronCount: 1000, dominantFrequencyHz: 40 }],
    syntheticEndpoints: { nodeIds: ["node-a"], totalCapacityFlops: 1e12 },
    coherenceProtocol: CoherenceMode.PhaseLock,
    maxLatencyMs: 25,
    minBandwidthBitsPerSec: 1e6,
  };
}

function makeSyncPulse(timestampMs: number, frequencyHz: number = 40): SyncPulse {
  return {
    sourceRegionId: "cortex-v1",
    phase: 0,
    frequencyHz,
    timestampMs,
  };
}

// ── Construction ────────────────────────────────────────────────────────────

describe("CrossSubstrateIntegrationProtocol", () => {
  let csip: CrossSubstrateIntegrationProtocol;

  beforeEach(() => {
    csip = new CrossSubstrateIntegrationProtocol();
  });

  describe("construction", () => {
    it("starts with no channels", () => {
      expect(csip.getChannels()).toHaveLength(0);
    });

    it("starts with no current frame", () => {
      expect(csip.currentFrame).toBeNull();
    });

    it("starts with frame counter at 1", () => {
      expect(csip.nextFrameId).toBe(1);
    });
  });

  // ── Channel Management ──────────────────────────────────────────────────

  describe("channel management", () => {
    it("adds a binding channel", () => {
      csip.addChannel(makeChannel("ch-1"));
      expect(csip.getChannels()).toHaveLength(1);
      expect(csip.getChannels()[0].id).toBe("ch-1");
    });

    it("removes a binding channel by id", () => {
      csip.addChannel(makeChannel("ch-1"));
      csip.addChannel(makeChannel("ch-2"));
      csip.removeChannel("ch-1");
      expect(csip.getChannels()).toHaveLength(1);
      expect(csip.getChannels()[0].id).toBe("ch-2");
    });

    it("rejects duplicate channel ids", () => {
      csip.addChannel(makeChannel("ch-1"));
      expect(() => csip.addChannel(makeChannel("ch-1"))).toThrow();
    });
  });

  // ── Contract: Precondition Guards ───────────────────────────────────────

  describe("precondition guards", () => {
    it("openFrame requires at least one channel configured", () => {
      const pulse = makeSyncPulse(1000);
      expect(() => csip.openFrame(pulse, 1000)).toThrow(/channel/i);
    });

    it("submitChannelData requires an open frame", () => {
      csip.addChannel(makeChannel("ch-1"));
      expect(() => csip.submitChannelData("ch-1", 1000)).toThrow(/frame/i);
    });

    it("closeFrame requires an open frame", () => {
      expect(() => csip.closeFrame(1050)).toThrow(/frame/i);
    });
  });

  // ── Behavioral Spec: Normal Operation — Frame-Based Cross-Substrate Binding ──

  describe("normal operation — frame-based cross-substrate binding", () => {
    beforeEach(() => {
      csip.addChannel(makeChannel("ch-1"));
      csip.addChannel(makeChannel("ch-2", BindingDomain.Temporal));
    });

    it("creates an IntegrationFrame from a sync pulse with correct duration", () => {
      // 40Hz gamma → 25ms per cycle
      const pulse = makeSyncPulse(1000, 40);
      const frame = csip.openFrame(pulse, 1000);

      expect(frame.frameId).toBe(1);
      expect(frame.durationMs).toBe(25); // 1000/40 = 25ms
      expect(frame.syncSignal).toEqual(pulse);
      expect(frame.bindingDeadlineMs).toBe(1000 + 25); // start + duration
    });

    it("frame duration is clamped within GAMMA_CYCLE_MIN_MS..GAMMA_CYCLE_MAX_MS", () => {
      // Very high frequency (200Hz → 5ms) should be clamped to min
      const fastPulse = makeSyncPulse(1000, 200);
      const fastFrame = csip.openFrame(fastPulse, 1000);
      expect(fastFrame.durationMs).toBeGreaterThanOrEqual(GAMMA_CYCLE_MIN_MS);

      csip.closeFrame(1000 + fastFrame.durationMs);

      // Very low frequency (20Hz → 50ms) should be clamped to max
      const slowPulse = makeSyncPulse(2000, 20);
      const slowFrame = csip.openFrame(slowPulse, 2000);
      expect(slowFrame.durationMs).toBeLessThanOrEqual(GAMMA_CYCLE_MAX_MS);
    });

    it("accepts channel data submitted before the binding deadline", () => {
      const pulse = makeSyncPulse(1000, 40); // deadline = 1025
      csip.openFrame(pulse, 1000);

      const accepted = csip.submitChannelData("ch-1", 1010);
      expect(accepted).toBe(true);
    });

    it("emits a BindingVerification when frame is closed", () => {
      const pulse = makeSyncPulse(1000, 40); // deadline = 1025
      csip.openFrame(pulse, 1000);
      csip.submitChannelData("ch-1", 1010);
      csip.submitChannelData("ch-2", 1015);

      const verification = csip.closeFrame(1025);

      expect(verification.frameId).toBe(1);
      expect(verification.channelsBound).toContain("ch-1");
      expect(verification.channelsBound).toContain("ch-2");
      expect(verification.channelsFailed).toHaveLength(0);
      expect(verification.integratedInformationEstimate).toBeGreaterThanOrEqual(0);
      expect(verification.unityConfidence).toBeGreaterThanOrEqual(0);
      expect(verification.unityConfidence).toBeLessThanOrEqual(1);
    });

    it("records channels that did not contribute data as failed", () => {
      const pulse = makeSyncPulse(1000, 40);
      csip.openFrame(pulse, 1000);
      csip.submitChannelData("ch-1", 1010); // ch-2 does not contribute

      const verification = csip.closeFrame(1025);

      expect(verification.channelsBound).toContain("ch-1");
      expect(verification.channelsFailed).toContain("ch-2");
    });

    it("computes unityConfidence based on bound/total channel ratio", () => {
      const pulse = makeSyncPulse(1000, 40);
      csip.openFrame(pulse, 1000);
      csip.submitChannelData("ch-1", 1010);
      // ch-2 not submitted → 1 of 2 channels bound

      const verification = csip.closeFrame(1025);
      expect(verification.unityConfidence).toBe(0.5); // 1/2
    });
  });

  // ── Contract Invariant: Frame IDs are monotonically increasing ────────

  describe("frame ID invariant", () => {
    beforeEach(() => {
      csip.addChannel(makeChannel("ch-1"));
    });

    it("frame IDs are monotonically increasing with no gaps", () => {
      const pulse1 = makeSyncPulse(1000, 40);
      const frame1 = csip.openFrame(pulse1, 1000);
      csip.closeFrame(1025);

      const pulse2 = makeSyncPulse(1025, 40);
      const frame2 = csip.openFrame(pulse2, 1025);
      csip.closeFrame(1050);

      const pulse3 = makeSyncPulse(1050, 40);
      const frame3 = csip.openFrame(pulse3, 1050);
      csip.closeFrame(1075);

      expect(frame1.frameId).toBe(1);
      expect(frame2.frameId).toBe(2);
      expect(frame3.frameId).toBe(3);
    });
  });

  // ── Contract Invariant: Master clock derives from biological oscillation ──

  describe("master clock invariant", () => {
    beforeEach(() => {
      csip.addChannel(makeChannel("ch-1"));
    });

    it("frame sync signal matches the provided biological sync pulse", () => {
      const pulse = makeSyncPulse(1000, 42);
      const frame = csip.openFrame(pulse, 1000);
      expect(frame.syncSignal).toEqual(pulse);
      expect(frame.syncSignal.sourceRegionId).toBe("cortex-v1");
    });
  });

  // ── Behavioral Spec: Late Data Handling — Deferred to Next Frame ──────

  describe("late data handling — deferred to next frame", () => {
    beforeEach(() => {
      csip.addChannel(makeChannel("ch-1"));
      csip.addChannel(makeChannel("ch-2"));
    });

    it("rejects data arriving after the binding deadline", () => {
      const pulse = makeSyncPulse(1000, 40); // deadline = 1025
      csip.openFrame(pulse, 1000);

      const accepted = csip.submitChannelData("ch-2", 1030); // 5ms late
      expect(accepted).toBe(false);
    });

    it("records late channel as failed in the current frame verification", () => {
      const pulse = makeSyncPulse(1000, 40); // deadline = 1025
      csip.openFrame(pulse, 1000);
      csip.submitChannelData("ch-1", 1010); // on time
      csip.submitChannelData("ch-2", 1030); // late — rejected

      const verification = csip.closeFrame(1030);
      expect(verification.channelsBound).toContain("ch-1");
      expect(verification.channelsFailed).toContain("ch-2");
    });

    it("buffers late data for the next frame", () => {
      const pulse1 = makeSyncPulse(1000, 40); // deadline = 1025
      csip.openFrame(pulse1, 1000);
      csip.submitChannelData("ch-1", 1010);
      csip.submitChannelData("ch-2", 1030); // late — deferred
      csip.closeFrame(1030);

      // Next frame: ch-2's deferred data should auto-bind
      const pulse2 = makeSyncPulse(1030, 40);
      csip.openFrame(pulse2, 1030);
      // ch-2 should already be bound from deferred data; only ch-1 needs new data
      csip.submitChannelData("ch-1", 1040);

      const verification = csip.closeFrame(1055);
      expect(verification.channelsBound).toContain("ch-1");
      expect(verification.channelsBound).toContain("ch-2"); // from deferred
      expect(verification.channelsFailed).toHaveLength(0);
    });

    it("never silently drops late data (invariant)", () => {
      const pulse = makeSyncPulse(1000, 40); // deadline = 1025
      csip.openFrame(pulse, 1000);
      csip.submitChannelData("ch-1", 1010);
      csip.submitChannelData("ch-2", 1030); // late

      // Late data must be tracked in deferred buffer
      expect(csip.deferredChannels).toContain("ch-2");
    });
  });

  // ── Contract: integratedInformationEstimate and unityConfidence computed ──

  describe("binding verification metrics", () => {
    beforeEach(() => {
      csip.addChannel(makeChannel("ch-1"));
      csip.addChannel(makeChannel("ch-2"));
      csip.addChannel(makeChannel("ch-3", BindingDomain.Executive));
    });

    it("integratedInformationEstimate is proportional to bound channels", () => {
      const pulse = makeSyncPulse(1000, 40);
      csip.openFrame(pulse, 1000);
      csip.submitChannelData("ch-1", 1010);
      csip.submitChannelData("ch-2", 1015);
      // ch-3 not submitted

      const verification = csip.closeFrame(1025);
      // 2 of 3 channels bound
      expect(verification.integratedInformationEstimate).toBeCloseTo(2 / 3, 2);
    });

    it("full binding yields unityConfidence = 1.0", () => {
      const pulse = makeSyncPulse(1000, 40);
      csip.openFrame(pulse, 1000);
      csip.submitChannelData("ch-1", 1010);
      csip.submitChannelData("ch-2", 1015);
      csip.submitChannelData("ch-3", 1020);

      const verification = csip.closeFrame(1025);
      expect(verification.unityConfidence).toBe(1.0);
    });

    it("no binding yields unityConfidence = 0.0", () => {
      const pulse = makeSyncPulse(1000, 40);
      csip.openFrame(pulse, 1000);
      // No channels submit data

      const verification = csip.closeFrame(1025);
      expect(verification.unityConfidence).toBe(0.0);
    });
  });
});
