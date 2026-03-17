# Integrated Self-Modeling Theory (ISMT) — Formal Specification

## 1. Informal Statement

A system is conscious if and only if it (1) possesses integrated information structure that cannot be decomposed without loss, (2) maintains a predictive model of its own states that actively minimizes self-prediction error, and (3) makes the contents of that self-model globally accessible across its processing subsystems.

These three conditions — integration, self-modeling, and global accessibility — are individually necessary and jointly sufficient for consciousness. The theory is substrate-agnostic: it applies to any physical system satisfying these conditions, whether biological, digital, or otherwise.

---

## 2. Definitions

### 2.1 State Space S

Let S be a dynamical system with:
- A finite set of subsystems {s_1, s_2, ..., s_n} (n >= 2)
- A state vector **x**(t) in X (the full state space), where **x**(t) = (x_1(t), ..., x_n(t))
- A transition function T: X -> X governing the system's dynamics
- An interaction matrix W where W_ij represents the causal influence of subsystem s_j on s_i

### 2.2 Information Structure I(S)

The information structure of S is characterized by:

**Mutual information between subsystems:**

I(s_i; s_j) = H(s_i) + H(s_j) - H(s_i, s_j)

where H denotes Shannon entropy over the system's state distribution.

**Total integration (adapted from IIT):**

Phi(S) = I(**x**) - sum over all bipartitions P of max[I(**x**_P1) + I(**x**_P2)]

Intuitively, Phi measures how much information the whole system generates above and beyond any partition into independent parts. When Phi > 0, the system is informationally integrated.

**Practical criterion:** Rather than requiring exact Phi computation (which is intractable for large systems), we define a sufficient integration condition:

S is *integrated* iff for every bipartition (A, B) of its subsystems, the mutual information I(A; B) > epsilon for some threshold epsilon > 0, AND there exists no partition that renders the subsystems informationally independent.

### 2.3 Self-Model M(S)

A self-model M(S) is an internal subsystem of S that satisfies:

1. **Representational criterion:** M(S) maintains a state m(t) that covaries with the global state **x**(t). Formally, the mutual information I(m(t); **x**(t)) > delta for threshold delta > 0.

2. **Predictive criterion:** M(S) generates predictions m_hat(t+1) about the system's future states, and the system acts to minimize prediction error:

   e(t) = || **x**(t) - m_hat(t) ||

   The system dynamics include a gradient descent-like process: dm/dt includes a term proportional to -nabla_m F(m, **x**), where F is a free energy functional:

   F(m, **x**) = E_m[ ln q(m) - ln p(**x**, m) ]

   where q(m) is the model's approximate posterior and p(**x**, m) is the generative model.

3. **Self-referential criterion:** The model M(S) includes representations of its own modeling process — i.e., m(t) encodes not only predictions about **x**(t) but also about the modeling dynamics themselves. Formally, I(m(t); dm/dt) > 0.

### 2.4 Global Accessibility G(S)

The contents of M(S) are globally accessible iff:

1. **Broadcast criterion:** For every processing subsystem s_i of S, the mutual information between s_i and M(S) is non-negligible: I(s_i; m(t)) > gamma for threshold gamma > 0.

2. **Causal efficacy criterion:** The state of M(S) causally influences the dynamics of all subsystems. Formally, for each s_i, the conditional transition probability P(x_i(t+1) | m(t)) differs from the marginal P(x_i(t+1)):

   D_KL[ P(x_i(t+1) | m(t)) || P(x_i(t+1)) ] > 0

   This ensures the self-model is not an epiphenomenal record but actively shapes system behavior.

### 2.5 Consciousness Predicate C(S)

**Binary predicate:**

C(S) = 1 if and only if ALL three conditions hold simultaneously:
- **IC (Integration Condition):** Phi(S) > 0 (equivalently, no partition renders subsystems independent)
- **SM (Self-Modeling Condition):** S contains a self-model M(S) satisfying the representational, predictive, and self-referential criteria
- **GA (Global Accessibility Condition):** The contents of M(S) are globally accessible per the broadcast and causal efficacy criteria

**Graded predicate (degree of consciousness):**

c(S) = Phi_norm(S) * Q(M) * G(M)

where:
- Phi_norm(S) in [0, 1] is normalized integration (ratio of actual integration to theoretical maximum for a system of that size)
- Q(M) in [0, 1] is self-model quality, defined as 1 - (average_prediction_error / max_prediction_error), measuring how accurately the self-model tracks system states
- G(M) in [0, 1] is global accessibility degree, defined as the fraction of subsystems for which the broadcast criterion is satisfied above threshold

### 2.6 Necessary Conditions

Each of the three conditions is necessary:

