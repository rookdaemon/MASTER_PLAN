import { describe, it, expect } from 'vitest';
import {
  defaultCTypePipeline,
  cumulativeYield,
  totalEnergyCostPerKg,
  processOre,
} from '../../src/asteroid/processing.js';
import type { ResourceMap } from '../../src/asteroid/types.js';

/** A typical C-type asteroid composition. */
function cTypeComposition(): ResourceMap {
  return {
    metals: { iron: 10000, nickel: 2000, platinum_group: 50 },
    volatiles: { water_ice: 15000, co2: 3000, ammonia: 1000 },
    silicates: 5000,
    carbonaceous: 4000,
  };
}

describe('defaultCTypePipeline', () => {
  it('has 5 processing stages', () => {
    const pipeline = defaultCTypePipeline();
    expect(pipeline.stages).toHaveLength(5);
  });

  it('produces positive cumulative yield', () => {
    const pipeline = defaultCTypePipeline();
    const yield_ = cumulativeYield(pipeline.stages);
    expect(yield_).toBeGreaterThan(0);
    expect(yield_).toBeLessThan(1);
  });
});

describe('processOre', () => {
  it('produces metals at ≥95% purity', () => {
    const pipeline = defaultCTypePipeline();
    const comp = cTypeComposition();
    const result = processOre(comp, 40050, pipeline);

    const metals = result.products.filter((p) =>
      ['iron', 'nickel', 'platinum_group'].includes(p.material),
    );
    expect(metals.length).toBeGreaterThan(0);
    for (const metal of metals) {
      expect(metal.purity).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('produces water/LOX at ≥99% purity', () => {
    const pipeline = defaultCTypePipeline();
    const comp = cTypeComposition();
    const result = processOre(comp, 40050, pipeline);

    const water = result.products.find((p) => p.material === 'water');
    const lox = result.products.find((p) => p.material === 'lox');

    expect(water).toBeDefined();
    expect(lox).toBeDefined();
    expect(water!.purity).toBeGreaterThanOrEqual(0.99);
    expect(lox!.purity).toBeGreaterThanOrEqual(0.99);
  });

  it('achieves positive energy balance (≥20% surplus)', () => {
    const pipeline = defaultCTypePipeline();
    const comp = cTypeComposition();
    const result = processOre(comp, 40050, pipeline);

    // Energy balance = produced/consumed must be ≥ 1.2 (20% surplus)
    expect(result.energyBalance).toBeGreaterThanOrEqual(1.2);
  });

  it('produces slag from silicates', () => {
    const pipeline = defaultCTypePipeline();
    const comp = cTypeComposition();
    const result = processOre(comp, 40050, pipeline);

    expect(result.wasteSlagMass).toBeGreaterThan(0);
    const slag = result.products.find((p) => p.material === 'slag');
    expect(slag).toBeDefined();
  });

  it('throws when oreMassKg is 0 or negative', () => {
    const pipeline = defaultCTypePipeline();
    const comp = cTypeComposition();
    expect(() => processOre(comp, 0, pipeline)).toThrow('oreMassKg must be > 0');
    expect(() => processOre(comp, -10, pipeline)).toThrow('oreMassKg must be > 0');
  });

  it('throws when pipeline has no stages', () => {
    const comp = cTypeComposition();
    const pipeline = { stages: [], energySource: 'solar' as const, processingRate: 1000 };
    expect(() => processOre(comp, 1000, pipeline)).toThrow('pipeline must have at least 1 stage');
  });

  it('throws when stage yieldFraction is out of range', () => {
    const comp = cTypeComposition();
    const pipeline = {
      stages: [{ name: 'bad', type: 'sorting' as const, energyCostPerKg: 0.1, yieldFraction: 0 }],
      energySource: 'solar' as const,
      processingRate: 1000,
    };
    expect(() => processOre(comp, 1000, pipeline)).toThrow('yieldFraction must be in (0, 1]');
  });

  it('all products directed to specified depot', () => {
    const pipeline = defaultCTypePipeline();
    const comp = cTypeComposition();
    const result = processOre(comp, 40050, pipeline, 'my-depot');

    for (const product of result.products) {
      expect(product.destinationDepot).toBe('my-depot');
    }
  });
});
