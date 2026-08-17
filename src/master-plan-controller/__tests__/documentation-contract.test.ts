import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeFileSystem } from '../runtime-adapters.js';

const CORE_DOCUMENTS = [
  'README.md',
  'docs/PLAN.md',
  'docs/OPERATIONS.md',
  'docs/REFERENCE.md',
] as const;

const DOSSIERS = [
  'docs/reference/consciousness-science.md',
  'docs/reference/ethics-and-coexistence.md',
  'docs/reference/agents-and-societies.md',
  'docs/reference/continuity-and-identity.md',
  'docs/reference/durable-infrastructure.md',
  'docs/reference/space-and-longevity.md',
  'docs/reference/institutions-and-transmission.md',
] as const;

interface ResearchArea {
  id: string;
  title: string;
  domain: string;
  status: 'active' | 'gated' | 'reference';
  strategyNodeId: string;
  supportedDirectives: string[];
  referencePath: string;
}

function headingAnchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function localLinks(markdown: string): Array<{ destination: string; anchor?: string }> {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((destination) => !destination.includes('://') && !destination.startsWith('mailto:'))
    .map((destination) => {
      const [path, anchor] = destination.split('#', 2);
      return { destination: path, ...(anchor ? { anchor } : {}) };
    });
}

describe('unified documentation contract', () => {
  const fileSystem = new NodeFileSystem('.');

  it('has one approachable core and exactly seven curated dossiers', async () => {
    const documents = await Promise.all([...CORE_DOCUMENTS, ...DOSSIERS]
      .map(async (path) => [path, await fileSystem.readText(path)] as const));

    for (const [path, content] of documents) {
      expect(content, path).toMatch(/^# /);
    }

    const reference = await fileSystem.readText('docs/REFERENCE.md');
    const dossierLinks = localLinks(reference)
      .map(({ destination }) => posix.normalize(posix.join('docs', destination)))
      .filter((destination) => destination.startsWith('docs/reference/'));
    expect(new Set(dossierLinks)).toEqual(new Set(DOSSIERS));

    for (const dossier of DOSSIERS) {
      const content = await fileSystem.readText(dossier);
      expect(content, dossier).toMatch(/\*\*Status:\*\* (Implemented|Observed|Proposed|Speculative)/);
      expect(content, dossier).toContain('## Evidence and limitations');
    }
  });

  it('resolves every local document link and anchor', async () => {
    for (const source of [...CORE_DOCUMENTS, ...DOSSIERS]) {
      const markdown = await fileSystem.readText(source);
      for (const link of localLinks(markdown)) {
        const sourceDirectory = posix.dirname(source);
        const target = link.destination
          ? posix.normalize(posix.join(sourceDirectory, link.destination))
          : source;
        const targetMarkdown = await fileSystem.readText(target);
        if (link.anchor) {
          const anchors = [...targetMarkdown.matchAll(/^#{1,6}\s+(.+)$/gm)]
            .map((match) => headingAnchor(match[1]));
          expect(anchors, `${source} -> ${target}#${link.anchor}`).toContain(link.anchor);
        }
      }
    }
  });

  it('maps every current research area to a strategy node and canonical dossier', async () => {
    const areas = JSON.parse(await fileSystem.readText('strategy/research-areas.json')) as ResearchArea[];
    const graph = JSON.parse(await fileSystem.readText('strategy/graph.json')) as Array<{ id: string }>;
    const nodeIds = new Set(graph.map(({ id }) => id));

    expect(areas.length).toBeGreaterThanOrEqual(30);
    expect(new Set(areas.map(({ id }) => id)).size).toBe(areas.length);
    for (const area of areas) {
      expect(nodeIds, area.id).toContain(area.strategyNodeId);
      expect(DOSSIERS, area.id).toContain(area.referencePath.split('#')[0]);
      expect(area.supportedDirectives.length, area.id).toBeGreaterThan(0);
    }
  });

  it('contains no project-generation split or removed document-system references', async () => {
    const paths = [...CORE_DOCUMENTS, ...DOSSIERS];
    for (const path of paths) {
      const content = await fileSystem.readText(path);
      expect(content, path).not.toMatch(/MASTER_PLAN\s+v[12]|\bv[12]\s+(plan|strategy|roadmap|history)|legacy[- ](plan|audit|replay)/i);
      expect(content, path).not.toContain('plan/');
    }
  });
});
