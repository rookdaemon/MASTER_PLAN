/**
 * Consciousness-Preserving Redundancy Module
 *
 * Implements redundancy architectures that maintain continuity of subjective
 * experience through component failures. Unlike conventional fault-tolerance,
 * this treats any subjective discontinuity as a system failure.
 *
 * See: docs/consciousness-preserving-redundancy/ARCHITECTURE.md
 */

export * from "./types.js";
export { createContinuityVerifier } from "./continuity-verifier.js";
export type { ContinuityVerifierImpl } from "./continuity-verifier.js";
export { createFailoverController } from "./failover-controller.js";
export type { FailoverControllerImpl } from "./failover-controller.js";
