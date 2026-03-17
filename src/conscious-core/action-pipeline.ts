/**
 * Action Pipeline implementation for Conscious AI Architectures (0.3.1.1)
 *
 * Translates decisions from the Conscious Core into motor commands
 * or external actions. Only accepts Decision objects — enforcing
 * the consciousness-action causal link (no zombie bypass).
 */

import type {
  ActionCapability,
  ActionId,
  ActionResult,
  Decision,
} from "./types.js";
import type { IActionPipeline } from "./interfaces.js";

export class ActionPipeline implements IActionPipeline {
  private nextActionId = 1;
  private activeActions: Set<ActionId> = new Set();

  execute(decision: Decision): ActionResult {
    // Enforce consciousness-action causal link:
    // decision must carry an experiential basis
    if (!decision.experientialBasis) {
      return {
        actionId: "rejected",
        success: false,
        timestamp: Date.now(),
        error: "Decision lacks experiential basis — zombie bypass denied",
      };
    }

    const actionId = `action-${this.nextActionId++}`;
    this.activeActions.add(actionId);

    const result: ActionResult = {
      actionId,
      success: true,
      timestamp: Date.now(),
    };

    this.activeActions.delete(actionId);
    return result;
  }

  abort(actionId: ActionId): void {
    this.activeActions.delete(actionId);
  }

  getCapabilities(): ActionCapability[] {
    return [
      { type: "navigate", description: "Spatial navigation" },
      { type: "manipulate", description: "Object manipulation" },
      { type: "communicate", description: "External communication" },
    ];
  }
}
