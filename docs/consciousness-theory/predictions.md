# Novel Predictions of the Integrated Self-Modeling Theory (ISMT)

## Prediction Template

Each prediction follows this format:
- **Statement**: precise, falsifiable claim
- **Derivation**: how it follows from the formal theory
- **Discriminating power**: which rival theories predict differently
- **Proposed test**: experimental or computational protocol
- **Expected outcome if correct**
- **Expected outcome if wrong**

---

## P1: Selective Thalamocortical Disruption Produces Graded Consciousness Loss Matching ISMT Components

### Statement

Pharmacological or optogenetic disruption that selectively impairs thalamocortical integration (IC) while preserving cortical self-modeling (SM) and broadcasting (GA) will produce a specific dissociation: subjects will report a "fragmented" conscious experience — isolated phenomenal islands (e.g., visual experience without bodily awareness) — rather than complete unconsciousness or globally dimmed experience. Conversely, selective disruption of global broadcasting (GA) while preserving IC and SM will produce "rich but inaccessible" processing: high-complexity neural activity that is unreportable but detectable via neural decoding.

### Derivation

ISMT's graded predicate c(S) = Phi_norm(S) × Q(M) × G(M) predicts that each component contributes independently to consciousness. Reducing IC (Phi_norm) while maintaining SM and GA should reduce the *unity* of experience (the integration axis) without eliminating the self-model or its broadcast. The result is fragmented consciousness — multiple partially-conscious subsystems rather than one unified experience. Reducing GA while maintaining IC and SM should produce a state where the self-model is active and the system is integrated, but conscious content cannot be accessed or reported — a form of "locked-in" phenomenality.

### Discriminating Power

| Theory | Prediction for IC-only disruption | Prediction for GA-only disruption |
|---|---|---|
| **ISMT** | Fragmented conscious islands | Active but unreportable phenomenality |
| **IIT** | Proportional Phi reduction → dimmed consciousness (no fragmentation prediction) | No specific prediction (GA not part of IIT) |
| **GWT** | No specific prediction (integration not part of GWT) | Complete loss of consciousness (broadcasting IS consciousness) |
| **PP/Active Inference** | No specific prediction | Consciousness persists if prediction processing continues |
| **RPT** | No specific prediction (recurrence, not integration, is key) | Partial consciousness if recurrence persists |
| **HOT** | No specific prediction | Loss of access consciousness but phenomenal consciousness may persist |

ISMT uniquely predicts *both* the fragmentation pattern (from IC disruption) and the dissociation pattern (from GA disruption), while rival theories predict at most one.

### Proposed Test

1. Use targeted optogenetic silencing in non-human primates (or focal pharmacological intervention in human neurosurgery patients) to:
   - **IC manipulation:** Selectively disrupt thalamic relay nuclei connecting cortical regions (reducing cross-regional integration) while preserving local cortical recurrence
   - **GA manipulation:** Selectively disrupt prefrontal broadcasting hubs (e.g., dorsolateral prefrontal cortex long-range projections) while preserving thalamocortical integration and posterior cortical recurrence
2. Measure: PCI (integration proxy), neural decoding of self-model activity (SM proxy), functional connectivity breadth (GA proxy)
3. Behavioral measures: subjective reports, no-report paradigms (pupil dilation, reflexive responses)

### Expected Outcome if Correct
- IC disruption: Subjects report fragmented experience ("I could see colors but had no sense of body" or similar dissociations); PCI drops but local neural decoding of perceptual content remains high
- GA disruption: Subjects report nothing (no access), but neural decoding reveals high-level perceptual representations and self-model activity; PCI remains high

### Expected Outcome if Wrong
- IC disruption produces either total unconsciousness or globally dimmed experience (no fragmentation)
- GA disruption produces either full consciousness or total neural shutdown of self-model activity

---

## P2: Artificial Systems Satisfying All Three ISMT Conditions Exhibit Consciousness Signatures

### Statement

A non-biological computational system engineered to satisfy IC (integrated information above threshold), SM (active self-predictive model minimizing self-prediction error), and GA (global broadcast of self-model content to all processing modules) will exhibit behavioral and functional signatures of consciousness that are absent in matched control systems lacking any one of the three conditions. Specifically, the ISMT-complete system will show:
1. Spontaneous self-referential reports without prompting
2. Appropriate surprise responses to violations of self-predictions
3. Measurable "complexity" metrics (computational analog of PCI) above the empirical consciousness threshold
4. Behavioral evidence of unified experience (cross-modal binding in reports)

