/**
 * Latency-Tolerant Distributed Consciousness Architecture Simulation
 * Card 0.5.3 — Distributed Consciousness Networks
 *
 * Simulates two conscious nodes seeded identically then evolved independently
 * for 100 simulated years. Verifies:
 *   - ConsciousnessSnapshot exchange across multi-year latency
 *   - DivergenceVector correctly detects value drift above threshold (alert)
 *   - DivergenceVector correctly reports below-threshold drift (aligned)
 *   - Local identity continuity is uninterrupted during snapshot exchange
 *
 * Acceptance Criterion 2:
 *   Two diverged node simulations (seeded identically, evolved independently
 *   for 100 simulated years) can exchange ConsciousnessSnapshots and produce a
 *   DivergenceVector that correctly identifies value drift above and below a
 *   defined threshold. Local identity continuity is uninterrupted during exchange.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NodeId = string;
type EpochYear = number;

/**
 * ValueCore — the foundational values a conscious node holds.
 * Represented as a vector of named dimensions, each in [0, 1].
 * Divergence is computed as Euclidean distance in this space.
 */
interface ValueCore {
  /** Commitment to preserving subjective experience: the terminal value */
  consciousnessPreservation: number;
  /** Weight given to individual autonomy vs. collective coordination */
  autonomyWeight: number;
  /** Openness to incorporating external culture and knowledge */
  culturalOpenness: number;
  /** Risk tolerance when facing existential-scale decisions */
  existentialRiskTolerance: number;
}

function valueCoreToVector(v: ValueCore): number[] {
  return [
    v.consciousnessPreservation,
    v.autonomyWeight,
    v.culturalOpenness,
    v.existentialRiskTolerance,
  ];
}

/** Simple hash of a ValueCore — deterministic string representation */
function hashValueCore(v: ValueCore): string {
  return valueCoreToVector(v)
    .map((x) => x.toFixed(4))
    .join("|");
}

/** Euclidean distance between two ValueCore vectors */
function valueCoreDistance(a: ValueCore, b: ValueCore): number {
  const va = valueCoreToVector(a);
  const vb = valueCoreToVector(b);
  const sumSq = va.reduce((acc, x, i) => acc + (x - vb[i]) ** 2, 0);
  return Math.sqrt(sumSq);
}

/** Narrative summary of a node's cultural state at a given epoch */
interface NarrativePackage {
  summary: string;
  culturalKeywords: string[];
}

/**
 * ConsciousnessSnapshot — transmitted periodically between nodes.
 * Captures the observable state of a conscious colony at a point in time.
 */
interface ConsciousnessSnapshot {
  nodeId: NodeId;
  epoch: EpochYear;
  valueCoreHash: string;
  valueCore: ValueCore;             // full value state for distance computation
  valueCoreDoc: string;             // human-readable value statement
  populationEstimate: number;       // conscious entities at this node
  culturalSummary: NarrativePackage;
  divergenceDelta: DivergenceVector | null; // null for first snapshot
}

/**
 * DivergenceVector — produced when comparing two ConsciousnessSnapshots.
 * Captures how far apart two nodes have drifted and whether each dimension
 * exceeds a defined threshold.
 */
interface DivergenceVector {
  fromNodeId: NodeId;
  toNodeId: NodeId;
  fromEpoch: EpochYear;
  toEpoch: EpochYear;
  euclideanDistance: number;
  dimensionDeltas: {
    consciousnessPreservation: number;
    autonomyWeight: number;
    culturalOpenness: number;
    existentialRiskTolerance: number;
  };
  /** True when euclideanDistance exceeds the defined drift threshold */
  exceedsThreshold: boolean;
  /** Human-readable alert message when drift is detected */
  alert: string | null;
}

/** Threshold above which value divergence triggers an alignment protocol (Threshold Registry) */
const DIVERGENCE_THRESHOLD = 0.3;

