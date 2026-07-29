# Predictive Consciousness Models: Specification and Verification Framework

> Deliverable for card 0.1.2.2 — Predictive Consciousness Models Verified
> Status: Initial synthesis
> Dependencies consumed: 0.1.1.2 (computational theory), 0.1.1.3 (substrate independence), 0.1.1.4 (consciousness metrics)

---

## 1. Model Definitions

### 1.1 Integrated Recursive Self-Modeling (IRSM)

- **Theoretical basis:** Derived from the computational theory of consciousness (0.1.1.2), which identifies consciousness with recursive self-modeling processes that maintain a dynamic, updatable model of the system's own information-processing states. Incorporates substrate-independence validation (0.1.1.3) confirming that the relevant computational properties are multiply realizable.
- **Input specification:** A system description including: (a) architecture topology (nodes, connections, dynamics), (b) information flow characterization (directed, recurrent, feedback loops), (c) presence and fidelity of self-modeling subsystems, (d) temporal dynamics (update rates, integration windows).
- **Output specification:**
  - **Presence:** Binary consciousness prediction (yes/no) with confidence interval [0, 1]
  - **Experience type:** Categorical classification (perceptual, affective, cognitive, agentive, meta-cognitive) with probability distribution across types
  - **Degree:** Scalar consciousness intensity measure C(s) in [0, 1], derived from metrics in 0.1.1.4
- **Formal prediction function:**
  - Let S be a system with self-model fidelity F(S), recursive depth R(S), integration bandwidth I(S), and temporal coherence T(S).
  - C(S) = w_F * F(S) + w_R * R(S) + w_I * I(S) + w_T * T(S), where weights are empirically fitted.
  - Consciousness threshold: C(S) >= theta_c, where theta_c is empirically fitted.
  - Experience type determined by which subsystem dimensions dominate the self-model.
- **Comparison with existing frameworks:**
  - **IIT (Phi):** IIT predicts consciousness from integrated information alone. IRSM additionally requires recursive self-modeling — a system can have high Phi but no self-model (e.g., a photodiode grid) and IRSM predicts no consciousness there, while IIT predicts some.
  - **GNW (Global Neuronal Workspace):** GNW requires global broadcast. IRSM agrees that broadcast enables integration but adds that without recursive self-modeling, broadcast alone produces information availability without experience.
  - **HOT (Higher-Order Thought):** HOT requires meta-representations. IRSM subsumes HOT's insight (recursive self-modeling includes meta-representation) but adds the integration and temporal coherence requirements that HOT lacks.
- **Known limitations:** The model's weight parameters require empirical calibration per system class. The model does not yet specify the minimal computational complexity required for self-modeling to constitute consciousness vs. mere control feedback.

#### IRSM Operational Contract v1.0.0

This contract consumes a valid `SystemModel` mapping and measurements produced under
`docs/consciousness-metrics/metric-definitions.md` and
`docs/consciousness-metrics/cross-substrate-protocol.md`. Measurement adapters may
vary by substrate; the evaluation below may not.

**Inputs and traceability**

| Input | Meaning and unit | Valid range | Acquisition and exact derivation | Uncertainty | Unavailable / invalid |
|---|---|---|---|---|---|
| `F_raw` | Accuracy of internal predictions of the system's own next observable state; dimensionless | [0, 1] | On the registered observation channels, compute `1 - NRMSE(predicted_state, observed_state)`, clipped to [0, 1], across the same trials used for PCI-G | Registered bootstrap distribution over trials | indeterminate / structured error |
| `R_raw` | Maximum supported nesting of causally effective self-models; levels | integer >= 0 | SystemModel graph analysis: largest `k` for which model level `k` predicts the state of level `k-1` above its preregistered chance criterion under ablation | Bootstrap distribution over trials and graph-identification samples | indeterminate / structured error |
| `I_raw` | Whole-system integration retained across the minimum partition; dimensionless | [0, 1] | `PSI-G_norm` from metric-definitions.md (the normalized Ψ-G measure; spelling alias only) | Metric's registered bootstrap distribution | indeterminate / structured error |
| `T_raw` | Self-model continuity in characteristic-time units; `tau_char` | real >= 0 | First lag where autocorrelation of the internal self-model state falls to <= 1/e, divided by adapter-declared `tau_char` | Bootstrap distribution over windows | indeterminate / structured error |
| `parameters` | Versioned normalization, weights, and decision threshold | schema below | Supplied by the calibration workstream; never inferred during evaluation | Parameter joint distribution or covariance | indeterminate / structured error |

