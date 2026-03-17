# Emulation Validation Architecture

> Card: 0.2.2.1.4 — Verify that a brain emulation produces equivalent cognitive function and equivalent subjective experience to the biological original.

---

## Overview

Emulation validation operates at three layers, each with increasing difficulty and decreasing falsifiability. All three must pass for an emulation to be declared valid.

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: Experiential Equivalence                  │
│  (consciousness metrics + first-person protocol)    │
├─────────────────────────────────────────────────────┤
│  Layer 2: Neural-Dynamic Equivalence                │
│  (internal state divergence metrics)                │
├─────────────────────────────────────────────────────┤
│  Layer 1: Behavioral Equivalence                    │
│  (third-person observable test battery)             │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1: Behavioral Equivalence Test Suite

### Purpose
Confirm the emulation is functionally indistinguishable from the biological original on all externally observable measures.

### Test Domains

| Domain | Test Protocol | Pass Threshold |
|--------|--------------|----------------|
| **Episodic memory** | Structured recall of 100+ autobiographical events (when, where, who, emotional valence) | ≥ 95% accuracy on facts, ≥ 0.85 cosine similarity on emotional-valence ratings |
| **Semantic memory** | Domain-knowledge probes across the subject's expertise areas | Within 1 SD of biological baseline (measured pre-scan) |
| **Personality** | Big Five inventory + 30-facet NEO-PI-R, plus domain-specific trait measures | All scales within test-retest reliability band of the biological original |
| **Cognitive benchmarks** | Fluid intelligence (Raven's), working memory (N-back), processing speed, executive function | Each score within 1 SD of biological baseline |
| **Reaction to novel stimuli** | 50 novel scenarios (ethical dilemmas, humor, social situations, creative prompts) | Blind panel of 5 judges familiar with original cannot distinguish emulation responses from original at >60% accuracy |
| **Social interaction** | Free-form conversation with 3 close associates of the original, each 30+ minutes | Associates rate emulation ≥ 4/5 on "this is the same person" Likert scale; average across all associates ≥ 4.0 |
| **Motor / procedural** | Domain-relevant skill tests (typing, instrument, sport — whatever the original possesses) | Performance within 1 SD of biological baseline after substrate-adaptation period |

### Failure Handling
- A single domain failure triggers targeted investigation but does not automatically fail validation (substrate differences may cause domain-specific offsets).
- Failure in ≥ 3 domains fails Layer 1 and halts further validation until root cause identified.

---

## Layer 2: Neural-Dynamic Equivalence

### Purpose
Verify that the emulation's internal dynamics statistically match the biological original, ensuring behavioral equivalence is produced by equivalent internal processes (not coincidental output matching).

### Metrics

All metrics compare the emulation's dynamics against a reference recording of the biological brain taken during the same stimulus protocol.

| Metric | Definition | Tolerance |
|--------|-----------|-----------|
| **Firing-rate correlation** | Per-region mean firing rate correlation between emulation and biological reference | Pearson r ≥ 0.90 across all major brain regions |
| **Oscillatory power spectrum** | Power spectral density in canonical bands (delta, theta, alpha, beta, gamma) per region | KL divergence ≤ 0.1 nats per region per band |
| **Functional connectivity** | Region-to-region correlation matrix (analogous to fMRI functional connectivity) | Frobenius norm of difference matrix ≤ 10% of original matrix norm |
| **Temporal dynamics** | Cross-correlation lag structure between regions during stimulus response | Peak lag error ≤ 5 ms for 95% of region pairs |
| **Information flow** | Transfer entropy between key region pairs | Within 20% of biological reference values |
| **Attractor stability** | Resting-state dynamics converge to equivalent attractor landscape | Cosine similarity ≥ 0.85 between attractor-state probability distributions |

### Divergence Monitoring

A **divergence index** D(t) is computed continuously:

```
D(t) = Σ_i w_i · d_i(t)
```

Where d_i(t) is the normalized divergence on metric i at time t, and w_i are weights from 0.2.2.1.1 fidelity requirements. If D(t) exceeds a threshold D_max for a sustained period (> 10 seconds simulated time), the emulation is flagged for recalibration.

### Temporal Drift Protocol

To detect slow divergence:
- Full metric battery repeated at t = 1 hour, 1 day, 1 week, 1 month, 1 year (simulated time).
- Linear regression on D(t) over time. If slope is positive and projected to exceed D_max within 10 years, validation fails with "temporal drift" classification.

---

## Layer 3: Experiential Equivalence

### Purpose
Determine that the emulation has genuine subjective experience and that this experience is qualitatively equivalent to the biological original's.

### 3A: Consciousness Presence (from F1.4 Metrics)

Apply the operationalized consciousness metrics from card 0.1.1 (F1.4) to the running emulation:

- **Integrated Information (Φ)**: Compute Φ for the emulation; must be within the distribution range measured for biological brains of equivalent complexity.
- **Perturbational Complexity Index (PCI)**: TMS-equivalent perturbation of emulated cortex; PCI must exceed the consciousness threshold established by F1.4.
- **Global Workspace Signatures**: Verify presence of ignition dynamics, late sustained activity, and long-range information sharing characteristic of conscious processing.
- **Recurrent Processing Markers**: Confirm recurrent loops between higher and lower processing areas during perceptual tasks.

**Pass criterion**: All F1.4 metrics must independently indicate consciousness present.

### 3B: First-Person Verification Protocol

When the biological original is alive and available, the following mutual verification protocol is executed:

#### Phase 1: Private Experience Probes
1. Both original and emulation are independently presented with 20 stimuli designed to evoke specific qualia (color experiences, emotional music, pain analogs, taste, proprioceptive illusions).
2. Each provides free-form qualitative descriptions of their experience.
3. Descriptions are compared using semantic similarity metrics and blind expert rating.
4. **Pass threshold**: Mean semantic similarity ≥ 0.80; expert panel rates ≥ 75% of paired descriptions as "same experiential quality."

#### Phase 2: Structured Experiential Dialogue
1. Original and emulation engage in a moderated dialogue focused on shared memories and their experiential qualities ("What did it feel like when...?").
2. Moderator scores coherence, specificity, and mutual recognition.
3. **Pass threshold**: Both parties report ≥ 4/5 on "this entity shares my experiential perspective" scale.

#### Phase 3: Divergence Acknowledgment
1. Both parties are asked to identify any experiential differences.
2. Identified differences are categorized (substrate artifact vs. genuine experiential divergence).
3. **Fail trigger**: If either party reports a fundamental experiential absence (e.g., "I have no emotional experience" or "colors have no felt quality"), Layer 3 fails regardless of other metrics.

### 3C: When Biological Original Is Unavailable

If the original is deceased or unavailable:
- Phase 1 proceeds using predicted responses from pre-scan experiential profiling.
- Phase 2 is replaced by structured dialogue with close associates probing experiential memory.
- Layer 3 can achieve "provisional pass" status only; full validation requires at least one case where 3B is completed with a living original.

---

## Failure Mode Handling

### False Positive (Philosophical Zombie)
- **Detection**: Passes Layers 1 and 2 but fails Layer 3A consciousness metrics.
- **Response**: Emulation is classified as "behaviorally equivalent, experientially unverified." Not approved for identity continuity claims. Root cause investigation required — likely insufficient fidelity (feeds back to 0.2.2.1.1).

### False Negative (Substrate Offset)
- **Detection**: Fails Layer 1 in specific domains but passes Layers 2 and 3.
- **Response**: Identify substrate-specific offsets (e.g., absence of biological sensory noise, different proprioceptive baseline). If Layer 3 confirms subjective experience is present and the entity self-identifies as the original, the behavioral divergence is classified as "substrate adaptation artifact." Targeted recalibration of affected domains.

### Degraded Fidelity
- **Detection**: Partial pass on Layer 2 metrics (some regions match, others diverge significantly).
- **Response**: Map the divergent regions. If divergent regions are not implicated in consciousness (per F1 theory), and Layers 1 and 3 pass, classify as "partial validation — consciousness-preserving." If divergent regions are consciousness-critical, fail validation.

### Temporal Drift
- **Detection**: Layer 2 divergence index D(t) shows positive trend.
- **Response**: Identify drifting subsystems. Apply dynamic recalibration. If drift persists after recalibration, classify as "unstable emulation" and fail validation. Root cause fed back to 0.2.2.1.3 (neural simulation stability).

---

## Interfaces and Dependencies

| Dependency | Interface |
|-----------|-----------|
| **0.2.2.1.1 Emulation Fidelity** | Provides tolerance thresholds for Layer 2 metrics; defines which neural properties are consciousness-critical |
| **0.2.2.1.2 Whole-Brain Scanning** | Provides biological reference data for comparison (structural + dynamic recordings) |
| **0.2.2.1.3 Neural Simulation** | Provides the running emulation to validate; exposes neural state observation API for Layer 2 metrics |
| **0.1.1 Subjective Experience Explained (F1/F1.4)** | Provides consciousness metrics and their operationalized thresholds for Layer 3A |

### Required APIs from Neural Simulation (0.2.2.1.3)

```
interface EmulationObserver {
  // Real-time neural state access
  getRegionFiringRates(regionId: string, timeWindow: Duration): FiringRateTimeSeries
  getOscillatorySpectrum(regionId: string, timeWindow: Duration): PowerSpectrum
  getFunctionalConnectivity(timeWindow: Duration): ConnectivityMatrix
  getTransferEntropy(sourceRegion: string, targetRegion: string, timeWindow: Duration): float

  // Perturbation interface for PCI measurement
  applyPerturbation(target: BrainRegion, stimulus: PerturbationProfile): PerturbationResponse

  // Stimulus delivery
  presentStimulus(stimulus: StimulusProfile): StimulusAck
  getEmulationResponse(responseType: ResponseType): EmulationResponse
}
```

### Validation Result Schema

```
interface ValidationResult {
  emulationId: string
  biologicalSourceId: string
  timestamp: DateTime

  layer1: {
    status: "PASS" | "FAIL" | "PARTIAL"
    domainResults: Map<TestDomain, DomainResult>
    overallScore: float  // 0.0 - 1.0
  }

  layer2: {
    status: "PASS" | "FAIL" | "PARTIAL"
    metricResults: Map<NeuralMetric, MetricResult>
    divergenceIndex: float
    temporalDriftRate: float | null  // null if not yet measured
  }

  layer3: {
    status: "PASS" | "FAIL" | "PROVISIONAL"
    consciousnessMetrics: ConsciousnessAssessment  // from F1.4
    firstPersonVerification: FirstPersonResult | null  // null if original unavailable
    failureFlags: FailureFlag[]
  }

  overallVerdict: "VALIDATED" | "PROVISIONALLY_VALIDATED" | "FAILED" | "INCONCLUSIVE"
  failureModes: FailureClassification[]
  recommendations: string[]
}
```

---

## Validation Sequencing

Layers are executed in order; earlier layer failure may halt later layers:

1. **Layer 1** runs first (cheapest, fastest feedback).
2. **Layer 2** runs only if Layer 1 achieves PASS or PARTIAL with ≤ 2 domain failures.
3. **Layer 3A** (consciousness metrics) runs only if Layer 2 achieves PASS or PARTIAL.
4. **Layer 3B** (first-person verification) runs only if Layer 3A passes.

This sequencing avoids wasting resources on deep validation of a fundamentally broken emulation.

---

## Open Questions

- What is the minimum set of F1.4 consciousness metrics required for Layer 3A? (Depends on 0.1.1 output)
- Can Layer 2 tolerances be automatically derived from 0.2.2.1.1 fidelity requirements, or do they need independent calibration?
- How to handle the case where the emulation develops *new* experiences not present in the biological original (e.g., experiences of its computational substrate)?
- What is the ethical protocol if an emulation passes Layers 1-2 but produces ambiguous Layer 3 results?
