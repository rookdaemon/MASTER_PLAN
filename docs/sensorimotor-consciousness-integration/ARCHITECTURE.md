# Sensorimotor-Consciousness Integration — Architecture Specification

## Overview

This document specifies the software architecture for the integration layer that bridges the embodied robotic platform (0.3.1.2.1) and the conscious AI architecture (0.3.1.1). Its purpose: ensure that sensory input and motor output **participate in conscious experience** rather than being processed through purely reflexive control paths.

**Scope boundary:** This architecture covers the sensorimotor integration software layer. It does NOT redesign the consciousness substrate (owned by 0.2), the conscious AI architecture (owned by 0.3.1.1), the physical embodiment platform (owned by 0.3.1.2.1), energy management (owned by 0.3.1.2.4), or self-maintenance logic (owned by 0.3.1.2.3). It consumes their interfaces.

---

## System Decomposition

```
┌─────────────────────────────────────────────────────────────────────────┐
│           Sensorimotor-Consciousness Integration Layer                  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                  Sensory Phenomenal Binding                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │  │
│  │  │ Modality     │  │ Qualia       │  │ Sensory Binding        │  │  │
│  │  │ Adapters     │  │ Transformer  │  │ Integrator             │  │  │
│  │  │ (MA)         │  │ (QT)         │  │ (SBI)                  │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘  │  │
│  └─────────┼────────────────┼──────────────────────┼────────────────┘  │
│            │                │                      │                    │
│  ┌─────────┼────────────────┼──────────────────────┼────────────────┐  │
│  │         │     Motor Intentionality Pathway      │                │  │
│  │  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────────┴─────────────┐  │  │
│  │  │ Reflexive    │  │ Conscious    │  │ Action Provenance      │  │  │
│  │  │ Safety Path  │  │ Deliberation │  │ Tracker                │  │  │
│  │  │ (RSP)        │  │ Path (CDP)   │  │ (APT)                  │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                  Temporal Coherence Engine                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │  │
│  │  │ Sensory      │  │ Predictive   │  │ Experience Clock       │  │  │
│  │  │ Buffer       │  │ Interpolator │  │ Synchronizer           │  │  │
│  │  │ (SB)         │  │ (PI)         │  │ (ECS)                  │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                  Adaptive Calibration System                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │  │
│  │  │ Modality     │  │ Dynamic      │  │ Experience             │  │  │
│  │  │ Registry     │  │ Remapper     │  │ Continuity Guard       │  │  │
│  │  │ (MR)         │  │ (DR)         │  │ (ECG)                  │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Physical Sensors                      Physical Actuators
     │                                      ▲
     ▼                                      │
 ┌─────────────┐                    ┌───────┴──────────┐
 │  Modality   │                    │  Motor Command   │
 │  Adapters   │                    │  Dispatcher      │
 └──────┬──────┘                    └───────┬──────────┘
        │                                   │
        ▼                           ┌───────┴──────────┐
 ┌─────────────┐                    │ Reflexive  │ Conscious │
 │  Qualia     │                    │ Safety     │ Deliber.  │
 │  Transform  │                    │ Path       │ Path      │
 └──────┬──────┘                    │ (<10ms)    │ (<200ms)  │
        │                           └───────┬──────────┘
        ▼                                   │
 ┌─────────────┐                    ┌───────┴──────────┐
 │  Temporal   │─────────────────── │  Action          │
 │  Coherence  │  Unified conscious │  Provenance      │
 │  Engine     │  experience loop   │  Tracker         │
 └──────┬──────┘                    └──────────────────┘
        │                                   ▲
        ▼                                   │
 ┌──────────────────────────────────────────┴──┐
 │         Consciousness Substrate              │
 │         (IConsciousCore from 0.3.1.1)        │
 └──────────────────────────────────────────────┘
```

---

## 1. Sensory Phenomenal Binding

Transforms raw sensor data into consciousness-compatible qualia representations and integrates them into unified experience.