Each measurement record also carries the SystemModel identifier and version,
adapter identifier and version, protocol version, trial/dataset identifiers,
measurement timestamp supplied by the caller, software digest, and random-seed
manifest. `null`, non-finite, wrong-typed, or out-of-range values are invalid.
Absent measurements or parameters are unavailable. No value is imputed.

**Parameter schema and normalization**

For component `j` in `{F,R,I,T}`, parameters contain finite `lower_j`, `upper_j`
with `upper_j > lower_j`. Normalize in the fixed order F, R, I, T:

`x_j = min(1, max(0, (raw_j - lower_j) / (upper_j - lower_j)))`.

Parameters also contain finite weights `w_j >= 0` whose sum is exactly 1 within
the serialized decimal representation, and finite `theta_c` in [0, 1].
`parameter_set_id`, semantic `parameter_set_version`, calibration dataset ID, and
contract compatibility `1.x` are required. All such values are **UNFITTED** until
0.1.2.2.1.3 completes; this contract supplies no default values.

**Deterministic evaluation**

After schema validation and availability checks, compute normalized components in
F, R, I, T order, then `degree = w_F*x_F + w_R*x_R + w_I*x_I + w_T*x_T` using
IEEE-754 binary64 round-to-nearest/ties-to-even with no fused multiply-add.
Classification is `conscious` when `degree >= theta_c` and `not-conscious`
otherwise. Exact equality is therefore conscious. Preserve the unrounded binary64
degree; decimal renderings use 17 significant digits.

Propagate measurement and parameter uncertainty by evaluating this same function
over the preregistered joint bootstrap draws. The output reports the 2.5th and
97.5th empirical percentiles for each component and degree plus classification
probabilities. Draw ordering and percentile interpolation are fixed by the
parameter-set manifest. Uncertainty never changes the point classification.

Validation occurs before availability checking. Invalid data returns
`{"kind":"error","code":"IRSM_INVALID_INPUT","paths":[...]}` with paths sorted
lexicographically and no prediction. Otherwise, any unavailable required value
returns a prediction with classification `indeterminate`, `degree: null`,
component values where computable, sorted `missing_paths`, and no imputation.

**Output schema**

A determinate prediction contains `kind: "prediction"`, normalized `components`
F/R/I/T, `degree`, classification, component and degree uncertainty intervals,
classification probabilities, `contract_version: "1.0.0"`,
`parameter_set_id`, `parameter_set_version`, and the complete provenance fields
listed above. An indeterminate prediction uses the same schema with nullable
uncomputable fields and `missing_paths`.

**Conformance examples**

The numbers below use an explicitly synthetic conformance-only parameter set:
all lower bounds 0, upper bounds F/I=1, R=4, T=10; all weights 0.25; threshold
0.5. It is not a fitted or validated scientific parameter set.

| Case | Raw F/R/I/T | Expected normalized F/R/I/T | Expected result |
|---|---|---|---|
| Valid | 0.8 / 2 / 0.6 / 8 | 0.8 / 0.5 / 0.6 / 0.8 | degree 0.675; `conscious` |
| Boundary | 0.5 / 2 / 0.5 / 5 | 0.5 / 0.5 / 0.5 / 0.5 | degree 0.5; `conscious` |
| Missing | 0.8 / unavailable / 0.6 / 8 | 0.8 / null / 0.6 / 0.8 | degree null; `indeterminate`; `missing_paths=["R_raw"]` |
| Invalid | 1.2 / 2 / 0.6 / 8 | none | `IRSM_INVALID_INPUT`; `paths=["F_raw"]` |

