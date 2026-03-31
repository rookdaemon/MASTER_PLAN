/**
 * Example Scenario: Asteroid Impact
 *
 * Models the detection and progression of an asteroid impact event from
 * initial long-range detection through atmospheric entry, surface impact,
 * and post-impact assessment.
 *
 * Timeline (relative offsets in minutes converted to ms):
 *   T+0h    Long-range telescope detects near-Earth object on collision course
 *   T+6h    Orbital refinement confirms impact probability > 95%
 *   T+18h   Early warning systems detect atmospheric entry
 *   T+18.5h Impact event — ground sensors record seismic signature
 *   T+19h   Post-impact: infrastructure damage reports incoming
 *   T+20h   Cascading secondary failures detected
 */

import type { ThreatScenario } from '../types.js';

const HOUR_MS = 60 * 60 * 1000;

export const asteroidImpactScenario: ThreatScenario = {
  name: 'Asteroid Impact',
  description:
    'Near-Earth object detected on collision course; full impact sequence from ' +
    'initial detection through post-impact cascading infrastructure failures.',
  timeline: [
    {
      timeOffsetMs: 0,
      observation: {
        id: 'ast-001',
        timestamp: 0,
        source: 'sensor',
        category: 'physical-impact',
        description: 'Near-Earth object detected at 2.5 AU — preliminary trajectory suggests close approach.',
        severity: 0.2,
        confidence: 0.6,
        domainTags: ['astronomy', 'threat-assessment', 'asteroid'],
        metadata: { distanceAU: 2.5, velocityKmS: 18.2 },
      },
    },
    {
      timeOffsetMs: 6 * HOUR_MS,
      observation: {
        id: 'ast-002',
        timestamp: 6 * HOUR_MS,
        source: 'inference',
        category: 'physical-impact',
        description: 'Orbital refinement complete — impact probability exceeds 95%; estimated impact zone: mid-latitude.',
        severity: 0.7,
        confidence: 0.95,
        domainTags: ['astronomy', 'threat-assessment', 'asteroid', 'impact-imminent'],
        metadata: { impactProbability: 0.95, estimatedYieldMt: 450 },
      },
    },
    {
      timeOffsetMs: 18 * HOUR_MS,
      observation: {
        id: 'ast-003',
        timestamp: 18 * HOUR_MS,
        source: 'sensor',
        category: 'physical-impact',
        description: 'Atmospheric entry detected — ablation signature visible; sonic boom wave inbound.',
        severity: 0.85,
        confidence: 0.99,
        domainTags: ['atmosphere', 'threat-assessment', 'asteroid', 'impact-imminent'],
        affectedEntityId: 'region:mid-latitude',
      },
    },
    {
      timeOffsetMs: 18 * HOUR_MS + 30 * 60 * 1000,
      observation: {
        id: 'ast-004',
        timestamp: 18 * HOUR_MS + 30 * 60 * 1000,
        source: 'sensor',
        category: 'physical-impact',
        description: 'Impact event confirmed — seismic sensors record M7.2 equivalent; crater formation in progress.',
        severity: 0.95,
        confidence: 1.0,
        domainTags: ['seismic', 'threat-assessment', 'asteroid', 'impact-confirmed'],
        affectedEntityId: 'region:mid-latitude',
        metadata: { seismicMagnitude: 7.2, craterDiameterKm: 12 },
      },
    },
    {
      timeOffsetMs: 19 * HOUR_MS,
      observation: {
        id: 'ast-005',
        timestamp: 19 * HOUR_MS,
        source: 'report',
        category: 'infrastructure-failure',
        description: 'Power grid failure across three sectors; communications infrastructure offline.',
        severity: 0.8,
        confidence: 0.9,
        domainTags: ['infrastructure', 'power', 'communications', 'threat-assessment'],
        affectedEntityId: 'system:power-grid-sector-alpha',
      },
    },
    {
      timeOffsetMs: 20 * HOUR_MS,
      observation: {
        id: 'ast-006',
        timestamp: 20 * HOUR_MS,
        source: 'inference',
        category: 'cascading-failure',
        description: 'Cascading failure propagating — cooling systems offline; reactor SCRAM initiated.',
        severity: 0.9,
        confidence: 0.85,
        domainTags: ['infrastructure', 'nuclear', 'cascading-failure', 'threat-assessment'],
        affectedEntityId: 'system:reactor-complex-7',
        metadata: { reactorsAffected: 2, scramStatus: 'initiated' },
      },
    },
  ],
};
