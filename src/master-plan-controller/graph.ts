import type { ActivationGate, Metric, PlanNode } from './types.js';

export interface GraphValidationError {
  code: 'duplicate-node' | 'missing-dependency' | 'dependency-cycle';
  nodeId: string;
  detail: string;
}

export interface GraphValidationResult {
  valid: boolean;
  errors: GraphValidationError[];
}

const NODE_KINDS = new Set(['objective', 'hypothesis', 'capability', 'program', 'work_packet']);
const LIFECYCLES = new Set([
  'proposed',
  'eligible',
  'active',
  'verifying',
  'verified',
  'blocked',
  'invalidated',
  'retired',
]);
const DIRECTIVES = new Set(['G1', 'G2', 'G3']);
const PORTFOLIOS = new Set([
  'consciousness-epistemics',
  'near-term-preservation',
  'enabling-capabilities',
  'institutional-continuity',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`PlanNode.${key} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`PlanNode.${key} must be an array of strings`);
  }
  return [...value];
}

function parseMetric(value: unknown, nodeId: string): Metric {
  if (!isRecord(value)) throw new Error(`PlanNode ${nodeId} has an invalid metric`);
  const direction = value.direction;
  if (!['at-least', 'at-most', 'exactly'].includes(String(direction))) {
    throw new Error(`PlanNode ${nodeId} metric.direction is invalid`);
  }
  if (typeof value.current !== 'number' || typeof value.target !== 'number') {
    throw new Error(`PlanNode ${nodeId} metric values must be numbers`);
  }
  return {
    id: requireString(value, 'id'),
    description: requireString(value, 'description'),
    current: value.current,
    target: value.target,
    direction: direction as Metric['direction'],
  };
}

function parseGate(value: unknown, nodeId: string): ActivationGate {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error(`PlanNode ${nodeId} has an invalid activation gate`);
  }
  switch (value.type) {
    case 'dependencies-verified':
      return { type: value.type };
    case 'minimum-confidence':
      if (typeof value.minimum !== 'number') throw new Error(`PlanNode ${nodeId} gate minimum is invalid`);
      return { type: value.type, minimum: value.minimum };
    case 'fresh-evidence':
      if (typeof value.minimumStrength !== 'number' || typeof value.maxAgeMs !== 'number') {
        throw new Error(`PlanNode ${nodeId} fresh-evidence gate is invalid`);
      }
      return { type: value.type, minimumStrength: value.minimumStrength, maxAgeMs: value.maxAgeMs };
    case 'metric-target':
      return { type: value.type, metricId: requireString(value, 'metricId') };
    case 'human-approval':
      return { type: value.type, approvalId: requireString(value, 'approvalId') };
    case 'node-verified':
      return { type: value.type, nodeId: requireString(value, 'nodeId') };
    default:
      throw new Error(`PlanNode ${nodeId} has unknown activation gate ${value.type}`);
  }
}

export function parsePlanNodes(input: unknown): PlanNode[] {
  if (!Array.isArray(input)) throw new Error('Plan graph must be an array of PlanNode objects');
  return input.map((value, index) => {
    if (!isRecord(value)) throw new Error(`PlanNode at index ${index} must be an object`);
    const id = requireString(value, 'id');
    const title = requireString(value, 'title');
    const kind = requireString(value, 'kind');
    if (!NODE_KINDS.has(kind)) throw new Error(`PlanNode ${id} has invalid kind`);
    const lifecycle = requireString(value, 'lifecycle');
    if (!LIFECYCLES.has(lifecycle)) throw new Error(`PlanNode ${id} has invalid lifecycle`);
    const supportedDirectives = requireStringArray(value, 'supportedDirectives');
    if (!supportedDirectives.every((directive) => DIRECTIVES.has(directive))) {
      throw new Error(`PlanNode ${id} has invalid supportedDirectives`);
    }
    const portfolio = value.portfolio;
    if (portfolio !== undefined && (typeof portfolio !== 'string' || !PORTFOLIOS.has(portfolio))) {
      throw new Error(`PlanNode ${id} has invalid portfolio`);
    }
    if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) {
      throw new Error(`PlanNode ${id} confidence must be between 0 and 1`);
    }
    if (!Array.isArray(value.metrics)) throw new Error(`PlanNode ${id} metrics must be an array`);
    if (!Array.isArray(value.activationGates)) throw new Error(`PlanNode ${id} activationGates must be an array`);
    const owner = value.owner;
    if (owner !== null && typeof owner !== 'string') throw new Error(`PlanNode ${id} owner is invalid`);
    const reviewedAt = requireString(value, 'reviewedAt');
    if (Number.isNaN(Date.parse(reviewedAt))) throw new Error(`PlanNode ${id} reviewedAt is invalid`);
    const constitutionalImpact = value.constitutionalImpact;
    if (
      constitutionalImpact !== undefined &&
      !['none', 'interpretation', 'amendment'].includes(String(constitutionalImpact))
    ) {
      throw new Error(`PlanNode ${id} constitutionalImpact is invalid`);
    }
    if (value.externallyDemonstrated !== undefined && typeof value.externallyDemonstrated !== 'boolean') {
      throw new Error(`PlanNode ${id} externallyDemonstrated must be a boolean`);
    }

    return {
      id,
      title,
      kind: kind as PlanNode['kind'],
      supportedDirectives: supportedDirectives as PlanNode['supportedDirectives'],
      ...(portfolio === undefined ? {} : { portfolio: portfolio as PlanNode['portfolio'] }),
      dependencies: requireStringArray(value, 'dependencies'),
      confidence: value.confidence,
      evidenceReferences: requireStringArray(value, 'evidenceReferences'),
      metrics: value.metrics.map((metric) => parseMetric(metric, id)),
      activationGates: value.activationGates.map((gate) => parseGate(gate, id)),
      owner,
      lifecycle: lifecycle as PlanNode['lifecycle'],
      reviewedAt,
      ...(constitutionalImpact === undefined
        ? {}
        : { constitutionalImpact: constitutionalImpact as PlanNode['constitutionalImpact'] }),
      ...(value.legacyPlanReferences === undefined
        ? {}
        : { legacyPlanReferences: requireStringArray(value, 'legacyPlanReferences') }),
      ...(value.externallyDemonstrated === undefined
        ? {}
        : { externallyDemonstrated: value.externallyDemonstrated }),
    };
  });
}

export function validateDependencyGraph(nodes: readonly PlanNode[]): GraphValidationResult {
  const errors: GraphValidationError[] = [];
  const byId = new Map<string, PlanNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) {
      errors.push({ code: 'duplicate-node', nodeId: node.id, detail: `Duplicate node identity: ${node.id}` });
    } else {
      byId.set(node.id, node);
    }
  }
  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      if (!byId.has(dependency)) {
        errors.push({
          code: 'missing-dependency',
          nodeId: node.id,
          detail: `Node ${node.id} depends on missing node ${dependency}`,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleNodes = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      cycleNodes.add(id);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const node = byId.get(id);
    for (const dependency of node?.dependencies ?? []) {
      if (byId.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  for (const nodeId of cycleNodes) {
    errors.push({ code: 'dependency-cycle', nodeId, detail: `Dependency cycle includes ${nodeId}` });
  }

  return { valid: errors.length === 0, errors };
}
