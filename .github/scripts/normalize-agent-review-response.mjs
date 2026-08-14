import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const NONE_VALUES = new Set(['none', 'no', 'n/a', 'not applicable']);

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function escapeLiteralControlsInsideJsonStrings(text) {
  let insideString = false;
  let escaped = false;
  let repaired = '';
  for (const character of text) {
    if (!insideString) {
      if (character === '"') insideString = true;
      repaired += character;
      continue;
    }
    if (escaped) {
      escaped = false;
      repaired += character;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      repaired += character;
      continue;
    }
    if (character === '"') {
      insideString = false;
      repaired += character;
      continue;
    }
    const code = character.codePointAt(0);
    if (code !== undefined && code <= 0x1f) {
      repaired += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    repaired += character;
  }
  return repaired;
}

export function parseAgentReviewResponseJson(text) {
  if (typeof text !== 'string') throw new Error('Agent review response JSON must be text');
  try {
    return JSON.parse(text);
  } catch (originalError) {
    const repaired = escapeLiteralControlsInsideJsonStrings(text);
    if (repaired === text) throw originalError;
    return JSON.parse(repaired);
  }
}

function canonicalResponse(response) {
  if (response.verdict !== 'approve' && response.verdict !== 'block') return null;
  if (response.summary !== undefined && typeof response.summary !== 'string') {
    throw new Error('Canonical agent review response summary must be a string when present');
  }
  if (!Array.isArray(response.blockers) ||
      response.blockers.some((blocker) => typeof blocker !== 'string' || blocker.trim().length === 0)) {
    throw new Error('Canonical agent review response requires an array of nonempty blocker strings');
  }
  const blockers = response.blockers.map((blocker) => blocker.trim());
  if (response.verdict === 'approve' && blockers.length > 0) {
    throw new Error('Contradictory agent review response approves while reporting blockers');
  }
  if (response.verdict === 'block' && blockers.length === 0) {
    throw new Error('Contradictory agent review response blocks without reporting a blocker');
  }
  const summary = (typeof response.summary === 'string' ? response.summary.trim() : '') || (response.verdict === 'approve'
    ? 'The reviewer reported no material blockers.'
    : 'The reviewer reported one or more material blockers.');
  return { verdict: response.verdict, summary, blockers };
}

function categoryResponse(response) {
  const categories = objectRecord(response.blockers);
  if (categories === null) return null;
  const entries = Object.entries(categories);
  if (entries.length === 0) throw new Error('Ambiguous agent review response has no blocker categories');
  const blockers = entries.map(([category, finding]) => {
    if (typeof finding !== 'string' || finding.trim().length === 0) {
      throw new Error(`Ambiguous agent review blocker category: ${category}`);
    }
    const normalized = finding.trim();
    return NONE_VALUES.has(normalized.toLowerCase()) ? null : `${category}: ${normalized}`;
  }).filter((finding) => finding !== null);
  return blockers.length === 0
    ? { verdict: 'approve', summary: 'The reviewer reported no material blockers.', blockers: [] }
    : {
        verdict: 'block',
        summary: `The reviewer reported ${blockers.length} material blocker${blockers.length === 1 ? '' : 's'}.`,
        blockers,
      };
}

export function normalizeAgentReviewResponse(value) {
  const response = objectRecord(value);
  if (response === null) throw new Error('Agent review response must be an object');
  const canonical = canonicalResponse(response);
  if (canonical !== null) return canonical;
  const categorized = categoryResponse(response);
  if (categorized !== null) return categorized;
  throw new Error('Agent review response is neither canonical nor a recognized categorized response');
}

export function runAgentReviewNormalizerCli(runtime) {
  const [path, ...extra] = runtime.arguments();
  if (!path || extra.length > 0) throw new Error('Usage: normalize-agent-review-response <response-json-path>');
  const parsed = parseAgentReviewResponseJson(runtime.readText(path));
  runtime.write(JSON.stringify(normalizeAgentReviewResponse(parsed)));
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    runAgentReviewNormalizerCli({
      arguments: () => process.argv.slice(2),
      readText: (path) => readFileSync(path, 'utf8'),
      write: (message) => process.stdout.write(`${message}\n`),
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
