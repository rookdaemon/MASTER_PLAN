/**
 * Sanity Pass Gate — deterministic pre-apply card validation.
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

const SENTINEL_PATTERNS = [
  /\*\*\* Begin Patch/i,
  /\*\*\* End Patch/i,
  /Begin updated file/i,
  /End updated file/i,
  /<<<<<<<|=======|>>>>>>>/,
];

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const H1_RE = /^#\s+([\d.]+)\s+.+\[(PLAN|ARCHITECT|IMPLEMENT|REVIEW|DONE)\]\s*$/m;

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
  _provider: IInferenceProvider,
  input: SanityPassInput,
  _maxTokens: number,
): Promise<SanityPassResult> {
  const errors = validateSanityPassInput(input);
  return {
    pass: errors.length === 0,
    raw: errors.length === 0 ? 'PASS' : errors.join('; '),
  };
}

function validateSanityPassInput(input: SanityPassInput): string[] {
  const errors: string[] = [];
  const proposed = input.proposedCard.trim();
  if (proposed.length === 0) {
    return ['Proposed card is empty'];
  }

  for (const pattern of SENTINEL_PATTERNS) {
    if (pattern.test(input.proposedCard)) {
      errors.push(`Proposed card contains sentinel text matching ${pattern}`);
    }
  }

  const proposedFrontmatter = parseFrontmatter(input.proposedCard);
  if (!proposedFrontmatter) {
    errors.push('Proposed card must begin with YAML frontmatter delimited by --- lines');
    return errors;
  }

  const h1Match = proposedFrontmatter.body.match(H1_RE);
  if (!h1Match) {
    errors.push('Top H1 line must include a numeric ID and [STATUS] tag');
  }

  const proposedRoot = proposedFrontmatter.fields.get('root');
  if (!proposedRoot) {
    errors.push('Proposed card must include root frontmatter');
  }

  const isRootCard = input.path.endsWith('/root.md') || input.path === 'plan/root.md';
  if (!isRootCard && !proposedFrontmatter.fields.get('parent')) {
    errors.push('Non-root card must include parent frontmatter');
  }

  const oldFrontmatter = parseFrontmatter(input.oldCard);
  if (oldFrontmatter) {
    const oldRoot = oldFrontmatter.fields.get('root');
    if (oldRoot && proposedRoot !== oldRoot) {
      errors.push(`Proposed card changed root from ${oldRoot} to ${proposedRoot ?? '<missing>'}`);
    }

    const oldParent = oldFrontmatter.fields.get('parent');
    const proposedParent = proposedFrontmatter.fields.get('parent');
    if (oldParent && proposedParent !== oldParent) {
      errors.push(`Proposed card changed parent from ${oldParent} to ${proposedParent ?? '<missing>'}`);
    }
  }

  return errors;
}

function parseFrontmatter(card: string): { fields: Map<string, string>; body: string } | null {
  const match = card.match(FRONTMATTER_RE);
  if (!match) {
    return null;
  }

  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const keyValueMatch = line.match(/^([A-Za-z][\w-]*):\s*(.+?)\s*$/);
    if (keyValueMatch) {
      fields.set(keyValueMatch[1], keyValueMatch[2]);
    }
  }

  return { fields, body: match[2] };
}
