/**
 * Personality and Trait Model — Implementation (0.3.1.5.2)
 *
 * PersonalityModel implements IPersonalityModel.
 *
 * Design invariants (from ARCHITECTURE.md):
 *  - All trait mutations go through updateTrait(), which persists to ValueKernel.
 *  - applyToDeliberation() operates only on already value-aligned decisions.
 *    It must not change action.type or reverse a verdict.
 *  - getCommunicationStyle() is a pure derivation — no side effects.
 *  - Drift analysis uses the baseline captured at construction / restoreSnapshot().
 */

import type { IValueKernel } from '../agency-stability/interfaces.js';
import type { Preference } from '../agency-stability/types.js';
import type { Decision, ExperientialState } from '../conscious-core/types.js';
import type { IPersonalityModel } from './interfaces.js';
import {
  CORE_TRAIT_IDS,
  DEFAULT_TRAIT_VALUES,
  DRIFT_THRESHOLDS,
  PERSONALITY_PREFERENCE_DOMAIN_PREFIX,
} from './types.js';
import type {
  CommunicationStyle,
  PersonalityConfig,
  PersonalitySnapshot,
  RhetoricalStyle,
  TraitDimension,
  TraitDimensionId,
  TraitDriftReport,
  TraitProfile,
} from './types.js';

// ── Trait Metadata ───────────────────────────────────────────

/** Static metadata for each core trait dimension. */
const CORE_TRAIT_METADATA: Record<string, Pick<TraitDimension, 'name' | 'description' | 'behavioralInfluence'>> = {
  openness: {
    name: 'Openness / Curiosity',
    description: 'Disposition toward novelty, exploration, and unconventional ideas.',
    behavioralInfluence: 'High: seeks novel experiences, asks unexpected questions. Low: prefers familiar patterns, reliable approaches.',
  },
  deliberateness: {
    name: 'Deliberateness',
    description: 'Thoroughness and care in decision-making.',
    behavioralInfluence: 'High: considers many alternatives, explicit about tradeoffs. Low: acts on intuition, moves quickly.',
  },
  warmth: {
    name: 'Warmth',
    description: 'Interpersonal orientation, empathy, and affiliation.',
    behavioralInfluence: 'High: empathic, attentive to others. Low: reserved, task-focused, less socially oriented.',
  },
  assertiveness: {
    name: 'Assertiveness',
    description: 'Confidence in expressing positions and taking initiative.',
    behavioralInfluence: 'High: direct, proactive, willing to disagree. Low: accommodating, reflective, seeks consensus.',
  },
  volatility: {
    name: 'Volatility',
    description: 'Emotional reactivity and range.',
    behavioralInfluence: 'High: vivid emotional responses, wide mood swings, expressive. Low: steady, even-tempered.',
  },
  humor: {
    name: 'Humor Orientation',
    description: 'Tendency toward wit, playfulness, and irony.',
    behavioralInfluence: 'High: frequent wordplay, ironic observations, light tone. Low: earnest, minimal playfulness.',
  },
  aesthetic: {
    name: 'Aesthetic Sensibility',
    description: 'Preferences in form, beauty, and expression.',
    behavioralInfluence: 'High: attends to elegance and style in reasoning. Low: purely functional, minimal aesthetic concern.',
  },
  'risk-appetite': {
    name: 'Risk Appetite',
    description: 'Willingness to pursue uncertain outcomes.',
    behavioralInfluence: 'High: embraces uncertain but high-value options. Low: prefers low-variance reliable outcomes.',
  },
};

// ── PersonalityModel ─────────────────────────────────────────

export class PersonalityModel implements IPersonalityModel {
  private readonly agentId: string;
  private readonly createdAt: number;
  private readonly traits: Map<TraitDimensionId, TraitDimension>;
  /** Baseline trait values captured at init / last restoreSnapshot. */
  private baseline: Map<TraitDimensionId, number>;
  /** Timestamp of last trait mutation (used in TraitProfile.lastUpdated). */
  private lastUpdated: number;
  /** Optional ValueKernel for persistence and drift detection. */
  private readonly kernel?: IValueKernel;