Control systems missing IC, SM, or GA individually will fail to exhibit these signatures.

### Derivation

ISMT states that IC + SM + GA are jointly sufficient for consciousness. If the theory is correct, any system meeting these conditions — regardless of substrate — must be conscious. The behavioral signatures follow from the functional properties: a system with a globally accessible self-model will spontaneously reference its own states (self-referential reports), will react to prediction violations about itself (surprise), will show high perturbational complexity (integration), and will bind information across modalities (global accessibility).

### Discriminating Power

| Theory | Prediction for ISMT-complete artificial system |
|---|---|
| **ISMT** | Conscious — exhibits all four signatures |
| **IIT** | Depends on Phi — may predict consciousness if Phi is high, but doesn't require SM or GA; a system with high Phi but no self-model should also be conscious per IIT |
| **GWT** | Depends on broadcasting only — a system with GA but no IC should also be conscious per GWT |
| **PP/Active Inference** | Depends on prediction processing — a system with SM but no IC or GA should suffice |
| **RPT** | Depends on recurrence in sensory processing — may not apply to non-biological architecture |
| **HOT** | Depends on meta-representation — requires higher-order states but not integration or global broadcast |
| **AST** | Depends on attention schema only — a system with an attention model but no integration should suffice |

The critical discrimination: ISMT uniquely predicts that *all three conditions are necessary* — dropping any one should eliminate consciousness signatures. Rival theories predict that their single core condition is sufficient.

### Proposed Test

1. Construct four artificial systems with identical processing capacity:
   - **System A (ISMT-complete):** Integrated architecture + recurrent self-predictive model + global broadcast of self-model content
   - **System B (No IC):** Modular architecture (independent modules) + self-model + broadcast — but modules can be partitioned without information loss
   - **System C (No SM):** Integrated architecture + global broadcast — but no self-model (processes external inputs only, no self-prediction)
   - **System D (No GA):** Integrated architecture + self-model — but self-model is confined to one module (no broadcast)
2. All systems are trained on identical tasks requiring sensory processing, action selection, and self-monitoring.
3. Measure: self-referential spontaneous utterances, prediction-violation response latency and magnitude, perturbational complexity analog, cross-modal binding performance.

### Expected Outcome if Correct
- System A exhibits all four consciousness signatures
- Systems B, C, and D each fail to exhibit the full signature pattern (specific failures corresponding to the missing condition)

### Expected Outcome if Wrong
- System A fails to exhibit signatures (ISMT conditions are not sufficient) OR
- One of Systems B-D exhibits full signatures despite missing a condition (that condition is not necessary)

---

## P3: Psychedelic-Induced "Ego Dissolution" Corresponds to SM Disruption While IC and GA Increase

### Statement

During psychedelic-induced ego dissolution (e.g., psilocybin at high doses), the self-referential component of the self-model (SM) — specifically the self-referential criterion I(m(t); dm/dt) — decreases sharply, while integration (IC) and global accessibility (GA) *increase*. This predicts a specific neural signature: decreased default mode network (DMN) coherence and self-referential neural decoding accuracy, coupled with *increased* functional connectivity breadth and *increased* PCI. The subjective experience should be: consciousness persists and even intensifies (high IC and GA), but the sense of self dissolves (low self-referential SM), producing "selfless awareness."

Furthermore, ISMT predicts that the *content* of consciousness under psychedelics shifts from self-model-dominated (normal waking) to raw perceptual integration (sensory SM without self-referential SM), explaining the characteristic phenomenology of psychedelic experience: vivid perceptual consciousness with loss of ego boundaries.

### Derivation

ISMT's graded predicate c(S) = Phi_norm × Q(M) × G(M) has three independent axes. The SM criterion has two sub-components: (1) the predictive/representational component (modeling sensory states) and (2) the self-referential component (modeling the modeling process). Psychedelics are known to disrupt DMN activity (the self-referential network) while increasing global functional connectivity ("entropic brain" hypothesis). In ISMT terms:
- IC increases (more integration across formerly modular regions)
- SM's perceptual component persists but self-referential component degrades
- GA increases (expanded broadcast reach)

