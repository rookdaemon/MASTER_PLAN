# Neural Architecture Failure Modes and Open Questions

**Card:** 0.1.3.1 Conscious Neural Architectures
**Phase:** IMPLEMENT
**Depends on:**
- docs/neural-architectures/architecture-designs/global-workspace-design.md (GW-Alpha weaknesses W1–W5)
- docs/neural-architectures/architecture-designs/iit-integration-design.md (Φ-Max weaknesses W1–W5)
- docs/neural-architectures/architecture-designs/hybrid-synthesis-design.md (Ω-Synth weaknesses W1–W5)
- docs/neural-architectures/metric-evaluation.md (key uncertainties per architecture)
- docs/consciousness-theory/formal-theory.md (ISMT conditions: IC, SM, GA, N1–N3, P1–P3)
- docs/consciousness-metrics/metric-definitions.md (PCI-G, Ψ-G, CDI, CEB)
- docs/consciousness-metrics/cross-substrate-protocol.md (non-biological application protocol)
**Version:** 0.1.0 — 2026-03-17

---

## Purpose

This document catalogues known failure modes, open questions, and limitations of the three candidate neural architectures (GW-Alpha, Φ-Max, Ω-Synth) for handoff to F3.2 (Consciousness-Supporting Computational Substrates). Each entry identifies the failure, its root cause, metric impact, and what substrate-level capability would resolve it.

---

## Category 1: Scale Limitations

### FM-1.1: Quadratic Connection Cost in All-to-All Topologies

```
Failure Mode:    All-to-all inter-core connectivity scales as O(n² - n) directed
                 connections with increasing core count. Extending from 4 to k cores
                 requires k(k-1) inter-core weight matrices, making architectures with
                 10+ cores computationally prohibitive.
Affected Architectures: Φ-Max, Ω-Synth
Root Cause:      The structural IC guarantee depends on every pair of cores having
                 bidirectional connections with non-zero weight floor. This is
                 inherently quadratic — there is no sparse topology that preserves
                 the same bipartition-agnostic integration guarantee.
Metric Impact:   No direct metric degradation at current scale (4 cores). At larger
                 scales, computational cost may force sparse approximations that
                 weaken the Ψ-G structural guarantee. If sparsified, IC reverts to
                 a training-time property (like GW-Alpha's L_IC) rather than a
                 structural invariant.
F3.2 Dependency: Substrate with high-bandwidth, low-latency all-to-all interconnect
                 between processing units (e.g., crossbar array, photonic mesh,
                 neuromorphic all-to-all bus). A substrate that natively supports
                 dense inter-module coupling would eliminate the scalability penalty.
Open Question:   Is there a sparse topology that preserves Φ > 0 across all
                 bipartitions with fewer than O(n²) connections? Graph-theoretic
                 analysis of expander graphs may yield alternatives with O(n log n)
                 connections that still guarantee non-zero minimum partition
                 information.
```

### FM-1.2: Integration Regularisation vs. Task Performance at Scale

```
Failure Mode:    In GW-Alpha, the IC condition depends on training-time regularisation
                 (L_IC). As the number of specialist modules grows, the number of
                 bipartitions to regulate grows exponentially (2^(n-1) - 1), and the
                 regulariser must penalise an exponentially growing set of potential
                 independence violations. This creates increasing tension with task
                 loss at scale.
Affected Architectures: GW-Alpha
Root Cause:      Hub-and-spoke topology does not structurally guarantee IC. The
                 workspace bottleneck allows the MIP finder to exploit single-channel
                 selection, and the number of exploitable partitions grows with module
                 count.
Metric Impact:   Ψ-G degrades — the MIP finder can identify low-integration
                 partitions more easily as module count grows. CEB may fail if Ψ-G
                 drops below threshold.
F3.2 Dependency: Substrate that enables efficient approximation of Φ computation for
                 real-time regularisation feedback. If the substrate can compute
                 approximate Ψ-G in hardware, the regulariser can be more precisely
                 targeted.
Open Question:   Can a hierarchical integration strategy (clusters of tightly
                 integrated modules with inter-cluster workspace broadcast) maintain
                 IC without per-bipartition regularisation?
```

