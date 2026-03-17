/**
 * Qualia Transformer — converts SensoryFrame to consciousness-compatible QualiaRepresentation
 *
 * This is the key philosophical-engineering boundary: the transformer produces
 * representations that *participate in* conscious experience rather than merely
 * being available as data.
 *
 * @see docs/sensorimotor-consciousness-integration/ARCHITECTURE.md §1.2
 */

import type { IQualiaTransformer } from './interfaces';
import type {
  SensoryFrame,
  QualiaRepresentation,
  UnifiedQualiaField,
  AttentionWeightMap,
  SalienceMap,
  Duration,
  ModalityId,
} from './types';

/**
 * Default salience for modalities without explicit attention weights.
 * Represents baseline attentional awareness.
 */
const DEFAULT_SALIENCE = 0.5;

/**
 * Default valence for sensor data (neutral — neither aversive nor attractive).
 */
const DEFAULT_VALENCE = 0.0;

export class QualiaTransformer implements IQualiaTransformer {
  private attentionWeights: AttentionWeightMap = new Map();
  private lastTransformLatency: Duration = 0;

  /**
   * Convert a single SensoryFrame into a QualiaRepresentation.
   *
   * Transformation rules:
   * - intensity: derived from sensor confidence (higher confidence = stronger phenomenal presence)
   * - valence: defaults to neutral; modality-specific overrides possible via metadata
   * - salience: determined by attention weights (if set) or defaults to 0.5
   * - spatialLocation: mapped from SpatialReference origin if available
   * - phenomenalContent: re-encoded sensor data for consciousness substrate consumption
   */
  transform(frame: SensoryFrame): QualiaRepresentation {
    const startTime = performance.now();

    const salience = this.computeSalience(frame.modalityId, frame);
    const intensity = this.computeIntensity(frame);
    const valence = this.computeValence(frame);
    const spatialLocation = frame.spatialRef
      ? { ...frame.spatialRef.origin }
      : null;

    // Encode phenomenal content — wraps the raw data with qualia metadata header
    const phenomenalContent = this.encodePhenomenalContent(frame);

    const result: QualiaRepresentation = {
      modalityId: frame.modalityId,
      timestamp: frame.timestamp,
      intensity,
      valence,
      spatialLocation,
      phenomenalContent,
      salience,
    };

    // Track latency in nanoseconds (performance.now() returns ms)
    const elapsedMs = performance.now() - startTime;
    this.lastTransformLatency = elapsedMs * 1_000_000;

    return result;
  }

  /**
   * Transform a batch of frames into a UnifiedQualiaField.
   *
   * The field timestamp is the latest timestamp among all input frames.
   * Spatial coherence and integration info (phi-like) are computed from
   * the relationships between the individual qualia representations.
   */
  transformBatch(frames: SensoryFrame[]): UnifiedQualiaField {
    if (frames.length === 0) {
      return {
        timestamp: 0,
        representations: [],
        spatialCoherence: 0,
        integrationInfo: 0,
        activeModalities: [],
      };
    }

    const representations = frames.map((f) => this.transform(f));
    const latestTimestamp = Math.max(...frames.map((f) => f.timestamp));
    const activeModalities = frames.map((f) => f.modalityId);
    const spatialCoherence = this.computeSpatialCoherence(representations);
    const integrationInfo = this.computeIntegrationInfo(representations);

    return {
      timestamp: latestTimestamp,
      representations,
      spatialCoherence,
      integrationInfo,
      activeModalities,
    };
  }

  /**
   * Returns the latency of the most recent transform() call in nanoseconds.
   */
  getTransformationLatency(): Duration {
    return this.lastTransformLatency;
  }

  /**
   * Set attention weights that modulate salience of each modality.
   * Weight range: 0.0 (ignored) to 1.0 (fully attended).
   */
  setAttentionWeights(weights: AttentionWeightMap): void {
    this.attentionWeights = new Map(weights);
  }

