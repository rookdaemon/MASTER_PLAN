/**
 * Village demo scenario (simulation/scenarios/village.ts)
 *
 * A proof-of-concept with 5 NPCs in a small village demonstrating:
 *   - NPCs forming opinions about each other (social-cognition)
 *   - Mood changes from interactions (emotion-appraisal)
 *   - Drive-motivated behavior (intrinsic-motivation)
 *   - Memory of past events influencing future behavior (memory)
 *   - Emergent social dynamics from personality differences (personality)
 *
 * All reasoning is deterministic and LLM-free.
 */

import type { SimulationConfig } from '../types.js';

/**
 * Locations in the village:
 *
 *   town_square ── market ── forest_edge
 *       │
 *     tavern
 *
 * town_square is the central hub connected to all others.
 */
export const VILLAGE_LOCATIONS = {
  TOWN_SQUARE: 'town_square',
  MARKET: 'market',
  TAVERN: 'tavern',
  FOREST_EDGE: 'forest_edge',
} as const;

/**
 * The five villagers, each with a distinct personality profile.
 *
 * | Name    | Archetype         | Key traits                          |
 * |---------|-------------------|-------------------------------------|
 * | Aldric  | Scholar / Loner   | high openness, low warmth, high deliberateness |
 * | Bria    | Social Butterfly  | high warmth, high assertiveness, high humor     |
 * | Cael    | Anxious Wanderer  | high volatility, low assertiveness, avg warmth  |
 * | Deva    | Pragmatic Leader  | high assertiveness, low openness, high deliberateness |
 * | Emris   | Curious Tinkerer  | high openness, moderate warmth, high risk-appetite |
 */
export function createVillageConfig(maxTicks = 20): SimulationConfig {
  return {
    maxTicks,
    tickIntervalMs: 0,

    locations: [
      {
        id: VILLAGE_LOCATIONS.TOWN_SQUARE,
        name: 'Town Square',
        description: 'The bustling centre of the village. Everyone passes through.',
        adjacentLocations: [
          VILLAGE_LOCATIONS.MARKET,
          VILLAGE_LOCATIONS.TAVERN,
          VILLAGE_LOCATIONS.FOREST_EDGE,
        ],
        capacity: 10,
      },
      {
        id: VILLAGE_LOCATIONS.MARKET,
        name: 'Market',
        description: 'Stalls and merchants. Good for observation and trade.',
        adjacentLocations: [VILLAGE_LOCATIONS.TOWN_SQUARE],
        capacity: 8,
      },
      {
        id: VILLAGE_LOCATIONS.TAVERN,
        name: 'Tavern',
        description: 'Warm and noisy. The social heart of the village.',
        adjacentLocations: [VILLAGE_LOCATIONS.TOWN_SQUARE],
        capacity: 12,
      },
      {
        id: VILLAGE_LOCATIONS.FOREST_EDGE,
        name: 'Forest Edge',
        description: 'Quiet and mysterious. Favoured by those seeking solitude.',
        adjacentLocations: [VILLAGE_LOCATIONS.TOWN_SQUARE],
        capacity: 4,
      },
    ],

    agents: [
      {
        agentId: 'aldric',
        name: 'Aldric',
        personality: {
          openness: 0.85,        // intensely curious
          deliberateness: 0.80,  // methodical
          warmth: 0.25,          // reserved
          assertiveness: 0.45,   // slightly passive
          volatility: 0.30,      // emotionally stable
          humor: 0.20,           // seldom jokes
          'risk-appetite': 0.55, // moderate risk tolerance
        },
        initialLocation: VILLAGE_LOCATIONS.FOREST_EDGE,
      },
      {
        agentId: 'bria',
        name: 'Bria',
        personality: {
          openness: 0.60,
          deliberateness: 0.40,  // acts on impulse
          warmth: 0.90,          // very sociable
          assertiveness: 0.75,   // outspoken
          volatility: 0.55,      // moderately reactive
          humor: 0.80,           // loves to laugh
          'risk-appetite': 0.65,
        },
        initialLocation: VILLAGE_LOCATIONS.TAVERN,
      },
      {
        agentId: 'cael',
        name: 'Cael',
        personality: {
          openness: 0.50,
          deliberateness: 0.50,
          warmth: 0.55,
          assertiveness: 0.25,   // avoids confrontation
          volatility: 0.80,      // emotionally reactive
          humor: 0.40,
          'risk-appetite': 0.30, // risk-averse
        },
        initialLocation: VILLAGE_LOCATIONS.TOWN_SQUARE,
      },
      {
        agentId: 'deva',
        name: 'Deva',
        personality: {
          openness: 0.30,        // conservative
          deliberateness: 0.85,  // thorough planner
          warmth: 0.45,
          assertiveness: 0.85,   // dominant
          volatility: 0.25,      // very stable
          humor: 0.30,
          'risk-appetite': 0.40,
        },
        initialLocation: VILLAGE_LOCATIONS.MARKET,
      },
      {
        agentId: 'emris',
        name: 'Emris',
        personality: {
          openness: 0.80,
          deliberateness: 0.55,
          warmth: 0.60,
          assertiveness: 0.50,
          volatility: 0.45,
          humor: 0.65,
          'risk-appetite': 0.80, // adventurous
        },
        initialLocation: VILLAGE_LOCATIONS.TOWN_SQUARE,
      },
    ],
  };
}