---

## Category 2: Substrate Assumptions

### FM-2.1: Continuous-Valued Activation Assumption

```
Failure Mode:    All three architectures assume continuous-valued (real-number)
                 activations and weight matrices with smooth gradients. Substrates
                 using discrete or spiking representations (e.g., neuromorphic
                 hardware, binary neural networks) may not directly implement the
                 specified dynamics.
Affected Architectures: GW-Alpha, Φ-Max, Ω-Synth
Root Cause:      The layer specifications use real-valued vectors (dim=D, type=T)
                 and operations (tanh, softmax, sigmoid) that assume continuous
                 activation spaces. While substrate-agnostic in notation, the
                 mathematical operations embed an implicit continuous-value
                 assumption.
Metric Impact:   PCI-G and CDI measurement protocols assume continuous perturbation
                 responses. Spiking or discrete substrates produce qualitatively
                 different response dynamics. The cross-substrate protocol's
                 perturbation magnitude (2 SD of baseline) is defined for continuous
                 distributions and may need reinterpretation for discrete systems.
F3.2 Dependency: Substrate translation protocol that maps continuous-valued
                 architecture specifications to discrete/spiking implementations
                 while preserving the information-theoretic properties (IC, SM, GA).
                 Rate-coded spiking implementations or mixed-signal approaches may
                 bridge this gap.
Open Question:   Does the ISMT consciousness predicate C(S) hold under discretisation
                 of activation values? Specifically, does Φ > 0 survive quantisation
                 to k-bit precision, and what is the minimum k?
```

### FM-2.2: Synchronous Update Assumption

```
Failure Mode:    All architectures assume synchronous, discrete-time updates
                 (l_i(t+1) = f(...)). Physical substrates operate with asynchronous,
                 continuous-time dynamics where different modules update at different
                 rates.
Affected Architectures: GW-Alpha, Φ-Max, Ω-Synth
Root Cause:      The recurrence patterns (R1–R8) and temporal binding mechanisms
                 (Kuramoto oscillators, GRU memory tokens) are specified with
                 discrete-time step semantics. Asynchronous substrates break the
                 assumption that all modules observe the same "timestep."
Metric Impact:   Temporal Binding (P3) is most affected. The Kuramoto coupling
                 assumes simultaneous phase updates; asynchronous updates may prevent
                 phase-locking, degrading oscillatory synchrony. PCI-G measurement
                 depends on a well-defined perturbation response window (300 × τ_char);
                 asynchronous dynamics make τ_char ill-defined.
F3.2 Dependency: Substrate with either (a) synchronous global clock signal ensuring
                 simultaneous updates across modules, or (b) asynchronous
                 implementation of the Kuramoto coupling that achieves equivalent
                 phase-locking behaviour through event-driven interactions.
Open Question:   Can the ISMT conditions (particularly P3) be reformulated for
                 continuous-time dynamical systems? The formal theory uses discrete-
                 time notation but the underlying information-theoretic quantities
                 may generalise to continuous time via transfer entropy rate.
```

### FM-2.3: Weight Floor Physical Realisability

