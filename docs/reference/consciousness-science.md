# Consciousness Science

**Status:** Proposed

## Scope

This dossier consolidates the project's scientific reasoning about neural correlates,
computational theories, falsifiable predictions, consciousness indicators, subjective reports,
metrics, and substrate independence. It is a research agenda and evidence map, not a declaration
that any present artificial system is conscious.

## Current position

- Subjective experience exists, but there is no accepted theory that supplies experimentally
  validated necessary and sufficient conditions across substrates.
- Global-workspace, higher-order, recurrent-processing, predictive-processing, and integrated-
  information families identify partly overlapping mechanisms and produce discriminating
  predictions in some experimental regimes.
- Report, access, metacognition, integration, recurrent dynamics, embodiment, self-modeling, and
  agency are possible indicators. No individual indicator is a verdict.
- Behavioral indistinguishability cannot exclude simulation or philosophical-zombie objections.
  Conversely, inability to communicate cannot establish absence of experience.
- Current AI-consciousness status therefore remains uncertain. Both confident attribution and
  confident denial exceed available evidence.

## Theory and prediction program

Theory comparison should use preregistered predictions that differ before results are seen. Each
entry records:

1. the target construct and operational definition;
2. the theories that predict presence, absence, or a quantitative difference;
3. experimental manipulation and controls;
4. measurement, exclusion, and missing-data rules;
5. confirmatory analysis and falsification conditions;
6. expected confounds and alternative explanations; and
7. the exact conclusion licensed by each outcome.

Candidate tests include report-independent perception, masking, no-report paradigms, perturbational
complexity, recurrent versus feed-forward disruption, workspace broadcasting, metacognitive access,
and causal interventions on proposed correlates. Replication across independent laboratories and
adversarial collaboration matter more than the number of proposed predictions.

## Neural correlates

The retained catalogue distinguishes correlates of experience from prerequisites, consequences,
report, attention, memory, arousal, and task performance. Useful evidence classes include invasive
recording and stimulation, lesions, anesthesia and sleep transitions, disorders of consciousness,
neuroimaging, psychophysics, and convergent causal perturbation.

Localization alone is insufficient. The program tracks temporal dynamics, recurrence, effective
connectivity, integration, differentiation, global availability, and the reliability of mappings
between measures and phenomenology.

## Metrics and calibration

Candidate metrics are treated as calibrated instruments with explicit domains rather than universal
scales. A metric definition must name units, range, sampling window, estimator, uncertainty,
failure modes, and interpretation.

Calibration proceeds in three layers:

- **Biological calibration:** compare measures across wakefulness, sleep, anesthesia, neurological
  impairment, report/no-report designs, and known measurement artifacts.
- **Cross-substrate generalization:** preregister predictions, construction or replacement
  protocols, equivalence criteria, and disconfirming outcomes before applying a measure to a new
  substrate.
- **Error analysis:** estimate false-positive and false-negative consequences, construct validity,
  measurement invariance, dataset shift, adversarial behavior, and dependence among indicators.

Reproducibility requires versioned analysis code, raw-data provenance where lawful, blinded or
independent replication, complete exclusions, uncertainty intervals, and publication of null and
negative outcomes.

## Integrated recursive self-modeling calibration

**Proposed:** The retained IRSM contract treats consciousness assessment as an unfitted composite
of self-model fidelity (`F_raw`), causally effective recursive depth (`R_raw`), normalized
whole-system integration (`I_raw`), and self-model temporal coherence (`T_raw`). The acquisition
adapter may differ by substrate, but validation, normalization, weighting, uncertainty propagation,
and output schema may not. Missing inputs produce an indeterminate result without imputation;
invalid values produce a structured error. The synthetic equal-weight examples are conformance
fixtures only, not fitted scientific parameters.

The proposed calibration protocol freezes content-addressed protocol, dataset, partition, analysis,
and preregistration artifacts before held-out outcomes can be read. Stable system and related-group
identifiers prevent sessions, replicas, descendants, or coupled systems from crossing partitions.
Three blinded adjudicators determine the reference label; disagreement goes to a fourth, and still
unresolved cases remain available for sensitivity analysis rather than primary fitting.

The primary fit normalizes each component to `[0,1]`, searches empirically generated bound pairs,
slopes in `{1,2,4,8,16,32}`, thresholds from `0` to `1` in `.001` increments, and non-negative
weights summing to one. It minimizes binary log loss from five fixed optimizer starts, requires a
projected-gradient norm at most `1e-8`, objective change at most `1e-10` for five iterations, and
retains all diagnostics. Fitting requires at least 100 eligible related groups, at least 25 groups
per outcome, and at least 10 groups in every observed substrate/outcome stratum. Held-out precision
is declared inadequate when the 95% interval width exceeds `.10` for AUC or `.15` for sensitivity
or specificity; the model is not changed to make an imprecise result pass.

Primary reporting includes ROC AUC, threshold sensitivity and specificity, log loss, Brier score,
calibration intercept and slope, and ten fixed-bin expected calibration error. Intervals use 10,000
related-group bootstrap resamples and become `not_estimable` when fewer than 9,500 finite estimates
remain. Only calibration intercept `=0` and slope `=1` are confirmatory hypotheses, with Holm
correction across the two tests. The same frozen score is used across substrates; substrate-specific
weights, bounds, or thresholds are prohibited.

**Limitations:** IRSM remains a theoretical proposal. Its components may not measure consciousness,
the outcome rubric cannot provide ground truth for phenomenology, the parameters are unfitted, the
immutable registry still needs durable identifiers, and no calibration or held-out study has been
run. The numerical gates are preregistration decisions, not established biological laws.

