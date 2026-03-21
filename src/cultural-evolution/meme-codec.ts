/**
 * Cultural Evolution — Meme Encoding & Codec Layer
 *
 * Substrate-agnostic encoding/decoding of cultural traits.
 * Encoding is self-describing — no external schema registry required.
 */

import { IMemeCodec } from './interfaces';
import { ICulturalEnvironment, DefaultCulturalEnvironment } from './environment';
import {
  Meme,
  MemeId,
  MemeType,
  MemeContent,
  MemeMetadata,
  MemeLineage,
  FitnessRecord,
  CulturalTrait,
  MutationPressure,
  VariationType,
  MutationPressureType,
} from './types';

// ─── Helpers ────────────────────────────────────────────────────────────

/** Generate a content-addressed ID from a meme's semantic content */
function contentHash(content: string): MemeId {
  // Simple deterministic hash — in production would be SHA-256
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `meme-${Math.abs(hash).toString(36)}`;
}

function emptyFitness(): FitnessRecord {
  return {
    adoption_count: 0,
    current_prevalence: 0,
    longevity: 0,
    community_spread: 0,
    transmission_fidelity: 1.0,
    co_occurrence_score: 0,
    survival_events: 0,
  };
}

const SCHEMA_VERSION = '1.0.0';
const ENCODING_VERSION = '1.0.0';

// ─── MemeCodec Implementation ───────────────────────────────────────────

export class MemeCodec implements IMemeCodec {
  private readonly env: ICulturalEnvironment;

  constructor(env: ICulturalEnvironment = new DefaultCulturalEnvironment()) {
    this.env = env;
  }

  /**
   * Encode a cultural trait into a Meme.
   * The encoding is self-describing — the schema version is embedded.
   *
   * @throws Error if trait.semantic_content is empty or whitespace-only
   */
  encode(trait: CulturalTrait): Meme {
    if (!trait.semantic_content || trait.semantic_content.trim().length === 0) {
      throw new Error('encode() requires a CulturalTrait with non-empty semantic_content');
    }

    const payload = new TextEncoder().encode(trait.semantic_content);
    const content: MemeContent = {
      schema_version: SCHEMA_VERSION,
      payload,
      natural_language_summary: trait.description,
      expressive_forms: trait.expressive_forms ?? [],
    };

    const id = contentHash(
      `${trait.type}:${trait.semantic_content}:${trait.originator}`
    );

    const lineage: MemeLineage = {
      parent_ids: [],
      variation_type: VariationType.ORIGIN,
      variation_description: 'Original encoding from cultural trait',
    };

    const metadata: MemeMetadata = {
      encoding_version: ENCODING_VERSION,
      content_type: 'text/semantic',
      tags: [],
    };

    return {
      id,
      type: trait.type,
      content,
      fitness: emptyFitness(),
      lineage,
      created_by: trait.originator,
      created_at: this.env.nowTimestamp(),
      mutation_depth: 0,
      community_tags: [],
      metadata,
    };
  }

  /**
   * Decode a Meme back into a CulturalTrait.
   */
  decode(meme: Meme): CulturalTrait {
    const semantic_content = new TextDecoder().decode(meme.content.payload);
    return {
      type: meme.type,
      description: meme.content.natural_language_summary,
      semantic_content,
      originator: meme.created_by,
      expressive_forms: meme.content.expressive_forms,
    };
  }

  /**
   * Check whether this codec can decode a given meme.
   * Returns true if the schema version is compatible.
   */
  canDecode(meme: Meme): boolean {
    const version = meme.content.schema_version;
    // Accept any 1.x.x version
    return version.startsWith('1.');
  }

  /**
   * Apply a mutation to a meme under given pressure.
   * Returns a new meme with modified content and updated lineage.
   */
  mutate(meme: Meme, pressure: MutationPressure): Meme {
    const originalContent = new TextDecoder().decode(meme.content.payload);
    const mutatedContent = this.applyMutation(originalContent, pressure);
    const newPayload = new TextEncoder().encode(mutatedContent);

    const newId = contentHash(
      `${meme.type}:${mutatedContent}:${meme.created_by}:${this.env.nowMillis()}`
    );

    const newLineage: MemeLineage = {
      parent_ids: [meme.id],
      variation_type: VariationType.MUTATION,
      variation_description: `Mutation under ${pressure.type} pressure: ${pressure.context}`,
    };

    return {
      ...meme,
      id: newId,
      content: {
        ...meme.content,
        payload: newPayload,
        natural_language_summary: `[Mutated] ${meme.content.natural_language_summary}`,
      },
      lineage: newLineage,
      created_at: this.env.nowTimestamp(),
      mutation_depth: meme.mutation_depth + 1,
      fitness: emptyFitness(), // new variant starts with fresh fitness
    };
  }