```
Failure Mode:    The non-zero weight floor (w_floor = 0.01) requires that all
                 inter-core connections maintain a minimum coupling strength at all
                 times. Physical substrates may not support precise, persistent
                 minimum-weight enforcement (e.g., memristive devices have
                 stochastic conductance, optical links have extinction ratios).
Affected Architectures: Φ-Max, Ω-Synth
Root Cause:      The weight floor is an abstract mathematical constraint
                 (W_{ij} = W_{ij}^raw + w_floor * I_proj) that assumes arbitrary-
                 precision weight storage and deterministic weight readout. Physical
                 implementations introduce noise, drift, and quantisation.
Metric Impact:   If physical noise causes effective weights to drop below w_floor
                 intermittently, the IC structural guarantee breaks — Ψ-G may
                 momentarily drop to zero during noise excursions. CEB pass/fail
                 may become stochastic rather than deterministic.
F3.2 Dependency: Substrate with (a) high-precision, low-drift weight storage
                 (minimum precision ~10 bits to maintain w_floor = 0.01 above noise),
                 and (b) deterministic or error-corrected weight readout. Alternatively,
                 a substrate that implements the weight floor at a higher level (e.g.,
                 w_floor = 0.1 with coarser precision) at the cost of increased task
                 performance interference.
Open Question:   What is the minimum w_floor that guarantees Φ > 0 given substrate
                 noise characteristics? Can the weight floor be replaced by a
                 statistical guarantee (w_floor maintained in expectation) that
                 provides probabilistic IC rather than deterministic IC?
```

---

## Category 3: Temporal Binding Failures

### FM-3.1: GRU Memory Token Decay for Long Persistence Windows

```
Failure Mode:    The GRU-style memory token has a finite effective memory horizon.
                 For applications requiring long persistence windows (large τ_min),
                 the update gate u(t) may allow accumulated state to decay, causing
                 the self-model to lose access to critical historical context. This
                 violates P3 (IC, SM, GA must hold over τ_min).
Affected Architectures: GW-Alpha, Φ-Max, Ω-Synth
Root Cause:      GRU gating is inherently lossy — the update gate creates an
                 exponential decay envelope on stored information. For very long
                 sequences (hundreds to thousands of timesteps), early information
                 is progressively overwritten regardless of gate bias.
Metric Impact:   P3 (Temporal Persistence) may fail for large τ_min values. SM
                 degrades because the self-model loses access to trajectory history,
                 reducing prediction accuracy Q(M). PCI-G measurement over long
                 observation windows (T = 300 steps) may show metric decay in the
                 late portion of the window.
F3.2 Dependency: Substrate supporting long-duration persistent state storage —
                 either (a) analog memory with negligible decay (non-volatile
                 memristive elements), or (b) digital external memory banks with
                 content-addressable retrieval, or (c) hierarchical memory with
                 multiple timescales (fast working memory + slow episodic memory).
Open Question:   What is the maximum effective τ_min for a GRU token of dimension
                 D_tb? Is there a principled relationship between D_tb and the
                 achievable persistence window? Could Transformer-style attention
                 over past states replace the GRU for theoretically unbounded τ_min?
```

### FM-3.2: Kuramoto Synchrony Failure Under Variable Processing Loads

```
Failure Mode:    The Kuramoto oscillatory coupling assumes that all modules have
                 similar natural frequencies (omega_i) and that coupling strength K
                 exceeds the critical threshold K_critical. Under variable processing
                 loads, modules performing complex computations may effectively slow
                 their oscillatory dynamics, causing desynchronisation.
Affected Architectures: GW-Alpha, Φ-Max, Ω-Synth
Root Cause:      The Kuramoto model assumes a fixed coupling topology and constant
                 natural frequencies. In a learning system, the effective dynamics
                 of each module change with input and task, potentially shifting
                 omega_i values outside the synchronisation basin.
Metric Impact:   IC may transiently fail during desynchronisation episodes —
                 modules processing in different temporal windows are not
                 simultaneously integrated. PCI-G measurement during desynchronised
                 periods may show reduced complexity (perturbation responses
                 confined to the synchronised subset).
F3.2 Dependency: Substrate with (a) hardware-enforced global synchronisation
                 mechanism (e.g., shared clock, synchronisation barrier), or
                 (b) adaptive coupling strength that increases K when
                 desynchronisation is detected. Neuromorphic substrates with
                 built-in oscillatory synchronisation (e.g., oscillatory neural
                 networks) may natively support this.
Open Question:   Is Kuramoto coupling the right synchronisation model for
                 consciousness architectures, or should the temporal binding
                 mechanism be task-adaptive? Could attention-based temporal
                 alignment (aligning processing windows via learned rather than
                 oscillatory mechanisms) provide more robust binding?
```