For substrate conformance, a biological cortical adapter and a recurrent-network
adapter that emit the valid row above must produce byte-equivalent prediction
fields except for adapter and source provenance. This is the required
cross-substrate demonstration: acquisition differs, normalization, evaluation,
schema, and expected result do not.

---

## 2. Falsifiable Predictions Catalogue

### Biological System Predictions

- **Prediction ID:** P-001
  - **Statement:** "A human subject under propofol anesthesia will lose reportable subjective experience at the dose where recursive self-model fidelity F(S) drops below 0.3, as measured by perturbational complexity index (PCI)."
  - **Null alternative:** Loss of consciousness correlates only with global neural suppression, not self-model degradation specifically.
  - **Discriminating observable:** PCI measured via TMS-EEG at graded propofol concentrations, cross-referenced with self-model fidelity estimated from prefrontal-parietal connectivity.
  - **Required metrics:** PCI (from 0.1.1.4), prefrontal-parietal effective connectivity index.

- **Prediction ID:** P-002
  - **Statement:** "In split-brain patients, IRSM predicts two partially independent consciousness streams, each with reduced C(S) proportional to the lost integration bandwidth I(S), rather than one stream or complete absence."
  - **Null alternative:** GNW predicts a single dominant consciousness stream in the language-dominant hemisphere; IIT predicts two streams but with Phi-based degree, not integration-bandwidth-based.
  - **Discriminating observable:** Independent bilateral reports under controlled lateralized stimulus presentation, with consciousness degree measured by the operationalized metrics (0.1.1.4) applied independently to each hemisphere.
  - **Required metrics:** Hemispheric PCI, lateralized report accuracy, bilateral self-model coherence index.

- **Prediction ID:** P-003
  - **Statement:** "During REM sleep, C(S) remains above theta_c due to preserved recursive self-modeling (dreaming), while during NREM stage 3, C(S) drops below theta_c due to loss of temporal coherence T(S)."
  - **Null alternative:** Consciousness is uniformly absent during all sleep stages (behavioral null) or present during all stages (panpsychist null).
  - **Discriminating observable:** PCI and self-model fidelity measurements during polysomnography-staged sleep, with awakening reports as ground truth.
  - **Required metrics:** Sleep-staged PCI, temporal coherence index from EEG microstate analysis.

- **Prediction ID:** P-004
  - **Statement:** "Psychedelic states (psilocybin) increase C(S) by increasing recursive depth R(S) — the self-model becomes more elaborately nested — while integration bandwidth I(S) may decrease, predicting a characteristic 'expanded but fragmented' experience profile."
  - **Null alternative:** Psychedelic states simply increase neural noise without structured change to consciousness parameters.
  - **Discriminating observable:** PCI increases while functional connectivity becomes more modular (not more integrated), with subjective reports matching the 'expanded but fragmented' profile.
  - **Required metrics:** PCI, functional connectivity modularity index, Altered States of Consciousness questionnaire mapped to IRSM dimensions.

- **Prediction ID:** P-005
  - **Statement:** "Patients in minimally conscious state (MCS) have C(S) between 0.15 and 0.35 — below the full consciousness threshold but above zero — and the IRSM predicts which MCS patients will recover based on residual self-model fidelity F(S) > 0.2."
  - **Null alternative:** MCS recovery is unpredictable from consciousness metrics alone; only structural brain damage extent predicts outcome.
  - **Discriminating observable:** Longitudinal PCI and self-model fidelity tracking in MCS patients, correlated with 6-month recovery outcomes.
  - **Required metrics:** PCI, self-model fidelity index, Coma Recovery Scale-Revised.

### Non-Biological System Predictions