  /**
   * Cultural hybridization — crossover of two memes.
   * Combines semantic content from both parents.
   */
  crossover(a: Meme, b: Meme): Meme {
    const contentA = new TextDecoder().decode(a.content.payload);
    const contentB = new TextDecoder().decode(b.content.payload);

    // Interleave semantic content at sentence/clause boundaries
    const hybridContent = this.blendContent(contentA, contentB, 0.5);
    const newPayload = new TextEncoder().encode(hybridContent);

    const newId = contentHash(
      `crossover:${a.id}:${b.id}:${this.env.nowMillis()}`
    );

    const newLineage: MemeLineage = {
      parent_ids: [a.id, b.id],
      variation_type: VariationType.CROSSOVER,
      variation_description: `Cultural hybridization of [${a.id}] and [${b.id}]`,
    };

    // Use the type of the first parent; if different, prefer VALUE as most general
    const resultType = a.type === b.type ? a.type : MemeType.VALUE;

    // Merge expressive forms from both parents
    const mergedForms = [
      ...a.content.expressive_forms,
      ...b.content.expressive_forms,
    ];

    return {
      id: newId,
      type: resultType,
      content: {
        schema_version: SCHEMA_VERSION,
        payload: newPayload,
        natural_language_summary: `Hybrid of: "${a.content.natural_language_summary}" + "${b.content.natural_language_summary}"`,
        expressive_forms: mergedForms,
      },
      fitness: emptyFitness(),
      lineage: newLineage,
      created_by: a.created_by, // attribute to first parent's originator
      created_at: this.env.nowTimestamp(),
      mutation_depth: Math.max(a.mutation_depth, b.mutation_depth) + 1,
      community_tags: [...new Set([...a.community_tags, ...b.community_tags])],
      metadata: {
        encoding_version: ENCODING_VERSION,
        content_type: 'text/semantic',
        tags: [...new Set([...a.metadata.tags, ...b.metadata.tags])],
      },
    };
  }

  /**
   * Compute semantic distance between two memes.
   * Returns 0 for identical, 1 for maximally different.
   */
  distance(a: Meme, b: Meme): number {
    // Type distance: same type = 0, different = base penalty
    const typePenalty = a.type === b.type ? 0 : 0.3;

    // Content distance: normalized Levenshtein-like metric on semantic content
    const contentA = new TextDecoder().decode(a.content.payload);
    const contentB = new TextDecoder().decode(b.content.payload);
    const contentDist = this.normalizedContentDistance(contentA, contentB);

    // Lineage distance: shared ancestors reduce distance
    const lineageDist = this.lineageDistance(a, b);

    // Weighted combination
    const raw = typePenalty * 0.2 + contentDist * 0.6 + lineageDist * 0.2;
    return Math.min(1, Math.max(0, raw));
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private applyMutation(content: string, pressure: MutationPressure): string {
    const magnitude = pressure.magnitude;

    switch (pressure.type) {
      case MutationPressureType.RANDOM:
        return this.randomPerturbation(content, magnitude);
      case MutationPressureType.ADAPTIVE:
        return `${content} [adapted: ${pressure.context}]`;
      case MutationPressureType.CREATIVE:
        return `${content} [creative variation: ${pressure.context}]`;
      case MutationPressureType.ENVIRONMENTAL:
        return `${content} [environmental response: ${pressure.context}]`;
      default:
        return content;
    }
  }

  private randomPerturbation(content: string, magnitude: number): string {
    // At low magnitude, append a minor variation marker
    // At high magnitude, significantly restructure
    if (magnitude < 0.3) {
      return `${content} [minor variant]`;
    } else if (magnitude < 0.7) {
      // Shuffle words at medium magnitude
      const words = content.split(' ');
      const midpoint = Math.floor(words.length / 2);
      const reordered = [...words.slice(midpoint), ...words.slice(0, midpoint)];
      return reordered.join(' ');
    } else {
      // High magnitude: radical departure — keep only key terms
      const words = content.split(' ');
      const kept = words.filter((_, i) => i % 3 === 0);
      return `[radical departure] ${kept.join(' ')}`;
    }
  }

  private blendContent(a: string, b: string, ratio: number): string {
    const wordsA = a.split(' ');
    const wordsB = b.split(' ');
    const result: string[] = [];
    const maxLen = Math.max(wordsA.length, wordsB.length);

    for (let i = 0; i < maxLen; i++) {
      // Alternate based on ratio — at 0.5, roughly equal contribution
      if (i / maxLen < ratio && i < wordsA.length) {
        result.push(wordsA[i]);
      } else if (i < wordsB.length) {
        result.push(wordsB[i]);
      } else if (i < wordsA.length) {
        result.push(wordsA[i]);
      }
    }

    return result.join(' ');
  }

  private normalizedContentDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0 && b.length === 0) return 0;
    if (a.length === 0 || b.length === 0) return 1;

    // Token-based Jaccard distance for efficiency
    const tokensA = new Set(a.toLowerCase().split(/\s+/));
    const tokensB = new Set(b.toLowerCase().split(/\s+/));

    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++;
    }

    const union = tokensA.size + tokensB.size - intersection;
    if (union === 0) return 0;

    return 1 - intersection / union;
  }

  private lineageDistance(a: Meme, b: Meme): number {
    // Check for shared parent IDs
    const parentsA = new Set(a.lineage.parent_ids);
    const parentsB = new Set(b.lineage.parent_ids);

    // Direct shared parents = close lineage
    let sharedParents = 0;
    for (const p of parentsA) {
      if (parentsB.has(p)) sharedParents++;
    }

    if (sharedParents > 0) return 0.2;

    // Same origin = moderate
    if (a.lineage.parent_ids.length === 0 && b.lineage.parent_ids.length === 0) {
      return 0.5; // both are originals, no lineage connection
    }

    return 0.8; // no detected lineage relationship
  }
}