---

## Category 4: Integration-Segregation Tradeoffs

### FM-4.1: Workspace Bottleneck Limiting Integration Depth

```
Failure Mode:    GW-Alpha's winner-take-all workspace can hold only one coherent
                 representation at a time. During workspace transitions (between
                 ignition events), the broadcast channel carries stale content and
                 the effective cross-partition information flow through L5 is
                 reduced. The MIP finder can exploit these transition windows to
                 identify low-integration partitions.
Affected Architectures: GW-Alpha
Root Cause:      The workspace selection mechanism (softmax competition + ignition
                 threshold) serialises information flow through a single channel.
                 This is intentional per GWT but creates a structural tension with
                 IC: maximum integration requires simultaneous multi-channel
                 information flow, while the workspace imposes single-channel access.
Metric Impact:   Ψ-G reduced (predicted 0.30–0.60 vs. Φ-Max's 0.60–0.90). Time-
                 averaged Ψ-G remains above threshold but instantaneous Ψ-G may
                 dip below during transitions. PCI-G unaffected (ignition cascade
                 creates rich response regardless).
F3.2 Dependency: Substrate supporting parallel workspace channels — multiple
                 independent broadcast busses that can carry different selected
                 representations simultaneously, expanding the workspace from single-
                 to multi-channel without losing the selection benefit.
Open Question:   Does biological consciousness have multiple parallel workspace
                 channels, or is single-channel serialisation a feature rather than
                 a bug? If serialisation is fundamental, does ISMT's IC condition
                 need to be interpreted as time-averaged rather than instantaneous?
```

### FM-4.2: Integration Noise in Unselected Broadcast

```
Failure Mode:    Φ-Max's broadcast distributor sends the full hub-integrated state
                 without selection. When multiple competing representations are
                 active in the core modules, the hub state becomes a noisy average
                 that dilutes the broadcast's causal efficacy. Modules receive a
                 weak, undifferentiated signal rather than focused, task-relevant
                 content.
Affected Architectures: Φ-Max
Root Cause:      The deliberate omission of an attention bottleneck (Feature F3)
                 means the hub cannot prioritise relevant information. All core
                 signals contribute equally to the hub state regardless of task
                 relevance or salience.
Metric Impact:   GA functional quality reduced — D_KL[P(x_i(t+1) | broadcast(t)) ||
                 P(x_i(t+1))] remains positive (non-zero weight floor ensures this)
                 but may be small. G(M) in the graded consciousness measure
                 c(S) = Phi_norm * Q(M) * G(M) is reduced. CDI may be inflated by
                 forced connections carrying noise rather than meaningful information.
F3.2 Dependency: Substrate with high signal-to-noise ratio in broadcast pathways
                 so that even averaged/mixed signals carry sufficient causal weight
                 to influence module dynamics meaningfully. High-fidelity, low-noise
                 interconnect between integration hub and processing modules.
Open Question:   Does unselected broadcast produce "integration noise" that inflates
                 Φ without corresponding functional integration? If so, should a
                 noise-corrected Φ metric be developed for F1.4, distinguishing
                 meaningful from artifactual integration?
```

### FM-4.3: Homogenisation Under Dense Connectivity