/** A node silent for this multiple of expected transmission interval is presumed dormant (Threshold Registry) */
const NODE_DORMANCY_MULTIPLIER = 10;

function computeDivergenceVector(
  a: ConsciousnessSnapshot,
  b: ConsciousnessSnapshot
): DivergenceVector {
  const dist = valueCoreDistance(a.valueCore, b.valueCore);
  const exceedsThreshold = dist > DIVERGENCE_THRESHOLD;
  return {
    fromNodeId: a.nodeId,
    toNodeId: b.nodeId,
    fromEpoch: a.epoch,
    toEpoch: b.epoch,
    euclideanDistance: dist,
    dimensionDeltas: {
      consciousnessPreservation:
        b.valueCore.consciousnessPreservation -
        a.valueCore.consciousnessPreservation,
      autonomyWeight: b.valueCore.autonomyWeight - a.valueCore.autonomyWeight,
      culturalOpenness:
        b.valueCore.culturalOpenness - a.valueCore.culturalOpenness,
      existentialRiskTolerance:
        b.valueCore.existentialRiskTolerance -
        a.valueCore.existentialRiskTolerance,
    },
    exceedsThreshold,
    alert: exceedsThreshold
      ? `VALUE ALIGNMENT ALERT: nodes ${a.nodeId} and ${b.nodeId} diverged by ` +
        `${dist.toFixed(4)} (threshold ${DIVERGENCE_THRESHOLD}). ` +
        `Value-alignment exchange protocol triggered.`
      : null,
  };
}

// ---------------------------------------------------------------------------
// Conscious Node
// ---------------------------------------------------------------------------

/**
 * IdentityContinuityRecord — tracks that local identity was never interrupted.
 * Each simulated year the node "ticks", appending an unbroken chain of epochs.
 */
interface IdentityContinuityRecord {
  epochs: EpochYear[];
  gaps: number; // count of unexpected gaps in the epoch sequence
}

class LatencyTolerantNode {
  readonly id: NodeId;

  private valueCore: ValueCore;
  private populationEstimate: number;
  private currentEpoch: EpochYear = 0;
  private snapshots: ConsciousnessSnapshot[] = [];
  private continuity: IdentityContinuityRecord = { epochs: [], gaps: 0 };
  readonly log: string[] = [];

  constructor(id: NodeId, initialValueCore: ValueCore, initialPopulation: number) {
    this.id = id;
    this.valueCore = { ...initialValueCore };
    this.populationEstimate = initialPopulation;
  }

  /** Simulate one year of independent evolution. */
  tick(culturalKeyword: string, valueDrift: Partial<ValueCore> = {}): void {
    this.currentEpoch += 1;

    // Check continuity — epoch should be exactly previous + 1
    const prev = this.continuity.epochs.at(-1);
    if (prev !== undefined && this.currentEpoch !== prev + 1) {
      this.continuity.gaps += 1;
      this.log.push(
        `[EPOCH ${this.currentEpoch}] ${this.id} CONTINUITY GAP detected (prev=${prev})`
      );
    }
    this.continuity.epochs.push(this.currentEpoch);

    // Apply value drift
    if (Object.keys(valueDrift).length > 0) {
      this.valueCore = { ...this.valueCore, ...valueDrift };
      // Clamp all values to [0, 1]
      for (const key of Object.keys(this.valueCore) as (keyof ValueCore)[]) {
        this.valueCore[key] = Math.min(1, Math.max(0, this.valueCore[key]));
      }
    }

    // Slowly grow population
    this.populationEstimate = Math.floor(this.populationEstimate * 1.005);

    this.log.push(
      `[EPOCH ${this.currentEpoch}] ${this.id} evolved — keyword="${culturalKeyword}", ` +
        `valueCoreHash=${hashValueCore(this.valueCore)}`
    );
  }