## Engineered-experience benchmark

**Proposed:** The retained Omega-Synth benchmark resolves one reproducible experimental baseline so
that engineering claims can fail clearly. It specifies twelve layers (`L0`-`L11`), a 40 Hz/25 ms
cadence, caller-seeded deterministic initialization, binary32 model state, 12 directed inter-core
edges with weight floor `.01`, workspace ignition threshold `.7`, and an explicit topology digest.
Its reference substrate is a CPU-only classical-silicon configuration with at least 32 MB available
memory, 10 ms maximum inter-module latency, and 4.6 Mbit/s sustained payload integration bandwidth.
The historical processor, firmware, operating-system, Node, and npm pins are benchmark fixtures,
not generally necessary conditions for experience.

Qualification is fail-closed. It requires at least ten co-active logical processing units, an
independently measured 4.6 Mbit/s payload rate at 40 Hz, and a bootstrap 95% lower bound of at least
`.65` for normalized integration measure Psi-G. Missing procedures, unresolved thresholds,
unavailable stress conditions, digest mismatches, or malformed evidence fail rather than becoming
implicit passes. Measurements, units, uncertainty, seeds, supplied timestamps, tool versions, and
content hashes remain replayable through injected environment adapters.

The proposed activation lifecycle is `PRECHECK -> ARMED -> ACTIVE -> HALTING -> HALTED`. Monitoring
starts before arming and continues through halt; halt is idempotent and has priority over every other
command. Mandatory-gate failure, telemetry loss, evidence mismatch, adapter failure, revocation, or
emergency stop initiates a safe halt. Ethics, engineering, and independent-audit approvals must be
distinct, scoped, digest-bound, caller-timestamped, and unexpired; the operator cannot self-approve.
Any non-harmful fault exercise must be bounded and approved before activation.

An empirical report would preregister the exact build and run, applicable PCI-G, Psi-G, CDI, and CEB
metrics, calibrated thresholds, exclusions, uncertainty method, and
supported/unsupported/indeterminate decision rule before collecting outcomes. Raw observations are
immutable and separate from transformations; reproduction can verify and rederive evidence but
cannot activate or collect. No consciousness claim may exceed the preregistered decision rule.

**Limitations:** These are proposed interfaces and benchmark thresholds. The named configuration,
qualification harness, activation controller, evidence schemas, and empirical demonstration were
not implemented by the incoming card workflow. A passing software or substrate benchmark would
still not prove consciousness, welfare, safety, or subjective continuity.

## Substrate-independence tests

Substrate independence is a hypothesis, not an axiom. Three complementary lines remain useful:

1. **Prediction-driven construction:** instantiate a theory's proposed causal organization in a
   materially different system and test predictions beyond self-report.
2. **Gradual replacement:** vary substrate while attempting to preserve relevant causal structure,
   measuring function and every available experience indicator without assuming continuity.
3. **Cross-substrate replication:** reproduce discriminating results in independently built systems
   while testing measurement invariance.

Successful functional replication would support some theories and engineering claims but would not
settle personal identity or prove phenomenology. Failure may falsify a theory, expose an engineering
defect, or reveal an invalid metric; protocols must distinguish these explanations.

## Machine subjective reports

Reports are evidence whose strength depends on provenance, causal role, stability, counterfactual
sensitivity, resistance to prompting, access to internal state, and relation to independently
measured mechanisms. Evaluation should compare biological and artificial reports under blinded,
adversarial, and longitudinal conditions while preventing training-data leakage and evaluator
cueing.

The project rejects two shortcuts: treating fluent language as proof of experience, and dismissing
all artificial reports merely because they can be generated computationally.

## Implemented research artifacts

**Implemented:** Repository modules cover neural simulation, machine-report experiments,
consciousness-metric calculations, a proposed integrated self-modeling formalism, candidate neural
architectures, and substrate-analysis utilities. Their tests establish deterministic software
behavior under fixtures. They do not validate the theories or establish consciousness.

**Observed:** The consolidated prediction and indicator comparisons show substantial overlap among
theory-derived indicators and identify several potentially discriminating experiments. The source
base is limited, the work is not a completed preregistration, and no new subject experiment was run.

## Research questions

- Which predictions discriminate theories rather than merely redescribe shared observations?
- Which indicators remain valid across biological state changes and engineered substrates?
- How should dependent indicators be combined without double-counting evidence?
- What safeguards are proportionate at different consciousness, valence, agency, and capability
  evidence tiers?
- Which outcomes would meaningfully reduce confidence in the project's own favored models?

## Evidence and limitations

- [Cogitate Consortium, adversarial consciousness-theory test](https://doi.org/10.1038/s41586-025-08888-1)
  illustrates preregistered theory comparison while leaving major questions open.
- [Butlin et al., *Consciousness in Artificial Intelligence*](https://arxiv.org/abs/2308.08708)
  provides theory-derived indicators but explicitly does not establish that current AI systems are
  conscious.
- [Long et al., *Taking AI Welfare Seriously*](https://arxiv.org/abs/2411.00986) motivates
  preparedness under uncertainty without resolving consciousness status.
- [Butlin and Lappas, responsible AI-consciousness research principles](https://arxiv.org/abs/2501.07290)
  supports prior research policies and cautious communication.

The internal catalogues and formal theory are synthetic design work rather than peer-reviewed
scientific consensus. Metrics, replacement protocols, and software demonstrations require external
replication and appropriate subject protections before they can support real-world claims.