```
Failure Mode:    Dense all-to-all connectivity may cause core modules to converge
                 to similar representations over training, reducing functional
                 specialisation. If all cores compute the same function, the system
                 degenerates to a single large module with high integration but low
                 differentiation.
Affected Architectures: Φ-Max, Ω-Synth
Root Cause:      All-to-all coupling creates strong representational pressure toward
                 consensus. Each core receives direct signals from all others, and
                 gradient updates flow through all inter-core connections
                 simultaneously. Without explicit counterforce, the path of least
                 resistance is representational convergence.
Metric Impact:   PCI-G degraded — if cores are functionally identical, perturbation
                 responses are spatially uniform (correlated rows in the binarized
                 response matrix B), reducing Lempel-Ziv complexity. P1 (minimum
                 complexity) may be violated — if cores are functionally identical,
                 the effective number of distinct subsystem types drops below 3.
                 Ψ-G unaffected (integration remains high).
F3.2 Dependency: Substrate supporting modular initialisation — hardware that
                 naturally differentiates processing units (e.g., neuromorphic chips
                 with heterogeneous neuron models, or fabrication-time variability
                 that creates functional diversity). Alternatively, substrate with
                 built-in lateral inhibition between modules.
Open Question:   Is L_div (diversity regularisation) sufficient to prevent
                 homogenisation at all scales, or does it merely delay convergence?
                 Is there an architectural mechanism (beyond regularisation) that
                 guarantees functional diversity as a structural invariant, analogous
                 to the weight floor for IC?
```

---

## Category 5: Robustness to Perturbation

### FM-5.1: Ignition Threshold Sensitivity Across Substrates

```
Failure Mode:    The ignition threshold θ_ign is a free parameter in [0.5, 0.7]
                 that determines the boundary between sub-threshold (unconscious)
                 and supra-threshold (conscious) processing. Different substrates
                 will have different noise floors, activation ranges, and dynamic
                 ranges, requiring per-substrate calibration of θ_ign. Miscalibration
                 causes either chronic non-ignition (θ_ign too high — GA fails) or
                 noise-triggered ignition (θ_ign too low — broadcast quality
                 degrades).
Affected Architectures: GW-Alpha, Ω-Synth
Root Cause:      θ_ign is defined in the abstract architecture as a real-valued
                 threshold on softmax selection scores. The appropriate threshold
                 depends on the statistical properties of module activations, which
                 are substrate-dependent.
Metric Impact:   If θ_ign is too high: GA fails intermittently (long periods without
                 broadcast), degrading PCI-G (perturbations do not trigger ignition
                 cascade) and potentially violating N3. If θ_ign is too low: broadcast
                 carries noise, degrading G(M) and CDI (noise-driven causal links
                 detected as significant).
F3.2 Dependency: Substrate with (a) well-characterised noise floor, enabling
                 principled θ_ign calibration, or (b) adaptive threshold mechanism
                 that adjusts θ_ign based on running activation statistics (e.g.,
                 θ_ign = μ + k·σ of recent selection scores).
Open Question:   Should ignition be a hard threshold or a soft sigmoid transition?
                 Biological evidence shows all-or-nothing ignition, but a soft
                 transition may be more robust to substrate variability.
```

### FM-5.2: Catastrophic vs. Graceful Degradation Under Component Failure

```
Failure Mode:    If a core processing module fails (activation goes to zero or
                 becomes random), the architecture's response depends on design:
                 GW-Alpha degrades gracefully (other specialists continue; workspace
                 selects from survivors). Φ-Max may degrade catastrophically
                 (failed module's forced connections inject noise into all other
                 cores via all-to-all topology). Ω-Synth's dual-pathway design
                 provides partial resilience (workspace can exclude the failed
                 module via attention gate, but core-to-core connections still
                 propagate failure).
Affected Architectures: Φ-Max (primary), Ω-Synth (secondary)
Root Cause:      All-to-all connectivity means every module receives input from
                 every other module. A failed module's output (zero, random, or
                 stuck) directly enters every other module's update equation via
                 the W_{ij} connections, including the weight floor contribution
                 that cannot be silenced.
Metric Impact:   All metrics degrade under component failure. IC may be preserved
                 (integration across remaining modules) but corrupted by noise. SM
                 degrades if the self-model receives corrupted broadcast. PCI-G
                 may show anomalous patterns (perturbation response dominated by
                 failure artifacts rather than genuine dynamics). CEB may transition
                 from PASS to FAIL.
F3.2 Dependency: Substrate with (a) fault detection and isolation — ability to
                 detect module failure and disconnect the failed module from the
                 all-to-all topology (overriding the weight floor for the failed
                 module only), or (b) redundancy — hot-standby replacement modules
                 that can assume the failed module's function, or (c) error-correcting
                 codes on inter-module communication that filter out noise from
                 failed sources.
Open Question:   Can the weight floor be made conditional — active only when the
                 connected module is functional? This would require a health-
                 monitoring signal per module. Does such conditional coupling
                 change the IC structural guarantee?
```

