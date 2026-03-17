# Architecture: 0.1.1.1 Neural Correlates of Consciousness Fully Mapped

## Purpose

Define the structure, interfaces, and deliverables for a comprehensive NCC catalogue that serves as the empirical foundation for all downstream consciousness theory (0.1.1.2), substrate-independence validation (0.1.1.3), and metrics operationalization (0.1.1.4).

## Deliverable

A structured knowledge document: `docs/consciousness-science/ncc-catalogue.md`

This is a **research synthesis** card, not a software card. The "implementation" is the catalogue itself.

---

## Catalogue Structure

### 1. Taxonomy of Neural Correlates

Each NCC entry follows this schema:

```
### <NCC Name>
- **Type:** content NCC | background NCC | full NCC
- **Modality:** visual | auditory | somatosensory | emotional | cognitive | cross-modal
- **Structures:** [list of brain regions/circuits]
- **Key evidence:** [citations/paradigms]
- **Causal status:** correlational | necessary | sufficient | necessary-and-sufficient
- **Distinction:** NCC-proper | prerequisite | consequence
- **Open questions:** [unresolved issues]
```

**Type definitions:**
- **Content NCC**: Correlates of specific conscious contents (e.g. seeing red)
- **Background NCC**: Enabling conditions for any conscious state (e.g. arousal)
- **Full NCC**: The complete minimal neural substrate sufficient for any one conscious experience

### 2. Sections

The catalogue is organized into these major sections:

1. **Background NCCs** — Neural prerequisites enabling consciousness at all
   - Reticular activating system / brainstem arousal nuclei
   - Thalamocortical connectivity
   - Intralaminar thalamic nuclei

2. **Content NCCs by Modality**
   - Visual (V1-V5 debate, recurrent processing, posterior cortical hot zone)
   - Auditory (auditory cortex, temporal binding)
   - Somatosensory (S1/S2, insular cortex, interoception)
   - Emotional/affective (amygdala, anterior insula, ACC)
   - Cognitive/metacognitive (prefrontal cortex, TPJ)

3. **Cross-Modal and Integrative NCCs**
   - Claustrum
   - Default mode network
   - Global workspace (frontoparietal network)
   - Posterior cortical hot zone (temporo-parieto-occipital)

4. **NCCs Across Altered States**
   - Sleep stages (NREM vs REM)
   - General anesthesia (propofol, ketamine, sevoflurane)
   - Coma / vegetative state / minimally conscious state
   - Psychedelic states (psilocybin, DMT, LSD)
   - Meditation (advanced contemplative states)
   - Epileptic seizures (absence vs. complex partial)

5. **The Prerequisite / NCC-proper / Consequence Distinction**
   - Framework for classification (after Chalmers 2000, de Graaf et al. 2012)
   - Decision criteria and experimental paradigms
   - Current consensus classifications

6. **Open Debates and Discriminating Experiments**
   - Prefrontal vs. posterior cortex (GNW vs. IIT predictions)
   - Role of recurrent processing vs. feedforward sweeps
   - Within-state vs. between-state NCCs
   - Proposed adversarial collaboration designs

---

## Interfaces to Downstream Cards

| Consumer Card | What it needs from the NCC catalogue |
|---|---|
| 0.1.1.2 Computational Theory | Empirical constraints: which structures/dynamics are necessary vs. sufficient |
| 0.1.1.3 Substrate Independence | The physical substrate details to test for functional equivalence |
| 0.1.1.4 Consciousness Metrics | Observable neural signatures to ground measurement instruments |

---

## Acceptance Criteria Traceability

| Acceptance Criterion | Catalogue Section |
|---|---|
| Comprehensive catalogue organized by modality and state | Sections 1-4 |
| NCCs distinguished from prerequisites and consequences | Section 5 |
| Coverage of normal waking, dreaming, anesthesia, coma, altered states | Section 4 |
| Open debates resolved or characterized with testable experiments | Section 6 |

---

## Constraints

- This is a research-synthesis deliverable, not software
- All claims must reference established neuroscience paradigms (no speculation without labeling)
- The catalogue must be structured enough to serve as machine-readable input for downstream cards
- During IMPLEMENT, only files under `docs/consciousness-science/` are written