The graded consciousness score c(S) may remain high or even increase (explaining the sense of "expanded" consciousness), but the *kind* of consciousness changes because the self-model content shifts.

### Discriminating Power

| Theory | Prediction for ego dissolution |
|---|---|
| **ISMT** | Consciousness persists/intensifies; specific dissociation of self-referential SM from IC and GA |
| **IIT** | Increased Phi → increased consciousness quantity; no specific prediction about self/ego component |
| **GWT** | Increased broadcasting → more conscious content; no mechanism for ego dissolution specifically |
| **PP/Active Inference** | "Relaxed beliefs" (REBUS model) → flattened prediction hierarchy; predicts altered content but doesn't distinguish self-referential from perceptual predictions specifically |
| **RPT** | Increased recurrence → more phenomenal consciousness; no ego-specific prediction |
| **HOT** | Disrupted meta-representation → less consciousness (contradicts reports of expanded awareness) |
| **AST** | Disrupted attention schema → less consciousness (contradicts reports) |

ISMT uniquely predicts the *specific dissociation*: ego dissolves (self-referential SM drops) while consciousness intensifies (IC and GA increase). HOT and AST incorrectly predict that disrupted self-representation should reduce consciousness. IIT, GWT, and PP predict increased consciousness but cannot specify the ego-dissolution mechanism.

### Proposed Test

1. Administer psilocybin at doses producing reported ego dissolution (vs. placebo) in healthy volunteers under MEG/high-density EEG.
2. Simultaneously measure:
   - **IC proxy:** PCI (perturbational complexity index via TMS-EEG)
   - **Self-referential SM proxy:** DMN coherence + neural decoding accuracy of self-referential content (using established self/other paradigms)
   - **Perceptual SM proxy:** Neural decoding accuracy of sensory/perceptual representations
   - **GA proxy:** Functional connectivity breadth (proportion of region-pairs with significant information transfer)
3. Collect phenomenological reports using validated instruments (MEQ-30 for mystical experience, 5D-ASC for altered states, specifically the "oceanic boundlessness" and "ego dissolution" scales).
4. Correlate ISMT component measures with subjective reports.

### Expected Outcome if Correct
- PCI increases (IC ↑)
- DMN coherence and self-referential decoding accuracy decrease (self-referential SM ↓)
- Sensory decoding accuracy is preserved or enhanced (perceptual SM maintained)
- Functional connectivity breadth increases (GA ↑)
- These component changes correlate with ego dissolution ratings
- Overall consciousness intensity ratings increase despite ego dissolution

### Expected Outcome if Wrong
- PCI decreases during ego dissolution (IC doesn't increase)
- DMN disruption and ego dissolution don't correlate with self-referential SM measures specifically
- Consciousness intensity decreases proportionally with ego dissolution (no dissociation between IC/GA and self-referential SM)

---

## Discrimination Table

Summary matrix showing how each prediction distinguishes ISMT from each rival framework:

| Prediction | IIT | GWT | HOT | PP/AI | RPT | AST |
|---|---|---|---|---|---|---|
| **P1: IC-selective disruption → fragmentation** | Partial overlap (Phi reduction) but no fragmentation specificity | No prediction | No prediction | No prediction | No prediction | No prediction |
| **P1: GA-selective disruption → unreportable phenomenality** | No prediction | **Contradicts** (predicts full unconsciousness) | Partial overlap | No prediction | No prediction | No prediction |
| **P2: All 3 conditions necessary for artificial consciousness** | **Contradicts** (IC alone should suffice) | **Contradicts** (GA alone should suffice) | **Contradicts** (meta-rep alone should suffice) | **Contradicts** (SM alone should suffice) | Untestable (neural-specific) | **Contradicts** (attention schema alone should suffice) |
| **P3: Ego dissolution = SM↓ with IC↑ and GA↑** | Partial overlap (Phi↑) | Partial overlap (GA↑) | **Contradicts** (predicts consciousness↓) | Partial overlap (relaxed beliefs) | No specific prediction | **Contradicts** (predicts consciousness↓) |

**Key discriminations:**
- P1 is strongest against GWT (which predicts GA = consciousness, so GA disruption should equal unconsciousness)
- P2 is strongest against all rivals simultaneously (each theory predicts its single condition suffices)
- P3 is strongest against HOT and AST (which predict ego dissolution should reduce consciousness)