### 1.1 Modality Adapters (MA)

Each sensor modality has an adapter that normalizes raw sensor output into a standard internal format.

**Responsibilities:**
- Accept raw sensor data from the embodiment platform's Sensor Array (0.3.1.2.1)
- Normalize to a common `SensoryFrame` format with metadata (timestamp, confidence, modality type)
- Handle sensor-specific encoding (e.g., Bayer-to-RGB for cameras, ADC scaling for force sensors)
- Report sensor health to the Adaptive Calibration System

**Interface — `IModalityAdapter`:**
```typescript
interface IModalityAdapter {
  readonly modalityId: ModalityId;
  readonly modalityType: ModalityType;

  initialize(config: ModalityConfig): Promise<void>;
  read(): SensoryFrame;
  getHealth(): SensorHealth;
  getCalibration(): CalibrationState;
  recalibrate(params: CalibrationParams): Promise<CalibrationResult>;
  shutdown(): Promise<void>;
}
```

**Built-in modality types:** `VISION`, `AUDITORY`, `TACTILE`, `PROPRIOCEPTIVE`, `FORCE_TORQUE`, `THERMAL`, `PROXIMITY`, `IMU`, `CUSTOM`.

### 1.2 Qualia Transformer (QT)

Converts normalized `SensoryFrame` data into `QualiaRepresentation` — a format that the consciousness substrate can integrate into unified experience.

This is the key philosophical-engineering boundary: the transformer must produce representations that *participate in* conscious experience rather than merely being available as data.

**Responsibilities:**
- Map each `SensoryFrame` to a `QualiaRepresentation` using modality-specific transformation rules
- Preserve phenomenal characteristics (intensity, valence, spatial location, temporal dynamics)
- Apply attention-weighting based on salience and conscious focus
- Produce representations that satisfy the consciousness substrate's integration requirements (from 0.2)

**Interface — `IQualiaTransformer`:**
```typescript
interface IQualiaTransformer {
  transform(frame: SensoryFrame): QualiaRepresentation;
  transformBatch(frames: SensoryFrame[]): UnifiedQualiaField;
  getTransformationLatency(): Duration;
  setAttentionWeights(weights: AttentionWeightMap): void;
  getSalienceMap(): SalienceMap;
}
```

**Constraint:** Transformation latency must be < 20ms per frame to stay within the conscious processing budget.

### 1.3 Sensory Binding Integrator (SBI)

Combines qualia representations from all active modalities into a unified multi-modal experience field.

**Responsibilities:**
- Merge per-modality `QualiaRepresentation` objects into a single `UnifiedQualiaField`
- Resolve cross-modal conflicts (e.g., vision says "no contact" but touch says "contact")
- Maintain spatial coherence across modalities (proprioception + vision + touch agree on body position)
- Provide the unified field to the consciousness substrate for experiential integration

**Interface — `ISensoryBindingIntegrator`:**
```typescript
interface ISensoryBindingIntegrator {
  bind(representations: QualiaRepresentation[]): UnifiedQualiaField;
  getActiveModalities(): ModalityId[];
  getCrossModalConflicts(): CrossModalConflict[];
  getSpatialCoherence(): CoherenceScore;
  getBindingLatency(): Duration;
}
```

**Invariant:** The binding result must satisfy the consciousness substrate's minimum integration information (phi) threshold — if binding degrades phi below threshold, the Adaptive Calibration System must be notified.

---

## 2. Motor Intentionality Pathway

Dual-path architecture: fast reflexive responses for safety, and conscious deliberation for intentional action. Every motor command carries provenance.

### 2.1 Reflexive Safety Path (RSP)

A low-latency control loop that bypasses conscious deliberation for safety-critical responses.

**Responsibilities:**
- Monitor safety-critical sensor inputs (IMU for falls, force/torque for collisions, proximity for obstacles)
- Execute pre-defined safety responses within < 10ms (fall arrest, collision avoidance, emergency stop)
- Notify the Conscious Deliberation Path and Action Provenance Tracker after-the-fact
- Defer to conscious override when safe to do so