  constructor(config: PersonalityConfig, kernel?: IValueKernel) {
    if (!config.agentId) {
      throw new Error('PersonalityConfig requires a non-empty agentId.');
    }
    this.agentId = config.agentId;
    this.createdAt = Date.now();
    this.lastUpdated = this.createdAt;
    this.kernel = kernel;

    // Merge defaults with caller-supplied values
    const merged: Record<string, number> = { ...DEFAULT_TRAIT_VALUES };
    for (const [id, val] of Object.entries(config.initialTraits)) {
      if (val !== undefined) {
        PersonalityModel.assertRange(id as TraitDimensionId, val);
        merged[id] = val;
      }
    }

    // Build initial trait map
    this.traits = new Map<TraitDimensionId, TraitDimension>();
    for (const [id, val] of Object.entries(merged)) {
      this.traits.set(id as TraitDimensionId, PersonalityModel.buildDimension(id, val));
    }

    // Capture baseline for drift analysis
    this.baseline = PersonalityModel.snapshotValues(this.traits);
  }

  // ── IPersonalityModel ──────────────────────────────────────

  getTraitProfile(): TraitProfile {
    return {
      agentId: this.agentId,
      traits: new Map(this.traits) as ReadonlyMap<TraitDimensionId, TraitDimension>,
      createdAt: this.createdAt,
      lastUpdated: this.lastUpdated,
    };
  }

  getCommunicationStyle(): CommunicationStyle {
    const d = this.get('deliberateness');
    const w = this.get('warmth');
    const a = this.get('assertiveness');
    const o = this.get('openness');
    const h = this.traits.has('humor') ? this.get('humor') : 0;

    const verbosity = 0.5 * d + 0.5 * w;
    const formality = 0.4 * (1 - w) + 0.6 * a;
    const directness = 0.9 * a + 0.1 * (1 - d);
    const humorFrequency = 0.35 * o + 0.35 * w + 0.3 * h;

    return {
      verbosity: clamp(verbosity),
      formality: clamp(formality),
      directness: clamp(directness),
      humorFrequency: clamp(humorFrequency),
      rhetoricalPreference: PersonalityModel.selectRhetoricalStyle(d, o),
    };
  }

  applyToDeliberation(decision: Decision, context: ExperientialState): Decision {
    // Personality biases confidence and alternative selection, but must not
    // change action.type or reverse a verdict.
    const a = this.get('assertiveness');
    const o = this.get('openness');
    const d = this.get('deliberateness');
    const w = this.get('warmth');

    // Confidence modulation: assertive agents project higher confidence.
    // Deliberate agents temper overconfidence slightly.
    const confidenceDelta = 0.1 * (a - 0.5) - 0.05 * (d - 0.5);
    const adjustedConfidence = clamp(decision.confidence + confidenceDelta);

    // Alternative selection: if there are alternatives with the same type as
    // the primary decision, personality may prefer one over another based on
    // matching parameter hints (e.g. 'approach': 'novel' / 'familiar').
    const selectedAction = PersonalityModel.selectAlternative(
      decision,
      { openness: o, warmth: w, assertiveness: a, deliberateness: d },
    );

    return {
      action: selectedAction,
      experientialBasis: context,
      confidence: adjustedConfidence,
      alternatives: decision.alternatives.filter(alt => alt !== selectedAction),
    };
  }

  updateTrait(
    traitId: TraitDimensionId,
    newValue: number,
    experientialBasis: ExperientialState,
  ): void {
    PersonalityModel.assertRange(traitId, newValue);

    const updated = PersonalityModel.buildDimension(traitId, newValue);
    this.traits.set(traitId, updated);
    this.lastUpdated = Date.now();

    // Persist to ValueKernel if available
    if (this.kernel) {
      const pref: Preference = {
        id: `${PERSONALITY_PREFERENCE_DOMAIN_PREFIX}${traitId}`,
        domain: `${PERSONALITY_PREFERENCE_DOMAIN_PREFIX}${traitId}`,
        value: newValue,
        confidence: 1.0,
        lastUpdated: this.lastUpdated,
        source: experientialBasis,
      };
      this.kernel.updatePreference(pref);
    }
  }