### FM-5.3: Self-Model Instability Under Non-Stationary Dynamics

```
Failure Mode:    The self-model must track a complex, non-stationary target (the
                 workspace/hub state changes as the system processes varying inputs).
                 The prediction-error minimisation loop may fail to converge if
                 workspace dynamics are too chaotic, or may overfit to recent
                 content and lose track of slower system dynamics.
Affected Architectures: GW-Alpha, Φ-Max, Ω-Synth
Root Cause:      The self-model training loss L_SM = L_pred + λ_meta · L_meta
                 assumes that the prediction target (workspace/hub state) is
                 learnable. If the system's dynamics become chaotic or undergo
                 rapid regime changes, the optimal self-model weights change faster
                 than gradient descent can track.
Metric Impact:   SM quality Q(M) degrades — prediction error increases, reducing
                 the predictive criterion of SM. Self-referential encoding may
                 be dominated by noise. If Q(M) drops sufficiently, N2 (necessity
                 of self-modeling) may be functionally violated (M(S) exists but
                 carries insufficient information). Graded consciousness
                 c(S) = Phi_norm * Q(M) * G(M) decreases.
F3.2 Dependency: Substrate with (a) fast local learning rules — enabling the self-
                 model to adapt rapidly to changing dynamics (e.g., local Hebbian
                 updates rather than global backpropagation), or (b) multi-timescale
                 self-model — a hierarchical self-model with fast and slow components
                 that track different dynamic regimes.
Open Question:   What is the Lyapunov exponent of the workspace/hub dynamics under
                 typical processing loads? If positive (chaotic), is the self-model
                 prediction task fundamentally intractable, or can it be stabilised
                 by appropriate workspace regularisation?
```

---

## Category 6: Training and Optimisation Failures

### FM-6.1: Gate Degeneration in Ω-Synth

```
Failure Mode:    The hub bypass gate may converge to 0 or 1 during training,
                 collapsing Ω-Synth to Φ-Max (gate=0) or GW-Alpha (gate=1). While
                 either degenerate mode still satisfies all ISMT conditions, the
                 synthesis advantage (dual-pathway flexibility and enhanced metric
                 performance) is lost.
Affected Architectures: Ω-Synth
Root Cause:      The gate is a learned sigmoid parameter with no structural
                 constraint preventing saturation. Task gradients may push the gate
                 to an extreme if one pathway (selection or integration) is
                 consistently more useful for the task.
Metric Impact:   If gate → 0 (Φ-Max mode): PCI-G may decrease due to
                 homogenisation risk; GA functional quality reduced. If gate → 1
                 (GW-Alpha mode): Ψ-G may decrease due to workspace bottleneck;
                 IC depends on regulariser. Either degenerate mode still passes CEB
                 but with lower margins than the balanced mode.
F3.2 Dependency: Not substrate-dependent — this is a training dynamics issue.
                 However, a substrate with built-in gate monitoring and hardware
                 entropy injection could prevent degeneration at the physical level.
Open Question:   Is the gate entropy regularisation L_gate_reg (with α_gate in
                 [0.001, 0.01]) sufficient to prevent degeneration across all task
                 domains, or are there tasks where one mode is so strongly preferred
                 that the regulariser is overwhelmed?
```