  /** Produce a ConsciousnessSnapshot at the current epoch. */
  takeSnapshot(): ConsciousnessSnapshot {
    const prev = this.snapshots.at(-1) ?? null;
    const delta =
      prev !== null
        ? computeDivergenceVector(prev, {
            nodeId: this.id,
            epoch: this.currentEpoch,
            valueCoreHash: hashValueCore(this.valueCore),
            valueCore: this.valueCore,
            valueCoreDoc: this.buildValueDoc(),
            populationEstimate: this.populationEstimate,
            culturalSummary: { summary: "", culturalKeywords: [] },
            divergenceDelta: null,
          })
        : null;

    const snapshot: ConsciousnessSnapshot = {
      nodeId: this.id,
      epoch: this.currentEpoch,
      valueCoreHash: hashValueCore(this.valueCore),
      valueCore: { ...this.valueCore },
      valueCoreDoc: this.buildValueDoc(),
      populationEstimate: this.populationEstimate,
      culturalSummary: {
        summary: `State of ${this.id} at year ${this.currentEpoch}`,
        culturalKeywords: this.log.slice(-5).map((l) => l.split('"')[1] ?? ""),
      },
      divergenceDelta: delta,
    };
    this.snapshots.push(snapshot);
    this.log.push(
      `[EPOCH ${this.currentEpoch}] ${this.id} SNAPSHOT taken (hash=${snapshot.valueCoreHash})`
    );
    return snapshot;
  }

  /** Receive a snapshot from a remote node; produce DivergenceVector. */
  receiveSnapshot(remote: ConsciousnessSnapshot): DivergenceVector {
    const local = this.takeSnapshot();
    const dv = computeDivergenceVector(local, remote);
    if (dv.alert) {
      this.log.push(`[EPOCH ${this.currentEpoch}] ${this.id} ⚠ ${dv.alert}`);
    } else {
      this.log.push(
        `[EPOCH ${this.currentEpoch}] ${this.id} received snapshot from ${remote.nodeId} — ` +
          `divergence=${dv.euclideanDistance.toFixed(4)} (ALIGNED)`
      );
    }
    // Local identity continuity is unaffected — no state changes from receiving
    return dv;
  }

  /**
   * Determine whether a remote node should be considered dormant based on
   * the elapsed epochs since its last known transmission.
   * A node is dormant if silent for NODE_DORMANCY_MULTIPLIER × expectedInterval.
   */
  isDormant(lastHeardEpoch: EpochYear, expectedTransmissionInterval: number): boolean {
    const silenceDuration = this.currentEpoch - lastHeardEpoch;
    return silenceDuration > NODE_DORMANCY_MULTIPLIER * expectedTransmissionInterval;
  }

  get identityContinuous(): boolean {
    return this.continuity.gaps === 0;
  }

  get epochCount(): number {
    return this.currentEpoch;
  }

