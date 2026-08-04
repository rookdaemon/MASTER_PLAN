import { Controller } from './controller.js';
import type { ExecutionResult, FileSystemPort } from './ports.js';
import {
  crossPortfolioPacketHandlers,
  matchesRepositoryPacketHandler,
  versionedArtifactPaths,
  type RepositoryExecutionOutput,
  type RepositoryPacketHandler,
} from './repository-packet-handlers.js';
import { formattedRepositoryJson } from './repository-json.js';
import { integrateRepositoryPacketResult, type RepositoryPacketIntegration } from './repository-result-integration.js';
import { loadRepositoryStrategy, verifyRepositoryStrategy } from './repository-strategy.js';
import type { PacketResult, Timestamp } from './types.js';

export interface RepositoryPacketExecution {
  status: 'waiting' | 'executed' | 'already-executed';
  packetId: string | null;
  artifactPath: string | null;
  resultPath: string | null;
}

export type { RepositoryExecutionOutput, RepositoryPacketHandler } from './repository-packet-handlers.js';

export interface AgentReviewAttestation {
  packetId: string;
  resultPath: string;
  reviewer: string;
  reviewRunId: string;
  reviewedHeadSha: string;
  reviewedAt: Timestamp;
}

interface PredictionRegistry {
  predictions: Array<{
    id: string;
    sourceIds: string[];
    criteria: { fail: string; inconclusive: string };
    confounders: Array<{ confounder: string }>;
    interpretations: Array<{
      theoryId: string;
      expectedResult: string;
      consequence: string;
      sourceIds: string[];
    }>;
    neutrality: { rivalExplanations: string[]; forbiddenInference: string };
  }>;
  theoryFamilies: Array<{ id: string; limitations: string[] }>;
}

const REGISTRY_PATH = 'strategy/results/consciousness-prediction-registry-v1.json';

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function executionOutputWithoutTimestamps(artifact: unknown, result: ExecutionResult): unknown {
  const artifactCopy = structuredClone(artifact) as Record<string, unknown>;
  const resultCopy = structuredClone(result);
  delete artifactCopy.preparedAt;
  return {
    artifact: artifactCopy,
    result: {
      ...resultCopy,
      evidence: resultCopy.evidence.map(({ observedAt: _observedAt, ...record }) => record),
    },
  };
}

function indicatorComparisonHandler(): RepositoryPacketHandler {
  return {
    packetId: 'packet-indicator-framework-comparison-v1',
    packetFamily: 'packet-indicator-framework-comparison',
    async prepare(fileSystem, packet, state, now) {
      const paths = versionedArtifactPaths(packet, 'packet-indicator-framework-comparison');
      const registry = JSON.parse(await fileSystem.readText(REGISTRY_PATH)) as PredictionRegistry;
      const families = new Map(registry.theoryFamilies.map((family) => [family.id, family]));
      const indicators = registry.predictions.flatMap((prediction) => prediction.interpretations.map((interpretation) => {
        const family = families.get(interpretation.theoryId);
        if (!family) throw new Error(`Unknown theory family ${interpretation.theoryId} in ${prediction.id}`);
        return {
          id: `${prediction.id}:${interpretation.theoryId}`,
          predictionId: prediction.id,
          theoryId: interpretation.theoryId,
          expectedResult: interpretation.expectedResult,
          discriminatingConsequence: interpretation.consequence,
          counterexamples: unique([
            ...prediction.neutrality.rivalExplanations,
            ...prediction.confounders.map((confounder) => confounder.confounder),
          ]),
          uncertainty: unique([prediction.criteria.inconclusive, ...family.limitations]),
          falsificationCondition: prediction.criteria.fail,
          forbiddenInference: prediction.neutrality.forbiddenInference,
          sourceIds: unique([...prediction.sourceIds, ...interpretation.sourceIds]),
        };
      }));
      if (indicators.length === 0) throw new Error('Prediction registry produced no comparison indicators');
      for (const indicator of indicators) {
        if (indicator.counterexamples.length === 0 || indicator.uncertainty.length === 0 ||
          !indicator.falsificationCondition.trim() || indicator.sourceIds.length === 0) {
          throw new Error(`Indicator ${indicator.id} lacks required comparison evidence`);
        }
      }
      const artifact = {
        schemaVersion: '1.0.0',
        id: paths.artifactId,
        packetId: packet.id,
        preparedAt: now,
        sourceRegistry: REGISTRY_PATH,
        scope: {
          claimsSentience: false,
          executesHumanSubjectsResearch: false,
          publishesExternally: false,
        },
        indicators,
      };
      const result: ExecutionResult = {
        outcome: 'positive',
        artifactReferences: [paths.artifactPath, REGISTRY_PATH],
        evidence: [{
          id: `evidence-${paths.artifactId}-executed`,
          claim: 'A deterministic comparison maps each registered theory interpretation to predictions, counterexamples, uncertainty, and a falsification condition.',
          method: 'Schema-checked transformation of the checked-in consciousness prediction registry.',
          source: paths.artifactPath,
          strength: 0.7,
          limitations: [
            'Execution establishes a reviewable repository artifact; independent agent review is still required before strategy integration.',
            'The comparison does not establish consciousness or sentience in any biological or artificial system.',
          ],
          supportedHypotheses: [packet.nodeId],
          falsifiedHypotheses: [],
          verifier: 'deterministic-packet-executor:v1',
          observedAt: now,
          outcome: 'positive',
        }],
        acceptanceCriteriaMet: true,
        portfolioEffortAfter: structuredClone(state.portfolioEffort),
      };
      return {
        artifactPath: paths.artifactPath,
        artifact,
        resultPath: paths.resultPath,
        result,
      };
    },
  };
}

