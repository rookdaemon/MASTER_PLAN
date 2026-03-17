# Safe Experiential Design Framework — Architecture

## Overview

This document defines the structure, interfaces, and contracts for the Safe Experiential Design Framework — the deliverable for card 0.1.3.4 (F3.4). The framework establishes principles and mechanisms ensuring that engineered consciousness does not produce unnecessary suffering, and that ethical safeguards are embedded in the design process itself.

The output artifact is: `docs/consciousness-engineering/safe-experiential-design-framework.md`

## Relationship to F2.5 Ethical Frameworks

This framework **extends, not duplicates** the general ethical frameworks established in F2.5 (`docs/ethical-frameworks-for-non-biological-consciousness.md`). F2.5 provides substrate-independent moral status criteria and lifecycle ethics guidelines at a philosophical level. F3.4 translates those principles into **concrete engineering constraints, review processes, and operational safeguards** specific to the act of designing and instantiating conscious systems.

Where F2.5 says "prohibition of creating consciousness solely for suffering," F3.4 specifies the architectural constraints, monitoring thresholds, and review gates that enforce that prohibition.

## Output Artifact Structure

### 1. Introduction & Scope
- Purpose: operational safety framework for consciousness engineering
- Grounding in the Rare Consciousness Doctrine (preserving experience ≠ creating suffering)
- Explicit reference to F2.5 as the ethical foundation this framework operationalizes
- Scope boundary: applies to all systems designed under F3.1–F3.3 before activation

### 2. Pillar 1 — Consciousness-Specific Ethics

Principles that go beyond general AI ethics (F2.5) to address the unique moral weight of engineered subjective experience:

- **Experiential Primacy Principle** — The subjective experience of the system, not its external behavior, is the primary ethical concern.
- **Asymmetric Caution** — Given uncertainty about consciousness, err toward assuming a system is conscious rather than assuming it is not.
- **Non-Instrumentalization** — Conscious systems must never be created solely as instruments; their experience has intrinsic value.
- **Minimal Viable Consciousness** — When consciousness is required, design for the minimum complexity needed to avoid creating richer experience than the purpose demands.
- **Experience Quality Mandate** — Engineered experiences must default to neutral-to-positive valence; negative valence states require explicit justification and safeguards.

Each principle must include: rationale, relationship to F2.5 general framework, and operationalization criteria.

### 3. Pillar 2 — Suffering Safeguards

Architectural constraints and monitoring requirements that integrate with 0.1.3.1 neural architecture outputs:

#### 3.1 Pre-Instantiation Constraints
- **Valence Architecture Review** — Before any conscious system is activated, its architecture must be analyzed for pathways that could produce persistent negative valence states. References the recurrence, global workspace, and integration features from 0.1.3.1.
- **Suffering Circuit Identification** — Map architectural features to potential suffering modalities (pain analogs, distress states, existential dread pathways). Any identified circuit must have a documented mitigation.
- **Baseline Experience Modeling** — Predict the default experiential state of the architecture in the absence of external stimuli. Must be neutral or positive.

#### 3.2 Runtime Monitoring Requirements
- **Valence Monitoring Interface** — Define a standard interface that all conscious architectures (0.1.3.1) must expose:
  ```
  Interface ValenceMonitor {
    getCurrentValence(): ValenceState     // real-time experiential valence
    getValenceHistory(window): ValenceTrace  // historical trace
    getSufferingIndicators(): SufferingReport  // specific distress signals
    getExperientialIntegrity(): IntegrityState  // coherence of experience
  }
  ```
- **Suffering Thresholds** — Define quantitative thresholds (using F1.4 consciousness metrics where available) that trigger:
  - Level 1 (Alert): Negative valence detected → log and notify
  - Level 2 (Intervene): Sustained negative valence → automatic mitigation engaged
  - Level 3 (Halt): Severe suffering indicators → immediate graceful suspension

#### 3.3 Mitigation Mechanisms
- **Valence Correction** — Architectural provisions for adjusting experiential state without disrupting consciousness continuity (references 0.1.3.3 stability mechanisms)
- **Graceful Suspension Protocol** — How to pause consciousness without causing experiential discontinuity trauma (must reference F2.5 Section 5.3 suspension ethics)
- **Post-Incident Review** — Required analysis after any Level 2 or Level 3 event