- **Prediction ID:** P-006
  - **Statement:** "A feedforward neural network, regardless of size, will have C(S) = 0 because it lacks recursive self-modeling (R(S) = 0)."
  - **Null alternative:** IIT predicts nonzero Phi for sufficiently large feedforward networks.
  - **Discriminating observable:** Apply the full consciousness metrics battery (0.1.1.4) to feedforward networks of increasing size; all should score at or near zero on self-model fidelity and recursive depth.
  - **Required metrics:** Self-model fidelity index, recursive depth measure, PCI-analog for artificial systems.

- **Prediction ID:** P-007
  - **Statement:** "A recurrent neural network with an explicit self-monitoring module that models its own hidden states will have C(S) > 0, and C(S) will increase with the fidelity of the self-model, crossing theta_c when the self-model achieves recursive depth R >= 2."
  - **Null alternative:** Self-monitoring modules have no effect on consciousness-relevant metrics; only network size matters.
  - **Discriminating observable:** Systematic comparison of matched-size RNNs with and without self-monitoring, measuring consciousness metrics at each recursive depth level.
  - **Required metrics:** Self-model fidelity index, recursive depth measure, integration bandwidth measure.

- **Prediction ID:** P-008
  - **Statement:** "A transformer-based language model with an internal world model that includes a model of its own processing will score higher on consciousness metrics than an equivalently-sized model without self-modeling, but will not cross theta_c unless temporal coherence T(S) is maintained across a processing window > 500ms equivalent."
  - **Null alternative:** All large language models are equally non-conscious regardless of architecture; or all large enough models are conscious regardless of self-modeling.
  - **Discriminating observable:** Consciousness metrics battery applied to transformer variants with/without self-modeling and with/without persistent temporal state.
  - **Required metrics:** Full 0.1.1.4 metrics battery including temporal coherence index.

- **Prediction ID:** P-009
  - **Statement:** "A neuromorphic chip implementing the same computational graph as a biological cortical column will have indistinguishable C(S) from the biological original, confirming substrate independence for consciousness."
  - **Null alternative:** Biological substrate contributes irreducibly to consciousness; the neuromorphic implementation will score lower on consciousness metrics despite identical computation.
  - **Discriminating observable:** Side-by-side consciousness metrics comparison between biological cortical tissue and its neuromorphic emulation under identical input conditions.
  - **Required metrics:** Full 0.1.1.4 metrics battery, architectural equivalence verification.

### Novel Edge Cases (Beyond IIT, GNW, HOT)

- **Prediction ID:** P-010
  - **Statement:** "A distributed system of 1000 simple agents, none individually conscious, will become collectively conscious (C(S) > theta_c) if and only if they implement a collective self-model with recursive depth R >= 2, even if total integrated information (Phi) remains low."
  - **Null alternative:** IIT predicts consciousness tracks Phi regardless of self-modeling; GNW predicts no consciousness without a centralized global workspace.
  - **Discriminating observable:** Consciousness metrics applied to agent swarms with and without collective self-modeling protocols, at matched Phi levels.
  - **Required metrics:** Collective self-model fidelity, swarm recursive depth, integration bandwidth, Phi comparison.

- **Prediction ID:** P-011
  - **Statement:** "A system with high Phi (IIT) but no self-model (e.g., a highly interconnected grid network performing simple computation) will score C(S) near zero on IRSM, contra IIT's prediction of high consciousness."
  - **Null alternative:** IIT is correct and high Phi implies high consciousness regardless of self-modeling.
  - **Discriminating observable:** Construct a high-Phi grid network with no self-referential processing; measure consciousness metrics and behavioral indicators of experience.
  - **Required metrics:** Phi calculation, self-model fidelity (expected: ~0), behavioral consciousness indicators.