export function defaultRepositoryPacketHandlers(): RepositoryPacketHandler[] {
  return [indicatorComparisonHandler(), ...crossPortfolioPacketHandlers()];
}

export async function executeRepositoryPacket(
  fileSystem: FileSystemPort,
  now: Timestamp,
  handlers: readonly RepositoryPacketHandler[] = defaultRepositoryPacketHandlers(),
): Promise<RepositoryPacketExecution> {
  if (Number.isNaN(Date.parse(now))) throw new Error('A valid caller-supplied timestamp is required');
  const bundle = await loadRepositoryStrategy(fileSystem);
  const verification = await verifyRepositoryStrategy(fileSystem, bundle, now);
  if (verification.errors.length > 0) throw new Error(`Strategy verification failed: ${verification.errors.join('; ')}`);
  const selected = new Controller(bundle.state, bundle.config).evaluate(bundle.state, now).ranked[0]?.packet;
  if (!selected) return { status: 'waiting', packetId: null, artifactPath: null, resultPath: null };
  const handler = handlers.find((candidate) => matchesRepositoryPacketHandler(candidate, selected));
  if (!handler) throw new Error(`No executor is registered for ${selected.id}`);
  const output = await handler.prepare(fileSystem, selected, bundle.state, now);
  const existing = new Set(await fileSystem.listFiles('strategy/results/'));
  const artifactExists = existing.has(output.artifactPath);
  const resultExists = existing.has(output.resultPath);
  if (artifactExists !== resultExists) throw new Error(`Execution artifacts for ${selected.id} are incomplete`);
  if (artifactExists) {
    const [artifactText, resultText] = await Promise.all([
      fileSystem.readText(output.artifactPath),
      fileSystem.readText(output.resultPath),
    ]);
    const existingArtifact = JSON.parse(artifactText) as Record<string, unknown>;
    const existingResult = JSON.parse(resultText) as ExecutionResult;
    const existingPreparedAt = typeof existingArtifact.preparedAt === 'string'
      ? Date.parse(existingArtifact.preparedAt)
      : Number.NaN;
    const existingEvidenceTimes = existingResult.evidence.map((record) => Date.parse(record.observedAt));
    if (Number.isNaN(existingPreparedAt) || existingPreparedAt > Date.parse(now) ||
      existingEvidenceTimes.some((value) => Number.isNaN(value) || value > Date.parse(now)) ||
      formattedRepositoryJson(executionOutputWithoutTimestamps(existingArtifact, existingResult)) !==
        formattedRepositoryJson(executionOutputWithoutTimestamps(output.artifact, output.result))) {
      throw new Error(`Execution artifacts for ${selected.id} differ from deterministic output`);
    }
    return {
      status: 'already-executed',
      packetId: selected.id,
      artifactPath: output.artifactPath,
      resultPath: output.resultPath,
    };
  }
  await fileSystem.writeText(output.artifactPath, formattedRepositoryJson(output.artifact));
  await fileSystem.writeText(output.resultPath, formattedRepositoryJson(output.result));
  return {
    status: 'executed',
    packetId: selected.id,
    artifactPath: output.artifactPath,
    resultPath: output.resultPath,
  };
}

export async function integrateReviewedRepositoryExecution(
  fileSystem: FileSystemPort,
  attestation: AgentReviewAttestation,
  now: Timestamp,
): Promise<RepositoryPacketIntegration> {
  const reviewedEpoch = Date.parse(attestation.reviewedAt);
  const nowEpoch = Date.parse(now);
  const valid = attestation.packetId.trim().length > 0 &&
    /^strategy\/results\/[a-zA-Z0-9._/-]+\.result\.json$/.test(attestation.resultPath) &&
    !attestation.resultPath.includes('..') &&
    /^[a-zA-Z0-9._-]+$/.test(attestation.reviewer) &&
    /^\d+$/.test(attestation.reviewRunId) &&
    /^[0-9a-f]{40}$/.test(attestation.reviewedHeadSha) &&
    !Number.isNaN(reviewedEpoch) && !Number.isNaN(nowEpoch) && reviewedEpoch <= nowEpoch;
  if (!valid) throw new Error('A valid exact-head agent review attestation is required');

  const pending = JSON.parse(await fileSystem.readText(attestation.resultPath)) as ExecutionResult & {
    verification?: unknown;
  };
  if (pending.verification !== undefined) throw new Error('Execution result already contains a verification');
  if (!Array.isArray(pending.artifactReferences) || pending.artifactReferences.length === 0 ||
    !Array.isArray(pending.evidence) || pending.evidence.length === 0) {
    throw new Error('Execution result is incomplete');
  }
  const localArtifacts = pending.artifactReferences.filter((reference) => reference.startsWith('strategy/'));
  if (localArtifacts.length === 0) throw new Error('Execution result has no repository artifact');
  await Promise.all(localArtifacts.map((path) => fileSystem.readText(path)));

  const verifier = `${attestation.reviewer}:run:${attestation.reviewRunId}:head:${attestation.reviewedHeadSha}`;
  const reviewedResult: PacketResult = {
    ...pending,
    evidence: pending.evidence.map((record) => ({ ...record, verifier })),
    verification: { status: 'passed', verifier, reviewedAt: attestation.reviewedAt },
  };
  const integrated = await integrateRepositoryPacketResult(fileSystem, attestation.packetId, reviewedResult, now);
  await fileSystem.writeText(attestation.resultPath, formattedRepositoryJson(reviewedResult));
  return integrated;
}
