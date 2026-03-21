import type {
  NodeRecord,
  NodeMetrics,
  WorkloadSpec,
  PlacementDecision,
  WorkloadClass,
} from './types.js';

// Priority ordering for shed (higher = more important)
const WORKLOAD_PRIORITY: Record<WorkloadClass, number> = {
  consciousness_host: 4,
  comms: 3,
  simulation: 2,
  maintenance: 1,
};

const consciousnessHostHeadroom = 0.25; // reserve 25% headroom on consciousness-host nodes
const scoreCpuWeight = 0.4;             // CPU utilisation weight in placement scoring
const scoreMemWeight = 0.4;             // Memory pressure weight in placement scoring
const scoreLatencyWeight = 0.2;         // Network latency weight in placement scoring
const neutralScore = 0.5;               // default score when no metrics are available

export interface ActiveWorkload {
  spec: WorkloadSpec;
  nodeId: string;
  placedAt: number;
}

export class WorkloadOrchestrator {
  private activeNodes: Map<string, NodeRecord> = new Map();
  private nodeMetrics: Map<string, NodeMetrics> = new Map();
  private placements: Map<string, ActiveWorkload> = new Map();

  admitNode(node: NodeRecord): void {
    if (node.state !== 'ACTIVE') {
      throw new Error(`Cannot admit node ${node.nodeId} in state ${node.state}`);
    }
    this.activeNodes.set(node.nodeId, node);
  }

  removeNode(nodeId: string): void {
    this.activeNodes.delete(nodeId);
    this.nodeMetrics.delete(nodeId);
  }

  updateMetrics(metrics: NodeMetrics): void {
    this.nodeMetrics.set(metrics.nodeId, metrics);
  }

  placeWorkload(spec: WorkloadSpec, now: number = Date.now()): PlacementDecision {
    const candidates = this.filterCandidates(spec);
    if (candidates.length === 0) {
      throw new Error(`No suitable node for workload ${spec.workloadId} (class: ${spec.class})`);
    }

    const scored = candidates.map(node => ({
      node,
      score: this.scoreNode(node, spec),
    }));
    scored.sort((a, b) => b.score - a.score || (a.node.joinedAt ?? 0) - (b.node.joinedAt ?? 0));

    const chosen = scored[0].node;

    const decision: PlacementDecision = {
      workloadId: spec.workloadId,
      nodeId: chosen.nodeId,
      decidedAt: now,
      reason: `Selected node ${chosen.nodeId} (score ${scored[0].score.toFixed(3)})`,
    };

    this.placements.set(spec.workloadId, { spec, nodeId: chosen.nodeId, placedAt: now });
    return decision;
  }

  evictWorkloadsFromNode(nodeId: string): WorkloadSpec[] {
    const evicted: WorkloadSpec[] = [];
    for (const [id, placement] of this.placements.entries()) {
      if (placement.nodeId === nodeId) {
        evicted.push(placement.spec);
        this.placements.delete(id);
      }
    }
    return evicted;
  }

  getPlacement(workloadId: string): ActiveWorkload | undefined {
    return this.placements.get(workloadId);
  }

  getPlacementsForNode(nodeId: string): ActiveWorkload[] {
    return [...this.placements.values()].filter(p => p.nodeId === nodeId);
  }

  getActiveNodes(): NodeRecord[] {
    return [...this.activeNodes.values()];
  }

  getWorkloadsByPriority(): ActiveWorkload[] {
    return [...this.placements.values()].sort(
      (a, b) => WORKLOAD_PRIORITY[b.spec.class] - WORKLOAD_PRIORITY[a.spec.class],
    );
  }

  // ── internals ────────────────────────────────────────────────────────────

  private filterCandidates(spec: WorkloadSpec): NodeRecord[] {
    return [...this.activeNodes.values()].filter(node => {
      // Check all required placement constraints
      for (const c of spec.constraints) {
        if (!c.required) continue;
        const nodeValue = (node.spec as unknown as Record<string, unknown>)[c.key];
        if (nodeValue !== c.value) return false;
      }

      // Ensure node has enough capacity (rough check using latest metrics)
      const metrics = this.nodeMetrics.get(node.nodeId);
      if (!metrics) return true; // no metrics yet — admit optimistically

      const availableCpu = node.spec.minCpuCores * (1 - metrics.cpuUtil);
      const availableMem = node.spec.minMemoryGiB * (1 - metrics.memPressure);

      // For consciousness_host workloads, require 25% headroom on node
      const headroomFactor = spec.class === 'consciousness_host' ? (1 - consciousnessHostHeadroom) : 1;

      return (
        availableCpu * headroomFactor >= spec.cpuRequest &&
        availableMem * headroomFactor >= spec.memRequest
      );
    });
  }

  private scoreNode(node: NodeRecord, _spec: WorkloadSpec): number {
    const metrics = this.nodeMetrics.get(node.nodeId);
    if (!metrics) return neutralScore;

    const cpuScore = 1 - metrics.cpuUtil;
    const memScore = 1 - metrics.memPressure;
    const latencyScore = metrics.networkLatencyMs > 0 ? 1 / metrics.networkLatencyMs : 1;

    return cpuScore * scoreCpuWeight + memScore * scoreMemWeight + latencyScore * scoreLatencyWeight;
  }
}