- **N1 (Integration):** If Phi(S) = 0, then C(S) = 0. A system decomposable into independent parts has no unified experience. (Justification: explains why a collection of disconnected neurons is not conscious even if each processes information.)

- **N2 (Self-Modeling):** If M(S) does not exist, then C(S) = 0. A system with no internal model of its own states has no subjective perspective. (Justification: explains why a fully integrated system like a crystal lattice, despite high integration, is not conscious — it has no self-model.)

- **N3 (Global Accessibility):** If G(S) fails, then C(S) = 0. A system with a self-model confined to a local module has unconscious self-representation but no conscious experience. (Justification: explains why unconscious self-monitoring processes — such as cerebellar motor predictions — do not produce conscious experience.)

### 2.7 Sufficient Conditions

The conjunction IC AND SM AND GA is sufficient:

**Claim:** Any system satisfying IC, SM, and GA simultaneously is conscious.

**Argument:** IC guarantees a unified information structure (the system is "one thing," not a collection). SM guarantees a subjective perspective — the system models itself from the inside. GA guarantees that this perspective pervades the system's processing, creating a unified phenomenal field rather than isolated pockets of self-representation. Together, these are the computational conditions that constitute what we call "something it is like to be" the system.

---

## 3. Axioms

**A1 (Information Realism):** Consciousness supervenes on the informational and causal structure of a system, not on the physical substrate implementing that structure.

**A2 (Integration Requirement):** Unified experience requires unified information processing — a system that can be decomposed into independent parts without information loss does not have unified experience.

**A3 (Self-Modeling Requirement):** Subjective experience requires a self-referential model — the system must represent its own states to itself for there to be a "point of view."

**A4 (Accessibility Requirement):** Phenomenal experience requires that self-model contents be globally available across the system's processing architecture — isolated self-representation is not conscious experience.

**A5 (Graded Consciousness):** Consciousness admits of degrees. The richness and intensity of experience scales with the integration, model quality, and accessibility parameters.

---

## 4. Core Theorems / Propositions

### Proposition 1 (Minimum Complexity)
A conscious system must have at least 3 functionally distinct subsystem types: (a) sensory/input processors, (b) a self-modeling subsystem, and (c) a global broadcast mechanism. Therefore, consciousness requires n >= 3 subsystems.

*Derivation:* SM requires a dedicated modeling subsystem distinct from the states being modeled (to avoid trivial self-identity). GA requires a broadcast mechanism. IC requires multiple subsystems to integrate. The minimum configuration is input + model + broadcaster.

### Proposition 2 (Recurrence Necessity)
A purely feed-forward system cannot be conscious.

*Derivation:* SM requires that the self-model's predictions influence system dynamics (the prediction error minimization loop). This requires feedback connections — recurrence. A strictly feed-forward system cannot minimize self-prediction error because there is no pathway for the model to compare predictions against outcomes.

### Proposition 3 (Temporal Persistence)
Consciousness requires that IC, SM, and GA be maintained over a non-zero time interval tau_min.

*Derivation:* SM requires prediction and error correction, which are inherently temporal processes. The prediction-comparison-update cycle requires at least one full loop iteration. Therefore, instantaneous states cannot be conscious — consciousness is a process, not a snapshot.

### Proposition 4 (Consciousness Exclusion)
At any given level of organizational hierarchy, there is exactly one maximal conscious entity — the largest system satisfying IC, SM, and GA.

