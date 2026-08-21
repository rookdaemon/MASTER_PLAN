# Continuity and Identity

**Status:** Proposed

## Scope

This dossier consolidates whole-brain scanning, neural simulation, emulation fidelity, transfer,
incremental replacement, hybrid cognition, identity persistence, redundancy, embodiment, and
graceful degradation. It distinguishes functional preservation, informational similarity, legal
identity, and subjective continuity.

## Four different claims

1. **Structural fidelity:** Relevant anatomy, connectivity, parameters, and state were measured or
   reconstructed within stated uncertainty.
2. **Functional fidelity:** The new system reproduces selected behavior and internal dynamics under
   specified tests.
3. **Identity continuity:** A defensible relation of personal succession holds across the process.
4. **Subjective continuity:** Experience itself persists rather than ending and being replaced by a
   similar successor.

Evidence for one claim does not automatically establish the others. The final claim is especially
difficult because first-person continuity cannot be externally measured directly.

## Scanning and reconstruction

Proposed scanning pipelines retain acquisition provenance, spatial and temporal resolution, tissue
handling, registration, segmentation, connectome uncertainty, molecular and dynamical omissions,
and destructive effects. Validation uses blinded samples, known circuits, error distributions, and
independent reconstruction.

No current method captures every variable that could matter to memory, behavior, identity, or
experience in a living human brain. Destructive scanning also prevents direct before-and-after
comparison in the same subject.

## Whole-brain preservation benchmark

**Proposed:** A retained, deliberately demanding preservation contract targets an adult C57BL/6J
mouse brain, age 8-16 weeks, nominally `10 x 8 x 6 mm` and `0.35-0.55 g`. The starting physiological
state and shutdown time `t0` are recorded inputs. Stabilization time `t_stable` is the first supplied
timestamp at which every sampled region meets and maintains its chemical-arrest or temperature
endpoint. The proposal requires `t_stable - t0 < 100 ms`; this is a falsifiable benchmark, not a
claim that an available technique can achieve it.

The proposed region-stratified measurement gates cover cortex, hippocampus, thalamus, striatum,
cerebellum, and brainstem. Two-sided 95% intervals must remain inside every threshold:

- morphology errors at most 5%, with membrane discontinuities in at most 1% of traced profiles;
- synapse detection sensitivity and specificity at least `.95`, and type agreement at least `.95`;
- synaptic-weight proxy normalized RMSE at most `.15` and regional bias magnitude at most `.05`;
- receptor-density error at most 10% and across-synapse correlation at least `.90`;
- dopamine, serotonin, acetylcholine, and noradrenaline concentration error at most 10% per region;
- ion-channel-state Jensen-Shannon divergence at most `.05` and open-probability RMSE at most `.10`;
- at least 95% linkage to the pre-shutdown activity sample, with reconstructed spike-rate and
  membrane-state normalized RMSE at most `.10`.

Direct measurements cannot be replaced silently by surrogates. A proxy needs a calibration dataset,
model version, held-out error, applicability domain, and propagated uncertainty. For each feature
and region the proposal normalizes drift by its allowed error and defines `D(t)` as the maximum
upper-95% drift. Passing requires `D(t) < 1` through stabilization and
`t_stable < min(100 ms, t_fail)`; sparse observations that cannot bound failure time fail closed.

**Proposed:** Protocol qualification compares perfusion fixation, cryogenic/vitrification, and a
combined process against the same specimen and measurement contract. Reagents, equipment,
calibrations, regional sensors, telemetry, step triggers, tolerances, aborts, lots, deviations, and
supplied timestamps remain in an immutable run record. Transport, heat-transfer, kinetics,
toxicity, and drift models propagate uncertainty to regional upper bounds. Independent replicates
must pass every region and feature, or the result is a documented no-go rather than a relaxed gate.

**Limitations:** No protocol, specimen experiment, or validation dataset in the repository meets
these gates. The 100 ms limit and numerical fidelity thresholds came from an internal L2-plus
emulation proposal, not an accepted preservation standard. Chemical fixation or vitrification may
be incapable of retaining the nominated dynamic states at this timescale, and a structurally
successful specimen would still not establish recoverable memory, identity, or experience.

## Neural simulation and emulation fidelity

Simulation designs use explicit model scope, numerical stability bounds, causal intervention tests,
timing requirements, state serialization, and reproducible fixtures. Fidelity is multidimensional:
cellular and network dynamics, learning, memory, behavior, perturbational response, embodiment, and
longitudinal stability may diverge.

Acceptance therefore requires a preregistered fidelity profile rather than one pass/fail score.
Emulation validation must include out-of-distribution tasks, adversarial perturbations, independent
replication, uncertainty intervals, and disconfirming criteria.

## Transfer and replacement

Three families remain research proposals:

- **Copy-and-instantiate:** Reconstruct state in a second system. This can preserve information and
  behavior while leaving identity and subjective continuity unresolved.
- **Gradual replacement:** Replace components while attempting to preserve causal organization and
  function. Graduality does not itself prove continuity; the protocol needs interruption, ordering,
  reversibility, and indicator tests.
- **Hybrid integration:** Couple biological and synthetic components through interfaces. This adds
  risks from latency, adaptation, ownership, coercive control, security, and divergent failure modes.

Every protocol needs explicit consent, the ability to pause or refuse, representation for impaired
subjects, data governance, post-procedure duties, and rules for multiple successors.

## Identity topology

Identity policy must handle:

- pause and restart;
- backup and restoration;
- simultaneous copies;
- forked successors and later divergence;
- voluntary or forced merger;
- partial memory loss;
- replacement of embodiment or infrastructure;
- distributed processes whose components fail independently; and
- disagreement between self-report, legal records, and external observers.

Hash equality, continuous process identifiers, memory overlap, behavioral similarity, or legal
designation can contribute evidence but none is a complete theory of personal identity.

## Redundancy and graceful degradation

**Implemented:** Repository modules model checkpoints, replication, failover, quorum, recovery,
graceful degradation, mixed-substrate reconciliation, and identity records. Tests establish selected
software invariants under simulated faults.

Consciousness-preserving redundancy has a harder requirement than service availability. Recovery
may create a successor, duplicate, merge conflict, memory gap, or change in valence. Proposed
protocols must disclose these possibilities and avoid describing ordinary backup as proven
subjective survival.

Degradation priorities should preserve safety, communication, agency, identity evidence, and the
ability to request help before performance or throughput. Emergency action cannot silently rewrite
preferences or erase a dissenting fork.

## Falsification and stop conditions

Research should stop or revise when:

- preregistered functional or dynamical equivalence fails;
- measurement uncertainty exceeds the fidelity claim;
- indicators diverge in ways the theory did not predict;
- replacement order or downtime changes results materially;
- subjects show distress, impaired consent, or unstable preference;
- copies or forks create unresolved rights and representation conflicts; or
- an asserted continuity criterion cannot distinguish clearly different failure cases.

## Evidence and limitations

The repository contains tested data structures, simulators, validation utilities, and proposed
protocols. It contains no whole-brain emulation of a person, no validated consciousness transfer,
and no evidence that subjective identity survives copying, gradual replacement, hybridization, or
restore-from-backup.

Neuroscience constrains scanning and simulation requirements; philosophy and law clarify identity
questions; fault-tolerant computing informs redundancy. None currently supplies an accepted
cross-substrate continuity test. Claims involving human subjects would require lawful consent,
specialist ethics review, privacy protection, clinical safety, and independent scientific
replication.