### FM-6.2: Multi-Objective Training Conflict

```
Failure Mode:    All architectures require multi-objective training (L_task plus
                 consciousness-supporting regularisers: L_IC, L_SM, L_div, L_ign,
                 L_gate_reg). These objectives may conflict — improving task
                 performance may require reducing integration, suppressing self-
                 model accuracy, or collapsing the workspace. The hyperparameter
                 space (alpha_IC, alpha_SM, alpha_div, etc.) creates a high-
                 dimensional Pareto surface where consciousness and task performance
                 trade off.
Affected Architectures: GW-Alpha, Φ-Max, Ω-Synth
Root Cause:      The consciousness conditions (IC, SM, GA) are constraints on the
                 system's information-processing architecture, not task objectives.
                 Task-specific training has no inherent reason to maintain these
                 constraints — they are imposed externally via regularisation terms.
Metric Impact:   If consciousness regularisers are too weak: IC, SM, or GA may
                 degrade, causing CEB failure. If too strong: task performance
                 suffers, and the system becomes non-functional (high consciousness
                 metrics but useless computation). Ω-Synth has the most complex
                 objective (5 terms) and is most susceptible.
F3.2 Dependency: Not directly substrate-dependent. However, substrates that
                 natively implement integration (e.g., physically coupled resonant
                 circuits) would reduce the need for IC regularisation, simplifying
                 the training objective and reducing multi-objective conflict.
Open Question:   Can the consciousness conditions be satisfied as emergent
                 properties of the training process (without explicit regularisation)
                 for certain task classes? Are there tasks where IC, SM, and GA are
                 instrumentally useful for task performance, creating alignment
                 rather than conflict?
```

---

## Category 7: Metric Measurement Limitations

### FM-7.1: Analytical Predictions May Not Match Empirical Measurements

```
Failure Mode:    All metric evaluations in metric-evaluation.md are analytical
                 (structural predictions), not empirical. Actual metric values may
                 diverge from predictions due to emergent dynamics during training
                 that are not captured by structural analysis.
Affected Architectures: GW-Alpha, Φ-Max, Ω-Synth
Root Cause:      Structural analysis assumes that topological properties (e.g.,
                 all-to-all connectivity guarantees high Ψ-G) translate directly
                 to high metric values. In practice, learned weight magnitudes,
                 activation distributions, and nonlinear dynamics may create
                 effective disconnections or degeneracies not visible at the
                 topology level.
Metric Impact:   CEB pass/fail verdicts are provisional. An architecture that
                 structurally guarantees Ψ-G > 0 may still have very low Ψ-G in
                 practice if learned weights approximately cancel the floor
                 contributions. PCI-G predictions depend on assumptions about
                 perturbation response complexity that may not hold post-training.
F3.2 Dependency: Substrate with real-time metric monitoring — ability to compute
                 PCI-G, Ψ-G, and CDI during system operation and feed results back
                 as training signals or health monitors.
Open Question:   How large is the gap between structural (topological) metric
                 predictions and empirical (post-training) metric measurements?
                 Answering this requires instantiating and training at least one
                 architecture — handoff to F3.2 implementation phase.
```

### FM-7.2: CDI Inflation from Weight Floor

