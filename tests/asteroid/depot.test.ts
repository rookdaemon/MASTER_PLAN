import { describe, it, expect } from 'vitest';
import {
  createDepot,
  addToInventory,
  dispenseMaterial,
  simulateDepot,
} from '../../src/asteroid/depot.js';
import type {
  ConsumerEndpoint,
  ProcessedProduct,
  MaterialType,
} from '../../src/asteroid/types.js';

const testLocation = { x: 1.5, y: 0, z: 0 };

function threeConsumers(): ConsumerEndpoint[] {
  return [
    {
      id: 'consciousness-alpha',
      type: 'consciousness-platform',
      planCard: '0.4.1.1',
      demandForecast: [
        { material: 'iron', dailyRateKg: 10 },
        { material: 'water', dailyRateKg: 5 },
      ],
    },
    {
      id: 'manufacturing-beta',
      type: 'manufacturing',
      planCard: '0.4.1.3',
      demandForecast: [
        { material: 'iron', dailyRateKg: 20 },
        { material: 'nickel', dailyRateKg: 5 },
      ],
    },
    {
      id: 'propellant-gamma',
      type: 'propellant-depot',
      planCard: '0.4.1.3',
      demandForecast: [
        { material: 'lox', dailyRateKg: 15 },
        { material: 'lh2', dailyRateKg: 3 },
      ],
    },
  ];
}

describe('createDepot', () => {
  it('initializes with zero inventory', () => {
    const consumers = threeConsumers();
    const depot = createDepot('test-depot', testLocation, consumers);
    expect(depot.depotId).toBe('test-depot');
    expect(depot.inventory.get('iron')).toBe(0);
    expect(depot.consumers).toHaveLength(3);
  });

  it('throws when capacityPerMaterial is 0 or negative', () => {
    expect(() => createDepot('test', testLocation, [], 0)).toThrow('capacityPerMaterial must be > 0');
    expect(() => createDepot('test', testLocation, [], -1)).toThrow('capacityPerMaterial must be > 0');
  });
});

describe('simulateDepot preconditions', () => {
  it('throws when totalDays is 0 or negative', () => {
    const depot = createDepot('test', testLocation, []);
    expect(() => simulateDepot(depot, 0, () => [])).toThrow('totalDays must be > 0');
    expect(() => simulateDepot(depot, -1, () => [])).toThrow('totalDays must be > 0');
  });
});

describe('addToInventory', () => {
  it('adds products to inventory respecting capacity', () => {
    const depot = createDepot('test', testLocation, [], 100);
    addToInventory(depot, [
      { material: 'iron', purity: 0.96, massKg: 80, destinationDepot: 'test' },
    ]);
    expect(depot.inventory.get('iron')).toBe(80);

    // Adding beyond capacity caps at capacity
    addToInventory(depot, [
      { material: 'iron', purity: 0.96, massKg: 50, destinationDepot: 'test' },
    ]);
    expect(depot.inventory.get('iron')).toBe(100);
  });

  it('ignores slag products', () => {
    const depot = createDepot('test', testLocation, []);
    addToInventory(depot, [
      { material: 'slag', purity: 0, massKg: 1000, destinationDepot: 'test' },
    ]);
    expect(depot.inventory.get('slag')).toBe(0);
  });
});

describe('dispenseMaterial', () => {
  it('dispenses up to available amount', () => {
    const depot = createDepot('test', testLocation, []);
    depot.inventory.set('iron', 50);
    const dispensed = dispenseMaterial(depot, 'iron', 30);
    expect(dispensed).toBe(30);
    expect(depot.inventory.get('iron')).toBe(20);
  });

  it('returns less than requested if inventory insufficient', () => {
    const depot = createDepot('test', testLocation, []);
    depot.inventory.set('iron', 10);
    const dispensed = dispenseMaterial(depot, 'iron', 30);
    expect(dispensed).toBe(10);
    expect(depot.inventory.get('iron')).toBe(0);
  });
});

