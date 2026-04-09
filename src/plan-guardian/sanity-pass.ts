/**
 * Sanity Pass Gate — model-verified pre-apply card validation.
 *
 * The gate evaluates each proposed plan-card change with a strict contract:
 * return exact text PASS to allow the write; any other output is a failure.
 */

import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';

export interface SanityPassInput {
  path: string;
  oldCard: string;
  proposedCard: string;
}

export interface SanityPassResult {
  pass: boolean;
  raw: string;
}

const SANITY_SYSTEM_PROMPT = [
  'SANITY_PASS_GATE',
  'You are a strict validator for markdown plan-card edits.',
  "Return the exact string PASS if and only if all rules are satisfied.",
  'Return anything else only when a rule is violated.',
].join('\n');

const SANITY_RULES = [
  'The PROPOSED CARD must be a valid markdown plan card.',
  'If the card is a plan card, it must begin with YAML frontmatter delimited by --- lines.',
  'The PROPOSED CARD must not include patch/process sentinel text (e.g. "Begin updated file", "End updated file", "*** Begin Patch").',
  'The top H1 line must include a numeric ID (e.g. "# 0.7.3.1 ... [PLAN]").',
  'If OLD CARD is present, the PROPOSED CARD must not corrupt structure or remove required metadata unintentionally.',
].join('\n');

export function buildSanityPassPrompt(input: SanityPassInput): string {
  return [
    'RULES',
    SANITY_RULES,
    '',
    'OLD CARD',
    `Path: ${input.path}`,
    input.oldCard,
    '',
    'PROPOSED CARD',
    `Path: ${input.path}`,
    input.proposedCard,
    '',
    "Answer with the exact string 'PASS' ONLY if rules are verified.",
  ].join('\n');
}

export async function runSanityPass(
  provider: IInferenceProvider,
  input: SanityPassInput,
  maxTokens: number,
): Promise<SanityPassResult> {
  const userPrompt = buildSanityPassPrompt(input);
  const response = await provider.infer(
    SANITY_SYSTEM_PROMPT,
    [{ role: 'user', content: userPrompt }],
    [],
    maxTokens,
  );

  const raw = (response.text ?? '').trim();
  return { pass: raw === 'PASS', raw };
}
