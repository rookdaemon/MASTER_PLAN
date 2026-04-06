/**
 * 7B Threshold Evaluator
 *
 * Heuristic pre-filter to determine if a leaf task is simple enough
 * for a 7B model to execute directly. The `promote` action then has
 * the big model confirm and write the Execution Spec.
 *
 * Domain: Plan Guardian
 */

import type { PlanFile } from './interfaces.js';

export interface ThresholdVerdict {
  passes: boolean;
  reasons: string[];
}

export function evaluate7BThreshold(plan: PlanFile): ThresholdVerdict {
  const reasons: string[] = [];

  if (!plan.isLeaf) {
    reasons.push('Not a leaf node (has children)');
  }

  if ((plan.frontmatter['blocked-by'] ?? []).length > 0) {
    reasons.push('Has unresolved blocked-by dependencies');
  }

  const acMatch = plan.body.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n## |\n*$)/);
  if (!acMatch) {
    reasons.push('No acceptance criteria section');
  } else {
    const acLines = acMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
    if (acLines.length === 0) {
      reasons.push('Acceptance criteria section is empty');
    } else if (acLines.length > 5) {
      reasons.push(`Too many acceptance criteria (${acLines.length} — suggests task is too broad)`);
    }
  }

  if (plan.body.includes('## Decision')) {
    reasons.push('Contains Decision section (architectural decisions needed)');
  }

  if (plan.body.length > 5000) {
    reasons.push(`Task description too long (${plan.body.length} chars — suggests complexity)`);
  }

  return { passes: reasons.length === 0, reasons };
}
