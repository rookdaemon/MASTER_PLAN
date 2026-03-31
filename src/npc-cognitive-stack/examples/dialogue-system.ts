/**
 * Dialogue System Example — NPC Cognitive Stack
 *
 * Demonstrates how to use CognitiveAgent to drive an NPC's tone, empathy,
 * and social trust in an interactive dialogue scenario.
 *
 * Key patterns shown:
 *   - Selecting dialogue tone from the NPC's mood and communication style
 *   - Recording interaction outcomes to evolve trust over repeated dialogues
 *   - Generating empathic responses when the player expresses distress
 *   - Simulating the NPC's perspective on a situation
 *
 * Run with:
 *   npx tsx src/npc-cognitive-stack/examples/dialogue-system.ts
 */

import { CognitiveAgent } from '../cognitive-agent.js';
import type { CognitiveTickInput } from '../types.js';
import type { EntityObservation, InteractionOutcome } from '../../social-cognition/types.js';

// ── NPC setup ─────────────────────────────────────────────────────────────────

const INNKEEPER = new CognitiveAgent({
  agentId: 'innkeeper-aldric',
  initialTraits: {
    openness:       0.50,
    deliberateness: 0.55,
    warmth:         0.82,
    assertiveness:  0.60,
    volatility:     0.38,
  },
  initialMoodValence: 0.05,
  initialMoodArousal: 0.55,
});

const PLAYER_ID = 'player-character';

// ── Dialogue tone selection ────────────────────────────────────────────────────

function selectDialogueTone(moodValence: number, directness: number): string {
  if (moodValence < -0.3) return 'worried';
  if (moodValence < -0.1) return 'subdued';
  if (directness > 0.7)   return 'direct';
  if (moodValence > 0.3)  return 'warm and cheerful';
  return 'friendly';
}

// ── Simulation tick helper ─────────────────────────────────────────────────────

function makeBaseInput(now: number, hoursSinceSocialInteraction = 0): CognitiveTickInput {
  return {
    now,
    worldModelUncertainty:          0.2,
    timeSinceLastSocialInteraction:  hoursSinceSocialInteraction * 60 * 60_000,
    recentActivity:                  [],
    currentCognitiveLoad:            0.3,
    currentNovelty:                  0.4,
    selfModelCoherence:              0.9,
  };
}

// ── Dialogue scenarios ────────────────────────────────────────────────────────

