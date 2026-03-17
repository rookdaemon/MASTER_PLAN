# Bio-Synthetic Interface Design — Architecture

## Overview

This document defines the architecture for bidirectional interfaces between biological neural tissue and synthetic computational substrates. The interface layer sits between the brain emulation model (0.2.2.1) and the enduring substrate hardware (0.2.1), providing the signal bridge that makes hybrid cognition (0.2.2.4) possible.

## System Context

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  Biological Neural   │     │   Bio-Synthetic      │     │  Synthetic Compute   │
│  Tissue              │◄───►│   Interface Layer     │◄───►│  Substrate           │
│  (0.2.2.1 scope)     │     │   (THIS CARD)        │     │  (0.2.1 scope)       │
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
                                      │
                                      ▼
                             ┌──────────────────────┐
                             │  Consciousness        │
                             │  Unity Layer          │
                             │  (0.2.2.4.2 scope)   │
                             └──────────────────────┘
```

## Architectural Layers

### Layer 1 — Physical Electrode / Transducer Array

The lowest layer: physical contact points between interface hardware and neural tissue.

**Components:**
- **Electrode array**: High-density microelectrode arrays (MEAs) with single-neuron resolution. Target: ≥10,000 electrodes per mm² for cortical-column-scale coverage.
- **Biocompatible coating**: Anti-inflammatory surface treatment (e.g., parylene-C, conducting polymers like PEDOT:PSS) to prevent glial scarring and maintain signal quality over operational lifetime (target: years without degradation).
- **Mechanical compliance**: Flexible substrates that match brain tissue elasticity (~1–10 kPa) to prevent micro-motion damage.

**Interfaces exposed:**
- `RawNeuralSignal`: Continuous analog voltage traces per electrode channel
- `StimulationPulse`: Current/voltage waveform delivered to a specific electrode subset

---

### Layer 2 — Signal Conditioning & Conversion

Analog-to-digital and digital-to-analog conversion with real-time signal processing.

**Read pathway (bio → synthetic):**
1. Amplification — low-noise amplifiers (target: < 5 μV_rms input-referred noise)
2. Filtering — bandpass (300 Hz – 6 kHz for spikes, 1–300 Hz for LFPs)
3. Digitization — ADC at ≥ 30 kHz per channel, ≥ 12-bit resolution
4. Spike detection — on-chip threshold detection and waveform extraction
5. Spike sorting — real-time assignment of detected spikes to putative neurons

**Write pathway (synthetic → bio):**
1. Stimulation pattern encoding — synthetic spike trains converted to charge-balanced biphasic current pulses
2. Current steering — multi-electrode activation patterns for spatial targeting
3. Safety limiting — hard charge-density limits (< 30 μC/cm² per phase) enforced in hardware

**Interfaces exposed:**
- `SpikeTrainStream`: Time-stamped spike events with neuron IDs (read)
- `LFPStream`: Continuous local field potential per region (read)
- `StimulationCommand`: Target neuron population + desired activation pattern (write)

**Latency budget:** < 100 μs for read pathway (electrode → spike event), < 200 μs for write pathway (command → current delivery). Total round-trip < 500 μs to stay within biological synaptic timing.

---

### Layer 3 — Neural Protocol Adapter

Translates between the electrode-level signal representation and the abstract neural-computation representation used by the synthetic substrate.

**Read direction:**
- Maps spike trains from electrode coordinates to the brain emulation model's neuron graph
- Performs coordinate registration between physical electrode positions and the brain atlas
- Applies calibration corrections for electrode drift over time

**Write direction:**
- Translates synthetic neuron activations into spatial stimulation patterns
- Maintains a stimulation-response model that adapts based on observed neural responses (closed-loop calibration)
- Implements safety envelope: monitors for seizure-like activity and auto-inhibits

**Interfaces exposed:**
- `NeuralStateSnapshot`: Aggregate state of the recorded neural population at a time instant
- `SyntheticActivationRequest`: Desired neural state change from synthetic side
- `CalibrationFeedback`: Continuous quality metrics for monitoring interface health

---

### Layer 4 — Integration Gateway

The top-level abstraction presented to the consciousness unity layer (0.2.2.4.2) and the hybrid cognition orchestrator.

**Responsibilities:**
- Multiplexes multiple physical interface units across cortical regions
- Presents a unified logical interface regardless of how many physical arrays are deployed
- Manages bandwidth allocation across regions based on cognitive load
- Provides health monitoring and degradation signals to the graceful degradation layer (0.2.2.4.3)

**Interfaces exposed:**
- `HybridCognitionBus`: Unified bidirectional neural data stream between biological and synthetic sides
- `InterfaceHealthReport`: Per-region signal quality, electrode impedance trends, tissue status
- `BandwidthAllocation`: Dynamic throughput control per cortical region

---

## Key Design Decisions

### D1 — Closed-loop adaptive calibration
The interface continuously adjusts its read/write mappings based on observed neural responses. This is essential because biological neural tissue reorganizes over time (plasticity), and electrode properties drift. The calibration loop runs at Layer 3.

### D2 — Hardware-enforced safety limits
Charge density limits and seizure detection are implemented in hardware (Layer 2), not software. Software can restrict further but cannot override hardware safety.

### D3 — Graceful scaling via modular arrays
Each physical electrode array is an independent unit with its own signal conditioning. The Integration Gateway (Layer 4) aggregates them. Scaling from a single cortical column to a full hemisphere means deploying more arrays — the architecture does not change.

### D4 — Separation of electrode concerns from neural semantics
Layers 1–2 deal with electrodes and signals. Layer 3 deals with neurons and brain regions. This separation allows swapping electrode technology (e.g., from Utah arrays to neural dust) without affecting the neural protocol adapter.

---

## Bandwidth Analysis

| Scale | Neurons | Spike rate | Raw data rate | After compression |
|-------|---------|------------|---------------|-------------------|
| Single column | ~10,000 | ~10 Hz avg | ~1.2 Mbps | ~200 Kbps |
| Cortical area | ~1M | ~10 Hz avg | ~120 Mbps | ~20 Mbps |
| Hemisphere | ~10B | ~10 Hz avg | ~1.2 Tbps | ~200 Gbps |

Full hemisphere-scale integration requires substantial bandwidth. The architecture supports incremental deployment — early hybrid systems will interface with individual cortical areas, scaling as bandwidth technology matures.

---

## Fidelity Metrics

- **Signal-to-noise ratio (SNR)**: ≥ 10 dB per electrode channel
- **Spike detection accuracy**: ≥ 95% true positive, ≤ 5% false positive
- **Spike sorting accuracy**: ≥ 90% correct neuron assignment
- **Stimulation spatial precision**: Activation of target population with ≤ 10% off-target activation
- **Round-trip latency**: < 500 μs (electrode → synthetic → electrode)
- **Biocompatibility duration**: ≥ 5 years without signal quality degradation > 20%

---

## Dependencies

- **0.2.2.1 Brain Emulation**: Provides the neuron graph and brain atlas that Layer 3 maps to
- **0.2.1 Enduring Substrates**: Provides the synthetic compute substrate that the interface connects to
- **0.2.2.4.2 Unified Consciousness**: Consumes the `HybridCognitionBus` to maintain phenomenal unity
- **0.2.2.4.3 Graceful Degradation**: Consumes `InterfaceHealthReport` to manage partial failures

## Open Questions

1. **Immune response longevity**: Can biocompatible coatings truly prevent glial scarring for multi-year timescales, or will periodic replacement/maintenance be required?
2. **Write pathway fidelity**: Can electrical stimulation achieve the specificity of natural synaptic transmission, or will optogenetic or chemical interfaces be required?
3. **Scaling wall**: At what neuron count does the bandwidth requirement become physically impractical with electrical interfaces, forcing a transition to optical or other modalities?
