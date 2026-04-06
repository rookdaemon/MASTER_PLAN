/**
 * Plan DAG — Directed Acyclic Graph of Plan Files
 *
 * Loads all .md files from the plan directory, parses them into PlanFile
 * structs, and provides query methods over the graph structure.
 *
 * Domain: Plan Guardian
 */

import type { IFileSystem } from '../agent-runtime/filesystem.js';
import type { IPlanDAG, PlanFile, PlanStatus } from './interfaces.js';
import { parsePlanFile } from './plan-file.js';

export async function buildDAG(fs: IFileSystem, planDir: string): Promise<IPlanDAG> {
  const filenames = await fs.listFiles(planDir);
  const mdFiles = filenames.filter(f => f.endsWith('.md'));

  const nodes = new Map<string, PlanFile>();
  for (const filename of mdFiles) {
    const path = `${planDir}/${filename}`;
    const content = await fs.readFile(path, 'utf-8');
    const plan = parsePlanFile(path, content);
    nodes.set(path, plan);
  }

  return new PlanDAG(nodes);
}

class PlanDAG implements IPlanDAG {
  readonly nodes: ReadonlyMap<string, PlanFile>;

  constructor(nodes: Map<string, PlanFile>) {
    this.nodes = nodes;
  }

  childrenOf(path: string): PlanFile[] {
    const node = this.nodes.get(path);
    if (!node || !node.frontmatter.children) return [];
    return node.frontmatter.children
      .map(c => this.nodes.get(c))
      .filter((n): n is PlanFile => n !== undefined);
  }

  parentOf(path: string): PlanFile | null {
    const node = this.nodes.get(path);
    if (!node || !node.frontmatter.parent) return null;
    return this.nodes.get(node.frontmatter.parent) ?? null;
  }

  blockers(path: string): PlanFile[] {
    const node = this.nodes.get(path);
    if (!node || !node.frontmatter['blocked-by']) return [];
    return node.frontmatter['blocked-by']
      .map(b => this.nodes.get(b))
      .filter((n): n is PlanFile => n !== undefined);
  }

  dependants(path: string): PlanFile[] {
    const node = this.nodes.get(path);
    if (!node || !node.frontmatter['depends-on']) return [];
    return node.frontmatter['depends-on']
      .map(d => this.nodes.get(d))
      .filter((n): n is PlanFile => n !== undefined);
  }

  leaves(): PlanFile[] {
    return [...this.nodes.values()].filter(n => n.isLeaf);
  }

  roots(): PlanFile[] {
    return [...this.nodes.values()].filter(
      n => n.frontmatter.parent === 'plan/root.md' || n.frontmatter.parent?.endsWith('/root.md'),
    );
  }

  byStatus(status: PlanStatus): PlanFile[] {
    return [...this.nodes.values()].filter(n => n.status === status);
  }
}
