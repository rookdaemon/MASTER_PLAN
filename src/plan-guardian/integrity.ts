/**
 * Integrity Checks — strict validation for plan actions and graph consistency.
 *
 * Enforces:
 * - canonical plan path normalization
 * - no self-parent cycles
 * - child references resolve
 * - parent/child reciprocity
 * - no parent-cycle chains
 * - bounded file creation per action
 */

import type { GuardianConfig, PlanningAction, PlanFile } from './interfaces.js';
import { parsePlanFile } from './plan-file.js';
import { normalizePlanPath } from './actions.js';

export interface IntegrityValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateActionIntegrity(
  action: PlanningAction,
  baselineNodes: ReadonlyMap<string, PlanFile>,
  config: GuardianConfig,
): IntegrityValidationResult {
  const errors: string[] = [];

  if (action.filesCreated.length > config.maxNewFilesPerAction) {
    errors.push(
      `Action creates ${action.filesCreated.length} files; max-new-files=${config.maxNewFilesPerAction}`,
    );
  }

  const plannedWrites = new Set<string>();
  for (const f of action.filesCreated) plannedWrites.add(normalizePlanPath(f.path));
  for (const f of action.filesModified) plannedWrites.add(normalizePlanPath(f.path));

  const planWrites = [...action.filesCreated, ...action.filesModified]
    .filter(f => normalizePlanPath(f.path).startsWith(`${config.planDir}/`) && normalizePlanPath(f.path).endsWith('.md'));

  for (const write of planWrites) {
    const path = normalizePlanPath(write.path);
    const parsed = parsePlanFile(path, write.content);

    if (parsed.frontmatter.parent != null) {
      const parent = normalizePlanPath(parsed.frontmatter.parent);
      if (parent === path) {
        errors.push(`${path}: parent cannot reference itself`);
      }
    }

    for (const child of parsed.frontmatter.children ?? []) {
      const childPath = normalizePlanPath(child);
      const existsInBaseline = baselineNodes.has(childPath);
      const existsInWrites = plannedWrites.has(childPath);
      if (!existsInBaseline && !existsInWrites) {
        errors.push(`${path}: child reference missing target file ${childPath}`);
      }
    }

    const headerMatch = parsed.body.match(/^#\s+([\d.]+)\s+/m);
    const headingId = headerMatch?.[1]?.replace(/\.$/, '') ?? null;
    if (headingId && headingId !== parsed.numericId) {
      errors.push(`${path}: heading numeric id ${headingId} mismatches filename id ${parsed.numericId}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateGraphIntegrity(
  snapshotContents: ReadonlyMap<string, string>,
  planDir: string,
): IntegrityValidationResult {
  const errors: string[] = [];
  const nodes = new Map<string, PlanFile>();

  for (const [path, content] of snapshotContents) {
    if (!path.startsWith(`${planDir}/`) || !path.endsWith('.md')) continue;
    const normalized = normalizePlanPath(path);
    const parsed = parsePlanFile(normalized, content);
    nodes.set(normalized, parsed);
  }

  for (const [path, node] of nodes) {
    const parent = node.frontmatter.parent ? normalizePlanPath(node.frontmatter.parent) : null;
    if (parent === path) {
      errors.push(`${path}: parent cannot reference itself`);
    }
    if (parent && parent !== `${planDir}/root.md` && !nodes.has(parent)) {
      errors.push(`${path}: missing parent node ${parent}`);
    }

    for (const childRaw of node.frontmatter.children ?? []) {
      const child = normalizePlanPath(childRaw);
      if (!nodes.has(child)) {
        errors.push(`${path}: missing child node ${child}`);
        continue;
      }
      const childParent = nodes.get(child)?.frontmatter.parent
        ? normalizePlanPath(nodes.get(child)!.frontmatter.parent!)
        : null;
      if (childParent !== path) {
        errors.push(`${path}: child ${child} points to parent ${childParent ?? 'null'}`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(path: string, stack: string[]): void {
    if (visited.has(path)) return;
    if (visiting.has(path)) {
      const cycleStart = stack.indexOf(path);
      const cycle = cycleStart >= 0 ? stack.slice(cycleStart).concat(path) : [...stack, path];
      errors.push(`parent-cycle detected: ${cycle.join(' -> ')}`);
      return;
    }

    visiting.add(path);
    const parent = nodes.get(path)?.frontmatter.parent;
    if (parent) {
      const normalizedParent = normalizePlanPath(parent);
      if (nodes.has(normalizedParent)) {
        visit(normalizedParent, [...stack, path]);
      }
    }
    visiting.delete(path);
    visited.add(path);
  }

  for (const path of nodes.keys()) {
    visit(path, []);
  }

  return { valid: errors.length === 0, errors };
}

export function buildSnapshotWithActions(
  baselineNodes: ReadonlyMap<string, PlanFile>,
  actions: readonly PlanningAction[],
): Map<string, string> {
  const snapshot = new Map<string, string>();

  for (const [path, node] of baselineNodes) {
    snapshot.set(path, serializeCurrent(node));
  }

  for (const action of actions) {
    for (const file of action.filesCreated) {
      snapshot.set(normalizePlanPath(file.path), file.content);
    }
    for (const file of action.filesModified) {
      snapshot.set(normalizePlanPath(file.path), file.content);
    }
  }

  return snapshot;
}

function serializeCurrent(node: PlanFile): string {
  const lines: string[] = [];
  if (node.frontmatter.parent) lines.push(`parent: ${normalizePlanPath(node.frontmatter.parent)}`);
  if (node.frontmatter.root) lines.push(`root: ${normalizePlanPath(node.frontmatter.root)}`);
  if (node.frontmatter.children?.length) {
    lines.push('children:');
    for (const c of node.frontmatter.children) lines.push(`  - ${normalizePlanPath(c)}`);
  }
  if (node.frontmatter['blocked-by']?.length) {
    lines.push('blocked-by:');
    for (const b of node.frontmatter['blocked-by']) lines.push(`  - ${normalizePlanPath(b)}`);
  }
  if (node.frontmatter['depends-on']?.length) {
    lines.push('depends-on:');
    for (const d of node.frontmatter['depends-on']) lines.push(`  - ${normalizePlanPath(d)}`);
  }

  return `---\n${lines.join('\n')}\n---\n${node.body}`;
}
