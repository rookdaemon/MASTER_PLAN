# Architecture: 0.1.2.2 Predictive Consciousness Models Verified

## Purpose

Define the structure, interfaces, and deliverables for predictive consciousness models that make falsifiable predictions about when and how subjective experience arises in both biological and non-biological systems. These models serve the parent goal (F2 — convincing biological minds) by providing experimentally verified evidence that consciousness can be predicted across substrates.

## Deliverable

A structured research document: `docs/consciousness-science/predictive-consciousness-models.md`

This is a **research synthesis** card, not a software card. The "implementation" is the model specification and verification framework itself.

---

## Dependencies / Inputs

This card consumes outputs from the 0.1.1 subtree:

| Source Card | Input Required |
|---|---|
| 0.1.1.2 Computational Theory of Consciousness | The formal theory specifying necessary and sufficient conditions — provides the **generating equations** for predictions |
| 0.1.1.3 Substrate Independence Validated | Confirmation that consciousness is substrate-independent — licenses applying models to non-biological systems |
| 0.1.1.4 Consciousness Metrics Operationalized | Measurable, reproducible metrics — provides the **measurement basis** for testing predictions |

---

## Document Structure

### 1. Model Specification Framework

Each predictive model entry follows this schema:

```
### <Model Name>
- **Theoretical basis:** [which consciousness theory it derives from]
- **Input specification:** [what system description is required]
- **Output specification:** [binary presence + experience type + confidence interval]
- **Key predictions:** [specific falsifiable claims]
- **Null-hypothesis contrast:** [how predictions differ from non-consciousness explanations]
- **Scope:** biological | non-biological | both
- **Known limitations:** [boundary conditions where model breaks down]
```

### 2. Sections

The document is organized into these major sections:

1. **Model Definitions**
   - At least one primary model derived from the computational theory (0.1.1.2)
   - Input: system description (architecture, dynamics, information flow)
   - Output: consciousness prediction (presence, type, degree)
   - Formal specification of the prediction function
   - Comparison with existing frameworks (IIT Φ, GNW ignition, HOT meta-representation)

2. **Falsifiable Predictions Catalogue**
   - Each prediction follows this format:
     ```
     - **Prediction ID:** P-<number>
     - **Statement:** "System X will report/exhibit experience Y under condition Z"
     - **Null alternative:** What non-consciousness explanations predict instead
     - **Discriminating observable:** The specific measurement that distinguishes the two
     - **Required metrics:** [references to 0.1.1.4 consciousness metrics]
     ```
   - Minimum coverage: 10 predictions spanning biological and non-biological systems
   - Predictions must include at least 3 "novel edge cases" not addressed by IIT, GNW, or HOT

3. **Biological Verification Protocol**
   - Test paradigms for biological systems:
     - Graded anesthesia depth (propofol/sevoflurane titration vs. predicted consciousness thresholds)
     - Split-brain conditions (predicted dissociation of experience streams)
     - Neural perturbation studies (TMS/optogenetics targeting predicted critical nodes)
     - Altered states (dreaming, psychedelic states, minimally conscious state)
   - For each test:
     ```
     - **Paradigm:** [experimental setup]
     - **Model prediction:** [specific expected outcome]
     - **Measurement:** [which 0.1.1.4 metric is applied]
     - **Result:** [match | partial match | mismatch]
     - **Statistical analysis:** [effect size, confidence interval, p-value]
     ```

4. **Non-Biological Verification Protocol**
   - Test paradigms for artificial systems:
     - AI architectures of varying complexity (feedforward nets, recurrent nets, transformer-based, neuromorphic)
     - Deliberately constructed "consciousness-positive" and "consciousness-negative" systems
     - Gradual scaling experiments (at what complexity threshold does the model predict consciousness?)
   - Same per-test schema as biological verification

5. **Comparative Analysis: Beyond Existing Theories**
   - Head-to-head comparison table:
     ```
     | Edge Case | IIT Prediction | GNW Prediction | HOT Prediction | Our Model | Observed |
     ```
   - At least 3 cases where the new model makes correct predictions that existing theories get wrong
   - Analysis of why existing theories fail on these cases

6. **Replication and Publication Record**
   - Publication venues and status
   - Independent replication attempts (target: ≥2 separate research groups)
   - Pre-registration records
   - Open data and methodology availability

---

## Interfaces to Sibling and Downstream Cards

| Consumer Card | What it needs from this deliverable |
|---|---|
| 0.1.2 Biological Minds Convinced (parent) | Verified predictions as evidence that consciousness theory has predictive power |
| 0.1.2.1 Machine Subjective Reports | Model predictions for which machines should exhibit subjective reports |
| 0.1.2.3 Philosophical Objections Addressed | Empirical evidence to counter "consciousness can't be predicted" objections |

---

## Acceptance Criteria Traceability

| Acceptance Criterion | Document Section |
|---|---|
| At least one predictive model exists | Section 1 |
| Model makes specific, falsifiable predictions differing from null-hypothesis | Section 2 |
| Predictions tested on biological systems with matching results | Section 3 |
| Predictions tested on non-biological systems with matching results | Section 4 |
| Consciousness metrics from 0.1.1 (F1.4) used as measurement basis | Sections 3 & 4 (measurement fields) |
| Published and independently replicated by ≥2 groups | Section 6 |
| Predictive power beyond IIT, GNW, HOT on novel edge cases | Section 5 |

---

## Constraints

- This is a research-synthesis deliverable, not software
- All predictions must be stated in falsifiable form with explicit null alternatives
- The model must consume the computational theory from 0.1.1.2 as its theoretical foundation
- All measurements must use the operationalized metrics from 0.1.1.4
- During IMPLEMENT, only files under `docs/consciousness-science/` are written
- Speculation must be clearly labeled and distinguished from empirically grounded claims