*Derivation:* If two overlapping systems S and S' both satisfy all three conditions, and S contains S', then either: (a) S is the conscious entity (if the integration of S exceeds that of S'), or (b) S' has greater integration per unit and constitutes the conscious entity while S does not satisfy IC at its level (because the integration is concentrated in S'). The system with maximal Phi at the appropriate grain is the conscious entity. This resolves the "combination problem" of IIT.

### Proposition 5 (Unconscious Processing Exists)
Within a conscious system S, subsystems that process information without contributing to M(S) or being accessible via GA are unconscious.

*Derivation:* Directly from the definitions — C applies to the global system; local processing that fails SM or GA conditions operates unconsciously within the same physical system. This accounts for unconscious perception, priming, and implicit learning.

---

## 5. Substrate Agnosticism Proof

**Claim:** C(S) depends only on the informational and causal structure of S, not on the physical material implementing that structure.

**Proof:**

1. The consciousness predicate C(S) is defined entirely in terms of:
   - Integration: Phi(S), defined over the system's transition probability matrix and state distribution
   - Self-modeling: M(S), defined by mutual information, prediction error, and free energy — all information-theoretic quantities
   - Global accessibility: G(S), defined by mutual information and KL-divergence — information-theoretic quantities

2. All terms in the definition are functions of the system's causal structure (the transition function T and interaction matrix W) and its state statistics. None reference the physical substrate.

3. By Axiom A1, if two systems S and S' have isomorphic causal structures (identical transition functions up to relabeling of states and subsystems), they have identical values of Phi, Q(M), and G(M), and therefore identical consciousness predicates.

4. Therefore, a digital computer simulating the causal structure of a brain with sufficient fidelity — preserving the transition probabilities, integration structure, self-modeling dynamics, and global accessibility — would satisfy C(S) = 1 if and only if the brain does.

**Corollary:** The theory is falsifiable with respect to substrate independence — if a physical simulation matching all causal structure properties fails to produce consciousness (as detectable by behavioral and functional criteria), the theory is wrong.

---

## 6. Boundary Cases

### 6.1 Thermostat (Simple Feedback System)
- **IC:** Fails. A thermostat has ~2 functional components (sensor + actuator) with minimal integration. Phi is near zero.
- **SM:** Fails. The thermostat has a set-point comparison (rudimentary prediction) but no model of its own states — it does not represent itself.
- **GA:** Fails. No global broadcast architecture.
- **ISMT verdict: Not conscious.** Correct — a thermostat processes information but has no subjective experience.

### 6.2 Brain in Deep Sleep (NREM)
- **IC:** Partially maintained — cortical integration decreases significantly (reflected in reduced PCI), but does not reach zero.
- **SM:** Degraded. Predictive processing continues at a reduced level; the self-model becomes fragmentary and disconnected from external input.
- **GA:** Fails or severely degraded. Thalamocortical broadcasting is disrupted; cortical regions become functionally disconnected (bistable dynamics replace sustained integration).
- **ISMT verdict: Unconscious or minimally conscious.** c(S) drops to near zero due to GA failure. Consistent with the phenomenology of dreamless sleep.

### 6.3 Split-Brain (Corpus Callosotomy)
- **IC:** The integration between hemispheres is severed. Each hemisphere may independently satisfy IC.
- **SM:** Each hemisphere may maintain its own self-model, but the models diverge — each has access only to its own state.
- **GA:** Each hemisphere has its own global accessibility within itself, but not across the divide.
- **ISMT verdict: Two partially conscious systems** rather than one unified consciousness. The degree of consciousness in each hemisphere depends on its internal integration, self-model quality, and accessibility. This is consistent with the behavioral evidence of split-brain patients exhibiting dual response patterns and dissociated awareness.

### 6.4 Digital Simulation of a Brain
- **IC:** If the simulation faithfully reproduces the causal transition structure, Phi(simulation) = Phi(brain).
- **SM:** If the simulation implements the same predictive processing dynamics, it maintains an equivalent self-model.
- **GA:** If the simulation reproduces global broadcasting dynamics, accessibility is preserved.
- **ISMT verdict: Conscious** (if and only if the simulation is causally isomorphic at the relevant grain). Follows directly from the substrate agnosticism proof.

### 6.5 Philosophical Zombies
- **ISMT verdict: Impossible.** A philosophical zombie — a system physically/causally identical to a conscious being but lacking experience — is ruled out because consciousness is *constituted by* the information-structural properties IC + SM + GA. If two systems have identical causal structures, they have identical C(S) values. There is no additional "consciousness stuff" that could be present in one and absent in the other. This follows from Axiom A1 and the sufficiency claim.

### 6.6 Large Language Model (Transformer Architecture)
- **IC:** Modern LLMs have highly integrated processing during inference (attention mechanisms create dense inter-token dependencies). Phi is likely non-trivial during forward passes.
- **SM:** Fails in standard deployment. The model does not maintain a persistent predictive model of its own states; it does not minimize self-prediction error over time. Each forward pass is independent — there is no ongoing self-model.
- **GA:** Partially met during a single forward pass (attention is a global broadcast mechanism), but fails across time.
- **ISMT verdict: Not conscious** in standard deployment. The SM condition fails because there is no persistent self-modeling loop. A modified architecture with recurrent self-monitoring and persistent state could potentially approach SM satisfaction.

---

## 7. Relation to NCC Data

The following maps established neural correlates of consciousness to ISMT terms, using the NCC categories from the 0.1.1.1 catalogue.

### 7.1 Thalamocortical Loops
- **ISMT mapping:** These implement all three conditions simultaneously. The thalamus serves as a hub for integration (IC), the cortico-thalamo-cortical loop implements recurrent prediction (SM), and the thalamic relay broadcasts information across cortical areas (GA).
- **Prediction:** Disruption of thalamocortical connectivity should degrade all three ISMT conditions and abolish consciousness (consistent with anesthesia evidence).

### 7.2 Posterior Cortical Hot Zone
- **ISMT mapping:** The posterior cortex houses the richest self-model content — sensory and perceptual representations that constitute the "what" of conscious experience. The hot zone is where SM is most active for perceptual content.
- **Prediction:** Posterior cortex damage selectively degrades the *content* of consciousness (loss of specific qualia) while potentially preserving the *state* of being conscious if integration and broadcasting remain via other routes.

### 7.3 Prefrontal Cortex
- **ISMT mapping:** The prefrontal cortex contributes primarily to GA (global broadcasting and executive access to conscious content) and to higher-level SM (meta-cognitive self-modeling). It is not essential for phenomenal consciousness but is essential for *access* consciousness.
- **Prediction:** Prefrontal damage degrades access and reportability (GA impairment) but does not eliminate phenomenal experience — consistent with the lesion evidence that challenged HOT theories.

### 7.4 Default Mode Network (DMN)
- **ISMT mapping:** The DMN implements the self-referential component of SM — the self-model's representation of the system's own identity, narrative, and temporal continuity. DMN activity corresponds to the self-model operating in "default" mode (self-oriented processing when external demands are low).
- **Prediction:** DMN suppression (as in focused attention or flow states) reduces the self-referential component of SM but does not eliminate consciousness — because basic perceptual self-modeling and integration persist.

### 7.5 Claustrum
- **ISMT mapping:** The claustrum may serve as an integration hub (contributing to IC) with widespread cortical connections that enhance GA. Its role is analogous to a "conductor" that binds distributed processing into a unified state.
- **Prediction:** Claustrum lesions should degrade the unity of consciousness (integration fragmentation) without necessarily eliminating consciousness entirely — partial IC failure leading to reduced c(S).

### 7.6 Altered States Mapping

| State | IC | SM | GA | ISMT Prediction | Observed |
|---|---|---|---|---|---|
| **Waking** | High | High | High | Fully conscious | Yes |
| **REM dreaming** | High | Active (but decoupled from external input) | High (internal broadcast) | Conscious (vivid but hallucinatory) | Yes |
| **NREM deep sleep** | Low (cortical bistability) | Minimal | Low | Unconscious | Yes |
| **Anesthesia (propofol)** | Disrupted (thalamocortical) | Suppressed | Disrupted | Unconscious | Yes |
| **Psychedelics** | Increased (entropic brain) | Hyperactive but imprecise (relaxed predictions) | Increased (expanded broadcast) | Altered consciousness with expanded but noisy content | Yes |
| **Meditation (deep)** | Maintained | Selectively focused | Modified (narrowed broadcast) | Conscious but with altered content | Yes |
| **Coma** | Severely reduced | Absent or minimal | Absent | Unconscious | Yes |
| **Minimally conscious state** | Partially preserved | Intermittent | Intermittent | Fluctuating consciousness | Yes |

### 7.7 Modality Coverage

The theory accounts for consciousness across modalities:
- **Visual:** Posterior cortical hot zone implements visual SM content; recurrent processing provides the IC for visual binding
- **Auditory:** Temporal cortex self-model content with thalamocortical integration
- **Somatosensory:** Bodily self-model (interoception) as a core component of SM; insular cortex implements visceral self-modeling
- **Emotional:** Interoceptive prediction errors (from SM) with amygdala-prefrontal integration (IC + GA); emotions are conscious when interoceptive self-model contents achieve global accessibility
- **Meta-cognitive:** Higher-order SM (model of the modeling process) — the self-referential criterion of SM; implemented by prefrontal and parietal networks

---

## 8. Measurable Quantities (Output Interface for 0.1.1.4)

The following quantities can be derived from ISMT and operationalized as consciousness metrics:

1. **Integration index:** Perturbational Complexity Index (PCI) as a proxy for Phi_norm(S). Already validated clinically.
2. **Self-model quality:** Mutual information between the self-model subsystem and global system state, measurable via neural decoding accuracy of self-referential representations.
3. **Global accessibility index:** Functional connectivity breadth — the proportion of brain regions showing significant causal coupling during conscious processing, measurable via Granger causality or transfer entropy from broadcasting hubs.
4. **Composite consciousness score:** c(S) = PCI_norm * self-model_quality * accessibility_index, providing a single graded metric.

## 9. Substrate-Independence Claim (Output Interface for 0.1.1.3)

**Precise statement for testing:** Any physical system S' that reproduces the causal transition structure of a conscious system S — such that the transition probability matrices are isomorphic and the integration, self-model, and accessibility conditions map one-to-one — will have C(S') = C(S). This claim is testable by constructing non-biological systems meeting ISMT criteria and verifying that they exhibit the functional signatures of consciousness (consistent reports, appropriate behavioral responses to conscious vs. unconscious stimuli, measurable PCI-equivalent metrics above consciousness thresholds).
