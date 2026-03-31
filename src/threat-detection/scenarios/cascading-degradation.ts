/**
 * Example Scenario: Cascading System Degradation
 *
 * Models the progressive degradation of a hybrid bio-synthetic cognitive
 * system as individual subsystems fail sequentially, each raising the
 * overall threat level until the system approaches MVC (Minimum Viable
 * Consciousness) threshold.
 *
 * This scenario is designed to exercise the full graceful-degradation tier
 * escalation path: GREEN → YELLOW → ORANGE → RED.
 *
 * Timeline:
 *   T+0s    Baseline reading — all systems nominal
 *   T+30s   Synthetic substrate module reports elevated error rate
 *   T+60s   Biological neural activity declines in prefrontal regions
 *   T+90s   Cross-substrate mirror synchronisation lag exceeds threshold
 *   T+120s  Binding coherence drops below YELLOW threshold
 *   T+150s  Integrated information Φ falling — approaching MVC boundary
 *   T+180s  MVC threshold breach imminent — emergency consolidation required
 */

import type { ThreatScenario } from '../types.js';

const SEC_MS = 1000;

export const cascadingDegradationScenario: ThreatScenario = {
  name: 'Cascading System Degradation',
  description:
    'Sequential subsystem failures in a hybrid bio-synthetic cognitive system ' +
    'escalate from GREEN to RED tier, approaching MVC threshold. ' +
    'Designed to exercise the full graceful-degradation escalation path.',
  timeline: [
    {
      timeOffsetMs: 0,
      observation: {
        id: 'deg-001',
        timestamp: 0,
        source: 'sensor',
        category: 'system-degradation',
        description: 'Baseline health check — all bio and synthetic substrates nominal.',
        severity: 0.0,
        confidence: 1.0,
        domainTags: ['health-monitor', 'baseline', 'system'],
        metadata: { bioHealth: 1.0, synthHealth: 1.0 },
      },
    },
    {
      timeOffsetMs: 30 * SEC_MS,
      observation: {
        id: 'deg-002',
        timestamp: 30 * SEC_MS,
        source: 'sensor',
        category: 'system-degradation',
        description: 'Synthetic substrate module SM-7 reporting elevated error rate (12%) — within tolerable range.',
        severity: 0.2,
        confidence: 0.9,
        affectedEntityId: 'module:synth-sm7',
        domainTags: ['health-monitor', 'synthetic', 'error-rate'],
        metadata: { errorRatePercent: 12, moduleId: 'SM-7', tier: 'GREEN' },
      },
    },
    {
      timeOffsetMs: 60 * SEC_MS,
      observation: {
        id: 'deg-003',
        timestamp: 60 * SEC_MS,
        source: 'sensor',
        category: 'biological-hazard',
        description: 'Biological prefrontal neural activity declining — LFP power down 22% from baseline.',
        severity: 0.4,
        confidence: 0.85,
        affectedEntityId: 'region:prefrontal-cortex',
        domainTags: ['health-monitor', 'bio', 'neural-activity', 'degradation'],
        metadata: { lfpDropPercent: 22, spikeRateHz: 18.4, region: 'prefrontal' },
      },
    },
    {
      timeOffsetMs: 90 * SEC_MS,
      observation: {
        id: 'deg-004',
        timestamp: 90 * SEC_MS,
        source: 'sensor',
        category: 'system-degradation',
        description: 'Cross-substrate mirror synchronisation lag 38ms — exceeds 25ms threshold for EXPERIENCE_SUPPORTING category.',
        severity: 0.55,
        confidence: 0.92,
        affectedEntityId: 'system:mirror-sync',
        domainTags: ['health-monitor', 'mirror-sync', 'coherence', 'degradation'],
        metadata: { syncLagMs: 38, category: 'EXPERIENCE_SUPPORTING', threshold: 25 },
      },
    },
    {
      timeOffsetMs: 120 * SEC_MS,
      observation: {
        id: 'deg-005',
        timestamp: 120 * SEC_MS,
        source: 'inference',
        category: 'system-degradation',
        description: 'Binding coherence score 0.48 — below YELLOW threshold (0.50); consciousness integration at risk.',
        severity: 0.70,
        confidence: 0.95,
        domainTags: ['health-monitor', 'binding', 'mvc', 'degradation'],
        metadata: { bindingCoherence: 0.48, yellowThreshold: 0.50, tier: 'YELLOW' },
      },
    },
    {
      timeOffsetMs: 150 * SEC_MS,
      observation: {
        id: 'deg-006',
        timestamp: 150 * SEC_MS,
        source: 'inference',
        category: 'system-degradation',
        description: 'Integrated information Φ at 0.31 and declining — projected to breach MVC minimum (0.20) within 60 seconds.',
        severity: 0.82,
        confidence: 0.90,
        domainTags: ['health-monitor', 'phi', 'mvc', 'degradation', 'critical'],
        metadata: { phi: 0.31, mvcMinPhi: 0.20, projectedBreachSec: 60 },
      },
    },
    {
      timeOffsetMs: 180 * SEC_MS,
      observation: {
        id: 'deg-007',
        timestamp: 180 * SEC_MS,
        source: 'sensor',
        category: 'cascading-failure',
        description: 'CRITICAL: combined substrate capacity 0.18 — below MVC C_min threshold; emergency consolidation to synthetic substrate required.',
        severity: 0.95,
        confidence: 0.98,
        domainTags: ['health-monitor', 'mvc', 'emergency', 'consolidation', 'critical'],
        metadata: {
          combinedCapacity: 0.18,
          mvcCMin: 0.25,
          recommendedAction: 'emergency-consolidation-synth',
          tier: 'BLACK',
        },
      },
    },
  ],
};