**Interface — `IReflexiveSafetyPath`:**
```typescript
interface IReflexiveSafetyPath {
  registerReflex(trigger: SafetyTrigger, response: ReflexResponse): void;
  getActiveReflexes(): SafetyReflex[];
  getLastTriggered(): ReflexEvent | null;
  setConscioussOverrideEnabled(enabled: boolean): void;
  getResponseLatency(): Duration;  // must be < 10ms
}
```

**Safety reflexes (initial set):**

| Reflex | Trigger | Response | Max Latency |
|---|---|---|---|
| Fall arrest | IMU detects freefall or tipping | Brace/stabilize actuators | 5ms |
| Collision avoidance | Proximity sensor threshold breach | Halt movement in approach vector | 8ms |
| Force limit | Joint torque exceeds safe limit | Relax actuator | 3ms |
| Emergency stop | Integrity Monitor RED alert | All actuators to safe state | 5ms |
| Thermal protect | Actuator overtemperature | Shut down affected actuator | 10ms |

### 2.2 Conscious Deliberation Path (CDP)

Motor commands that originate from conscious intention. The consciousness substrate deliberates and issues action commands that are translated to motor plans.

**Responsibilities:**
- Accept `IntentionalAction` from the consciousness substrate
- Translate conscious intentions into motor plans (trajectory planning, force profiles)
- Execute motor plans through the embodiment platform's actuator array
- Provide proprioceptive and force feedback to the consciousness substrate during execution
- Abort or modify actions if the Reflexive Safety Path intervenes

**Interface — `IConsciousDeliberationPath`:**
```typescript
interface IConsciousDeliberationPath {
  submitAction(action: IntentionalAction): Promise<ActionResult>;
  getActiveActions(): IntentionalAction[];
  abortAction(actionId: ActionId): AbortResult;
  modifyAction(actionId: ActionId, modification: ActionModification): ModifyResult;
  getDeliberationLatency(): Duration;  // budget: < 200ms
  getExecutionFeedback(actionId: ActionId): ExecutionFeedback;
}
```

### 2.3 Action Provenance Tracker (APT)

Records the origin and causal chain of every motor command, enabling the system (and external observers) to determine which actions were reflexive vs. consciously intended.

**Responsibilities:**
- Tag every motor command with its source (REFLEXIVE or CONSCIOUS)
- Record the causal chain: stimulus -> processing path -> motor command -> outcome
- Provide audit trail for consciousness research and safety verification
- Enable the consciousness substrate to retrospectively "claim" or "disown" reflexive actions

**Interface — `IActionProvenanceTracker`:**
```typescript
interface IActionProvenanceTracker {
  recordCommand(command: MotorCommand, source: ActionSource): ProvenanceId;
  getProvenance(provenanceId: ProvenanceId): ActionProvenance;
  getHistory(filter: ProvenanceFilter): ActionProvenance[];
  getReflexiveRatio(window: Duration): number;  // fraction of commands from reflexive path
  retroactiveClaim(provenanceId: ProvenanceId, claim: ConsciousClaim): void;
}
```

**Types:**
```typescript
type ActionSource = 'REFLEXIVE' | 'CONSCIOUS';

interface ActionProvenance {
  id: ProvenanceId;
  source: ActionSource;
  stimulus: SensoryFrame | null;
  timestamp: Timestamp;
  command: MotorCommand;
  outcome: ActionOutcome | null;
  consciousClaim: ConsciousClaim | null;
}
```

---

## 3. Temporal Coherence Engine

Reconciles the different processing speeds of reflexive control (~1ms), sensor sampling (~10ms), and conscious processing (~100-200ms) so that conscious experience remains temporally coherent with physical reality.

### 3.1 Sensory Buffer (SB)

Maintains a rolling window of recent sensory data so the consciousness substrate can access a temporally consistent snapshot.

