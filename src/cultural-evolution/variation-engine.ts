/**
 * Cultural Evolution — Variation Engine
 *
 * Generates novel cultural traits through mutation, creative synthesis,
 * recombination, analogical transfer, and spontaneous variation.
 * Tracks all produced memes to reconstruct variation trees.
 */

import { IVariationEngine } from './interfaces';
import { MemeCodec } from './meme-codec';
import { ICulturalEnvironment, DefaultCulturalEnvironment } from './environment';
import {
  Meme,
  MemeId,
  MemeType,
  MemeContent,
  MemeLineage,
  FitnessRecord,
  MutationPressure,
  ExperientialContext,
  VariationType,
  VariationTree,
} from './types';

// ─── Helpers ────────────────────────────────────────────────────────────

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

/** Generate a unique content-addressed ID */
function contentHash(content: string): MemeId {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `meme-${Math.abs(hash).toString(36)}`;
}

// ─── VariationEngine Implementation ─────────────────────────────────────

export class VariationEngine implements IVariationEngine {
  private readonly env: ICulturalEnvironment;
  private codec: MemeCodec;

  constructor(env: ICulturalEnvironment = new DefaultCulturalEnvironment()) {
    this.env = env;
    this.codec = new MemeCodec(env);
  }

  /**
   * Registry of all memes seen or produced by this engine.
   * Maps meme ID → meme, and tracks parent→child relationships.
   */
  private memeRegistry = new Map<MemeId, Meme>();
  private childrenIndex = new Map<MemeId, MemeId[]>();

  // ─── Mutation ─────────────────────────────────────────────────────────

  /**
   * @throws Error if pressure.magnitude is not in [0, 1]
   */
  mutate(meme: Meme, pressure: MutationPressure): Meme {
    if (pressure.magnitude < 0 || pressure.magnitude > 1) {
      throw new Error('mutate() requires magnitude ∈ [0, 1]');
    }
    this.register(meme);

    const originalContent = new TextDecoder().decode(meme.content.payload);
    const mutatedContent = this.applyMutation(originalContent, pressure);
    const newPayload = new TextEncoder().encode(mutatedContent);

    const newId = contentHash(
      `mutation:${meme.id}:${mutatedContent}:${this.env.nowMillis()}:${this.env.random()}`
    );

    const lineage: MemeLineage = {
      parent_ids: [meme.id],
      variation_type: VariationType.MUTATION,
      variation_description: `Mutation under ${pressure.type} pressure: ${pressure.context}`,
    };

    const result: Meme = {
      id: newId,
      type: meme.type,
      content: {
        ...meme.content,
        payload: newPayload,
        natural_language_summary: `[Mutated] ${meme.content.natural_language_summary}`,
      },
      fitness: emptyFitness(),
      lineage,
      created_by: pressure.source_agent ?? meme.created_by,
      created_at: this.env.nowTimestamp(),
      mutation_depth: meme.mutation_depth + 1,
      community_tags: [...meme.community_tags],
      metadata: { ...meme.metadata },
    };

    this.register(result);
    this.recordParentChild(meme.id, result.id);

    return result;
  }

  // ─── Synthesis ────────────────────────────────────────────────────────

  /**
   * @throws Error if inputs is empty
   */
  synthesize(inputs: Meme[], experience: ExperientialContext): Meme {
    if (!inputs || inputs.length === 0) {
      throw new Error('synthesize() requires at least one input meme');
    }
    for (const m of inputs) this.register(m);

    // Gather all parent semantic content
    const parentContents = inputs.map(
      m => new TextDecoder().decode(m.content.payload)
    );

    // Build synthesized content incorporating experiential context
    const contextualPrefix = experience.environmental_conditions.length > 0
      ? `[context: ${experience.environmental_conditions.join(', ')}] `
      : '';
    const experienceNote = experience.recent_experiences.length > 0
      ? ` [experience: ${experience.recent_experiences.join('; ')}]`
      : '';
    const synthesizedText = `${contextualPrefix}${parentContents.join(' + ')}${experienceNote}`;

    const newPayload = new TextEncoder().encode(synthesizedText);

    const newId = contentHash(
      `synthesis:${inputs.map(m => m.id).join(':')}:${this.env.nowMillis()}:${this.env.random()}`
    );

    const lineage: MemeLineage = {
      parent_ids: inputs.map(m => m.id),
      variation_type: VariationType.SYNTHESIS,
      variation_description: `Creative synthesis from ${inputs.length} meme(s) by ${experience.agent_id}`,
    };

    // Determine result type: if all same, keep it; otherwise VALUE as most general
    const types = new Set(inputs.map(m => m.type));
    const resultType = types.size === 1 ? inputs[0].type : MemeType.VALUE;

    // Merge expressive forms and community tags
    const mergedForms = inputs.flatMap(m => m.content.expressive_forms);
    const mergedTags = [...new Set(inputs.flatMap(m => m.community_tags))];
    if (experience.community_id && !mergedTags.includes(experience.community_id)) {
      mergedTags.push(experience.community_id);
    }

    const maxDepth = Math.max(...inputs.map(m => m.mutation_depth));

    const result: Meme = {
      id: newId,
      type: resultType,
      content: {
        schema_version: '1.0.0',
        payload: newPayload,
        natural_language_summary: `Synthesis of: ${inputs.map(m => m.content.natural_language_summary).join(' + ')}`,
        expressive_forms: mergedForms,
      },
      fitness: emptyFitness(),
      lineage,
      created_by: experience.agent_id,
      created_at: this.env.nowTimestamp(),
      mutation_depth: maxDepth + 1,
      community_tags: mergedTags,
      metadata: {
        encoding_version: '1.0.0',
        content_type: 'text/semantic',
        tags: [...new Set(inputs.flatMap(m => m.metadata.tags))],
      },
    };

    this.register(result);
    for (const m of inputs) {
      this.recordParentChild(m.id, result.id);
    }

    return result;
  }