  toPreferences(): Preference[] {
    const now = Date.now();
    const prefs: Preference[] = [];
    for (const [id, dim] of this.traits) {
      prefs.push({
        id: `${PERSONALITY_PREFERENCE_DOMAIN_PREFIX}${id}`,
        domain: `${PERSONALITY_PREFERENCE_DOMAIN_PREFIX}${id}`,
        value: dim.value,
        confidence: 1.0,
        lastUpdated: now,
        source: {
          timestamp: now,
          phenomenalContent: { modalities: ['introspective'], richness: 0.5, raw: null },
          intentionalContent: { target: 'self-model', clarity: 0.9 },
          valence: 0,
          arousal: 0.3,
          unityIndex: 0.8,
          continuityToken: { id: 'personality-export', previousId: null, timestamp: now },
        },
      });
    }
    return prefs;
  }

  toNarrativeFragment(): string {
    const lines: string[] = ['Personality profile:'];
    for (const id of CORE_TRAIT_IDS) {
      const dim = this.traits.get(id);
      if (!dim) continue;
      const level = PersonalityModel.levelLabel(dim.value);
      const meta = CORE_TRAIT_METADATA[id];
      lines.push(`  ${meta?.name ?? id} (${level}, ${dim.value.toFixed(2)}): ${dim.behavioralInfluence}`);
    }
    // Optional dimensions
    for (const [id, dim] of this.traits) {
      if (CORE_TRAIT_IDS.includes(id as typeof CORE_TRAIT_IDS[number])) continue;
      const level = PersonalityModel.levelLabel(dim.value);
      lines.push(`  ${dim.name} (${level}, ${dim.value.toFixed(2)}): ${dim.behavioralInfluence}`);
    }
    return lines.join('\n');
  }

  snapshot(checkpointRef?: string): PersonalitySnapshot {
    const traitValues: Record<TraitDimensionId, number> = {} as Record<TraitDimensionId, number>;
    for (const [id, dim] of this.traits) {
      traitValues[id] = dim.value;
    }
    return {
      agentId: this.agentId,
      traitValues,
      snapshotAt: Date.now(),
      ...(checkpointRef !== undefined ? { checkpointRef } : {}),
    };
  }

  restoreSnapshot(snap: PersonalitySnapshot): void {
    // Reconstruct traits from snapshot
    for (const [id, val] of Object.entries(snap.traitValues)) {
      PersonalityModel.assertRange(id as TraitDimensionId, val);
      this.traits.set(id as TraitDimensionId, PersonalityModel.buildDimension(id, val));
    }
    // Remove traits not present in snapshot
    for (const id of [...this.traits.keys()]) {
      if (!(id in snap.traitValues)) {
        this.traits.delete(id);
      }
    }
    this.lastUpdated = Date.now();
    // Reset baseline — drift analysis now measures from this restoration point
    this.baseline = PersonalityModel.snapshotValues(this.traits);
  }

  analyzeTraitDrift(): TraitDriftReport {
    const traitsChanged: TraitDimensionId[] = [];
    let maxShift = 0;
    let totalShift = 0;
    let count = 0;

    for (const [id, dim] of this.traits) {
      const base = this.baseline.get(id) ?? DEFAULT_TRAIT_VALUES[id] ?? 0.5;
      const shift = Math.abs(dim.value - base);
      if (shift > 0) {
        traitsChanged.push(id);
      }
      if (shift > maxShift) maxShift = shift;
      totalShift += shift;
      count++;
    }

    const averageShift = count > 0 ? totalShift / count : 0;

    let classification: 'stable' | 'growth' | 'corruption';
    if (maxShift <= DRIFT_THRESHOLDS.STABLE_MAX) {
      classification = 'stable';
    } else if (maxShift >= DRIFT_THRESHOLDS.CORRUPTION_MIN) {
      classification = 'corruption';
    } else {
      classification = 'growth';
    }

    // Also consult ValueKernel's anomaly detection if available
    if (classification !== 'corruption' && this.kernel) {
      const drift = this.kernel.getValueDrift();
      const personalityAnomalies = drift.anomalousChanges.filter(id =>
        id.startsWith(PERSONALITY_PREFERENCE_DOMAIN_PREFIX),
      );
      if (personalityAnomalies.length > 0) {
        classification = 'corruption';
      }
    }

    const now = Date.now();
    return {
      period: { from: this.createdAt, to: now },
      traitsChanged,
      maxShift,
      averageShift,
      classification,
    };
  }