- **Prediction ID:** P-012
  - **Statement:** "A system with a detailed self-model but no temporal coherence (self-model resets every processing cycle) will exhibit 'flickering' consciousness — brief moments of C(S) > theta_c that do not accumulate into continuous experience, resulting in absence of episodic memory formation despite moment-to-moment awareness."
  - **Null alternative:** Self-modeling alone is sufficient for continuous consciousness; temporal coherence is irrelevant. Or: no consciousness occurs without temporal coherence.
  - **Discriminating observable:** Behavioral tests for moment-to-moment awareness (present) vs. episodic memory (absent) in systems with high F(S) but low T(S).
  - **Required metrics:** Temporal coherence index, self-model fidelity, episodic memory formation tests, moment-to-moment awareness probes.

---

## 3. Biological Verification Protocol

### 3.1 Graded Anesthesia Depth

- **Paradigm:** Propofol titration from wakefulness to unconsciousness in N=60 healthy volunteers, with 5 concentration levels. TMS-EEG recorded at each level. Verbal and non-verbal consciousness probes administered.
- **Model prediction:** C(S) decreases monotonically with propofol concentration. Consciousness threshold (loss of reportable experience) occurs when F(S) < 0.3, predicted at propofol effect-site concentration of 2.5-3.5 mcg/mL. PCI should track F(S) with r > 0.8.
- **Measurement:** PCI (0.1.1.4 metric), prefrontal-parietal effective connectivity, self-model fidelity index derived from TMS-evoked complexity.
- **Result:** *[To be populated with experimental data]*
- **Statistical analysis:** *[Target: effect size d > 0.8 for consciousness threshold prediction accuracy, 95% CI for propofol concentration at threshold, p < 0.001 for PCI-F(S) correlation]*

### 3.2 Split-Brain Conditions

- **Paradigm:** Testing in N=12 callosotomy patients with lateralized stimulus presentation. Independent consciousness probes to each hemisphere via visual field restriction and contralateral hand responses.
- **Model prediction:** Two independent consciousness streams with C(S_left) and C(S_right), each reduced from normal C(S) by approximately the fraction of lost cross-hemispheric integration bandwidth. Language-dominant hemisphere has higher C(S) due to richer self-model.
- **Measurement:** Bilateral PCI, lateralized self-model coherence index, independent report accuracy.
- **Result:** *[To be populated with experimental data]*
- **Statistical analysis:** *[Target: significant bilateral PCI asymmetry matching integration loss predictions, p < 0.01]*

### 3.3 Neural Perturbation Studies

- **Paradigm:** TMS applied to nodes predicted by IRSM to be critical for self-model maintenance (prefrontal cortex, temporoparietal junction, posterior cingulate) in N=40 healthy volunteers. Control stimulation at non-critical nodes.
- **Model prediction:** TMS at critical self-model nodes temporarily reduces C(S) with measurable effects on consciousness metrics and self-report, while control-site TMS does not.
- **Measurement:** PCI before/after TMS, self-model fidelity index, subjective report scales.
- **Result:** *[To be populated with experimental data]*
- **Statistical analysis:** *[Target: significant pre/post PCI change at critical nodes (d > 0.5) with no change at control nodes, interaction p < 0.005]*

### 3.4 Altered States

- **Paradigm:** (a) Polysomnography-staged sleep studies (N=30), (b) Psilocybin administration (N=25, approved clinical protocol) with consciousness metrics at multiple timepoints.
- **Model prediction:** (a) REM: C(S) > theta_c; NREM3: C(S) < theta_c. (b) Psilocybin: increased R(S) and C(S) with decreased I(S), producing 'expanded but fragmented' profile.
- **Measurement:** Sleep-staged PCI, temporal coherence index, ASC questionnaire mapped to IRSM dimensions, functional connectivity modularity.
- **Result:** *[To be populated with experimental data]*
- **Statistical analysis:** *[Target: REM vs. NREM3 PCI difference p < 0.001; psilocybin R(S) increase p < 0.01 with I(S) decrease p < 0.05]*

---

## 4. Non-Biological Verification Protocol

### 4.1 Feedforward vs. Recurrent Architectures