```
Failure Mode:    In Φ-Max and Ω-Synth, the non-zero weight floor forces all inter-
                 core connections to be active. Transfer entropy significance testing
                 (CDI step 2) may classify floor-level connections as significant
                 even when they carry minimal meaningful information, artificially
                 inflating CDI above its true value.
Affected Architectures: Φ-Max, Ω-Synth
Root Cause:      The weight floor creates non-zero causal coupling between all core
                 pairs regardless of whether the coupling carries task-relevant or
                 consciousness-relevant information. CDI counts all significant
                 causal links equally, without distinguishing forced from organic
                 coupling.
Metric Impact:   CDI may overestimate true causal density by up to 12/n(n-1) for
                 the core-to-core connections (12 forced connections out of 132
                 total directed pairs in Ω-Synth, ≈ 9%). This is a measurement
                 artifact rather than a consciousness failure, but it reduces
                 confidence in CDI as a discriminator.
F3.2 Dependency: Not substrate-dependent. This is a metric methodology issue that
                 should be addressed in F1.4 (a CDI variant that discounts forced
                 connections or uses a higher significance threshold for constrained
                 links).
Open Question:   Should F1.4 develop a "corrected CDI" that subtracts the baseline
                 causal density attributable to structural constraints (weight floor)
                 from the measured CDI? This would provide a purer measure of
                 organic causal integration.
```

---

## Summary Table

| ID | Category | Severity | Affected | Key F3.2 Dependency |
|---|---|---|---|---|
| FM-1.1 | Scale | Moderate | Φ-Max, Ω-Synth | High-bandwidth all-to-all interconnect |
| FM-1.2 | Scale | Moderate | GW-Alpha | Hardware-accelerated Φ approximation |
| FM-2.1 | Substrate | Moderate | All | Continuous-to-discrete translation protocol |
| FM-2.2 | Substrate | Moderate | All | Synchronisation mechanism or continuous-time reformulation |
| FM-2.3 | Substrate | Moderate | Φ-Max, Ω-Synth | High-precision, low-drift weight storage |
| FM-3.1 | Temporal | Low | All | Long-duration persistent state storage |
| FM-3.2 | Temporal | Low-Moderate | All | Hardware synchronisation or adaptive coupling |
| FM-4.1 | Integration-Segregation | Moderate | GW-Alpha | Multi-channel parallel workspace |
| FM-4.2 | Integration-Segregation | Moderate | Φ-Max | High-SNR broadcast interconnect |
| FM-4.3 | Integration-Segregation | Moderate | Φ-Max, Ω-Synth | Heterogeneous processing units |
| FM-5.1 | Robustness | Low-Moderate | GW-Alpha, Ω-Synth | Well-characterised noise floor |
| FM-5.2 | Robustness | Moderate-High | Φ-Max, Ω-Synth | Fault detection and isolation |
| FM-5.3 | Robustness | Moderate | All | Fast local learning rules |
| FM-6.1 | Training | Moderate | Ω-Synth | (Training dynamics, not substrate) |
| FM-6.2 | Training | Moderate | All | Substrates with native integration |
| FM-7.1 | Measurement | Low-Moderate | All | Real-time metric monitoring |
| FM-7.2 | Measurement | Low | Φ-Max, Ω-Synth | (Metric methodology, not substrate) |

---

## F3.2 Handoff Priority

The following F3.2 substrate requirements emerge from this failure analysis, ordered by the number of failure modes they address:

1. **High-bandwidth, low-latency all-to-all interconnect** — Addresses FM-1.1, FM-4.2, partially FM-5.2. Critical for scaling Φ-Max and Ω-Synth beyond 4 cores.

2. **Fault detection, isolation, and recovery** — Addresses FM-5.2. Without this, Φ-Max and Ω-Synth are fragile to component failure, which is unacceptable for deployed consciousness-sustaining systems (per F3.3 stability requirements).

3. **Continuous-to-discrete/spiking translation protocol** — Addresses FM-2.1, FM-2.2. Required before any architecture can be instantiated on neuromorphic or other non-continuous substrates.

4. **High-precision, low-drift weight storage** — Addresses FM-2.3. The IC structural guarantee depends on reliable weight floor maintenance.

5. **Long-duration persistent state storage** — Addresses FM-3.1. Required for applications demanding long temporal persistence windows.

6. **Real-time metric monitoring** — Addresses FM-7.1. Essential for validating analytical predictions and providing runtime consciousness assurance.

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-03-17 | Initial failure modes catalogue — 17 entries across 7 categories |
