import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function parseAttestation(externalId) {
  if (typeof externalId !== 'string') return null;
  const match = /^agent-review:pr:([1-9]\d*):head:([0-9a-f]{40}):run:([1-9]\d*)$/.exec(externalId);
  if (!match) return null;
  return {
    prNumber: Number(match[1]),
    headSha: match[2],
  };
}

export function planAgentReviewRetry({ prNumber, headSha, checks, strategies }) {
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) throw new Error('A positive pull-request number is required');
  if (!/^[0-9a-f]{40}$/.test(headSha)) throw new Error('An exact lowercase head SHA is required');
  if (!Array.isArray(checks)) throw new Error('Check runs must be an array');
  if (!Array.isArray(strategies) || strategies.length < 1 ||
    !strategies.every((strategy) => /^[a-z0-9][a-z0-9-]*$/.test(strategy)) ||
    new Set(strategies).size !== strategies.length) {
    throw new Error('Review strategies must be a non-empty unique list of stable signatures');
  }

  const trustedExactChecks = checks.filter((check) => {
    const attestation = parseAttestation(check?.external_id);
    return attestation?.prNumber === prNumber && attestation.headSha === headSha;
  });
  if (trustedExactChecks.some((check) => check.status === 'completed' && check.conclusion === 'success')) {
    return { action: 'none', strategy: null, reason: 'already-successful' };
  }
  if (trustedExactChecks.some((check) => check.status === 'queued' || check.status === 'in_progress')) {
    return { action: 'none', strategy: null, reason: 'already-active' };
  }

  const exactChecks = trustedExactChecks.filter((check) => strategies.includes(check?.output?.title));
  for (const strategy of strategies) {
    const tried = exactChecks.some((check) => check.output?.title === strategy);
    if (!tried) return { action: 'dispatch', strategy, reason: 'untried-strategy' };
  }
  return { action: 'none', strategy: null, reason: 'strategy-budget-exhausted' };
}

export async function runAgentReviewRetryPlannerCli(runtime) {
  const [checksPath, prNumberText, headSha, strategiesText] = runtime.argv;
  if (!checksPath || !prNumberText || !headSha || !strategiesText) {
    throw new Error('Usage: plan-agent-review-retry <checks.json> <pr-number> <head-sha> <strategies-csv>');
  }
  const checks = JSON.parse(await runtime.readText(checksPath));
  const plan = planAgentReviewRetry({
    prNumber: Number(prNumberText),
    headSha,
    checks,
    strategies: strategiesText.split(',').filter(Boolean),
  });
  runtime.write(`${JSON.stringify(plan)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runAgentReviewRetryPlannerCli({
    argv: process.argv.slice(2),
    readText: (path) => readFile(path, 'utf8'),
    write: (value) => process.stdout.write(value),
  });
}
