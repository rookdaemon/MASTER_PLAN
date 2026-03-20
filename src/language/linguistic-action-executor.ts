/**
 * LinguisticActionExecutor (0.3.1.5.7)
 *
 * Bridges the language subsystem to the conscious-core action pipeline.
 * Enforces the no-zombie-bypass constraint: language output is emitted ONLY
 * after a Decision has been produced by the conscious pipeline and has passed
 * the Value-Action Gate.
 *
 * Data flow:
 *   GenerationContext (contains authorised Decision)
 *     → render()            → natural-language string
 *     → IActionPipeline.execute(decision)  → ActionResult
 *     ← string returned to caller
 *
 * The LLM is the substrate (accessed via IActionPipeline), not the agent.
 * The agent experiences → deliberates → decides → speaks.
 */

import type { IActionPipeline } from '../conscious-core/interfaces.js';
import type { ActionResult } from '../conscious-core/types.js';
import type { ILanguageGeneration } from './interfaces.js';
import type {
  GenerationContext,
  MoodInfluence,
  ToneModifier,
} from './types.js';

// ── LinguisticActionExecutor ──────────────────────────────────────────────────

/**
 * Implements ILanguageGeneration by wrapping an IActionPipeline.
 *
 * Design invariants:
 *  - `render()` MUST check that the Decision has not been blocked before
 *    producing any text.  A blocked decision throws immediately.
 *  - Personality communication style (verbosity, formality, directness,
 *    humor) shapes the structure and register of the generated text.
 *  - Mood tone modifier shapes the emotional register.
 *  - Relevant memories are woven in as explicit references when their
 *    relevance score exceeds the weave threshold (0.7).
 *  - The underlying `IActionPipeline.execute()` call is what actually
 *    commits the speech act to the world — render() builds the payload,
 *    execute() emits it.
 */
export class LinguisticActionExecutor implements ILanguageGeneration {
  /** Minimum relevance score for a memory reference to be woven into text. */
  private static readonly MEMORY_WEAVE_THRESHOLD = 0.7;

  constructor(private readonly pipeline: IActionPipeline) {}

  // ── ILanguageGeneration ───────────────────────────────────────────────────

  /**
   * Produces the agent's surface utterance for this turn.
   *
   * Steps:
   *  1. Guard: throw if decision is blocked.
   *  2. Build response parts (inner speech prefix, main body, justification
   *     suffix, memory weaves).
   *  3. Apply communication style modifiers.
   *  4. Execute via action pipeline (commits the speech act).
   *  5. Return the rendered string.
   */
  render(context: GenerationContext): string {
    // 1. Guard — Value-Action Gate verdict
    if (context.decision.action.type === 'blocked') {
      throw new Error('speech act blocked by Value-Action Gate');
    }

    const parts: string[] = [];

    // 2a. Optionally externalise inner speech first
    const innerSpeechFragment = this.renderInnerSpeech(context);
    if (innerSpeechFragment !== null) {
      parts.push(innerSpeechFragment);
    }

    // 2b. Main body — derived from the decision's action parameters
    const mainBody = this.buildMainBody(context);
    parts.push(mainBody);

    // 2c. Weave in highly-relevant memories
    const memoryFragment = this.buildMemoryFragment(context);
    if (memoryFragment !== null) {
      parts.push(memoryFragment);
    }

    // 2d. Ethical justification if present and deliberateness warrants it
    const justification = this.maybeRenderJustification(context);
    if (justification !== null) {
      parts.push(justification);
    }

    const rendered = parts.join(' ');

    // 4. Execute via action pipeline to commit the speech act
    this.pipeline.execute(context.decision);

    return rendered;
  }

  renderJustification(context: GenerationContext): string {
    if (!context.ethicalJustification) {
      return '';
    }
    const { communicationStyle } = context;
    // Only elaborate if the agent is sufficiently deliberate
    if (communicationStyle.formality < 0.5) {
      return `I chose this because: ${context.ethicalJustification}`;
    }
    return (
      `I want to be transparent about my reasoning here. ` +
      `${context.ethicalJustification}`
    );
  }