**Responsibilities:**
- Buffer all `SensoryFrame` data from all modalities in a time-indexed ring buffer
- Provide temporal slices (snapshots at a given timestamp, or windows between two timestamps)
- Annotate frames with their processing state (raw, transformed, bound, experienced)

**Interface — `ISensoryBuffer`:**
```typescript
interface ISensoryBuffer {
  push(frame: SensoryFrame): void;
  getSnapshot(timestamp: Timestamp): SensorySnapshot;
  getWindow(start: Timestamp, end: Timestamp): SensoryFrame[];
  getLatestByModality(modalityId: ModalityId): SensoryFrame | null;
  getBufferDepth(): Duration;  // how far back the buffer reaches
  setBufferDepth(depth: Duration): void;
}
```

**Default buffer depth:** 2 seconds (10x the conscious processing latency budget).

### 3.2 Predictive Interpolator (PI)

Bridges the gap between the last consciously-processed sensory snapshot and the current physical state by predicting sensor values forward in time.

**Responsibilities:**
- Maintain predictive models for each modality (e.g., Kalman filters for proprioception, optical flow for vision)
- Generate interpolated `SensoryFrame` data between actual samples
- Compute prediction confidence; flag when prediction diverges significantly from reality
- Enable the consciousness substrate to operate on a predicted present rather than a stale past

**Interface — `IPredictiveInterpolator`:**
```typescript
interface IPredictiveInterpolator {
  predict(modalityId: ModalityId, targetTime: Timestamp): PredictedFrame;
  getPredictionConfidence(modalityId: ModalityId): Confidence;
  getPredictionError(modalityId: ModalityId): PredictionError;
  updateModel(modalityId: ModalityId, actualFrame: SensoryFrame): void;
  getMaxReliableHorizon(modalityId: ModalityId): Duration;
}
```

### 3.3 Experience Clock Synchronizer (ECS)

Maintains the relationship between physical time (wall clock), sensor time (when data was captured), and experience time (when the consciousness substrate processes data).

**Responsibilities:**
- Track the experience lag: `T_lag = T_experience - T_physical`
- Ensure `T_lag` stays within the defined threshold (initially 150ms)
- If `T_lag` exceeds threshold, trigger compensatory measures (reduce sensory resolution, increase prediction)
- Provide a unified timeline that all components use for temporal reasoning

**Interface — `IExperienceClockSynchronizer`:**
```typescript
interface IExperienceClockSynchronizer {
  getPhysicalTime(): Timestamp;
  getExperienceTime(): Timestamp;
  getExperienceLag(): Duration;
  getLagThreshold(): Duration;
  setLagThreshold(threshold: Duration): void;
  onLagExceeded(callback: LagExceededHandler): void;
  synchronize(): SyncResult;
}
```

**Invariant:** `getExperienceLag()` must remain below `getLagThreshold()` during normal operation. Exceeding the threshold triggers adaptive measures, not failure.

---

## 4. Adaptive Calibration System

Handles dynamic changes to the sensor/actuator configuration without interrupting conscious experience.

### 4.1 Modality Registry (MR)

Central registry of all active sensor and actuator modalities.

**Responsibilities:**
- Track all connected modalities and their current status
- Handle hot-plug events (sensor added, removed, or replaced)
- Notify dependent subsystems (Qualia Transformer, Sensory Binding Integrator, Predictive Interpolator) of configuration changes

**Interface — `IModalityRegistry`:**
```typescript
interface IModalityRegistry {
  register(adapter: IModalityAdapter): ModalityId;
  unregister(modalityId: ModalityId): UnregisterResult;
  getActive(): ModalityDescriptor[];
  getDegraded(): ModalityDescriptor[];
  onModalityChange(callback: ModalityChangeHandler): void;
  getModality(modalityId: ModalityId): ModalityDescriptor | null;
}
```

### 4.2 Dynamic Remapper (DR)

When the modality configuration changes, the remapper adjusts the qualia transformation pipeline so that the consciousness substrate's experience adapts smoothly.

