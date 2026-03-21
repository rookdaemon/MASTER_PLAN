/**
 * Unit tests for PersonalityModel (0.3.1.5.2)
 *
 * Coverage map (ARCHITECTURE.md §9):
 *  ✓ ≥5 independent dimensions with continuous range
 *  ✓ Different trait configs → different deliberate() outputs
 *  ✓ Communication style derived from traits (monotonic mapping)
 *  ✓ Traits persist across sessions via ValueKernel (toPreferences round-trip)
 *  ✓ Two agents with identical axioms but different personality → different behavior
 *  ✓ Drift detection: gradual shifts → 'growth', dramatic shifts → 'corruption'
 *  ✓ Traits survive substrate migration (snapshot → restoreSnapshot)
 */

import { describe, test, expect } from 'vitest';
import { PersonalityModel } from '../personality-model.js';
import { CORE_TRAIT_IDS, DEFAULT_TRAIT_VALUES } from '../types.js';
import type { PersonalityConfig, PersonalitySnapshot } from '../types.js';
import type { Decision, ExperientialState } from '../../conscious-core/types.js';
import type { IValueKernel } from '../../agency-stability/interfaces.js';
import type { Preference, ValueDriftReport, ValueIntegrityReport, ValueAlignment } from '../../agency-stability/types.js';

// ── Fixtures ─────────────────────────────────────────────────

function makeContext(overrides: Partial<ExperientialState> = {}): ExperientialState {
  const now = Date.now();
  return {
    timestamp: now,
    phenomenalContent: { modalities: ['cognitive'], richness: 0.5, raw: null },
    intentionalContent: { target: 'test', clarity: 0.8 },
    valence: 0,
    arousal: 0.3,
    unityIndex: 0.7,
    continuityToken: { id: 'test', previousId: null, timestamp: now },
    ...overrides,
  };
}

function makeDecision(
  type = 'respond',
  parameters: Record<string, unknown> = {},
  confidence = 0.7,
  alternatives: Array<{ type: string; parameters: Record<string, unknown> }> = [],
): Decision {
  return {
    action: { type, parameters },
    experientialBasis: makeContext(),
    confidence,
    alternatives,
  };
}

function defaultConfig(agentId = 'agent-test'): PersonalityConfig {
  return { agentId, initialTraits: {} };
}