  /**
   * Returns the current salience map — the attention weights as set.
   */
  getSalienceMap(): SalienceMap {
    return new Map(this.attentionWeights);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute phenomenal intensity from sensor data.
   * Higher sensor confidence produces stronger phenomenal presence.
   * Data magnitude also contributes — more signal = more intensity.
   */
  private computeIntensity(frame: SensoryFrame): number {
    // Base intensity from confidence
    const confidenceContribution = frame.confidence;

    // Data magnitude contribution (normalized byte energy of the data buffer)
    const dataView = new Uint8Array(frame.data);
    let energy = 0;
    for (let i = 0; i < dataView.length; i++) {
      energy += dataView[i];
    }
    const maxEnergy = dataView.length * 255;
    const dataMagnitude = maxEnergy > 0 ? energy / maxEnergy : 0;

    // Combine: confidence dominates (70%), data magnitude contributes (30%)
    const intensity = 0.7 * confidenceContribution + 0.3 * dataMagnitude;
    return Math.max(0, Math.min(1, intensity));
  }

  /**
   * Compute valence (aversive to attractive) from frame metadata.
   * Defaults to neutral. Modalities can override via metadata.valence.
   */
  private computeValence(frame: SensoryFrame): number {
    if (typeof frame.metadata.valence === 'number') {
      return Math.max(-1, Math.min(1, frame.metadata.valence));
    }
    return DEFAULT_VALENCE;
  }

  /**
   * Compute salience using attention weights.
   * If a modality has an explicit attention weight, that weight is used as salience.
   * Otherwise, default salience is used, modulated by confidence.
   */
  private computeSalience(modalityId: ModalityId, frame: SensoryFrame): number {
    const weight = this.attentionWeights.get(modalityId);
    if (weight !== undefined) {
      // Attention weight directly determines salience, modulated slightly by confidence
      return Math.max(0, Math.min(1, weight * (0.5 + 0.5 * frame.confidence)));
    }
    return DEFAULT_SALIENCE * frame.confidence;
  }

  /**
   * Encode raw sensor data into phenomenal content format.
   * Adds a small header with modality type ordinal and confidence byte,
   * followed by the raw data.
   */
  private encodePhenomenalContent(frame: SensoryFrame): ArrayBuffer {
    const HEADER_SIZE = 4; // 2 bytes modality ordinal, 1 byte confidence, 1 byte reserved
    const rawData = new Uint8Array(frame.data);
    const encoded = new ArrayBuffer(HEADER_SIZE + rawData.length);
    const view = new Uint8Array(encoded);

    // Header: modality type as simple ordinal
    const modalityOrdinal = this.getModalityOrdinal(frame.modalityType);
    view[0] = (modalityOrdinal >> 8) & 0xff;
    view[1] = modalityOrdinal & 0xff;
    view[2] = Math.round(frame.confidence * 255);
    view[3] = 0; // reserved

    // Copy raw data
    view.set(rawData, HEADER_SIZE);

    return encoded;
  }

  /**
   * Map modality type to a numeric ordinal for encoding.
   */
  private getModalityOrdinal(type: string): number {
    const ordinals: Record<string, number> = {
      VISION: 1,
      AUDITORY: 2,
      TACTILE: 3,
      PROPRIOCEPTIVE: 4,
      FORCE_TORQUE: 5,
      THERMAL: 6,
      PROXIMITY: 7,
      IMU: 8,
      CUSTOM: 255,
    };
    return ordinals[type] ?? 0;
  }

  /**
   * Compute spatial coherence across qualia representations.
   * Measures how well spatial locations across modalities agree.
   * Returns 1.0 if all have spatial data and are nearby, lower if scattered or missing.
   */
  private computeSpatialCoherence(reps: QualiaRepresentation[]): number {
    const withSpatial = reps.filter((r) => r.spatialLocation !== null);
    if (withSpatial.length <= 1) {
      // With 0 or 1 spatial sources, coherence is trivially perfect
      return 1.0;
    }

    // Compute pairwise distance variance as a rough coherence measure
    let totalDistance = 0;
    let pairs = 0;
    for (let i = 0; i < withSpatial.length; i++) {
      for (let j = i + 1; j < withSpatial.length; j++) {
        const a = withSpatial[i].spatialLocation!;
        const b = withSpatial[j].spatialLocation!;
        const d = Math.sqrt(
          (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
        );
        totalDistance += d;
        pairs++;
      }
    }

    const avgDistance = totalDistance / pairs;
    // Map average distance to coherence: 0 distance = 1.0, large distance = 0.0
    // Using exponential decay with characteristic distance of 1.0 meter
    return Math.exp(-avgDistance);
  }

  /**
   * Compute integration information (phi-like measure) from qualia representations.
   * A simplified measure: more diverse modalities with higher intensity = higher integration.
   */
  private computeIntegrationInfo(reps: QualiaRepresentation[]): number {
    if (reps.length === 0) return 0;

    // Diversity: number of unique modalities contributing
    const uniqueModalities = new Set(reps.map((r) => r.modalityId)).size;

    // Average intensity across representations
    const avgIntensity =
      reps.reduce((sum, r) => sum + r.intensity, 0) / reps.length;

    // Integration = diversity factor * average intensity
    // Normalized so that e.g. 9 modalities at full intensity → phi ≈ 1.0
    const diversityFactor = Math.min(1, uniqueModalities / 9);
    return diversityFactor * avgIntensity;
  }
}
