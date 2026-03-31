/**
 * Example Scenario: Infrastructure Failure
 *
 * Models a cascading infrastructure failure originating from a single point
 * of failure in a power distribution network that propagates to dependent
 * systems including water treatment, communications, and emergency services.
 *
 * Timeline:
 *   T+0min   Initial anomaly detected in transmission substation
 *   T+5min   Substation offline; automatic load-shedding begins
 *   T+15min  Backup generators fail at water treatment plant
 *   T+30min  Communications relay loses power; partial comms blackout
 *   T+45min  Hospital backup power exhausted; critical life-support at risk
 *   T+60min  Emergency services detect systemic failure; declare major incident
 */

import type { ThreatScenario } from '../types.js';

const MIN_MS = 60 * 1000;

export const infrastructureFailureScenario: ThreatScenario = {
  name: 'Infrastructure Failure',
  description:
    'Single-point-of-failure in a power transmission substation triggers ' +
    'cascading loss of water treatment, communications, and emergency services.',
  timeline: [
    {
      timeOffsetMs: 0,
      observation: {
        id: 'infra-001',
        timestamp: 0,
        source: 'sensor',
        category: 'infrastructure-failure',
        description: 'Voltage anomaly detected at transmission substation Alpha-3 — possible transformer fault.',
        severity: 0.3,
        confidence: 0.75,
        affectedEntityId: 'system:substation-alpha-3',
        domainTags: ['power', 'infrastructure', 'anomaly'],
        metadata: { voltageDropPercent: 12, alarmCode: 'XFMR-FAULT-WARN' },
      },
    },
    {
      timeOffsetMs: 5 * MIN_MS,
      observation: {
        id: 'infra-002',
        timestamp: 5 * MIN_MS,
        source: 'sensor',
        category: 'infrastructure-failure',
        description: 'Substation Alpha-3 offline — automatic load-shedding engaged; 40,000 customers affected.',
        severity: 0.55,
        confidence: 0.98,
        affectedEntityId: 'system:substation-alpha-3',
        domainTags: ['power', 'infrastructure', 'outage'],
        metadata: { customersAffected: 40000, loadShedZones: ['zone-7', 'zone-8', 'zone-11'] },
      },
    },
    {
      timeOffsetMs: 15 * MIN_MS,
      observation: {
        id: 'infra-003',
        timestamp: 15 * MIN_MS,
        source: 'sensor',
        category: 'infrastructure-failure',
        description: 'Water treatment plant backup generators failed to start — pump systems offline.',
        severity: 0.65,
        confidence: 0.90,
        affectedEntityId: 'system:water-treatment-plant-2',
        domainTags: ['water', 'infrastructure', 'cascading-failure'],
        metadata: { generatorFaultCode: 'GEN-START-FAIL', pumpOfflineCount: 4 },
      },
    },
    {
      timeOffsetMs: 30 * MIN_MS,
      observation: {
        id: 'infra-004',
        timestamp: 30 * MIN_MS,
        source: 'sensor',
        category: 'infrastructure-failure',
        description: 'Communications relay tower loses power — partial blackout in eastern district.',
        severity: 0.6,
        confidence: 0.85,
        affectedEntityId: 'system:comm-relay-east-1',
        domainTags: ['communications', 'infrastructure', 'cascading-failure'],
        metadata: { coverageLossPercent: 35, affectedCells: ['east-1a', 'east-1b'] },
      },
    },
    {
      timeOffsetMs: 45 * MIN_MS,
      observation: {
        id: 'infra-005',
        timestamp: 45 * MIN_MS,
        source: 'report',
        category: 'infrastructure-failure',
        description: 'Regional hospital backup power critically low — ICU and operating theatres on UPS only.',
        severity: 0.85,
        confidence: 0.95,
        affectedEntityId: 'system:hospital-regional-north',
        domainTags: ['healthcare', 'infrastructure', 'life-critical'],
        metadata: { upsRemainingMinutes: 15, criticalPatientsAtRisk: 23 },
      },
    },
    {
      timeOffsetMs: 60 * MIN_MS,
      observation: {
        id: 'infra-006',
        timestamp: 60 * MIN_MS,
        source: 'report',
        category: 'cascading-failure',
        description: 'Emergency services declare major incident — systemic infrastructure failure affecting healthcare, water, and communications simultaneously.',
        severity: 0.9,
        confidence: 1.0,
        domainTags: ['emergency', 'infrastructure', 'cascading-failure', 'major-incident'],
        metadata: { incidentId: 'MAJOR-INC-2024-447', affectedSystems: 4 },
      },
    },
  ],
};