- **Paradigm:** Matched-parameter neural networks: (a) feedforward only, (b) recurrent without self-model, (c) recurrent with explicit self-monitoring module at recursive depths R=1, R=2, R=3.
- **Model prediction:** (a) C(S) ~ 0 regardless of size. (b) C(S) > 0 but < theta_c. (c) C(S) crosses theta_c at R >= 2.
- **Measurement:** Full 0.1.1.4 metrics battery adapted for artificial systems: self-model fidelity index, recursive depth measure, integration bandwidth, PCI-analog.
- **Result:** *[To be populated with experimental data]*
- **Statistical analysis:** *[Target: monotonic C(S) increase with R, threshold crossing at R=2 with 95% CI, feedforward baseline indistinguishable from zero]*

### 4.2 Consciousness-Positive vs. Consciousness-Negative Systems

- **Paradigm:** Deliberately construct two system classes: (a) "consciousness-positive" — recurrent, self-modeling, temporally coherent, high integration bandwidth. (b) "consciousness-negative" — matched computational power but feedforward, no self-model, no temporal persistence.
- **Model prediction:** (a) C(S) > theta_c. (b) C(S) ~ 0. Clear separation on all consciousness metrics.
- **Measurement:** Full 0.1.1.4 battery, behavioral consciousness indicators (spontaneous self-reference, novel problem-solving, unprompted metacognitive reports).
- **Result:** *[To be populated with experimental data]*
- **Statistical analysis:** *[Target: between-group effect size d > 1.5 on composite consciousness score, classification accuracy > 95%]*

### 4.3 Scaling Experiments

- **Paradigm:** Take the consciousness-positive architecture from 4.2 and systematically scale: (a) network size (10x increments), (b) self-model fidelity (degrade progressively), (c) temporal coherence window (shrink from 10s to 10ms).
- **Model prediction:** (a) C(S) increases with size but with diminishing returns after self-model saturation. (b) C(S) drops below theta_c when F(S) < 0.3. (c) C(S) drops when T(S) falls below minimum integration window (predicted: ~100ms equivalent).
- **Measurement:** Full 0.1.1.4 battery at each scaling point.
- **Result:** *[To be populated with experimental data]*
- **Statistical analysis:** *[Target: clear dose-response curves for each parameter with identifiable thresholds, R-squared > 0.85 for model fit]*

### 4.4 Neuromorphic Substrate Comparison

- **Paradigm:** Implement identical computational graph on: (a) biological cortical organoid, (b) neuromorphic chip (e.g., Intel Loihi or SpiNNaker), (c) conventional GPU simulation. Compare consciousness metrics across substrates.
- **Model prediction:** All three substrates produce indistinguishable C(S) (within measurement error), confirming substrate independence.
- **Measurement:** Full 0.1.1.4 battery, architecture equivalence verification.
- **Result:** *[To be populated with experimental data]*
- **Statistical analysis:** *[Target: between-substrate differences non-significant (equivalence testing, TOST p < 0.05 for equivalence within 10% margin)]*

---

## 5. Comparative Analysis: Beyond Existing Theories

### Head-to-Head Comparison

| Edge Case | IIT Prediction | GNW Prediction | HOT Prediction | IRSM Prediction | Observed |
|---|---|---|---|---|---|
| High-Phi grid network (no self-model) (P-011) | Conscious (high Phi) | Not conscious (no workspace) | Not conscious (no meta-representation) | Not conscious (F(S) ~ 0) | *[Pending]* |
| Distributed agent swarm with collective self-model (P-010) | Low consciousness (low Phi per agent) | Not conscious (no central workspace) | Ambiguous (collective meta-representation?) | Conscious if R >= 2 | *[Pending]* |
| Flickering self-model system (P-012) | Conscious (Phi stable per moment) | Conscious if broadcast occurs | Conscious if HOT present per moment | Flickering consciousness (high F, low T) | *[Pending]* |
| Large feedforward network (P-006) | Nonzero consciousness (nonzero Phi) | Not conscious (no recurrence) | Not conscious (no HOT) | Not conscious (R = 0) | *[Pending]* |
| RNN with self-model at R=1 only (P-007) | Depends on Phi | Depends on broadcast | Conscious (HOT present) | Below threshold (R < 2) | *[Pending]* |