export function runDialogueSystemExample(): void {
  console.log('=== Dialogue System Example ===\n');

  const social = INNKEEPER.getSocialCognition();
  const BASE_TIME = 1_700_000_000_000;

  // --- Scene 1: First encounter ---
  console.log('Scene 1: First encounter');
  let now = BASE_TIME;

  // Run a tick before the encounter (NPC idle)
  const idleResult = INNKEEPER.tick(makeBaseInput(now, 8));
  const style1 = INNKEEPER.getPersonality().getCommunicationStyle();
  const tone1  = selectDialogueTone(idleResult.moodState.valence, style1.directness);
  console.log(`  Aldric's tone: "${tone1}"`);
  console.log(`  Aldric: "Welcome to the Rusty Flagon. What can I do for you?"`);

  // Player greets warmly — observe the behavior
  const greetObservation: EntityObservation = {
    entityId:    PLAYER_ID,
    timestamp:   now,
    observationType: 'utterance',
    content:     'Good evening! I hear you make the best stew in the region.',
    perceivedAffect: { valence: 0.6, arousal: 0.4 },
  };
  social.observeEntity(PLAYER_ID, greetObservation);
  console.log(`  Player: "${greetObservation.content}"`);

  // Record a cooperative interaction
  const positiveOutcome: InteractionOutcome = {
    entityId:    PLAYER_ID,
    timestamp:   now,
    outcomeType: 'cooperative',
    description: 'Player greeted warmly and complimented the inn.',
    magnitude:   0.5,
  };
  social.recordInteraction(PLAYER_ID, positiveOutcome);

  const trust1 = social.getTrustScore(PLAYER_ID);
  console.log(`  Trust score after greeting: ${trust1.trustScore.toFixed(3)}\n`);

  // --- Scene 2: Player expresses distress ---
  console.log('Scene 2: Player returns distressed');
  now += 2 * 60 * 60_000; // 2 hours later

  const distressObservation: EntityObservation = {
    entityId:    PLAYER_ID,
    timestamp:   now,
    observationType: 'utterance',
    content:     'Aldric, something terrible has happened. I think I was deceived by the merchant.',
    perceivedAffect: { valence: -0.7, arousal: 0.8 },
  };
  social.observeEntity(PLAYER_ID, distressObservation);
  console.log(`  Player: "${distressObservation.content}"`);

  // Generate empathic response
  const playerState = {
    timestamp:        now,
    phenomenalContent: { modalities: ['cognitive'], richness: 0.5, raw: null },
    intentionalContent: { target: 'distress', clarity: 0.8 },
    valence:           -0.7,
    arousal:            0.8,
    unityIndex:         0.5,
    continuityToken:   { id: 'tok-player', previousId: null, timestamp: now },
  };
  const empathy = social.generateEmpathicResponse(PLAYER_ID, playerState);
  console.log(`  Empathy strength: ${empathy.empathyStrength.toFixed(3)}`);
  console.log(`  Aldric's valence shift: ${empathy.resonantValenceShift.toFixed(3)}`);

  // Run a tick reflecting the distressing news
  const distressedResult = INNKEEPER.tick({
    ...makeBaseInput(now, 2),
    currentValence: empathy.resonantValenceShift,
  });
  const style2 = INNKEEPER.getPersonality().getCommunicationStyle();
  const tone2  = selectDialogueTone(distressedResult.moodState.valence, style2.directness);
  console.log(`  Aldric's tone shifts to: "${tone2}"`);
  console.log(`  Aldric: "That's terrible news. Sit down — tell me everything."\n`);

  // --- Scene 3: Trust built through fulfilled commitment ---
  console.log('Scene 3: Aldric helped, and the player returned to say thank you');
  now += 24 * 60 * 60_000; // next day

  social.recordInteraction(PLAYER_ID, {
    entityId:    PLAYER_ID,
    timestamp:   now,
    outcomeType: 'fulfilled-commitment',
    description: 'Player returned as promised and shared what they found.',
    magnitude:   0.8,
  });

  const trust3 = social.getTrustScore(PLAYER_ID);
  console.log(`  Trust score after fulfilled commitment: ${trust3.trustScore.toFixed(3)}`);
  console.log(`  Interaction count: ${trust3.interactionCount}`);

  // --- Scene 4: Perspective simulation before giving advice ---
  console.log('\nScene 4: Aldric simulates player perspective before advising');
  const situation = {
    id:        'sit-merchant-deception',
    timestamp:  now,
    source:    PLAYER_ID,
    modality:  'verbal',
    content:   'I paid the merchant 50 gold for a map that turned out to be fake.',
    features:  {} as Record<string, unknown>,
  };
  const perspective = social.simulatePerspective(PLAYER_ID, situation);
  console.log(`  Simulated perspective: "${perspective.simulatedPercept}"`);
  console.log(`  Simulation confidence: ${perspective.simulationConfidence.toFixed(3)}`);
  const finalResult = INNKEEPER.tick(makeBaseInput(now, 0));
  const style4 = INNKEEPER.getPersonality().getCommunicationStyle();
  const tone4  = selectDialogueTone(finalResult.moodState.valence, style4.directness);
  console.log(`  Aldric's tone: "${tone4}"`);
  console.log(`  Aldric: "Based on what I've seen, I think you need to report this to the guard captain."`);

  console.log('\nDialogue system example complete.');
}

// Run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDialogueSystemExample();
}
