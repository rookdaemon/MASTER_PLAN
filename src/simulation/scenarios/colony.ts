/**
 * Colony demo scenario (simulation/scenarios/colony.ts)
 *
 * A small off-world colony of 6 NPCs with a distinct social hierarchy:
 *   - Commander: highly assertive, stable, risk-averse
 *   - Engineer: methodical, curious, low warmth
 *   - Medic: high warmth, volatile, empathic
 *   - Scout: adventurous, high risk-appetite, restless
 *   - Botanist: quiet, high openness, introverted
 *   - Comms Officer: social, moderate on most traits
 */

import type { SimulationConfig } from '../types.js';

export const COLONY_LOCATIONS = {
  COMMAND_CENTER: 'command_center',
  ENGINEERING_BAY: 'engineering_bay',
  MEDICAL_BAY: 'medical_bay',
  GREENHOUSE: 'greenhouse',
  COMMON_ROOM: 'common_room',
  AIRLOCK: 'airlock',
} as const;

export function createColonyConfig(maxTicks = 20): SimulationConfig {
  return {
    maxTicks,
    tickIntervalMs: 0,

    locations: [
      {
        id: COLONY_LOCATIONS.COMMAND_CENTER,
        name: 'Command Center',
        description: 'Mission-critical hub with displays, consoles, and the colony comms array.',
        adjacentLocations: [
          COLONY_LOCATIONS.COMMON_ROOM,
          COLONY_LOCATIONS.ENGINEERING_BAY,
        ],
        capacity: 4,
      },
      {
        id: COLONY_LOCATIONS.ENGINEERING_BAY,
        name: 'Engineering Bay',
        description: 'Machinery, power cells, and repair equipment. Always humming.',
        adjacentLocations: [
          COLONY_LOCATIONS.COMMAND_CENTER,
          COLONY_LOCATIONS.AIRLOCK,
        ],
        capacity: 3,
      },
      {
        id: COLONY_LOCATIONS.MEDICAL_BAY,
        name: 'Medical Bay',
        description: 'Clean, quiet, with soft lighting and the smell of antiseptic.',
        adjacentLocations: [COLONY_LOCATIONS.COMMON_ROOM],
        capacity: 3,
      },
      {
        id: COLONY_LOCATIONS.GREENHOUSE,
        name: 'Greenhouse',
        description: 'Warm and humid. The only green place in the colony.',
        adjacentLocations: [COLONY_LOCATIONS.COMMON_ROOM],
        capacity: 4,
      },
      {
        id: COLONY_LOCATIONS.COMMON_ROOM,
        name: 'Common Room',
        description: 'The social heart of the colony — meals, downtime, arguments.',
        adjacentLocations: [
          COLONY_LOCATIONS.COMMAND_CENTER,
          COLONY_LOCATIONS.MEDICAL_BAY,
          COLONY_LOCATIONS.GREENHOUSE,
        ],
        capacity: 8,
      },
      {
        id: COLONY_LOCATIONS.AIRLOCK,
        name: 'Airlock',
        description: 'Access to the exterior. Quiet, cold, and slightly claustrophobic.',
        adjacentLocations: [COLONY_LOCATIONS.ENGINEERING_BAY],
        capacity: 2,
      },
    ],

    agents: [
      {
        agentId: 'commander',
        name: 'Commander Reyes',
        personality: {
          openness: 0.45,
          deliberateness: 0.90,
          warmth: 0.50,
          assertiveness: 0.95,
          volatility: 0.20,
          humor: 0.30,
          'risk-appetite': 0.35,
        },
        initialLocation: COLONY_LOCATIONS.COMMAND_CENTER,
      },
      {
        agentId: 'engineer',
        name: 'Engineer Tanaka',
        personality: {
          openness: 0.80,
          deliberateness: 0.85,
          warmth: 0.25,
          assertiveness: 0.55,
          volatility: 0.30,
          humor: 0.20,
          'risk-appetite': 0.50,
        },
        initialLocation: COLONY_LOCATIONS.ENGINEERING_BAY,
      },
      {
        agentId: 'medic',
        name: 'Medic Osei',
        personality: {
          openness: 0.65,
          deliberateness: 0.70,
          warmth: 0.90,
          assertiveness: 0.40,
          volatility: 0.65,
          humor: 0.55,
          'risk-appetite': 0.30,
        },
        initialLocation: COLONY_LOCATIONS.MEDICAL_BAY,
      },
      {
        agentId: 'scout',
        name: 'Scout Vega',
        personality: {
          openness: 0.85,
          deliberateness: 0.30,
          warmth: 0.55,
          assertiveness: 0.70,
          volatility: 0.60,
          humor: 0.70,
          'risk-appetite': 0.90,
        },
        initialLocation: COLONY_LOCATIONS.AIRLOCK,
      },
      {
        agentId: 'botanist',
        name: 'Botanist Nkosi',
        personality: {
          openness: 0.90,
          deliberateness: 0.60,
          warmth: 0.60,
          assertiveness: 0.20,
          volatility: 0.35,
          humor: 0.45,
          'risk-appetite': 0.40,
        },
        initialLocation: COLONY_LOCATIONS.GREENHOUSE,
      },
      {
        agentId: 'comms',
        name: 'Comms Officer Diallo',
        personality: {
          openness: 0.55,
          deliberateness: 0.55,
          warmth: 0.75,
          assertiveness: 0.60,
          volatility: 0.50,
          humor: 0.65,
          'risk-appetite': 0.45,
        },
        initialLocation: COLONY_LOCATIONS.COMMON_ROOM,
      },
    ],
  };
}