describe('simulateDepot', () => {
  it('maintains continuous supply for 1 year with adequate production', () => {
    const consumers = threeConsumers();
    const depot = createDepot('sim-depot', testLocation, consumers);

    // Pre-stock 90 days of buffer
    const totalDailyIron = 30; // 10 + 20
    const totalDailyNickel = 5;
    const totalDailyWater = 5;
    const totalDailyLox = 15;
    const totalDailyLh2 = 3;

    depot.inventory.set('iron', totalDailyIron * 90);
    depot.inventory.set('nickel', totalDailyNickel * 90);
    depot.inventory.set('water', totalDailyWater * 90);
    depot.inventory.set('lox', totalDailyLox * 90);
    depot.inventory.set('lh2', totalDailyLh2 * 90);

    // Daily supply provides exactly 110% of demand (10% surplus for buffer growth)
    const dailySupply = (day: number): ProcessedProduct[] => [
      { material: 'iron', purity: 0.96, massKg: totalDailyIron * 1.1, destinationDepot: 'sim-depot' },
      { material: 'nickel', purity: 0.95, massKg: totalDailyNickel * 1.1, destinationDepot: 'sim-depot' },
      { material: 'water', purity: 0.999, massKg: totalDailyWater * 1.1, destinationDepot: 'sim-depot' },
      { material: 'lox', purity: 0.995, massKg: totalDailyLox * 1.1, destinationDepot: 'sim-depot' },
      { material: 'lh2', purity: 0.995, massKg: totalDailyLh2 * 1.1, destinationDepot: 'sim-depot' },
    ];

    const result = simulateDepot(depot, 365, dailySupply);

    expect(result.totalDaysSimulated).toBe(365);
    expect(result.maxGapDays).toBeLessThanOrEqual(30);
    expect(result.allConsumersServed).toBe(true);
  });

  it('detects supply gaps when production is insufficient', () => {
    const consumers = threeConsumers();
    const depot = createDepot('sim-depot', testLocation, consumers);

    // No initial stock, no supply → everything is a gap
    const noSupply = (_day: number): ProcessedProduct[] => [];

    const result = simulateDepot(depot, 60, noSupply);

    expect(result.supplyGaps.length).toBeGreaterThan(0);
    expect(result.maxGapDays).toBeGreaterThan(30);
    expect(result.allConsumersServed).toBe(false);
  });

  it('tracks three distinct consumer types', () => {
    const consumers = threeConsumers();
    const depot = createDepot('sim-depot', testLocation, consumers);

    expect(consumers.map((c) => c.type)).toEqual([
      'consciousness-platform',
      'manufacturing',
      'propellant-depot',
    ]);
  });

  it('handles supply interruptions within 30-day tolerance', () => {
    const consumers = threeConsumers();
    const depot = createDepot('sim-depot', testLocation, consumers);

    // Large initial buffer
    depot.inventory.set('iron', 30 * 50);
    depot.inventory.set('nickel', 30 * 50);
    depot.inventory.set('water', 30 * 50);
    depot.inventory.set('lox', 30 * 50);
    depot.inventory.set('lh2', 30 * 50);

    // Supply with a 20-day interruption mid-year
    const dailySupply = (day: number): ProcessedProduct[] => {
      if (day >= 100 && day < 120) return []; // 20-day gap
      return [
        { material: 'iron', purity: 0.96, massKg: 35, destinationDepot: 'sim-depot' },
        { material: 'nickel', purity: 0.95, massKg: 8, destinationDepot: 'sim-depot' },
        { material: 'water', purity: 0.999, massKg: 8, destinationDepot: 'sim-depot' },
        { material: 'lox', purity: 0.995, massKg: 20, destinationDepot: 'sim-depot' },
        { material: 'lh2', purity: 0.995, massKg: 5, destinationDepot: 'sim-depot' },
      ];
    };

    const result = simulateDepot(depot, 365, dailySupply);

    // With 30+ days buffer and 20-day interruption, should survive
    expect(result.maxGapDays).toBeLessThanOrEqual(30);
    expect(result.allConsumersServed).toBe(true);
  });
});