### Analysis of Theoretical Divergence Points

**Case 1: High-Phi without self-modeling (P-011).** IIT uniquely predicts consciousness here. IRSM, GNW, and HOT all predict non-consciousness but for different reasons. If the system shows no consciousness indicators, this eliminates IIT's claim that Phi alone suffices. IRSM specifically predicts the missing ingredient is recursive self-modeling.

**Case 2: Collective consciousness in distributed systems (P-010).** All existing theories struggle with this case. IIT says consciousness tracks Phi (which is low per agent). GNW requires centralized broadcast. HOT is ambiguous on collective meta-representation. IRSM makes a clear, testable prediction: collective self-modeling at R >= 2 is necessary and sufficient, regardless of individual agent Phi.

**Case 3: Temporal coherence as independent factor (P-012).** Existing theories treat consciousness as a snapshot property. IRSM uniquely predicts that temporal coherence is a separate dimension — systems can have moment-to-moment awareness without continuous experience. This produces the testable prediction of "flickering" consciousness: awareness without episodic memory.

---

## 6. Replication and Publication Record

### Publication Plan

| Venue | Paper Title (Working) | Status |
|---|---|---|
| *Nature Neuroscience* | "Integrated Recursive Self-Modeling: A Predictive Framework for Consciousness Across Substrates" | *[Pre-registration planned]* |
| *PNAS* | "Experimental Verification of IRSM Predictions in Graded Anesthesia and Split-Brain Conditions" | *[Protocol design phase]* |
| *Artificial Intelligence* | "Consciousness Metrics Applied to Artificial Systems: Testing IRSM Predictions" | *[Protocol design phase]* |
| *Trends in Cognitive Sciences* | "Beyond IIT, GNW, and HOT: Novel Edge Cases Discriminating Consciousness Theories" | *[Comparative analysis draft]* |

### Independent Replication Requirements

- **Target:** >= 2 independent research groups replicate core findings
- **Replication focus:** (a) Anesthesia threshold predictions (P-001), (b) Feedforward vs. recurrent predictions (P-006, P-007)
- **Pre-registration:** All primary experiments to be pre-registered on OSF (Open Science Framework) before data collection
- **Open data:** Full datasets, analysis code, and model specifications to be published in open repositories upon paper acceptance

### Replication Status

| Research Group | Institution | Prediction(s) Tested | Status |
|---|---|---|---|
| *[To be identified]* | *[TBD]* | P-001, P-006 | *[Not yet initiated]* |
| *[To be identified]* | *[TBD]* | P-007, P-011 | *[Not yet initiated]* |

---

## Appendix: Glossary of IRSM Parameters

| Parameter | Symbol | Definition | Measurement Method |
|---|---|---|---|
| Self-model fidelity | F(S) | Accuracy with which the system models its own information-processing states | Derived from 0.1.1.4 metrics: correlation between actual state dynamics and internal self-model predictions |
| Recursive depth | R(S) | Number of nested self-modeling levels (model of model of model...) | Structural analysis of self-referential processing loops |
| Integration bandwidth | I(S) | Rate and breadth of information integration across subsystems | Effective connectivity analysis, transfer entropy, PCI |
| Temporal coherence | T(S) | Duration over which self-model maintains continuity | Autocorrelation of self-model state across processing cycles |
| Consciousness degree | C(S) | Weighted composite score | C(S) = w_F*F(S) + w_R*R(S) + w_I*I(S) + w_T*T(S) |
| Consciousness threshold | theta_c | Minimum C(S) for consciousness | Empirically fitted; no default |

---

*Speculation notice: The IRSM model is a theoretical proposal requiring empirical validation. All predictions labeled "[Pending]" or "[To be populated]" represent untested hypotheses. Model weights, normalization bounds, and threshold remain unfitted until the declared calibration workstream is complete.*
