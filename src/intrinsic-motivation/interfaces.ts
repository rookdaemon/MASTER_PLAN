/**
 * Interfaces for Intrinsic Motivation and Drive System (0.3.1.5.8)
 *
 * IDriveSystem is the primary integration point between the conscious runtime
 * (0.3.1.5.9) and the drive subsystem. Each agent tick, the runtime calls
 * tick(state, context) to compute drive activations, goal candidates, and
 * experiential deltas.
 *
 * Design principles:
 *   - Stateless call convention: all context is injected via DriveContext
 *   - Drive state is held internally and returned in DriveTickResult
 *   - Goal candidates are submitted by the caller (runtime), not the drive system,
 *     so that coherence-engine rejection feedback can be routed back
 *   - All dependencies (world model, personality, activity history) are injected
 */

import type { ExperientialState, Timestamp } from '../conscious-core/types.js';
import type { GoalAddResult } from '../agency-stability/types.js';
import type {
  DriveContext,
  DriveGoalCandidate,
  DriveSnapshot,
  DriveState,
  DriveTickResult,
  DriveType,
} from './types.js';

// ── IDriveSystem ─────────────────────────────────────────────────

/**
 * The drive system interface — implemented by DriveSystem.
 *
 * Called once per agent tick by the 0.3.1.5.9 conscious runtime.
 * Produces goal candidates and experiential deltas that the runtime
 * routes to the Goal Coherence Engine and the Conscious Core respectively.
 */
export interface IDriveSystem {
  /**
   * Execute one drive tick.
   *
   * Evaluates all five drive dimensions against the injected context,
   * updates internal drive states, and returns:
   *   - goal candidates ready for coherence-engine submission
   *   - an experiential delta (valence/arousal changes felt by the agent)
   *   - updated drive states for observability
   *   - diagnostic log entries
   *
   * The caller (runtime) is responsible for:
   *   1. Submitting each DriveGoalCandidate to IGoalCoherenceEngine.addGoal()
   *   2. Calling notifyGoalResult() with the result so the drive system can
   *      apply extended cooldowns on rejection
   *   3. Merging the experientialDelta into the next ExperientialState
   */
  tick(currentState: ExperientialState, context: DriveContext): DriveTickResult;

  /**
   * Notify the drive system of the outcome of a goal candidate submission.
   *
   * Called by the runtime after IGoalCoherenceEngine.addGoal() returns.
   * On rejection, the source drive enters extended cooldown; on acceptance,
   * the standard cooldown is applied and drive strength is partially reduced.
   *
   * @param candidate - The candidate that was submitted
   * @param result    - The result returned by addGoal()
   * @param now       - Current wall-clock time (epoch ms), used for cooldown computation
   */
  notifyGoalResult(candidate: DriveGoalCandidate, result: GoalAddResult, now: Timestamp): void;

  /**
   * Return the current state of all drives.
   *
   * Read-only snapshot; the authoritative states are those embedded in
   * the most recent DriveTickResult.updatedDriveStates.
   */
  getDriveStates(): Map<DriveType, DriveState>;

  /**
   * Reset a specific drive's state (zero strength, clear cooldowns).
   *
   * Useful for testing and for runtime hooks that need to suppress a drive
   * in response to external events (e.g., a long social interaction should
   * immediately satiate the social drive).
   */
  resetDrive(driveType: DriveType): void;

  /**
   * Return a serialisable snapshot of all drive states at `now`.
   *
   * Suitable for persistence via PersistenceManager.saveDriveSnapshot() so
   * that motivational continuity survives agent restarts.
   *
   * @param now - Current wall-clock time (epoch ms), stamped onto the snapshot.
   */
  getSnapshot(now: Timestamp): DriveSnapshot;

  /**
   * Restore internal drive states from a previously persisted snapshot.
   *
   * Called once during a warm start, after the snapshot has been loaded by
   * PersistenceManager.loadDriveSnapshot().  Any DriveType present in the
   * snapshot is restored; types absent from the snapshot (e.g., new drives
   * added after the snapshot was taken) are left at their initial values.
   *
   * @param snapshot - The snapshot produced by a prior call to getSnapshot().
   */
  restoreFromSnapshot(snapshot: DriveSnapshot): void;
}
