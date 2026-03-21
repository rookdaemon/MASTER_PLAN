/**
 * Continuity-Preserving Transfer Protocols Module
 *
 * Implements gradual neuronal replacement that maintains unbroken subjective
 * experience during biological-to-synthetic substrate transition.
 *
 * See: docs/continuity-preserving-transfer/ARCHITECTURE.md
 */

export * from "./types.js";
export { SubjectContinuityConfirmationImpl } from "./subject-continuity-confirmation.js";
export { RealTimeContinuityMonitorImpl } from "./real-time-continuity-monitor.js";
export { RollbackEngineImpl } from "./rollback-engine.js";
export { ReplacementProtocolEngineImpl, type NeuronTopologyProvider, type PsiMeasurer } from "./replacement-protocol-engine.js";
