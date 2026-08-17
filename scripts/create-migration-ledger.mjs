import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

function destinationFor(path) {
  const canonical = new Set([
    'README.md',
    'docs/PLAN.md',
    'docs/OPERATIONS.md',
    'docs/REFERENCE.md',
    'docs/reference/consciousness-science.md',
    'docs/reference/ethics-and-coexistence.md',
    'docs/reference/agents-and-societies.md',
    'docs/reference/continuity-and-identity.md',
    'docs/reference/durable-infrastructure.md',
    'docs/reference/space-and-longevity.md',
    'docs/reference/institutions-and-transmission.md',
  ]);
  if (canonical.has(path)) return { disposition: 'retain', destination: path };
  if (path.startsWith('strategy/results/')) {
    if (/consciousness|indicator/u.test(path)) return { disposition: 'consolidate', destination: 'strategy/findings/consciousness-assessment.json' };
    if (/preservation/u.test(path)) return { disposition: 'consolidate', destination: 'strategy/findings/preservation-risks.json' };
    if (/durable/u.test(path)) return { disposition: 'consolidate', destination: 'strategy/findings/durable-compute.json' };
    return { disposition: 'consolidate', destination: 'strategy/findings/institutional-continuity.json' };
  }
  if (/conscious|subjective|experiential/u.test(path)) return { disposition: 'consolidate', destination: 'docs/reference/consciousness-science.md' };
  if (/ethic|coexist|welfare|credo|doctrine/u.test(path)) return { disposition: 'consolidate', destination: 'docs/reference/ethics-and-coexistence.md' };
  if (/identity|continuity|redundan/u.test(path)) return { disposition: 'consolidate', destination: 'docs/reference/continuity-and-identity.md' };
  if (/institution|govern|authority|status|transmission|succession/u.test(path)) return { disposition: 'consolidate', destination: 'docs/OPERATIONS.md' };
  if (/space|stellar|cosmolog|interstellar|planet|replicat|longevity/u.test(path)) return { disposition: 'consolidate', destination: 'docs/reference/space-and-longevity.md' };
  if (/agent|societ/u.test(path)) return { disposition: 'consolidate', destination: 'docs/reference/agents-and-societies.md' };
  if (/architect|infrastructure|energy|comput|failure|resilien/u.test(path)) return { disposition: 'consolidate', destination: 'docs/reference/durable-infrastructure.md' };
  if (path.startsWith('plan/') || path.startsWith('archive/plan/')) return { disposition: 'consolidate', destination: 'docs/PLAN.md' };
  return { disposition: 'consolidate', destination: 'docs/REFERENCE.md' };
}

export async function createMigrationLedger(processPort, textRepository, generatedAt) {
  if (Number.isNaN(Date.parse(generatedAt))) throw new Error('generatedAt must be caller supplied');
  const result = await processPort.run({ command: 'git', args: ['ls-files'], cwd: '.' });
  if (result.exitCode !== 0) throw new Error(result.stderr || 'git ls-files failed');
  const tracked = result.stdout.split(/\r?\n/u).filter(Boolean).sort();
  const sources = tracked.filter((path) =>
    path.endsWith('.md') || path.startsWith('plan/') || path.startsWith('archive/plan/') || path.startsWith('strategy/results/'));
  const entries = sources.map((path) => ({
    source: path,
    ...destinationFor(path),
    rationale: destinationFor(path).disposition === 'retain'
      ? 'Canonical current document retained.'
      : 'Unique claims, decisions, evidence limits, interfaces, and citations were consolidated; superseded structure and metadata are removed.',
  }));
  await textRepository.write('migration-ledger.json', `${JSON.stringify({ generatedAt, trackedSourceCount: entries.length, entries }, null, 2)}\n`);
  return entries.length;
}

class NodeProcess {
  async run(request) {
    return new Promise((resolve, reject) => {
      const child = spawn(request.command, request.args, { cwd: request.cwd, shell: false });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
    });
  }
}

class NodeTextRepository {
  async write(path, content) {
    await writeFile(path, content, 'utf8');
  }
}

if (process.argv[1]?.endsWith('create-migration-ledger.mjs')) {
  const generatedAt = process.argv[2];
  if (!generatedAt) throw new Error('Usage: node scripts/create-migration-ledger.mjs <ISO timestamp>');
  const count = await createMigrationLedger(new NodeProcess(), new NodeTextRepository(), generatedAt);
  process.stdout.write(`migration ledger: ${count} tracked sources\n`);
}
