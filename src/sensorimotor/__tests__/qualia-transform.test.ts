/**
 * Qualia Transform Tests
 *
 * Verifies that the QualiaTransformer correctly converts SensoryFrame data
 * into consciousness-compatible QualiaRepresentation, with correct latency
 * and attention weighting behavior.
 *
 * @see docs/sensorimotor-consciousness-integration/ARCHITECTURE.md §1.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QualiaTransformer } from '../qualia-transformer';
import type { SensoryFrame, QualiaRepresentation, UnifiedQualiaField } from '../types';
import { LATENCY_BUDGET, NS_PER_MS } from '../types';

function makeSensoryFrame(overrides: Partial<SensoryFrame> = {}): SensoryFrame {
  return {
    modalityId: 'vision-0',
    modalityType: 'VISION',
    timestamp: 1_000_000_000,
    data: new ArrayBuffer(64),
    confidence: 0.95,
    spatialRef: null,
    metadata: {},
    ...overrides,
  };
}

describe('QualiaTransformer', () => {
  let transformer: QualiaTransformer;

  beforeEach(() => {
    transformer = new QualiaTransformer();
  });

  describe('transform()', () => {
    it('should convert a SensoryFrame into a QualiaRepresentation', () => {
      const frame = makeSensoryFrame();
      const qualia = transformer.transform(frame);

      expect(qualia.modalityId).toBe(frame.modalityId);
      expect(qualia.timestamp).toBe(frame.timestamp);
      expect(qualia.intensity).toBeGreaterThanOrEqual(0);
      expect(qualia.intensity).toBeLessThanOrEqual(1);
      expect(qualia.valence).toBeGreaterThanOrEqual(-1);
      expect(qualia.valence).toBeLessThanOrEqual(1);
      expect(qualia.salience).toBeGreaterThanOrEqual(0);
      expect(qualia.salience).toBeLessThanOrEqual(1);
      expect(qualia.phenomenalContent).toBeInstanceOf(ArrayBuffer);
    });

    it('should preserve modality ID and timestamp from the source frame', () => {
      const frame = makeSensoryFrame({
        modalityId: 'tactile-2',
        modalityType: 'TACTILE',
        timestamp: 5_000_000_000,
      });
      const qualia = transformer.transform(frame);

      expect(qualia.modalityId).toBe('tactile-2');
      expect(qualia.timestamp).toBe(5_000_000_000);
    });

    it('should map sensor confidence to intensity proportionally', () => {
      const highConfidence = makeSensoryFrame({ confidence: 1.0 });
      const lowConfidence = makeSensoryFrame({ confidence: 0.2 });

      const highQualia = transformer.transform(highConfidence);
      const lowQualia = transformer.transform(lowConfidence);

      // Higher confidence sensor data should produce higher phenomenal intensity
      expect(highQualia.intensity).toBeGreaterThan(lowQualia.intensity);
    });

    it('should map spatial reference to spatial location when available', () => {
      const frame = makeSensoryFrame({
        spatialRef: {
          frameId: 'body',
          origin: { x: 1, y: 2, z: 3 },
          orientation: { x: 0, y: 0, z: 0 },
        },
      });
      const qualia = transformer.transform(frame);

      expect(qualia.spatialLocation).not.toBeNull();
      expect(qualia.spatialLocation!.x).toBe(1);
      expect(qualia.spatialLocation!.y).toBe(2);
      expect(qualia.spatialLocation!.z).toBe(3);
    });

    it('should return null spatialLocation when no spatial reference exists', () => {
      const frame = makeSensoryFrame({ spatialRef: null });
      const qualia = transformer.transform(frame);

      expect(qualia.spatialLocation).toBeNull();
    });
  });

  describe('transformBatch()', () => {
    it('should produce a UnifiedQualiaField from multiple frames', () => {
      const frames: SensoryFrame[] = [
        makeSensoryFrame({ modalityId: 'vision-0', modalityType: 'VISION' }),
        makeSensoryFrame({ modalityId: 'tactile-0', modalityType: 'TACTILE' }),
        makeSensoryFrame({ modalityId: 'audio-0', modalityType: 'AUDITORY' }),
      ];

      const field = transformer.transformBatch(frames);

      expect(field.representations).toHaveLength(3);
      expect(field.activeModalities).toContain('vision-0');
      expect(field.activeModalities).toContain('tactile-0');
      expect(field.activeModalities).toContain('audio-0');
      expect(field.spatialCoherence).toBeGreaterThanOrEqual(0);
      expect(field.spatialCoherence).toBeLessThanOrEqual(1);
      expect(field.integrationInfo).toBeGreaterThanOrEqual(0);
    });

    it('should return an empty field for an empty batch', () => {
      const field = transformer.transformBatch([]);

      expect(field.representations).toHaveLength(0);
      expect(field.activeModalities).toHaveLength(0);
    });

    it('should use the latest frame timestamp as the field timestamp', () => {
      const frames: SensoryFrame[] = [
        makeSensoryFrame({ timestamp: 1_000_000_000 }),
        makeSensoryFrame({ timestamp: 3_000_000_000 }),
        makeSensoryFrame({ timestamp: 2_000_000_000 }),
      ];

      const field = transformer.transformBatch(frames);
      expect(field.timestamp).toBe(3_000_000_000);
    });
  });

  describe('attention weighting', () => {
    it('should apply attention weights to salience', () => {
      const weights = new Map<string, number>();
      weights.set('vision-0', 1.0);   // fully attended
      weights.set('tactile-0', 0.1);  // barely attended

      transformer.setAttentionWeights(weights);

      const visionQualia = transformer.transform(
        makeSensoryFrame({ modalityId: 'vision-0', modalityType: 'VISION' })
      );
      const tactileQualia = transformer.transform(
        makeSensoryFrame({ modalityId: 'tactile-0', modalityType: 'TACTILE' })
      );

      expect(visionQualia.salience).toBeGreaterThan(tactileQualia.salience);
    });

    it('should reflect attention weights in the salience map', () => {
      const weights = new Map<string, number>();
      weights.set('vision-0', 0.8);
      transformer.setAttentionWeights(weights);

      const salienceMap = transformer.getSalienceMap();
      expect(salienceMap.get('vision-0')).toBe(0.8);
    });
  });

  describe('latency', () => {
    it('should report transformation latency within budget', () => {
      // First do a transform to have a measured latency
      transformer.transform(makeSensoryFrame());
      const latency = transformer.getTransformationLatency();

      expect(latency).toBeLessThan(LATENCY_BUDGET.QUALIA_TRANSFORM);
    });
  });
});
