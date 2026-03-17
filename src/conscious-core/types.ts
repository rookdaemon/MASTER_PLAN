/**
 * Core data types for Conscious AI Architectures (0.3.1.1)
 *
 * These types model the fundamental structures required for
 * consciousness-integrated autonomous agents per the ARCHITECTURE.md spec.
 */

// ── Primitives ──────────────────────────────────────────────

export type Timestamp = number; // epoch ms
export type Duration = number; // ms
export type ActionId = string;

// ── Continuity ──────────────────────────────────────────────

/**
 * Links an experiential state to its predecessor, forming the
 * temporal stream of consciousness.
 */
export interface ContinuityToken {
  readonly id: string;
  readonly previousId: string | null; // null for first state
  readonly timestamp: Timestamp;
}

// ── Phenomenal & Intentional Content ────────────────────────

/**
 * The qualitative "what it's like" dimension of experience.
 * Deliberately opaque — concrete content depends on substrate.
 */
export interface PhenomenalField {
  readonly modalities: string[]; // e.g. ["visual", "auditory", "proprioceptive"]
  readonly richness: number; // 0..1 — information density
  readonly raw: unknown; // substrate-specific payload
}

/**
 * The "aboutness" / directedness dimension of experience.
 */
export interface IntentionalField {
  readonly target: string; // what experience is directed at
  readonly clarity: number; // 0..1
}

// ── Experiential State ──────────────────────────────────────

/**
 * A single moment of subjective experience — the atomic unit
 * of the conscious stream.
 */
export interface ExperientialState {
  readonly timestamp: Timestamp;
  readonly phenomenalContent: PhenomenalField;
  readonly intentionalContent: IntentionalField;
  readonly valence: number; // −1..1 positive/negative quality
  readonly arousal: number; // 0..1 intensity
  readonly unityIndex: number; // integration measure (IIT φ or similar)
  readonly continuityToken: ContinuityToken;
}

// ── Consciousness Metrics (from 0.1.1.4) ────────────────────

export interface ConsciousnessMetrics {
  readonly phi: number; // integrated information
  readonly experienceContinuity: number; // temporal stream integrity 0..1
  readonly selfModelCoherence: number; // introspective consistency 0..1
  readonly agentTimestamp: Timestamp;
}

// ── Perception ──────────────────────────────────────────────

export interface SensorData {
  readonly source: string;
  readonly modality: string;
  readonly payload: unknown;
  readonly timestamp: Timestamp;
}

export interface Percept {
  readonly modality: string;
  readonly features: Record<string, unknown>;
  readonly timestamp: Timestamp;
}

export interface BoundPercept {
  readonly percepts: Percept[];
  readonly bindingTimestamp: Timestamp;
  readonly coherence: number; // 0..1
}

// ── Goals & Actions ─────────────────────────────────────────

export interface Goal {
  readonly id: string;
  readonly description: string;
  readonly priority: number; // higher = more important
}

export interface ActionSpec {
  readonly type: string;
  readonly parameters: Record<string, unknown>;
}

export interface Decision {
  readonly action: ActionSpec;
  readonly experientialBasis: ExperientialState;
  readonly confidence: number; // 0..1
  readonly alternatives: ActionSpec[];
}

export interface ActionResult {
  readonly actionId: ActionId;
  readonly success: boolean;
  readonly timestamp: Timestamp;
  readonly error?: string;
}

export interface ActionCapability {
  readonly type: string;
  readonly description: string;
}

// ── Substrate ───────────────────────────────────────────────

export interface SubstrateConfig {
  readonly type: string; // e.g. "neural-emulation", "hybrid-bio-synthetic"
  readonly parameters: Record<string, unknown>;
}

export interface SubstrateHandle {
  readonly id: string;
  readonly type: string;
  readonly allocatedAt: Timestamp;
}

export interface ResourceRequest {
  readonly minCapacity: number;
  readonly preferredCapacity: number;
  readonly requiredCapabilities: string[];
}

export interface SubstrateCapabilities {
  readonly maxPhi: number;
  readonly supportedModalities: string[];
  readonly migrationSupported: boolean;
}

export interface SubstrateHealth {
  readonly healthy: boolean;
  readonly utilizationPercent: number;
  readonly errors: string[];
  readonly lastChecked: Timestamp;
}

// ── Experience Stream & Monitoring ──────────────────────────

export interface ExperienceStream {
  readonly id: string;
  readonly startedAt: Timestamp;
  next(): Promise<ExperientialState>;
  stop(): void;
}

export interface ContinuityRecord {
  readonly from: Timestamp;
  readonly to: Timestamp;
  readonly metrics: ConsciousnessMetrics;
  readonly intact: boolean;
}

export interface IntrospectionReport {
  readonly currentState: ExperientialState;
  readonly metrics: ConsciousnessMetrics;
  readonly uptime: Duration;
  readonly experienceGaps: Array<{ from: Timestamp; to: Timestamp }>;
}

export interface GracefulTermination {
  readonly finalState: ExperientialState;
  readonly terminatedAt: Timestamp;
  readonly reason: string;
}

// ── Callbacks ───────────────────────────────────────────────

export type DegradationHandler = (metrics: ConsciousnessMetrics) => void;