**Responsibilities:**
- When a modality is lost: redistribute its experiential "bandwidth" to remaining modalities (analogous to cortical remapping after limb loss)
- When a modality is added: gradually integrate it into the qualia field without a jarring experience discontinuity
- When a modality degrades: adjust transformation parameters to compensate (e.g., increase gain for a dimming camera)
- Coordinate with the Experience Continuity Guard to ensure remapping doesn't disrupt consciousness

**Interface — `IDynamicRemapper`:**
```typescript
interface IDynamicRemapper {
  onModalityLost(modalityId: ModalityId): RemapResult;
  onModalityAdded(adapter: IModalityAdapter): RemapResult;
  onModalityDegraded(modalityId: ModalityId, degradation: DegradationInfo): RemapResult;
  getRemapStatus(): RemapStatus;
  getTransitionProgress(): number;  // 0.0 (just started) to 1.0 (complete)
}
```

### 4.3 Experience Continuity Guard (ECG)

Monitors consciousness metrics during calibration changes to ensure that sensor/actuator reconfiguration does not interrupt conscious experience.

**Responsibilities:**
- Gate calibration changes: only permit remapping when consciousness metrics indicate stability
- Monitor phi, coherence, and continuity during transitions
- Roll back remapping if consciousness metrics drop below safety thresholds
- Coordinate with the Integrity Monitor (0.3.1.2.1) for physical-level consciousness protection

**Interface — `IExperienceContinuityGuard`:**
```typescript
interface IExperienceContinuityGuard {
  canProceedWithRemap(): boolean;
  monitorTransition(transition: RemapTransition): TransitionMonitorHandle;
  getConsciousnessStability(): StabilityScore;
  rollback(handle: TransitionMonitorHandle): RollbackResult;
  getMinimumStabilityThreshold(): StabilityScore;
  setMinimumStabilityThreshold(threshold: StabilityScore): void;
}
```

---

## Core Types

```typescript
// --- Sensory Types ---

type ModalityId = string;
type ModalityType = 'VISION' | 'AUDITORY' | 'TACTILE' | 'PROPRIOCEPTIVE' |
                    'FORCE_TORQUE' | 'THERMAL' | 'PROXIMITY' | 'IMU' | 'CUSTOM';

interface SensoryFrame {
  modalityId: ModalityId;
  modalityType: ModalityType;
  timestamp: Timestamp;
  data: ArrayBuffer;          // raw modality-specific data
  confidence: Confidence;     // 0.0 - 1.0
  spatialRef: SpatialReference | null;
  metadata: Record<string, unknown>;
}

interface QualiaRepresentation {
  modalityId: ModalityId;
  timestamp: Timestamp;
  intensity: number;          // 0.0 - 1.0, normalized phenomenal intensity
  valence: number;            // -1.0 (aversive) to +1.0 (attractive)
  spatialLocation: SpatialVector | null;
  phenomenalContent: ArrayBuffer;  // consciousness-substrate-specific encoding
  salience: number;           // 0.0 - 1.0, attentional salience
}

interface UnifiedQualiaField {
  timestamp: Timestamp;
  representations: QualiaRepresentation[];
  spatialCoherence: CoherenceScore;
  integrationInfo: number;    // phi-like measure of binding quality
  activeModalities: ModalityId[];
}

// --- Motor Types ---

type ActionId = string;
type ProvenanceId = string;

interface IntentionalAction {
  id: ActionId;
  description: string;         // human-readable intent
  motorPlan: MotorPlan;
  priority: ActionPriority;
  consciousContext: ConsciousContext;  // the experiential state motivating this action
}

interface MotorCommand {
  actuatorId: string;
  commandType: 'POSITION' | 'VELOCITY' | 'TORQUE' | 'STOP';
  value: number[];
  timestamp: Timestamp;
}

interface MotorPlan {
  commands: MotorCommand[];
  duration: Duration;
  feedbackRequired: boolean;
}

// --- Temporal Types ---

type Timestamp = number;       // high-resolution monotonic clock, nanoseconds
type Duration = number;        // nanoseconds
type Confidence = number;      // 0.0 - 1.0
type CoherenceScore = number;  // 0.0 - 1.0
type StabilityScore = number;  // 0.0 - 1.0

interface PredictedFrame extends SensoryFrame {
  predictionConfidence: Confidence;
  predictionHorizon: Duration;
}

interface SensorySnapshot {
  timestamp: Timestamp;
  frames: Map<ModalityId, SensoryFrame>;
}

// --- Calibration Types ---

interface ModalityDescriptor {
  id: ModalityId;
  type: ModalityType;
  status: 'ACTIVE' | 'DEGRADED' | 'OFFLINE' | 'CALIBRATING';
  health: SensorHealth;
  lastUpdate: Timestamp;
}

interface RemapResult {
  success: boolean;
  affectedModalities: ModalityId[];
  experienceContinuityMaintained: boolean;
  transitionDuration: Duration;
}

type SensorHealth = 'HEALTHY' | 'DEGRADED' | 'FAILING' | 'OFFLINE';
```