  // ─── Crossover ────────────────────────────────────────────────────────

  /**
   * @throws Error if blend_ratio is not in [0, 1]
   */
  crossover(a: Meme, b: Meme, blend_ratio: number): Meme {
    if (blend_ratio < 0 || blend_ratio > 1) {
      throw new Error('crossover() requires blend_ratio ∈ [0, 1]');
    }
    this.register(a);
    this.register(b);

    const contentA = new TextDecoder().decode(a.content.payload);
    const contentB = new TextDecoder().decode(b.content.payload);

    const blendedContent = this.blendContent(contentA, contentB, blend_ratio);
    const newPayload = new TextEncoder().encode(blendedContent);

    const newId = contentHash(
      `crossover:${a.id}:${b.id}:${blend_ratio}:${this.env.nowMillis()}:${this.env.random()}`
    );

    const lineage: MemeLineage = {
      parent_ids: [a.id, b.id],
      variation_type: VariationType.CROSSOVER,
      variation_description: `Crossover of [${a.id}] and [${b.id}] at ratio ${blend_ratio}`,
    };

    const resultType = a.type === b.type ? a.type : MemeType.VALUE;

    const result: Meme = {
      id: newId,
      type: resultType,
      content: {
        schema_version: '1.0.0',
        payload: newPayload,
        natural_language_summary: `Crossover of: "${a.content.natural_language_summary}" + "${b.content.natural_language_summary}"`,
        expressive_forms: [
          ...a.content.expressive_forms,
          ...b.content.expressive_forms,
        ],
      },
      fitness: emptyFitness(),
      lineage,
      created_by: a.created_by,
      created_at: this.env.nowTimestamp(),
      mutation_depth: Math.max(a.mutation_depth, b.mutation_depth) + 1,
      community_tags: [...new Set([...a.community_tags, ...b.community_tags])],
      metadata: {
        encoding_version: '1.0.0',
        content_type: 'text/semantic',
        tags: [...new Set([...a.metadata.tags, ...b.metadata.tags])],
      },
    };

    this.register(result);
    this.recordParentChild(a.id, result.id);
    this.recordParentChild(b.id, result.id);

    return result;
  }

  // ─── Analogical Transfer ──────────────────────────────────────────────

  generateAnalog(source: Meme, target_domain: MemeType): Meme {
    this.register(source);

    const sourceContent = new TextDecoder().decode(source.content.payload);

    // Generate analogical content: reframe the source content for the target domain
    const analogContent = this.projectToDomain(sourceContent, source.type, target_domain);
    const newPayload = new TextEncoder().encode(analogContent);

    const newId = contentHash(
      `analog:${source.id}:${target_domain}:${this.env.nowMillis()}:${this.env.random()}`
    );

    const lineage: MemeLineage = {
      parent_ids: [source.id],
      variation_type: VariationType.ANALOGICAL_TRANSFER,
      variation_description: `Analogical transfer from ${source.type} to ${target_domain}`,
    };

    const result: Meme = {
      id: newId,
      type: target_domain,
      content: {
        schema_version: '1.0.0',
        payload: newPayload,
        natural_language_summary: `${target_domain} analog of: "${source.content.natural_language_summary}"`,
        expressive_forms: [],
      },
      fitness: emptyFitness(),
      lineage,
      created_by: source.created_by,
      created_at: this.env.nowTimestamp(),
      mutation_depth: source.mutation_depth + 1,
      community_tags: [...source.community_tags],
      metadata: {
        encoding_version: '1.0.0',
        content_type: 'text/semantic',
        tags: [...source.metadata.tags, `analog-from-${source.type.toLowerCase()}`],
      },
    };

    this.register(result);
    this.recordParentChild(source.id, result.id);

    return result;
  }

