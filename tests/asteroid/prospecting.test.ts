import { describe, it, expect } from 'vitest';
import {
  totalResourceMass,
  resourcePerDeltaV,
  selectTopCandidates,
} from '../../src/asteroid/prospecting.js';
import type { AsteroidCandidate, ResourceMap } from '../../src/asteroid/types.js';

function makeComposition(overrides: Partial<ResourceMap> = {}): ResourceMap {
  return {
    metals: { iron: 1000, nickel: 200, platinum_group: 5, ...overrides.metals },
    volatiles: { water_ice: 500, co2: 100, ammonia: 50, ...overrides.volatiles },
    silicates: overrides.silicates ?? 300,
    carbonaceous: overrides.carbonaceous ?? 100,
  };
}

function makeCandidate(
  designation: string,
  deltaVCost: number,
  accessibility: number,
  comp?: Partial<ResourceMap>,
): AsteroidCandidate {
  return {
    designation,
    spectralType: 'C',
    estimatedComposition: makeComposition(comp),
    deltaVCost,
    accessibilityScore: accessibility,
    orbitEphemeris: {
      semiMajorAxis: 2.5,
      eccentricity: 0.1,
      inclination: 5,
      argOfPerihelion: 0,
      longOfAscNode: 0,
      meanAnomaly: 0,
    },
  };
}

describe('totalResourceMass', () => {
  it('sums all resource components', () => {
    const comp = makeComposition();
    // 1000 + 200 + 5 + 500 + 100 + 50 + 300 + 100 = 2255
    expect(totalResourceMass(comp)).toBe(2255);
  });

  it('handles zero composition', () => {
    const comp: ResourceMap = {
      metals: { iron: 0, nickel: 0, platinum_group: 0 },
      volatiles: { water_ice: 0, co2: 0, ammonia: 0 },
      silicates: 0,
      carbonaceous: 0,
    };
    expect(totalResourceMass(comp)).toBe(0);
  });
});

describe('resourcePerDeltaV', () => {
  it('computes (mass * accessibility) / deltaV', () => {
    const candidate = makeCandidate('TEST-001', 5000, 0.8);
    const mass = totalResourceMass(candidate.estimatedComposition); // 2255
    const expected = (mass * 0.8) / 5000;
    expect(resourcePerDeltaV(candidate)).toBeCloseTo(expected, 6);
  });

  it('returns Infinity for zero deltaV', () => {
    const candidate = makeCandidate('TEST-002', 0, 0.5);
    expect(resourcePerDeltaV(candidate)).toBe(Infinity);
  });
});

describe('selectTopCandidates', () => {
  it('selects top-10 from 1000 candidates within 5% of optimal', () => {
    // Generate 1000 synthetic candidates with varying properties
    const seed = 12345;
    let state = seed;
    const prng = (): number => {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const catalog: AsteroidCandidate[] = [];
    for (let i = 0; i < 1000; i++) {
      const ironMass = 500 + prng() * 50000;
      const nickelMass = 100 + prng() * 10000;
      const pgm = prng() * 50;
      const water = 200 + prng() * 30000;
      const co2 = prng() * 5000;
      const ammonia = prng() * 2000;
      const silicates = 100 + prng() * 20000;
      const carbonaceous = prng() * 10000;

      catalog.push({
        designation: `AST-${String(i).padStart(4, '0')}`,
        spectralType: (['C', 'S', 'M'] as const)[Math.floor(prng() * 3)],
        estimatedComposition: {
          metals: { iron: ironMass, nickel: nickelMass, platinum_group: pgm },
          volatiles: { water_ice: water, co2, ammonia },
          silicates,
          carbonaceous,
        },
        deltaVCost: 2000 + prng() * 8000,
        accessibilityScore: 0.1 + prng() * 0.9,
        orbitEphemeris: {
          semiMajorAxis: 1.5 + prng() * 3.0,
          eccentricity: prng() * 0.4,
          inclination: prng() * 30,
          argOfPerihelion: prng() * 360,
          longOfAscNode: prng() * 360,
          meanAnomaly: prng() * 360,
        },
      });
    }

    const result = selectTopCandidates(catalog, 10);

    expect(result.rankedCandidates).toHaveLength(10);
    expect(result.selectionMetric).toBe('resource_per_delta_v');

    // Verify the selected top-10 matches the known optimal (brute-force sort)
    const allScored = catalog.map((c) => ({
      designation: c.designation,
      score: resourcePerDeltaV(c),
    }));
    allScored.sort((a, b) => b.score - a.score);
    const optimalTop10 = new Set(allScored.slice(0, 10).map((s) => s.designation));
    const selectedSet = new Set(result.rankedCandidates.map((c) => c.designation));

    // Must match exactly (our algorithm IS the brute-force optimal for independent candidates)
    const overlap = [...selectedSet].filter((d) => optimalTop10.has(d)).length;
    expect(overlap).toBe(10);

    // Verify scores are within 5% of optimal aggregate score
    const optimalTotalScore = allScored
      .slice(0, 10)
      .reduce((sum, s) => sum + s.score, 0);
    const selectedTotalScore = result.rankedCandidates
      .map((c) => resourcePerDeltaV(c))
      .reduce((sum, s) => sum + s, 0);
    expect(selectedTotalScore / optimalTotalScore).toBeGreaterThanOrEqual(0.95);
  });

  it('returns fewer than N if catalog is smaller', () => {
    const catalog = [makeCandidate('A', 1000, 0.9), makeCandidate('B', 2000, 0.8)];
    const result = selectTopCandidates(catalog, 10);
    expect(result.rankedCandidates).toHaveLength(2);
  });

  it('throws when topN is 0 or negative', () => {
    const catalog = [makeCandidate('A', 1000, 0.9)];
    expect(() => selectTopCandidates(catalog, 0)).toThrow('topN must be > 0');
    expect(() => selectTopCandidates(catalog, -1)).toThrow('topN must be > 0');
  });

  it('ranks candidates in descending score order', () => {
    const catalog = [
      makeCandidate('LOW', 10000, 0.1),
      makeCandidate('HIGH', 1000, 0.9),
      makeCandidate('MID', 3000, 0.5),
    ];
    const result = selectTopCandidates(catalog, 3);
    const scores = result.rankedCandidates.map((c) => resourcePerDeltaV(c));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});