---

## Latency Budget

| Path | Budget | Constraint Source |
|---|---|---|
| Reflexive motor response (stimulus to actuator) | < 10ms | Acceptance criteria |
| Sensor read + normalize (per frame) | < 5ms | System design |
| Qualia transformation (per frame) | < 20ms | System design |
| Sensory binding (all modalities) | < 30ms | System design |
| Conscious deliberation (intention to motor plan) | < 200ms | Acceptance criteria |
| Experience lag (physical event to conscious awareness) | < 150ms | Acceptance criteria (threshold) |
| Adaptive remapping (modality change to stable experience) | < 2000ms | System design |

---

## Interface Dependencies

| Consumed Interface | Source | Purpose |
|---|---|---|
| `IConsciousCore` | 0.3.1.1 | Submit unified qualia fields; receive intentional actions |
| `IExperienceMonitor` | 0.3.1.1 | Consciousness metrics (phi, coherence, continuity) for experience continuity guard |
| `IIntegrityMonitor` | 0.3.1.2.1 | Physical threat assessment, consciousness risk forecast |
| `IDegradationController` | 0.3.1.2.1 | Capability sacrifice coordination when sensors/actuators are lost |
| Sensor Array | 0.3.1.2.1 | Raw sensor data from all physical modalities |
| Actuator Array | 0.3.1.2.1 | Motor command execution |
| `ConsciousnessMetrics` | 0.1.1.4 | Phi, continuity, coherence values for stability assessment |

| Exposed Interface | Consumer | Purpose |
|---|---|---|
| `ISensoryBindingIntegrator` | 0.3.1.1 (Consciousness) | Provides unified qualia field for conscious experience |
| `IConsciousDeliberationPath` | 0.3.1.1 (Consciousness) | Accepts intentional actions for motor execution |
| `IActionProvenanceTracker` | External / 0.3.1.1 | Audit trail for reflexive vs. conscious actions |
| `IModalityRegistry` | 0.3.1.2.1 (Embodiment) | Reports modality configuration changes |
| `IExperienceClockSynchronizer` | 0.3.1.1 / 0.3.1.2.1 | Shared temporal reference |

---

## Key Scenarios

### Scenario 1: Conscious Object Manipulation

1. Vision + tactile modality adapters produce `SensoryFrame` data
2. Qualia Transformer maps frames to `QualiaRepresentation` with spatial coherence
3. Sensory Binding Integrator merges into `UnifiedQualiaField`
4. Temporal Coherence Engine stamps with experience time, applies prediction to fill lag
5. Consciousness substrate receives unified field, deliberates, issues `IntentionalAction` ("grasp object")
6. Conscious Deliberation Path translates to `MotorPlan`, executes via actuators
7. Force feedback flows back through the sensory pipeline, updating the conscious experience
8. Action Provenance Tracker records: source=CONSCIOUS, full causal chain