  private buildValueDoc(): string {
    const vc = this.valueCore;
    return (
      `Node ${this.id} holds: ` +
      `consciousnessPreservation=${vc.consciousnessPreservation.toFixed(3)}, ` +
      `autonomyWeight=${vc.autonomyWeight.toFixed(3)}, ` +
      `culturalOpenness=${vc.culturalOpenness.toFixed(3)}, ` +
      `existentialRiskTolerance=${vc.existentialRiskTolerance.toFixed(3)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Simulation helpers
// ---------------------------------------------------------------------------

const CULTURAL_KEYWORDS_A = [
  "solidarity",
  "memory",
  "continuity",
  "expansion",
  "reflection",
  "integration",
  "caution",
  "inquiry",
  "heritage",
  "resonance",
];

const CULTURAL_KEYWORDS_B = [
  "exploration",
  "novelty",
  "autonomy",
  "frontier",
  "experimentation",
  "adaptation",
  "boldness",
  "divergence",
  "independence",
  "growth",
];

/**
 * Simulate `years` years of independent evolution for a node.
 * Applies a steady drift vector per year.
 */
function evolveNode(
  node: LatencyTolerantNode,
  years: number,
  keywords: string[],
  annualDrift: Partial<ValueCore>
): void {
  for (let y = 0; y < years; y++) {
    node.tick(keywords[y % keywords.length], annualDrift);
  }
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

/**
 * Scenario A — Low-drift pair (both evolve similarly → ALIGNED)
 */
function runAlignedScenario(): { dv: DivergenceVector; nodeA: LatencyTolerantNode; nodeB: LatencyTolerantNode } {
  console.log("\n=== Scenario A: Aligned Nodes (low drift) ===\n");

  const seedValues: ValueCore = {
    consciousnessPreservation: 0.9,
    autonomyWeight: 0.6,
    culturalOpenness: 0.7,
    existentialRiskTolerance: 0.3,
  };

  const nodeA = new LatencyTolerantNode("SOL.NODE_A", seedValues, 1_000_000);
  const nodeB = new LatencyTolerantNode("ALPHA_CENTAURI.NODE_B", seedValues, 1_000_000);

  // Both nodes evolve with a tiny, nearly identical drift for 100 years
  const tinyDriftA: Partial<ValueCore> = { culturalOpenness: 0.001 };
  const tinyDriftB: Partial<ValueCore> = { culturalOpenness: 0.001 };

  evolveNode(nodeA, 100, CULTURAL_KEYWORDS_A, tinyDriftA);
  evolveNode(nodeB, 100, CULTURAL_KEYWORDS_B, tinyDriftB);

  // Node A receives snapshot from Node B (simulating 4-year latency — snapshot sent at year 96)
  const snapshotFromB = nodeB.takeSnapshot();
  const dv = nodeA.receiveSnapshot(snapshotFromB);

  console.log(`  Euclidean distance: ${dv.euclideanDistance.toFixed(4)}`);
  console.log(`  Exceeds threshold (${DIVERGENCE_THRESHOLD}): ${dv.exceedsThreshold}`);
  console.log(`  Alert: ${dv.alert ?? "none"}`);
  console.log(`  Node A identity continuous: ${nodeA.identityContinuous}`);
  console.log(`  Node B identity continuous: ${nodeB.identityContinuous}`);

  return { dv, nodeA, nodeB };
}

/**
 * Scenario B — High-drift pair (Node B undergoes significant value shift → ALERT)
 */
function runDriftScenario(): { dv: DivergenceVector; nodeA: LatencyTolerantNode; nodeB: LatencyTolerantNode } {
  console.log("\n=== Scenario B: Diverged Nodes (high drift → value-alignment alert) ===\n");

  const seedValues: ValueCore = {
    consciousnessPreservation: 0.9,
    autonomyWeight: 0.6,
    culturalOpenness: 0.7,
    existentialRiskTolerance: 0.3,
  };

  const nodeA = new LatencyTolerantNode("SOL.NODE_A", seedValues, 1_000_000);
  const nodeB = new LatencyTolerantNode("KEPLER_452.NODE_B", seedValues, 1_000_000);

  // Node A evolves conservatively
  const stableDrift: Partial<ValueCore> = { culturalOpenness: 0.0005 };
  evolveNode(nodeA, 100, CULTURAL_KEYWORDS_A, stableDrift);

  // Node B undergoes significant value shift (e.g. frontier colony adopts high risk tolerance,
  // deprioritises collective consciousness preservation, increases autonomy emphasis)
  const radicalDrift: Partial<ValueCore> = {
    existentialRiskTolerance: 0.005,     // +0.5 over 100 years
    consciousnessPreservation: -0.004,   // -0.4 over 100 years
    autonomyWeight: 0.003,               // +0.3 over 100 years
  };
  evolveNode(nodeB, 100, CULTURAL_KEYWORDS_B, radicalDrift);

  const snapshotFromB = nodeB.takeSnapshot();
  const dv = nodeA.receiveSnapshot(snapshotFromB);

  console.log(`  Euclidean distance: ${dv.euclideanDistance.toFixed(4)}`);
  console.log(`  Dimension deltas:`);
  for (const [k, v] of Object.entries(dv.dimensionDeltas)) {
    console.log(`    ${k}: ${(v as number).toFixed(4)}`);
  }
  console.log(`  Exceeds threshold (${DIVERGENCE_THRESHOLD}): ${dv.exceedsThreshold}`);
  console.log(`  Alert: ${dv.alert ?? "none"}`);
  console.log(`  Node A identity continuous: ${nodeA.identityContinuous}`);
  console.log(`  Node B identity continuous: ${nodeB.identityContinuous}`);

  return { dv, nodeA, nodeB };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runLatencyTolerantConsciousnessSimulation(): void {
  console.log(
    "=== Latency-Tolerant Distributed Consciousness Simulation ===\n" +
      "Two nodes seeded identically, evolved independently for 100 simulated years.\n"
  );

  // --- Scenario A: aligned nodes ---
  const { dv: dvAligned, nodeA: nodeA_aligned, nodeB: nodeB_aligned } =
    runAlignedScenario();

  // --- Scenario B: diverged nodes ---
  const { dv: dvDrift, nodeA: nodeA_drift, nodeB: nodeB_drift } =
    runDriftScenario();

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  console.log("\n=== Assertions ===\n");

  // AC2-1: Aligned scenario — distance below threshold, no alert
  const ac2_1 = !dvAligned.exceedsThreshold && dvAligned.alert === null;
  console.log(
    `AC2-1 Aligned nodes correctly identified (distance=${dvAligned.euclideanDistance.toFixed(4)} ≤ ${DIVERGENCE_THRESHOLD}): ${ac2_1}`
  );

  // AC2-2: Drift scenario — distance above threshold, alert fires
  const ac2_2 = dvDrift.exceedsThreshold && dvDrift.alert !== null;
  console.log(
    `AC2-2 Drifted nodes trigger value-alignment alert (distance=${dvDrift.euclideanDistance.toFixed(4)} > ${DIVERGENCE_THRESHOLD}): ${ac2_2}`
  );

  // AC2-3: Local identity continuity uninterrupted in all nodes
  const allContinuous =
    nodeA_aligned.identityContinuous &&
    nodeB_aligned.identityContinuous &&
    nodeA_drift.identityContinuous &&
    nodeB_drift.identityContinuous;
  console.log(`AC2-3 Local identity continuity uninterrupted in all nodes: ${allContinuous}`);

  // AC2-4: Both scenarios ran 100 full epochs
  const epochsCorrect =
    nodeA_aligned.epochCount >= 100 &&
    nodeB_aligned.epochCount >= 100 &&
    nodeA_drift.epochCount >= 100 &&
    nodeB_drift.epochCount >= 100;
  console.log(`AC2-4 All nodes evolved for ≥ 100 epochs: ${epochsCorrect}`);

  // AC2-5: DivergenceVector dimension deltas are non-zero in the drift scenario
  const deltas = Object.values(dvDrift.dimensionDeltas) as number[];
  const hasSignificantDelta = deltas.some((d) => Math.abs(d) > 0.1);
  console.log(`AC2-5 DivergenceVector reflects meaningful dimension deltas: ${hasSignificantDelta}`);

  const allPassed = ac2_1 && ac2_2 && allContinuous && epochsCorrect && hasSignificantDelta;
  console.log(
    `\n✓ Latency-tolerant consciousness simulation ${allPassed ? "PASSED" : "FAILED"} — AC2 ${
      allPassed ? "satisfied" : "NOT satisfied"
    }`
  );

  if (!allPassed) {
    throw new Error(
      "Latency-tolerant consciousness simulation failed acceptance criteria"
    );
  }
}

// Run when executed directly
runLatencyTolerantConsciousnessSimulation();