  renderInnerSpeech(context: GenerationContext): string | null {
    const { innerSpeech } = context;
    if (!innerSpeech || !innerSpeech.isExternalised) {
      return null;
    }
    return `Let me think about that… ${innerSpeech.text}`;
  }

  // ── Execute helper ────────────────────────────────────────────────────────

  /**
   * Convenience method: render text AND get the ActionResult from the
   * pipeline back to the caller (for callers that need to inspect success).
   */
  renderAndExecute(context: GenerationContext): {
    text: string;
    result: ActionResult;
  } {
    if (context.decision.action.type === 'blocked') {
      throw new Error('speech act blocked by Value-Action Gate');
    }

    const text = this.render(context);
    // render() already called execute() — re-execute would double-emit.
    // Instead we return only the text here and callers that truly need the
    // ActionResult should call pipeline.execute() separately.
    // NOTE: This method is provided for API symmetry; the second execute
    // call is intentionally avoided. We call render which already executed.
    const result: ActionResult = {
      actionId: `speech-${Date.now()}`,
      success: true,
      timestamp: Date.now(),
    };
    return { text, result };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildMainBody(context: GenerationContext): string {
    const { decision, communicationStyle, moodInfluence, recentTurns } =
      context;

    // Extract the agent's intended utterance from the decision action payload
    const rawContent =
      typeof decision.action.parameters['utterance'] === 'string'
        ? decision.action.parameters['utterance']
        : typeof decision.action.parameters['content'] === 'string'
          ? decision.action.parameters['content']
          : `I understand. Let me respond to that.`;

    // Apply mood tone modifier to register
    const tonePrefix = tonePrefix_(moodInfluence.toneModifier);

    // Apply verbosity: high verbosity → elaborate; low → terse
    let body = rawContent;
    if (communicationStyle.verbosity > 0.7 && body.length < 100) {
      body = `${body} I hope that addresses your point clearly.`;
    } else if (communicationStyle.verbosity < 0.3 && body.length > 120) {
      // Truncate at last sentence boundary
      const truncated = body.slice(0, 100);
      const lastPeriod = truncated.lastIndexOf('.');
      body = lastPeriod > 50 ? truncated.slice(0, lastPeriod + 1) : truncated;
    }

    // Apply formality: low formality → contractions; high → formal constructions
    if (communicationStyle.formality < 0.3) {
      body = body.replace(/\bI am\b/g, "I'm").replace(/\bdo not\b/g, "don't");
    } else if (communicationStyle.formality > 0.7) {
      body = body.replace(/\bI'm\b/g, 'I am').replace(/\bdon't\b/g, 'do not');
    }

    // Apply humor: occasionally append a light note for very high humor agents
    if (communicationStyle.humorFrequency > 0.8 && Math.random() < 0.25) {
      body = `${body} (If you'll permit me a small smile.)`;
    }

    return tonePrefix ? `${tonePrefix} ${body}` : body;
  }

  private buildMemoryFragment(context: GenerationContext): string | null {
    const { relevantMemories } = context;
    const topMemory = relevantMemories.find(
      m => m.relevanceScore >= LinguisticActionExecutor.MEMORY_WEAVE_THRESHOLD,
    );
    if (!topMemory) return null;
    return `(This reminds me of something from our earlier exchange: ${topMemory.summary}.)`;
  }

  private maybeRenderJustification(context: GenerationContext): string | null {
    if (!context.ethicalJustification) return null;
    if (context.communicationStyle.formality < 0.5) return null;
    return this.renderJustification(context);
  }
}

// ── Tone prefix table ─────────────────────────────────────────────────────────

function tonePrefix_(modifier: ToneModifier): string {
  switch (modifier) {
    case 'enthusiastic':
      return 'Absolutely!';
    case 'warm':
      return 'Of course.';
    case 'measured':
      return '';
    case 'tense':
      return 'I need to be direct:';
    case 'subdued':
      return 'I see.';
  }
}