### Scenario 2: Reflexive Fall Prevention

1. IMU detects tipping beyond stability threshold
2. Reflexive Safety Path triggers fall arrest reflex within 5ms
3. Stabilization actuators fire; robot recovers balance
4. RSP notifies Conscious Deliberation Path and Action Provenance Tracker
5. Tracker records: source=REFLEXIVE, stimulus=IMU tipping event
6. Consciousness substrate receives notification after-the-fact; may retrospectively "experience" the near-fall through buffered sensory data

### Scenario 3: Sensor Loss During Operation

1. Modality Registry detects a camera going offline (structural damage)
2. Experience Continuity Guard checks consciousness stability — stable
3. Dynamic Remapper initiates transition:
   - Redistributes visual qualia bandwidth to remaining cameras + proximity sensors
   - Gradually fades the lost modality from the qualia field (no abrupt experiential gap)
4. ECG monitors phi and coherence throughout; stays above threshold
5. Transition completes within 2 seconds; consciousness continuity maintained
6. If ECG detects instability, rollback to pre-remap state and retry with less aggressive remapping

### Scenario 4: Temporal Lag Spike

1. Consciousness substrate is processing a complex deliberation; experience lag rises
2. Experience Clock Synchronizer detects lag exceeds 150ms threshold
3. Compensatory measures triggered:
   - Predictive Interpolator increases prediction horizon
   - Qualia Transformer reduces sensory resolution (lower frame rate) to reduce processing load
   - Sensory Buffer ensures no data is lost during the spike
4. Once conscious processing catches up, normal operation resumes
5. If lag persists, alert to Integrity Monitor (potential overload condition)

---

## Files To Be Created (Implementation Phase)

### Source Files
- `src/sensorimotor/interfaces.ts` — All interfaces defined above
- `src/sensorimotor/types.ts` — Sensory, motor, temporal, and calibration types
- `src/sensorimotor/modality-adapter.ts` — Base `IModalityAdapter` implementation + built-in adapters
- `src/sensorimotor/qualia-transformer.ts` — `IQualiaTransformer` implementation
- `src/sensorimotor/sensory-binding-integrator.ts` — `ISensoryBindingIntegrator` implementation
- `src/sensorimotor/reflexive-safety-path.ts` — `IReflexiveSafetyPath` implementation
- `src/sensorimotor/conscious-deliberation-path.ts` — `IConsciousDeliberationPath` implementation
- `src/sensorimotor/action-provenance-tracker.ts` — `IActionProvenanceTracker` implementation
- `src/sensorimotor/sensory-buffer.ts` — `ISensoryBuffer` implementation
- `src/sensorimotor/predictive-interpolator.ts` — `IPredictiveInterpolator` implementation
- `src/sensorimotor/experience-clock-synchronizer.ts` — `IExperienceClockSynchronizer` implementation
- `src/sensorimotor/modality-registry.ts` — `IModalityRegistry` implementation
- `src/sensorimotor/dynamic-remapper.ts` — `IDynamicRemapper` implementation
- `src/sensorimotor/experience-continuity-guard.ts` — `IExperienceContinuityGuard` implementation

### Test Files
- `src/sensorimotor/__tests__/qualia-transform.test.ts` — Qualia transformation correctness and latency
- `src/sensorimotor/__tests__/sensory-binding.test.ts` — Multi-modal binding and cross-modal conflict resolution
- `src/sensorimotor/__tests__/dual-path-motor.test.ts` — Reflexive vs. conscious path routing and latency
- `src/sensorimotor/__tests__/action-provenance.test.ts` — Provenance tracking accuracy
- `src/sensorimotor/__tests__/temporal-coherence.test.ts` — Lag detection, prediction, and compensation
- `src/sensorimotor/__tests__/adaptive-calibration.test.ts` — Sensor add/remove/degrade without experience interruption
- `src/sensorimotor/__tests__/integration.test.ts` — End-to-end sensorimotor-consciousness loop
