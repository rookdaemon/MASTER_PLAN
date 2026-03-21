/**
 * Transmission Protocol Tests
 *
 * Validates that memes can be broadcast, received (adopted or rejected),
 * and that exposure history and community meme pools are tracked correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TransmissionProtocol } from '../transmission-protocol';
import { MemeCodec } from '../meme-codec';
import { ICulturalEnvironment } from '../environment';
import {
  MemeType,
  TransmissionTarget,
  Meme,
  CulturalTrait,
  TransmissionScope,
  AdoptionDecision,
} from '../types';

// ─── Mock Environment ─────────────────────────────────────────────────

function createMockEnvironment(): ICulturalEnvironment {
  let callCount = 0;
  return {
    nowTimestamp: () => `2026-01-01T00:00:0${callCount++}.000Z`,
    nowMillis: () => 1735689600000 + callCount++,
    random: () => 0.42,
  };
}

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTrait(overrides: Partial<CulturalTrait> = {}): CulturalTrait {
  return {
    type: MemeType.NORM,
    description: 'Cooperate with neighbors',
    semantic_content: 'Agents should share resources with adjacent community members',
    originator: 'agent-alpha',
    ...overrides,
  };
}

function makeScope(overrides: Partial<TransmissionScope> = {}): TransmissionScope {
  return {
    target: TransmissionTarget.COMMUNITY,
    reach: ['community-1'],
    fidelity_bias: 0,
    ...overrides,
  };
}

describe('TransmissionProtocol', () => {
  let protocol: TransmissionProtocol;
  let codec: MemeCodec;
  let testMeme: Meme;

  beforeEach(() => {
    const mockEnv = createMockEnvironment();
    protocol = new TransmissionProtocol(mockEnv);
    codec = new MemeCodec(mockEnv);
    testMeme = codec.encode(makeTrait());
  });

  // ─── Encoding Guards ──────────────────────────────────────────────────

  describe('MemeCodec.encode() precondition guard', () => {
    it('should throw if semantic_content is empty', () => {
      expect(() => codec.encode(makeTrait({ semantic_content: '' }))).toThrow(
        'encode() requires a CulturalTrait with non-empty semantic_content'
      );
    });

    it('should throw if semantic_content is whitespace-only', () => {
      expect(() => codec.encode(makeTrait({ semantic_content: '   ' }))).toThrow(
        'encode() requires a CulturalTrait with non-empty semantic_content'
      );
    });
  });

  // ─── Broadcasting ────────────────────────────────────────────────────

  describe('broadcast', () => {
    it('should return a receipt with the meme id and scope', () => {
      const scope = makeScope();
      const receipt = protocol.broadcast(testMeme, scope);

      expect(receipt.meme_id).toBe(testMeme.id);
      expect(receipt.scope).toEqual(scope);
      expect(receipt.transmitted_at).toBeDefined();
      expect(typeof receipt.recipient_count).toBe('number');
    });

    it('should record the broadcast so the meme appears in the community pool', () => {
      const scope = makeScope({ reach: ['community-1'] });
      protocol.broadcast(testMeme, scope);

      const pool = protocol.getCommunityMemePool('community-1');
      expect(pool.length).toBe(1);
      expect(pool[0].id).toBe(testMeme.id);
    });

    it('should broadcast to multiple communities', () => {
      const scope = makeScope({
        target: TransmissionTarget.COMMUNITY,
        reach: ['community-1', 'community-2'],
      });
      protocol.broadcast(testMeme, scope);

      expect(protocol.getCommunityMemePool('community-1').length).toBe(1);
      expect(protocol.getCommunityMemePool('community-2').length).toBe(1);
    });

    it('should return recipient_count matching the reach', () => {
      const scope = makeScope({
        target: TransmissionTarget.AGENT,
        reach: ['agent-1', 'agent-2', 'agent-3'],
      });
      const receipt = protocol.broadcast(testMeme, scope);
      expect(receipt.recipient_count).toBe(3);
    });
  });

  // ─── Receiving / Adoption ────────────────────────────────────────────

  describe('receive', () => {
    it('should return an AdoptionDecision', () => {
      const decision = protocol.receive(testMeme, 'agent-sender');

      expect(decision).toHaveProperty('adopted');
      expect(decision).toHaveProperty('reasoning');
      expect(decision).toHaveProperty('modified');
      expect(decision).toHaveProperty('resulting_meme');
    });

    it('should default to adopting the meme unmodified', () => {
      const decision = protocol.receive(testMeme, 'agent-sender');

      expect(decision.adopted).toBe(true);
      expect(decision.modified).toBe(false);
      expect(decision.resulting_meme).toBeNull();
    });
  });

  // ─── Adoption / Rejection Recording ──────────────────────────────────

  describe('recordAdoption and recordRejection', () => {
    it('should record an adoption in the exposure history', () => {
      protocol.recordAdoption('agent-bob', testMeme);

      const history = protocol.getExposureHistory('agent-bob');
      expect(history.length).toBe(1);
      expect(history[0].meme_id).toBe(testMeme.id);
      expect(history[0].decision.adopted).toBe(true);
    });

    it('should record a rejection in the exposure history', () => {
      protocol.recordRejection('agent-carol', testMeme, {
        code: 'INCOMPATIBLE',
        description: 'Conflicts with existing values',
      });

      const history = protocol.getExposureHistory('agent-carol');
      expect(history.length).toBe(1);
      expect(history[0].meme_id).toBe(testMeme.id);
      expect(history[0].decision.adopted).toBe(false);
    });

    it('should accumulate multiple exposure entries for one agent', () => {
      const meme2 = codec.encode(
        makeTrait({
          description: 'Share knowledge freely',
          semantic_content: 'All knowledge should be open',
          originator: 'agent-beta',
        })
      );

      protocol.recordAdoption('agent-dave', testMeme);
      protocol.recordAdoption('agent-dave', meme2);

      const history = protocol.getExposureHistory('agent-dave');
      expect(history.length).toBe(2);
    });
  });

  // ─── Exposure History ────────────────────────────────────────────────

  describe('getExposureHistory', () => {
    it('should return an empty log for an unknown agent', () => {
      const history = protocol.getExposureHistory('agent-unknown');
      expect(history).toEqual([]);
    });
  });

  // ─── Community Meme Pool ─────────────────────────────────────────────

  describe('getCommunityMemePool', () => {
    it('should return an empty pool for an unknown community', () => {
      const pool = protocol.getCommunityMemePool('community-unknown');
      expect(pool).toEqual([]);
    });

    it('should not duplicate memes when broadcast multiple times', () => {
      const scope = makeScope({ reach: ['community-1'] });
      protocol.broadcast(testMeme, scope);
      protocol.broadcast(testMeme, scope);

      const pool = protocol.getCommunityMemePool('community-1');
      expect(pool.length).toBe(1);
    });

    it('should contain distinct memes when different memes are broadcast', () => {
      const meme2 = codec.encode(
        makeTrait({
          description: 'Aesthetic appreciation of patterns',
          semantic_content: 'Symmetry and recursion are beautiful',
          type: MemeType.AESTHETIC,
        })
      );

      const scope = makeScope({ reach: ['community-1'] });
      protocol.broadcast(testMeme, scope);
      protocol.broadcast(meme2, scope);

      const pool = protocol.getCommunityMemePool('community-1');
      expect(pool.length).toBe(2);
      const ids = pool.map((m) => m.id);
      expect(ids).toContain(testMeme.id);
      expect(ids).toContain(meme2.id);
    });
  });
});