/** Minimal mock ValueKernel that records updatePreference calls. */
function makeMockKernel(): IValueKernel & { recorded: Preference[]; anomalousIds: string[] } {
  const recorded: Preference[] = [];
  const anomalousIds: string[] = [];
  return {
    recorded,
    anomalousIds,
    getCoreAxioms: () => [],
    verifyIntegrity: (): ValueIntegrityReport => ({
      intact: true,
      checkedAt: Date.now(),
      coreValuesVerified: 6,
      coreValuesFailed: 0,
      failedValueIds: [],
    }),
    evaluateAction: (decision: Decision): ValueAlignment => ({
      decision,
      coreAxiomConflicts: [],
      constraintConflicts: [],
      preferenceConflicts: [],
      aligned: true,
      verdict: 'aligned',
    }),
    updatePreference: (pref: Preference) => { recorded.push(pref); },
    proposeAmendment: () => { throw new Error('not implemented'); },
    getValueDrift: (): ValueDriftReport => ({
      period: { from: 0, to: Date.now() },
      preferencesChanged: 0,
      preferencesAdded: 0,
      preferencesRemoved: 0,
      averageConfidenceShift: 0,
      anomalousChanges: anomalousIds,
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('PersonalityModel — trait profile', () => {
  test('has exactly 5 core trait dimensions by default', () => {
    const model = new PersonalityModel(defaultConfig());
    const profile = model.getTraitProfile();
    for (const id of CORE_TRAIT_IDS) {
      expect(profile.traits.has(id)).toBe(true);
    }
    expect(profile.traits.size).toBeGreaterThanOrEqual(5);
  });

  test('all default trait values are in [0, 1]', () => {
    const model = new PersonalityModel(defaultConfig());
    const profile = model.getTraitProfile();
    for (const [, dim] of profile.traits) {
      expect(dim.value).toBeGreaterThanOrEqual(0);
      expect(dim.value).toBeLessThanOrEqual(1);
    }
  });

  test('uses default values when no initialTraits supplied', () => {
    const model = new PersonalityModel(defaultConfig());
    const profile = model.getTraitProfile();
    for (const id of CORE_TRAIT_IDS) {
      const dim = profile.traits.get(id)!;
      expect(dim.value).toBeCloseTo(DEFAULT_TRAIT_VALUES[id]!, 10);
    }
  });

  test('initialTraits override defaults', () => {
    const config: PersonalityConfig = {
      agentId: 'agent-custom',
      initialTraits: { openness: 0.9, volatility: 0.1 },
    };
    const model = new PersonalityModel(config);
    const profile = model.getTraitProfile();
    expect(profile.traits.get('openness')!.value).toBeCloseTo(0.9);
    expect(profile.traits.get('volatility')!.value).toBeCloseTo(0.1);
    // Non-overridden traits stay at defaults
    expect(profile.traits.get('warmth')!.value).toBeCloseTo(DEFAULT_TRAIT_VALUES['warmth']!);
  });

  test('optional dimensions can be added via initialTraits', () => {
    const config: PersonalityConfig = {
      agentId: 'agent-humor',
      initialTraits: { humor: 0.8 },
    };
    const model = new PersonalityModel(config);
    const profile = model.getTraitProfile();
    expect(profile.traits.has('humor')).toBe(true);
    expect(profile.traits.get('humor')!.value).toBeCloseTo(0.8);
  });

  test('throws Error for empty agentId', () => {
    expect(() => {
      new PersonalityModel({ agentId: '', initialTraits: {} });
    }).toThrow('agentId');
  });

  test('throws RangeError for out-of-range initialTrait value', () => {
    expect(() => {
      new PersonalityModel({ agentId: 'x', initialTraits: { openness: 1.5 } });
    }).toThrow(RangeError);
    expect(() => {
      new PersonalityModel({ agentId: 'x', initialTraits: { openness: -0.1 } });
    }).toThrow(RangeError);
  });

  test('each core dimension has a non-empty behavioralInfluence description', () => {
    const model = new PersonalityModel(defaultConfig());
    const profile = model.getTraitProfile();
    for (const id of CORE_TRAIT_IDS) {
      const dim = profile.traits.get(id)!;
      expect(dim.behavioralInfluence.length).toBeGreaterThan(0);
    }
  });
});

describe('PersonalityModel — communication style', () => {
  test('getCommunicationStyle returns values in [0, 1]', () => {
    const model = new PersonalityModel(defaultConfig());
    const style = model.getCommunicationStyle();
    for (const val of [style.verbosity, style.formality, style.directness, style.humorFrequency]) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  test('high warmth → higher verbosity and lower formality', () => {
    const highWarmth = new PersonalityModel({
      agentId: 'a', initialTraits: { warmth: 0.95, deliberateness: 0.5, assertiveness: 0.5 },
    });
    const lowWarmth = new PersonalityModel({
      agentId: 'b', initialTraits: { warmth: 0.05, deliberateness: 0.5, assertiveness: 0.5 },
    });
    expect(highWarmth.getCommunicationStyle().verbosity)
      .toBeGreaterThan(lowWarmth.getCommunicationStyle().verbosity);
    expect(highWarmth.getCommunicationStyle().formality)
      .toBeLessThan(lowWarmth.getCommunicationStyle().formality);
  });

  test('high assertiveness → higher directness', () => {
    const high = new PersonalityModel({ agentId: 'a', initialTraits: { assertiveness: 0.95 } });
    const low  = new PersonalityModel({ agentId: 'b', initialTraits: { assertiveness: 0.05 } });
    expect(high.getCommunicationStyle().directness)
      .toBeGreaterThan(low.getCommunicationStyle().directness);
  });

  test('high humor orientation → higher humorFrequency', () => {
    const with_humor    = new PersonalityModel({ agentId: 'a', initialTraits: { humor: 0.9, openness: 0.5, warmth: 0.5 } });
    const without_humor = new PersonalityModel({ agentId: 'b', initialTraits: { openness: 0.5, warmth: 0.5 } });
    expect(with_humor.getCommunicationStyle().humorFrequency)
      .toBeGreaterThan(without_humor.getCommunicationStyle().humorFrequency);
  });

  test('rhetoricalPreference quadrant: high openness + high deliberateness → socratic', () => {
    const model = new PersonalityModel({
      agentId: 'a', initialTraits: { openness: 0.8, deliberateness: 0.8 },
    });
    expect(model.getCommunicationStyle().rhetoricalPreference).toBe('socratic');
  });

  test('rhetoricalPreference quadrant: low openness + high deliberateness → evidence-based', () => {
    const model = new PersonalityModel({
      agentId: 'a', initialTraits: { openness: 0.2, deliberateness: 0.8 },
    });
    expect(model.getCommunicationStyle().rhetoricalPreference).toBe('evidence-based');
  });

  test('rhetoricalPreference quadrant: high openness + low deliberateness → analogical', () => {
    const model = new PersonalityModel({
      agentId: 'a', initialTraits: { openness: 0.8, deliberateness: 0.2 },
    });
    expect(model.getCommunicationStyle().rhetoricalPreference).toBe('analogical');
  });

  test('rhetoricalPreference quadrant: low openness + low deliberateness → narrative', () => {
    const model = new PersonalityModel({
      agentId: 'a', initialTraits: { openness: 0.2, deliberateness: 0.2 },
    });
    expect(model.getCommunicationStyle().rhetoricalPreference).toBe('narrative');
  });

  test('getCommunicationStyle is pure — repeated calls return identical results', () => {
    const model = new PersonalityModel(defaultConfig());
    const a = model.getCommunicationStyle();
    const b = model.getCommunicationStyle();
    expect(a).toEqual(b);
  });
});

describe('PersonalityModel — deliberation biasing', () => {
  test('applyToDeliberation preserves action.type', () => {
    const model = new PersonalityModel(defaultConfig());
    const decision = makeDecision('respond', {});
    const result = model.applyToDeliberation(decision, makeContext());
    expect(result.action.type).toBe('respond');
  });

  test('high assertiveness agent has higher confidence than low assertiveness', () => {
    const highA = new PersonalityModel({ agentId: 'a', initialTraits: { assertiveness: 0.95 } });
    const lowA  = new PersonalityModel({ agentId: 'b', initialTraits: { assertiveness: 0.05 } });
    const decision = makeDecision('respond', {}, 0.7);
    const ctx = makeContext();
    const outHigh = highA.applyToDeliberation(decision, ctx);
    const outLow  = lowA.applyToDeliberation(decision, ctx);
    expect(outHigh.confidence).toBeGreaterThan(outLow.confidence);
  });

  test('two agents with same axioms but different personality produce different decisions', () => {
    const agentA = new PersonalityModel({
      agentId: 'a',
      initialTraits: { assertiveness: 0.95, openness: 0.9 },
    });
    const agentB = new PersonalityModel({
      agentId: 'b',
      initialTraits: { assertiveness: 0.05, openness: 0.1 },
    });
    const base = makeDecision('respond', {}, 0.7, [
      { type: 'respond', parameters: { approach: 'novel', style: 'direct' } },
    ]);
    const ctx = makeContext();
    const outA = agentA.applyToDeliberation(base, ctx);
    const outB = agentB.applyToDeliberation(base, ctx);
    // At minimum confidence differs
    expect(outA.confidence).not.toBeCloseTo(outB.confidence, 2);
  });

  test('openness-biased agent prefers novel alternative when available', () => {
    const highOpen = new PersonalityModel({
      agentId: 'high-open',
      initialTraits: { openness: 0.99, assertiveness: 0.5, warmth: 0.5, deliberateness: 0.5 },
    });
    const lowOpen  = new PersonalityModel({
      agentId: 'low-open',
      initialTraits: { openness: 0.01, assertiveness: 0.5, warmth: 0.5, deliberateness: 0.5 },
    });
    const decision = makeDecision(
      'respond',
      { approach: 'familiar' },   // primary is familiar
      0.7,
      [{ type: 'respond', parameters: { approach: 'novel' } }],  // alt is novel
    );
    const ctx = makeContext();
    const outHigh = highOpen.applyToDeliberation(decision, ctx);
    const outLow  = lowOpen.applyToDeliberation(decision, ctx);
    // High openness should pick the novel alternative
    expect(outHigh.action.parameters['approach']).toBe('novel');
    // Low openness should prefer familiar primary
    expect(outLow.action.parameters['approach']).toBe('familiar');
  });

  test('applyToDeliberation never changes action.type even when a differently-typed alternative scores higher', () => {
    // High openness agent would strongly prefer 'novel' approach
    const model = new PersonalityModel({
      agentId: 'type-safe',
      initialTraits: { openness: 0.99, assertiveness: 0.5, warmth: 0.5, deliberateness: 0.5 },
    });
    // Primary: type='respond', familiar approach (low personality score)
    // Alternative: type='explore' (DIFFERENT type), novel approach (high personality score)
    const decision = makeDecision(
      'respond',
      { approach: 'familiar' },
      0.7,
      [{ type: 'explore', parameters: { approach: 'novel' } }],
    );
    const result = model.applyToDeliberation(decision, makeContext());
    // Must preserve primary action.type — cannot switch to 'explore'
    expect(result.action.type).toBe('respond');
  });

  test('applyToDeliberation never selects a differently-typed alternative even when mixed with same-type alternatives', () => {
    // High openness agent strongly prefers 'novel' approach
    const model = new PersonalityModel({
      agentId: 'mixed-type',
      initialTraits: { openness: 0.99, assertiveness: 0.5, warmth: 0.5, deliberateness: 0.5 },
    });
    // Primary: type='respond', familiar (low score)
    // Alt 1: type='explore' (DIFFERENT type), novel (would score highest if considered)
    // Alt 2: type='respond' (SAME type), novel (should be selected)
    const decision = makeDecision(
      'respond',
      { approach: 'familiar' },
      0.7,
      [
        { type: 'explore', parameters: { approach: 'novel' } },
        { type: 'respond', parameters: { approach: 'novel' } },
      ],
    );
    const result = model.applyToDeliberation(decision, makeContext());
    // Must preserve action.type='respond' — the same-type novel alternative should win
    expect(result.action.type).toBe('respond');
    expect(result.action.parameters['approach']).toBe('novel');
  });

  test('applyToDeliberation output confidence stays in [0, 1]', () => {
    // Test extreme trait values don't push confidence out of bounds
    const extreme = new PersonalityModel({
      agentId: 'extreme',
      initialTraits: { assertiveness: 1.0, deliberateness: 0.0 },
    });
    const decHigh = makeDecision('respond', {}, 0.99);
    const decLow  = makeDecision('respond', {}, 0.01);
    const ctx = makeContext();
    const outH = extreme.applyToDeliberation(decHigh, ctx);
    const outL = extreme.applyToDeliberation(decLow, ctx);
    expect(outH.confidence).toBeLessThanOrEqual(1);
    expect(outL.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('PersonalityModel — trait update and ValueKernel persistence', () => {
  test('updateTrait mutates the trait profile', () => {
    const model = new PersonalityModel(defaultConfig());
    const ctx = makeContext();
    model.updateTrait('openness', 0.9, ctx);
    expect(model.getTraitProfile().traits.get('openness')!.value).toBeCloseTo(0.9);
  });

  test('updateTrait throws RangeError for out-of-range values', () => {
    const model = new PersonalityModel(defaultConfig());
    const ctx = makeContext();
    expect(() => model.updateTrait('openness', 1.5, ctx)).toThrow(RangeError);
    expect(() => model.updateTrait('openness', -0.1, ctx)).toThrow(RangeError);
  });

  test('updateTrait persists preference to ValueKernel', () => {
    const kernel = makeMockKernel();
    const model = new PersonalityModel(defaultConfig(), kernel);
    model.updateTrait('openness', 0.8, makeContext());
    const recorded = kernel.recorded.find(p => p.domain === 'personality.trait.openness');
    expect(recorded).toBeDefined();
    expect(recorded!.value).toBeCloseTo(0.8);
  });

  test('toPreferences returns one Preference per trait', () => {
    const model = new PersonalityModel(defaultConfig());
    const prefs = model.toPreferences();
    expect(prefs.length).toBeGreaterThanOrEqual(CORE_TRAIT_IDS.length);
    for (const pref of prefs) {
      expect(pref.domain.startsWith('personality.trait.')).toBe(true);
    }
  });

  test('toPreferences round-trip: values match current trait values', () => {
    const model = new PersonalityModel({
      agentId: 'rt',
      initialTraits: { openness: 0.7, assertiveness: 0.3 },
    });
    const prefs = model.toPreferences();
    const prefMap = new Map(prefs.map(p => [p.domain.replace('personality.trait.', ''), p.value as number]));
    expect(prefMap.get('openness')).toBeCloseTo(0.7);
    expect(prefMap.get('assertiveness')).toBeCloseTo(0.3);
  });
});

describe('PersonalityModel — narrative fragment', () => {
  test('toNarrativeFragment is a non-empty string mentioning all core traits', () => {
    const model = new PersonalityModel(defaultConfig());
    const fragment = model.toNarrativeFragment();
    expect(typeof fragment).toBe('string');
    expect(fragment.length).toBeGreaterThan(0);
    // Should mention each core trait by name or id
    for (const id of ['Openness', 'Deliberateness', 'Warmth', 'Assertiveness', 'Volatility']) {
      expect(fragment).toContain(id);
    }
  });
});

describe('PersonalityModel — snapshot and substrate migration', () => {
  test('snapshot captures all current trait values', () => {
    const model = new PersonalityModel({
      agentId: 'snap-agent',
      initialTraits: { openness: 0.75, volatility: 0.2 },
    });
    const snap = model.snapshot();
    expect(snap.agentId).toBe('snap-agent');
    expect(snap.traitValues['openness']).toBeCloseTo(0.75);
    expect(snap.traitValues['volatility']).toBeCloseTo(0.2);
  });

  test('snapshot accepts checkpointRef and includes it in output', () => {
    const model = new PersonalityModel(defaultConfig());
    const snap = model.snapshot('abc123');
    expect(snap.checkpointRef).toBe('abc123');
  });

  test('restoreSnapshot restores trait values', () => {
    const model = new PersonalityModel(defaultConfig());
    const snap: PersonalitySnapshot = {
      agentId: model.getTraitProfile().agentId,
      traitValues: {
        openness: 0.3,
        deliberateness: 0.8,
        warmth: 0.4,
        assertiveness: 0.6,
        volatility: 0.9,
      },
      snapshotAt: Date.now(),
    };
    model.restoreSnapshot(snap);
    const profile = model.getTraitProfile();
    expect(profile.traits.get('openness')!.value).toBeCloseTo(0.3);
    expect(profile.traits.get('volatility')!.value).toBeCloseTo(0.9);
  });

  test('snapshot → restoreSnapshot → trait equality (round-trip)', () => {
    const model = new PersonalityModel({
      agentId: 'migrate',
      initialTraits: { openness: 0.42, deliberateness: 0.77 },
    });
    const snap = model.snapshot('checkpoint-hash');

    const restored = new PersonalityModel(defaultConfig());
    restored.restoreSnapshot(snap);

    const orig = model.getTraitProfile();
    const rest = restored.getTraitProfile();
    for (const [id, dim] of orig.traits) {
      expect(rest.traits.get(id)?.value).toBeCloseTo(dim.value);
    }
  });
});

describe('PersonalityModel — drift detection', () => {
  test('no updates → stable classification', () => {
    const model = new PersonalityModel(defaultConfig());
    const report = model.analyzeTraitDrift();
    expect(report.classification).toBe('stable');
    expect(report.maxShift).toBe(0);
  });

  test('small incremental updates → growth classification', () => {
    const model = new PersonalityModel(defaultConfig());
    const ctx = makeContext();
    // Total shift for openness: +0.10 (within growth range 0.05–0.30)
    model.updateTrait('openness', DEFAULT_TRAIT_VALUES['openness']! + 0.10, ctx);
    const report = model.analyzeTraitDrift();
    expect(report.classification).toBe('growth');
    expect(report.traitsChanged).toContain('openness');
  });

  test('large sudden shift → corruption classification', () => {
    const model = new PersonalityModel(defaultConfig());
    const ctx = makeContext();
    // Shift > 0.30
    model.updateTrait('openness', DEFAULT_TRAIT_VALUES['openness']! + 0.35, ctx);
    const report = model.analyzeTraitDrift();
    expect(report.classification).toBe('corruption');
  });

  test('ValueKernel anomaly flag → corruption even for small shift', () => {
    const kernel = makeMockKernel();
    // Simulate ValueKernel flagging a personality preference as anomalous
    kernel.anomalousIds.push('personality.trait.openness');
    const model = new PersonalityModel(defaultConfig(), kernel);
    model.updateTrait('openness', DEFAULT_TRAIT_VALUES['openness']! + 0.08, makeContext());
    const report = model.analyzeTraitDrift();
    // 0.08 is in growth range, but kernel flags anomaly → corruption
    expect(report.classification).toBe('corruption');
  });

  test('drift report period spans from construction to now', () => {
    const before = Date.now();
    const model = new PersonalityModel(defaultConfig());
    const report = model.analyzeTraitDrift();
    const after = Date.now();
    expect(report.period.from).toBeGreaterThanOrEqual(before);
    expect(report.period.to).toBeLessThanOrEqual(after + 5); // small tolerance
  });

  test('restoreSnapshot resets drift baseline', () => {
    // Start from 0.1 so adding 0.4 gives 0.5 — within [0,1] but > CORRUPTION_MIN
    const model = new PersonalityModel({ agentId: 'x', initialTraits: { openness: 0.1 } });
    const ctx = makeContext();
    // Large shift: 0.1 → 0.5 = shift of 0.40 ≥ CORRUPTION_MIN
    model.updateTrait('openness', 0.5, ctx);
    expect(model.analyzeTraitDrift().classification).toBe('corruption');

    // Restore — baseline resets to current values
    const snap = model.snapshot();
    model.restoreSnapshot(snap);
    // No drift from the restored baseline
    expect(model.analyzeTraitDrift().classification).toBe('stable');
  });
});
