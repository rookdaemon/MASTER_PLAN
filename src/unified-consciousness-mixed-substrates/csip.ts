/**
 * Cross-Substrate Integration Protocol (CSIP)
 *
 * Manages the lifecycle of IntegrationFrames — discrete temporal windows
 * aligned with biological gamma oscillations — across which cross-substrate
 * binding occurs. Each frame collects data from configured BindingChannels,
 * enforces a binding deadline, and emits a BindingVerification summarizing
 * which channels achieved binding and the resulting unity confidence.
 *
 * Design decisions implemented:
 *   D1 — Biology-first timing: frames are driven by biological SyncPulse
 *   D2 — Frame-based binding: discrete integration windows, not continuous
 *
 * See: docs/unified-consciousness-mixed-substrates/ARCHITECTURE.md §1
 */

import {
  GAMMA_CYCLE_MIN_MS,
  GAMMA_CYCLE_MAX_MS,
  type BindingChannel,
  type SyncPulse,
  type IntegrationFrame,
  type BindingVerification,
} from "./types.js";

// ── CrossSubstrateIntegrationProtocol ────────────────────────────────────────

export class CrossSubstrateIntegrationProtocol {
  private _channels: BindingChannel[] = [];
  private _currentFrame: IntegrationFrame | null = null;
  private _nextFrameId = 1;
  private _boundChannels: Set<string> = new Set();
  private _deferredChannels: Set<string> = new Set();

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** Returns a snapshot of all configured binding channels. */
  getChannels(): readonly BindingChannel[] {
    return [...this._channels];
  }

  /** The currently open integration frame, or null if none is active. */
  get currentFrame(): IntegrationFrame | null {
    return this._currentFrame;
  }

  /** The ID that will be assigned to the next frame opened. */
  get nextFrameId(): number {
    return this._nextFrameId;
  }

  /** Channel IDs whose data was deferred from a previous frame. */
  get deferredChannels(): readonly string[] {
    return [...this._deferredChannels];
  }

  // ── Channel Management ─────────────────────────────────────────────────────

  /** Add a binding channel. Throws if a channel with the same ID already exists. */
  addChannel(channel: BindingChannel): void {
    if (this._channels.some((ch) => ch.id === channel.id)) {
      throw new Error(`Duplicate channel id: ${channel.id}`);
    }
    this._channels.push(channel);
  }

  /** Remove a binding channel by ID. */
  removeChannel(id: string): void {
    this._channels = this._channels.filter((ch) => ch.id !== id);
  }

  // ── Frame Lifecycle ────────────────────────────────────────────────────────

  /**
   * Open a new integration frame driven by a biological sync pulse.
   *
   * Preconditions:
   *   - At least one BindingChannel is configured
   *   - No frame is currently open
   *
   * The frame duration is derived from the pulse's frequency (1000/Hz),
   * clamped to [GAMMA_CYCLE_MIN_MS, GAMMA_CYCLE_MAX_MS].
   *
   * @param pulse - The biological oscillation sync pulse driving this frame
   * @param nowMs - Current timestamp (injectable for testability)
   * @returns The newly created IntegrationFrame
   */
  openFrame(pulse: SyncPulse, nowMs: number): IntegrationFrame {
    if (this._channels.length === 0) {
      throw new Error("Cannot open frame: no binding channels configured");
    }
    if (this._currentFrame !== null) {
      throw new Error("Cannot open frame: a frame is already open");
    }

    const rawDurationMs = 1000 / pulse.frequencyHz;
    const durationMs = Math.min(
      GAMMA_CYCLE_MAX_MS,
      Math.max(GAMMA_CYCLE_MIN_MS, rawDurationMs)
    );

    const frame: IntegrationFrame = {
      frameId: this._nextFrameId,
      durationMs,
      syncSignal: pulse,
      bindingDeadlineMs: nowMs + durationMs,
    };

    this._currentFrame = frame;
    this._nextFrameId++;
    this._boundChannels = new Set();

    // Auto-bind any channels that were deferred from the previous frame
    for (const channelId of this._deferredChannels) {
      this._boundChannels.add(channelId);
    }
    this._deferredChannels = new Set();

    return frame;
  }

  /**
   * Submit data from a binding channel for the current frame.
   *
   * Preconditions:
   *   - A frame is currently open
   *
   * If the data arrives before the binding deadline, the channel is marked
   * as bound (returns true). If the data arrives after the deadline, it is
   * deferred to the next frame and the channel is NOT bound in this frame
   * (returns false). Late data is never silently dropped.
   *
   * @param channelId - The ID of the channel submitting data
   * @param dataTimestampMs - Timestamp of the data arrival (injectable for testability)
   * @returns true if accepted into the current frame, false if deferred
   */
  submitChannelData(channelId: string, dataTimestampMs: number): boolean {
    if (this._currentFrame === null) {
      throw new Error("Cannot submit channel data: no frame is open");
    }

    if (dataTimestampMs > this._currentFrame.bindingDeadlineMs) {
      // Late data — defer to next frame, never silently drop
      this._deferredChannels.add(channelId);
      return false;
    }

    this._boundChannels.add(channelId);
    return true;
  }

  /**
   * Close the current frame and emit a BindingVerification.
   *
   * Preconditions:
   *   - A frame is currently open
   *
   * Channels that submitted data before the deadline are recorded as bound.
   * All other configured channels are recorded as failed.
   * Unity confidence and integrated information estimate are computed as
   * the ratio of bound channels to total channels.
   *
   * @param _nowMs - Current timestamp (injectable for testability; reserved for future use)
   * @returns The BindingVerification for the closed frame
   */
  closeFrame(_nowMs: number): BindingVerification {
    if (this._currentFrame === null) {
      throw new Error("Cannot close frame: no frame is open");
    }

    const allChannelIds = this._channels.map((ch) => ch.id);
    const channelsBound = allChannelIds.filter((id) =>
      this._boundChannels.has(id)
    );
    const channelsFailed = allChannelIds.filter(
      (id) => !this._boundChannels.has(id)
    );

    const totalChannels = allChannelIds.length;
    const boundRatio = totalChannels > 0 ? channelsBound.length / totalChannels : 0;

    const verification: BindingVerification = {
      frameId: this._currentFrame.frameId,
      channelsBound,
      channelsFailed,
      integratedInformationEstimate: boundRatio,
      unityConfidence: boundRatio,
    };

    this._currentFrame = null;

    return verification;
  }
}