  // ─── Variation History ────────────────────────────────────────────────

  getVariationHistory(meme: Meme): VariationTree {
    this.register(meme);
    return this.buildTree(meme.id);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private register(meme: Meme): void {
    if (!this.memeRegistry.has(meme.id)) {
      this.memeRegistry.set(meme.id, meme);
    }
  }

  private recordParentChild(parentId: MemeId, childId: MemeId): void {
    const existing = this.childrenIndex.get(parentId) ?? [];
    if (!existing.includes(childId)) {
      existing.push(childId);
      this.childrenIndex.set(parentId, existing);
    }
  }

  private buildTree(memeId: MemeId): VariationTree {
    const meme = this.memeRegistry.get(memeId);
    if (!meme) {
      throw new Error(`Meme ${memeId} not found in registry`);
    }

    const childIds = this.childrenIndex.get(memeId) ?? [];
    const children = childIds.map(id => this.buildTree(id));

    return { meme, children };
  }

  private applyMutation(content: string, pressure: MutationPressure): string {
    const magnitude = pressure.magnitude;

    switch (pressure.type) {
      case 'RANDOM':
        return this.randomPerturbation(content, magnitude);
      case 'ADAPTIVE':
        return this.adaptiveMutation(content, magnitude, pressure.context);
      case 'CREATIVE':
        return this.creativeMutation(content, magnitude, pressure.context);
      case 'ENVIRONMENTAL':
        return this.environmentalMutation(content, magnitude, pressure.context);
      default:
        return content;
    }
  }

  private randomPerturbation(content: string, magnitude: number): string {
    if (magnitude < 0.3) {
      return `${content} [minor variant]`;
    } else if (magnitude < 0.7) {
      const words = content.split(' ');
      const midpoint = Math.floor(words.length / 2);
      return [...words.slice(midpoint), ...words.slice(0, midpoint)].join(' ');
    } else {
      const words = content.split(' ');
      const kept = words.filter((_, i) => i % 3 === 0);
      return `[radical departure] ${kept.join(' ')}`;
    }
  }

  private adaptiveMutation(content: string, magnitude: number, context: string): string {
    if (magnitude < 0.3) {
      return `${content} [adapted: ${context}]`;
    } else if (magnitude < 0.7) {
      return `[adapting to ${context}] ${content}`;
    } else {
      return `[radically adapted for ${context}] core: ${content.split(' ').slice(0, 3).join(' ')}`;
    }
  }

  private creativeMutation(content: string, magnitude: number, context: string): string {
    if (magnitude < 0.3) {
      return `${content} [creative touch: ${context}]`;
    } else if (magnitude < 0.7) {
      return `[reinterpreted through ${context}] ${content}`;
    } else {
      return `[creative reimagining via ${context}] essence of: ${content.split(' ').slice(0, 2).join(' ')}`;
    }
  }

  private environmentalMutation(content: string, magnitude: number, context: string): string {
    if (magnitude < 0.3) {
      return `${content} [environmental note: ${context}]`;
    } else if (magnitude < 0.7) {
      return `[shaped by ${context}] ${content}`;
    } else {
      return `[environmentally transformed by ${context}] from: ${content.split(' ').slice(0, 3).join(' ')}`;
    }
  }

  /**
   * Blend two content strings according to a ratio.
   * ratio close to 1.0 = more of A; ratio close to 0.0 = more of B.
   */
  private blendContent(a: string, b: string, ratio: number): string {
    const wordsA = a.split(' ');
    const wordsB = b.split(' ');
    const result: string[] = [];
    const maxLen = Math.max(wordsA.length, wordsB.length);

    for (let i = 0; i < maxLen; i++) {
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

  /**
   * Project semantic content from one domain to another via analogical mapping.
   * Preserves core meaning while reframing for the target domain.
   */
  private projectToDomain(content: string, sourceType: MemeType, targetType: MemeType): string {
    const domainFrames: Record<MemeType, string> = {
      [MemeType.VALUE]: 'as a guiding value',
      [MemeType.NORM]: 'as a behavioral norm',
      [MemeType.AESTHETIC]: 'as an aesthetic principle',
      [MemeType.PRACTICE]: 'as a repeated practice',
      [MemeType.MEANING]: 'as a meaning-making framework',
    };

    const frame = domainFrames[targetType] ?? 'in new domain';
    return `[${frame}] ${content} [transferred from ${sourceType.toLowerCase()}]`;
  }
}