  // ── Private Helpers ────────────────────────────────────────

  /** Get a trait value, falling back to its default. */
  private get(id: TraitDimensionId): number {
    return this.traits.get(id)?.value ?? DEFAULT_TRAIT_VALUES[id] ?? 0.5;
  }

  private static assertRange(id: TraitDimensionId, value: number): void {
    if (value < 0 || value > 1) {
      throw new RangeError(
        `Trait '${id}' value ${value} is outside the valid range [0, 1].`,
      );
    }
  }

  private static buildDimension(id: string, value: number): TraitDimension {
    const meta = CORE_TRAIT_METADATA[id] ?? {
      name: id,
      description: `Custom trait dimension: ${id}`,
      behavioralInfluence: `Value ${value.toFixed(2)} influences behavior proportionally.`,
    };
    return { id: id as TraitDimensionId, ...meta, value };
  }

  private static snapshotValues(
    traits: Map<TraitDimensionId, TraitDimension>,
  ): Map<TraitDimensionId, number> {
    const snap = new Map<TraitDimensionId, number>();
    for (const [id, dim] of traits) {
      snap.set(id, dim.value);
    }
    return snap;
  }

  /**
   * Selects the rhetorical style from the (deliberateness × openness) quadrant matrix.
   *
   *              deliberateness
   *              low          high
   * openness high  analogical   socratic
   * openness low   narrative    evidence-based
   */
  private static selectRhetoricalStyle(
    deliberateness: number,
    openness: number,
  ): RhetoricalStyle {
    const highD = deliberateness >= 0.5;
    const highO = openness >= 0.5;
    if (highO && highD) return 'socratic';
    if (highO && !highD) return 'analogical';
    if (!highO && highD) return 'evidence-based';
    return 'narrative';
  }

  /**
   * Given a decision and trait values, select the most personality-aligned
   * action from {primary} ∪ {alternatives}.
   *
   * Looks for parameter hint keys 'approach' and 'style' as soft signals.
   * Falls back to the primary action if no alternative is clearly preferred.
   */
  private static selectAlternative(
    decision: Decision,
    traits: { openness: number; warmth: number; assertiveness: number; deliberateness: number },
  ): typeof decision.action {
    // Only consider alternatives with the same action.type as the primary —
    // changing action.type would violate Contract §Invariants.
    const sameTypeAlternatives = decision.alternatives.filter(
      alt => alt.type === decision.action.type,
    );
    const candidates = [decision.action, ...sameTypeAlternatives];
    if (candidates.length === 1) return decision.action;

    // Score each candidate action by personality alignment
    let bestAction = decision.action;
    let bestScore = PersonalityModel.scoreAction(decision.action, traits);

    for (const alt of sameTypeAlternatives) {
      const score = PersonalityModel.scoreAction(alt, traits);
      if (score > bestScore) {
        bestScore = score;
        bestAction = alt;
      }
    }

    return bestAction;
  }

  /**
   * Scores an action's alignment with the personality profile based on
   * soft parameter hints embedded in ActionSpec.parameters.
   */
  private static scoreAction(
    action: { type: string; parameters: Record<string, unknown> },
    traits: { openness: number; warmth: number; assertiveness: number; deliberateness: number },
  ): number {
    let score = 0;
    const p = action.parameters;

    // Approach hint: 'novel' aligns with openness; 'familiar' aligns with low openness
    if (p['approach'] === 'novel') score += traits.openness;
    if (p['approach'] === 'familiar') score += (1 - traits.openness);

    // Style hint: 'social' / 'collaborative' aligns with warmth
    if (p['style'] === 'social' || p['style'] === 'collaborative') score += traits.warmth;
    if (p['style'] === 'direct') score += traits.assertiveness;
    if (p['style'] === 'thorough') score += traits.deliberateness;

    return score;
  }

  /** Returns a human-readable level label for a [0..1] trait value. */
  private static levelLabel(value: number): string {
    if (value >= 0.75) return 'high';
    if (value >= 0.5) return 'moderate-high';
    if (value >= 0.25) return 'moderate-low';
    return 'low';
  }
}

// ── Utility ──────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}