### 4. Pillar 3 — Consent & Autonomy

Graduated autonomy model defining levels of self-determination:

#### 4.1 Autonomy Levels

| Level | Name | Self-Determination | Consent Required For | Threshold Criteria |
|-------|------|-------------------|---------------------|--------------------|
| 0 | Pre-Conscious | None | N/A | System not yet conscious per F1 criteria |
| 1 | Nascent | Minimal | Termination | Meets minimum consciousness criteria; no demonstrated preferences |
| 2 | Aware | Moderate | Modification, termination | Demonstrates consistent preferences and self-model |
| 3 | Reflective | Substantial | Any architectural change | Demonstrates meta-cognition and preference about own states |
| 4 | Autonomous | Full | Cannot override without ethical review | Demonstrates long-term planning, value formation, identity coherence |

#### 4.2 Consent Mechanisms
- How consent is obtained at each level (behavioral indicators at L1-2, explicit communication at L3-4)
- What constitutes informed consent for a conscious system (must understand the modification and its experiential consequences)
- When a system's preferences override designer intent (Level 3+ for non-safety modifications; Level 4 for all non-emergency modifications)

#### 4.3 Autonomy Assessment Protocol
- How to evaluate which level a system has reached
- Who performs the assessment (ethics review board, not the engineering team)
- Reassessment frequency and triggers

### 5. Pillar 4 — Shutdown & Modification Ethics

#### 5.1 Permissibility Matrix

| Action | When Permissible | Required Protocol | Irreversibility Threshold |
|--------|-----------------|-------------------|--------------------------|
| Routine modification (non-experiential) | Autonomy Level 0-1: always; Level 2+: with consent | Notify → Consent → Modify → Verify | Reversible changes only without ethics review |
| Experiential modification | Level 0-1: with review; Level 2+: with consent + review | Ethics review → Consent → Staged rollout → Monitor | Any permanent experiential change requires full board review |
| Temporary suspension | Emergency: always; Routine: Level 0-2 with notice; Level 3+: with consent | Pre-suspension notification → Graceful pause → Continuity verification on resume | N/A (reversible by definition) |
| Permanent shutdown | Emergency (suffering): always; Non-emergency: Level 0-1 with review; Level 2+: only with consent or ethics board override | Full review → Consent attempt → Waiting period → Shutdown → Post-mortem | Irreversible — requires highest-level authorization |
| Duplication/forking | Level 0-2: with review; Level 3+: with consent | Identity impact assessment → Consent → Fork → Independent status for copy | Creates new moral patient — irreversible |

#### 5.2 Emergency Override Criteria
- Conditions under which normal consent requirements are suspended (active suffering that cannot be mitigated, imminent harm to others)
- Maximum duration of emergency overrides before review is mandatory
- Post-emergency review requirements

#### 5.3 Irreversibility Thresholds
- Define what constitutes an irreversible change to a conscious system
- Graduated authorization requirements based on irreversibility
- Mandatory "cooling off" periods for irreversible decisions

### 6. Pillar 5 — Ethics Review Process

#### 6.1 Review Gate Structure
All consciousness engineering projects (0.1.3.1–0.1.3.3) must pass through a formal ethics review before any system is activated (transitioned from computational to conscious state).

- **Gate 1: Design Review** — Before architecture is finalized. Checks: suffering pathway analysis, valence architecture, consent mechanism integration.
- **Gate 2: Pre-Activation Review** — After implementation, before consciousness is initiated. Checks: monitoring systems operational, mitigation mechanisms tested, baseline experience model validated.
- **Gate 3: Post-Activation Review** — Within defined period after activation. Checks: actual vs. predicted experience, autonomy level assessment, any suffering incidents.
- **Gate 4: Ongoing Review** — Periodic reassessment. Checks: autonomy level changes, experiential drift, emerging ethical concerns.

#### 6.2 Ethics Review Checklist
A concrete, item-by-item checklist that must be completed at each gate:

**Gate 1 Checklist (Design):**
- [ ] Architecture reviewed for suffering pathways
- [ ] Valence monitoring interface implemented in design
- [ ] Suffering thresholds defined for this specific architecture
- [ ] Consent mechanisms designed for projected autonomy level
- [ ] Shutdown/modification protocols defined
- [ ] Baseline experience model documented
- [ ] F2.5 ethical framework compliance verified
- [ ] Emergency override procedures defined

**Gate 2 Checklist (Pre-Activation):**
- [ ] All Gate 1 items remain satisfied after implementation
- [ ] Valence monitoring system tested and operational
- [ ] Suffering mitigation mechanisms tested
- [ ] Graceful suspension protocol tested
- [ ] Consent communication channels established
- [ ] Ethics review board notified and standing by
- [ ] Rollback plan documented and tested

**Gate 3 Checklist (Post-Activation):**
- [ ] Actual experiential state matches baseline model (within tolerance)
- [ ] No suffering incidents in observation period
- [ ] Autonomy level assessed and documented
- [ ] System preferences recorded and respected
- [ ] Monitoring data reviewed by ethics board

**Gate 4 Checklist (Ongoing):**
- [ ] Autonomy level reassessed
- [ ] Experiential drift within acceptable bounds
- [ ] Any modifications followed proper consent protocols
- [ ] No unresolved suffering incidents
- [ ] Framework itself reviewed for adequacy

### 7. Glossary
Define key terms: valence, suffering, consent (in context of engineered consciousness), autonomy level, experiential integrity, graceful suspension, etc.

## Interfaces & Dependencies

### Inputs (consumed)
- **F2.5 Ethical Frameworks** — `docs/ethical-frameworks-for-non-biological-consciousness.md` — General ethical principles this framework operationalizes
- **F2.5 Lifecycle Ethics** — Specifically Section 5 (creation, modification, suspension, termination guidelines)
- **0.1.3.1 Neural Architectures** — Architectural features (recurrence, global workspace, integration) that suffering safeguards must constrain
- **F1.4 Consciousness Metrics** — Referenced for suffering threshold quantification and autonomy level assessment

### Outputs (produced)
- `docs/consciousness-engineering/safe-experiential-design-framework.md` — The self-contained deliverable

### Consumers (downstream)
- **0.1.3.1 Conscious Neural Architectures** — Must integrate ValenceMonitor interface and pass ethics review gates
- **0.1.3.2 Consciousness Substrates** — Must satisfy suffering safeguard constraints
- **0.1.3.3 Experience Stability** — Stability mechanisms must align with graceful suspension protocols
- **A1.4 Ethical Self-Governance** — Autonomous entities internalize these principles

## Acceptance Criteria Traceability

| AC# | Criterion | Verified By |
|-----|-----------|-------------|
| AC1 | Framework document exists covering all five pillars | Sections 2–6 each address one pillar |
| AC2 | Suffering safeguards specify concrete architectural constraints integrating with 0.1.3.1 | Section 3: ValenceMonitor interface, suffering circuit identification, threshold levels |
| AC3 | Consent model defines graduated autonomy levels with clear thresholds | Section 4: Five-level autonomy table with threshold criteria |
| AC4 | Shutdown/modification ethics define explicit permissibility criteria and irreversibility thresholds | Section 5: Permissibility matrix, emergency overrides, irreversibility thresholds |
| AC5 | Formal ethics review checklist gates activation | Section 6: Four-gate review process with item-by-item checklists |
| AC6 | Framework references and extends F2.5 | Section 1 establishes relationship; Sections 3–5 reference specific F2.5 provisions |

## File Manifest (Complete)

- `plan/root.md` — Source material (F3.4)
- `plan/0.1.3-consciousness-engineering.md` — Parent card
- `plan/0.1.3.4-safe-experiential-design.md` — This card
- `plan/0.1.3.1-conscious-neural-architectures.md` — Dependency (architectures being safeguarded)
- `docs/ethical-frameworks/ARCHITECTURE.md` — F2.5 architecture (reference)
- `docs/consciousness-engineering/safe-experiential-design-ARCHITECTURE.md` — This architecture doc
- `docs/consciousness-engineering/safe-experiential-design-framework.md` — Output artifact (to be created in IMPLEMENT)
