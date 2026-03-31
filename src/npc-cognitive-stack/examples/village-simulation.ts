/**
 * Village Simulation Example — NPC Cognitive Stack
 *
 * Demonstrates how to use CognitiveAgent to power multiple NPCs in a
 * simple village simulation. Each villager has a distinct personality
 * that shapes their drives, mood, and social behavior over time.
 *
 * Run with:
 *   npx tsx src/npc-cognitive-stack/examples/village-simulation.ts
 */

import { CognitiveAgent } from '../cognitive-agent.js';
import type { CognitiveAgentConfig, CognitiveTickInput, ActivityRecord } from '../types.js';

// ── Village NPC definitions ───────────────────────────────────────────────────

const VILLAGER_CONFIGS: CognitiveAgentConfig[] = [
  {
    agentId: 'elara-the-scholar',
    initialTraits: {
      openness:       0.90,
      deliberateness: 0.80,
      warmth:         0.45,
      assertiveness:  0.55,
      volatility:     0.30,
    },
    initialMoodValence: 0.1,
    initialMoodArousal: 0.55,
  },
  {
    agentId: 'torben-the-blacksmith',
    initialTraits: {
      openness:       0.35,
      deliberateness: 0.65,
      warmth:         0.70,
      assertiveness:  0.75,
      volatility:     0.55,
    },
    initialMoodValence: 0.0,
    initialMoodArousal: 0.6,
  },
  {
    agentId: 'mira-the-merchant',
    initialTraits: {
      openness:       0.60,
      deliberateness: 0.50,
      warmth:         0.80,
      assertiveness:  0.70,
      volatility:     0.45,
    },
    initialMoodValence: 0.15,
    initialMoodArousal: 0.65,
  },
];

// ── Simulation helpers ────────────────────────────────────────────────────────

function makeTickInput(
  now: number,
  hoursIsolated: number,
  recentActivity: ActivityRecord[],
): CognitiveTickInput {
  return {
    now,
    worldModelUncertainty:          0.3,
    timeSinceLastSocialInteraction:  hoursIsolated * 60 * 60_000,
    recentActivity,
    currentCognitiveLoad:            0.4,
    currentNovelty:                  0.35,
    selfModelCoherence:              0.85,
  };
}

function makeDailyActivity(now: number, day: number, agentId: string): ActivityRecord {
  const activities = [
    { description: 'morning routine', novelty: 0.1, goalProgress: 'advancing' as const },
    { description: 'core craft work', novelty: 0.3, goalProgress: 'advancing' as const },
    { description: 'market visit',    novelty: 0.5, goalProgress: 'advancing' as const },
    { description: 'evening reading', novelty: 0.4, goalProgress: 'advancing' as const },
  ];
  const activity = activities[day % activities.length]!;
  return {
    timestamp: now - 8 * 60 * 60_000,
    description: `${agentId}: ${activity.description}`,
    novelty:      activity.novelty,
    arousal:      0.5,
    goalProgress: activity.goalProgress,
  };
}

// ── Simulation run ────────────────────────────────────────────────────────────

export function runVillageSimulation(days = 5): void {
  console.log('=== Village Simulation ===\n');

  // Create NPCs
  const villagers = VILLAGER_CONFIGS.map(cfg => new CognitiveAgent(cfg));

  const SIM_EPOCH = 1_700_000_000_000; // arbitrary simulation epoch
  const MS_PER_DAY = 24 * 60 * 60_000;

  for (let day = 0; day < days; day++) {
    const now = SIM_EPOCH + day * MS_PER_DAY;
    console.log(`--- Day ${day + 1} ---`);

    for (const villager of villagers) {
      const activity = makeDailyActivity(now, day, villager.agentId);
      const hoursIsolated = day === 0 ? 12 : day * 16; // builds social drive over days

      const input = makeTickInput(now, hoursIsolated, [activity]);
      const result = villager.tick(input);

      const style   = villager.getPersonality().getCommunicationStyle();
      const mood    = result.moodState;
      const topDrives = [...result.driveStates.entries()]
        .filter(([, s]) => s.active)
        .map(([dt]) => dt)
        .slice(0, 3);

      console.log(`  ${villager.agentId}`);
      console.log(`    mood:     valence=${mood.valence.toFixed(3)}  arousal=${mood.arousal.toFixed(3)}`);
      console.log(`    style:    directness=${style.directness.toFixed(2)}  warmth-tone=${style.formality.toFixed(2)}`);
      console.log(`    drives:   ${topDrives.length > 0 ? topDrives.join(', ') : '(none active)'}`);
      if (result.goalCandidates.length > 0) {
        console.log(`    goals:    ${result.goalCandidates.map(c => c.sourceDrive).join(', ')}`);
      }
    }
    console.log();
  }

  // Save/load demo: snapshot all villagers
  console.log('=== Snapshot / Restore Demo ===\n');
  const snapshots = villagers.map(v => v.snapshot(SIM_EPOCH + days * MS_PER_DAY));

  // Restore and run one more tick to verify continuity
  for (let i = 0; i < villagers.length; i++) {
    const villager  = villagers[i]!;
    const snap      = snapshots[i]!;
    villager.restoreFromSnapshot(snap);
    const now = SIM_EPOCH + (days + 1) * MS_PER_DAY;
    const result = villager.tick(makeTickInput(now, 2, []));
    console.log(`  ${villager.agentId} restored — mood valence: ${result.moodState.valence.toFixed(3)}`);
  }

  console.log('\nSimulation complete.');
}

// Run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runVillageSimulation();
}
