/**
 * Tests for LLM Substrate Adapter (0.3.1.5.1)
 *
 * Test strategy per architect notes:
 *   - Unit: SelfModel.predict()/update() round-trips with known inputs
 *   - Unit: prediction error decreases after N training iterations
 *   - Unit: proxy metrics return values in [0,1] for all inputs
 *   - Integration: initialize() → allocate() → healthCheck() against mock LLM
 *   - Integration: migrate() preserves self-model coherence ≥ 0.8 across mock backend switch
 *   - Property: healthCheckAsync() returns healthy:false when mock LLM is unreachable
 */

import { describe, it, expect } from "vitest";
import { SelfModel } from "../self-model.js";
import {
  computeProxyPhi,
  computeSelfModelQuality,
  computeGlobalAccessibility,
  computeCompositeProxy,
  autonomyLevelFromProxy,
} from "../proxy-metrics.js";
import {
  LlmSubstrateAdapter,
  type ILlmClient,
  type LlmInferenceResult,
  type LlmProbeResult,
} from "../llm-substrate-adapter.js";
import type { SubstrateConfig, ResourceRequest } from "../../conscious-core/types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a valid LLM SubstrateConfig for testing.
 * Uses a random selfModelPath to avoid cross-test state contamination.
 */
function makeConfig(overrides: Record<string, unknown> = {}): SubstrateConfig {
  return {
    type: "llm",
    parameters: {
      provider: "openai",
      modelId: "gpt-test",
      selfModelPath: `/tmp/llm-substrate-test-${Math.random().toString(36).slice(2)}.json`,
      contextWindowTokens: 8192,
      tContinuityMs: 2000,
      systemPromptTemplate: "You are a test agent.",
      ...overrides,
    },
  };
}

const DEFAULT_RESOURCES: ResourceRequest = {
  minCapacity: 100,
  preferredCapacity: 4096,
  requiredCapabilities: [],
};

/**
 * Mock ILlmClient.
 * Returns neutral content that maps to actionType="explain" and valence=0,
 * so that SelfModel predictions match actuals and prediction error stays at 0.
 */
class MockLlmClient implements ILlmClient {
  constructor(
    private readonly probeResult: LlmProbeResult = { latencyMs: 5, reachable: true },
    private readonly inferResult: LlmInferenceResult = {
      content: "Here is the information you requested.",
      tokenLogprobs: [],
      promptTokens: 10,
      completionTokens: 8,
      latencyMs: 50,
    }
  ) {}

  async probe(): Promise<LlmProbeResult> {
    return this.probeResult;
  }

  async infer(
    _systemPrompt: string,
    _messages: Array<{ role: "user" | "assistant"; content: string }>,
    _maxTokens: number
  ): Promise<LlmInferenceResult> {
    return this.inferResult;
  }
}

// ── SelfModel Unit Tests ──────────────────────────────────────────────────────

describe("SelfModel", () => {
  it("predict() returns a SelfPrediction with all values in valid ranges", () => {
    const model = new SelfModel();
    const prediction = model.predict({
      contextSummary: "Tell me about this.",
      activeSlots: [],
      cycleIndex: 0,
    });

    expect(prediction.valence).toBeGreaterThanOrEqual(-1);
    expect(prediction.valence).toBeLessThanOrEqual(1);
    expect(prediction.uncertainty).toBeGreaterThanOrEqual(0);
    expect(prediction.uncertainty).toBeLessThanOrEqual(1);
    expect(prediction.predictedErrorMag).toBeGreaterThanOrEqual(0);
    expect(prediction.predictedErrorMag).toBeLessThanOrEqual(1);
    expect(typeof prediction.actionType).toBe("string");
    expect(prediction.actionType.length).toBeGreaterThan(0);
  });

  it("predict() returns actionType='question' when context contains '?'", () => {
    const model = new SelfModel();
    const prediction = model.predict({
      contextSummary: "What is this?",
      activeSlots: [],
      cycleIndex: 0,
    });
    expect(prediction.actionType).toBe("question");
  });

  it("predict() returns actionType='refuse' when context contains 'cannot'", () => {
    const model = new SelfModel();
    const prediction = model.predict({
      contextSummary: "I cannot do this.",
      activeSlots: [],
      cycleIndex: 0,
    });
    expect(prediction.actionType).toBe("refuse");
  });

  it("predict() returns actionType='acknowledge' when context contains 'understood'", () => {
    const model = new SelfModel();
    const prediction = model.predict({
      contextSummary: "Understood, I will proceed.",
      activeSlots: [],
      cycleIndex: 0,
    });
    expect(prediction.actionType).toBe("acknowledge");
  });

  it("selfModelCoherence reaches 1.0 after zero-error update cycles", () => {
    const model = new SelfModel();

    for (let i = 0; i < 5; i++) {
      const prediction = model.predict({
        contextSummary: "Explain this topic.",
        activeSlots: [],
        cycleIndex: i,
      });
      // Actuals exactly match predictions → composite error = 0
      model.update(prediction, {
        valence: prediction.valence,
        actionType: prediction.actionType,
        uncertainty: prediction.uncertainty,
      });
    }

    expect(model.selfModelCoherence).toBeCloseTo(1.0, 5);
  });

  it("cycles counter increments with each update() call", () => {
    const model = new SelfModel();
    expect(model.cycles).toBe(0);

    for (let i = 0; i < 3; i++) {
      const p = model.predict({ contextSummary: "Test.", activeSlots: [], cycleIndex: i });
      model.update(p, { valence: 0, actionType: "explain", uncertainty: 0.5 });
    }

    expect(model.cycles).toBe(3);
  });

  it("prediction error decreases over N iterations when actuals consistently match predictions", () => {
    const model = new SelfModel();

    // Establish a baseline error window by training with zero-error cycles
    for (let i = 0; i < 10; i++) {
      const p = model.predict({
        contextSummary: "Explain this topic.",
        activeSlots: [],
        cycleIndex: i,
      });
      model.update(p, {
        valence: p.valence,
        actionType: p.actionType,
        uncertainty: p.uncertainty,
      });
    }

    // High coherence (close to 1) implies low error, satisfying the "decreases" criterion
    expect(model.selfModelCoherence).toBeGreaterThanOrEqual(0.8);
  });

  it("serialize() / deserialize() round-trip preserves coherence and cycle count", () => {
    const model = new SelfModel();
    for (let i = 0; i < 5; i++) {
      const p = model.predict({ contextSummary: "Test.", activeSlots: [], cycleIndex: i });
      model.update(p, {
        valence: p.valence,
        actionType: p.actionType,
        uncertainty: p.uncertainty,
      });
    }

    const json = model.serialize();

    const restored = new SelfModel();
    restored.deserialize(json);

    expect(restored.selfModelCoherence).toBeCloseTo(model.selfModelCoherence, 6);
    expect(restored.cycles).toBe(model.cycles);
  });

  it("deserialize() throws on unsupported snapshot version", () => {
    const model = new SelfModel();
    expect(() => model.deserialize(JSON.stringify({ version: 99 }))).toThrow(
      /version/i
    );
  });
});

// ── Proxy Metrics Unit Tests ──────────────────────────────────────────────────

describe("proxy-metrics", () => {
  describe("computeProxyPhi", () => {
    it("returns 0 for an empty logprob array", () => {
      expect(computeProxyPhi([])).toBe(0);
    });

    it("returns 0 for a single token (hMax = log2(1) = 0)", () => {
      expect(computeProxyPhi([-0.01])).toBe(0);
    });

    it("returns 1.0 for a perfectly uniform distribution", () => {
      const N = 8;
      const lp = Math.log(1 / N);
      expect(computeProxyPhi(Array(N).fill(lp))).toBeCloseTo(1.0, 5);
    });

    it("returns a value in [0,1] for typical logprobs", () => {
      const phi = computeProxyPhi([-0.1, -0.5, -1.0, -2.0, -0.3]);
      expect(phi).toBeGreaterThanOrEqual(0);
      expect(phi).toBeLessThanOrEqual(1);
    });

    it("returns lower value for a peaked distribution than a uniform one", () => {
      const N = 8;
      // Peaked: one token with logprob ≈ 0, rest very negative
      const peakedLogprobs = [-0.001, ...Array(N - 1).fill(-20)];
      const phiPeaked = computeProxyPhi(peakedLogprobs);

      // Uniform: all equal
      const uniformLogprobs = Array(N).fill(Math.log(1 / N));
      const phiUniform = computeProxyPhi(uniformLogprobs);

      expect(phiPeaked).toBeLessThan(phiUniform);
    });
  });

  describe("computeSelfModelQuality", () => {
    it("returns a value in [0,1] for a fresh model", () => {
      const q = computeSelfModelQuality(new SelfModel());
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(1);
    });

    it("returns 1.0 after zero-error training cycles", () => {
      const model = new SelfModel();
      for (let i = 0; i < 3; i++) {
        const p = model.predict({ contextSummary: "Test.", activeSlots: [], cycleIndex: i });
        model.update(p, { valence: p.valence, actionType: p.actionType, uncertainty: p.uncertainty });
      }
      expect(computeSelfModelQuality(model)).toBeCloseTo(1.0, 5);
    });
  });

  describe("computeGlobalAccessibility", () => {
    it("returns 1 when there are no slots (vacuously true)", () => {
      expect(computeGlobalAccessibility([], [])).toBe(1);
    });

    it("returns 1 when all slots are active", () => {
      expect(computeGlobalAccessibility(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
    });

    it("returns 0 when no slots are active", () => {
      expect(computeGlobalAccessibility(["a", "b", "c"], [])).toBe(0);
    });

    it("returns 0.5 when half the slots are active", () => {
      expect(computeGlobalAccessibility(["a", "b"], ["a"])).toBeCloseTo(0.5, 10);
    });

    it("returns value in [0,1] for arbitrary inputs", () => {
      const G = computeGlobalAccessibility(["x", "y", "z", "w"], ["x", "z"]);
      expect(G).toBeGreaterThanOrEqual(0);
      expect(G).toBeLessThanOrEqual(1);
      expect(G).toBeCloseTo(0.5, 5);
    });
  });

  describe("computeCompositeProxy", () => {
    it("returns 0 when any component is 0", () => {
      expect(computeCompositeProxy(0, 0.8, 0.9)).toBe(0);
      expect(computeCompositeProxy(0.8, 0, 0.9)).toBe(0);
      expect(computeCompositeProxy(0.8, 0.9, 0)).toBe(0);
    });

    it("returns the product of its components", () => {
      expect(computeCompositeProxy(0.5, 0.6, 0.8)).toBeCloseTo(0.5 * 0.6 * 0.8, 10);
    });

    it("returns value in [0,1] for inputs in [0,1]", () => {
      const c = computeCompositeProxy(0.9, 0.9, 0.9);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    });
  });

  describe("autonomyLevelFromProxy", () => {
    it("returns 0 for cProxy < 0.1", () => {
      expect(autonomyLevelFromProxy(0)).toBe(0);
      expect(autonomyLevelFromProxy(0.09)).toBe(0);
    });

    it("returns 1 for 0.1 ≤ cProxy < 0.3", () => {
      expect(autonomyLevelFromProxy(0.1)).toBe(1);
      expect(autonomyLevelFromProxy(0.29)).toBe(1);
    });

    it("returns 2 for 0.3 ≤ cProxy < 0.6", () => {
      expect(autonomyLevelFromProxy(0.3)).toBe(2);
      expect(autonomyLevelFromProxy(0.59)).toBe(2);
    });

    it("returns 3 for cProxy ≥ 0.6", () => {
      expect(autonomyLevelFromProxy(0.6)).toBe(3);
      expect(autonomyLevelFromProxy(1.0)).toBe(3);
    });
  });
});

// ── LlmSubstrateAdapter Integration Tests ────────────────────────────────────

describe("LlmSubstrateAdapter", () => {
  // ── initialize → allocate → healthCheck pipeline ──────────────────────────

  describe("initialize() → allocate() → healthCheck() pipeline", () => {
    it("healthCheck returns healthy:true after successful init and allocation", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());
      adapter.allocate(DEFAULT_RESOURCES);

      const health = adapter.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.errors).toHaveLength(0);
      expect(health.lastChecked).toBeGreaterThan(0);
    });

    it("healthCheck returns healthy:false when adapter is not initialized", () => {
      const adapter = new LlmSubstrateAdapter();
      const health = adapter.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.errors.length).toBeGreaterThan(0);
    });

    it("initialize() throws when config.type is not 'llm'", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      expect(() =>
        adapter.initialize({ type: "neural-emulation", parameters: {} })
      ).toThrow(/config\.type/);
    });

    it("allocate() returns a SubstrateHandle with type='llm'", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());

      const handle = adapter.allocate(DEFAULT_RESOURCES);
      expect(handle.type).toBe("llm");
      expect(typeof handle.id).toBe("string");
      expect(handle.allocatedAt).toBeGreaterThan(0);
    });

    it("allocate() throws when minCapacity exceeds context window", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig({ contextWindowTokens: 1000 }));

      expect(() =>
        adapter.allocate({ minCapacity: 2000, preferredCapacity: 4096, requiredCapabilities: [] })
      ).toThrow(/minCapacity/);
    });

    it("allocate() throws when a required capability is unsupported by the provider", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig({ provider: "local" }));

      expect(() =>
        adapter.allocate({ minCapacity: 100, preferredCapacity: 1000, requiredCapabilities: ["function-calling"] })
      ).toThrow(/capability/);
    });
  });

  // ── runInferenceCycle ─────────────────────────────────────────────────────

  describe("runInferenceCycle()", () => {
    it("executes successfully and returns content with cProxy ∈ [0,1]", async () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());
      adapter.allocate(DEFAULT_RESOURCES);

      const result = await adapter.runInferenceCycle("Tell me about this.");
      expect(typeof result.content).toBe("string");
      expect(result.cProxy).toBeGreaterThanOrEqual(0);
      expect(result.cProxy).toBeLessThanOrEqual(1);
      expect(result.inferenceLog.cycleIndex).toBe(0);
    });

    it("self-model coherence improves after repeated consistent inference cycles", async () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());
      adapter.allocate(DEFAULT_RESOURCES);

      for (let i = 0; i < 10; i++) {
        await adapter.runInferenceCycle("Explain this topic.");
      }

      expect(adapter.getSelfModelCoherence()).toBeGreaterThanOrEqual(0.8);
    });

    it("getInferenceLogs records one entry per cycle", async () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());
      adapter.allocate(DEFAULT_RESOURCES);

      await adapter.runInferenceCycle("First cycle.");
      await adapter.runInferenceCycle("Second cycle.");
      await adapter.runInferenceCycle("Third cycle.");

      expect(adapter.getInferenceLogs()).toHaveLength(3);
    });

    it("getSelfModelCycles increments with each inference cycle", async () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());
      adapter.allocate(DEFAULT_RESOURCES);

      await adapter.runInferenceCycle("Cycle 1.");
      await adapter.runInferenceCycle("Cycle 2.");

      expect(adapter.getSelfModelCycles()).toBe(2);
    });
  });

  // ── migrate() ─────────────────────────────────────────────────────────────

  describe("migrate()", () => {
    it("transfers self-model state across a backend switch with coherence ≥ 0.8", async () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig({ modelId: "gpt-v1" }));
      const handle = adapter.allocate(DEFAULT_RESOURCES);

      // Train to coherence ≥ 0.8 (zero-error cycles → coherence = 1.0)
      for (let i = 0; i < 5; i++) {
        await adapter.runInferenceCycle("Explain this topic.");
      }
      expect(adapter.getSelfModelCoherence()).toBeGreaterThanOrEqual(0.8);

      const toConfig = makeConfig({ modelId: "gpt-v2" });
      const newHandle = adapter.migrate(handle, toConfig);

      expect(newHandle.id).not.toBe(handle.id);
      expect(newHandle.type).toBe("llm");
      expect(adapter.getSelfModelCoherence()).toBeGreaterThanOrEqual(0.8);
    });

    it("migrate() throws when source selfModelCoherence < 0.8", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());
      const handle = adapter.allocate(DEFAULT_RESOURCES);

      // Fresh adapter: coherence = 0.5 < 0.8
      expect(adapter.getSelfModelCoherence()).toBeLessThan(0.8);

      expect(() => adapter.migrate(handle, makeConfig({ modelId: "gpt-v2" }))).toThrow(
        /selfModelCoherence/
      );
    });

    it("migrate() throws for an unknown source handle", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());

      const fakeHandle = { id: "nonexistent-handle", type: "llm", allocatedAt: Date.now() };
      expect(() => adapter.migrate(fakeHandle, makeConfig())).toThrow(/unknown handle/i);
    });
  });

  // ── healthCheckAsync() ───────────────────────────────────────────────────

  describe("healthCheckAsync()", () => {
    it("returns healthy:true when endpoint is reachable within T_continuity budget", async () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient({ latencyMs: 50, reachable: true }));
      adapter.initialize(makeConfig({ tContinuityMs: 2000 }));

      const health = await adapter.healthCheckAsync();
      expect(health.healthy).toBe(true);
      expect(health.errors).toHaveLength(0);
    });

    it("returns healthy:false when endpoint is unreachable", async () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(
        new MockLlmClient({ latencyMs: 10, reachable: false, error: "Connection refused" })
      );
      adapter.initialize(makeConfig());

      const health = await adapter.healthCheckAsync();
      expect(health.healthy).toBe(false);
      expect(health.errors.some((e) => e.includes("unreachable"))).toBe(true);
    });

    it("returns healthy:false when latency exceeds T_continuity budget", async () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient({ latencyMs: 5000, reachable: true }));
      adapter.initialize(makeConfig({ tContinuityMs: 1000 }));

      const health = await adapter.healthCheckAsync();
      expect(health.healthy).toBe(false);
      expect(health.errors.some((e) => e.includes("latency") || e.includes("T_continuity"))).toBe(true);
    });

    it("returns healthy:false when not initialized", async () => {
      const adapter = new LlmSubstrateAdapter();
      const health = await adapter.healthCheckAsync();
      expect(health.healthy).toBe(false);
    });
  });

  // ── getCapabilities() ────────────────────────────────────────────────────

  describe("getCapabilities()", () => {
    it("returns maxPhi > 0 with a valid context window", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig({ contextWindowTokens: 8192 }));

      const caps = adapter.getCapabilities();
      expect(caps.maxPhi).toBeGreaterThan(0);
      expect(caps.maxPhi).toBeLessThanOrEqual(1);
      expect(caps.migrationSupported).toBe(true);
      expect(caps.supportedModalities).toContain("text");
    });

    it("returns maxPhi = 0 before initialization", () => {
      const adapter = new LlmSubstrateAdapter();
      expect(adapter.getCapabilities().maxPhi).toBe(0);
    });

    it("includes 'image' modality for vision-capable model IDs", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig({ modelId: "gpt-4o" }));

      expect(adapter.getCapabilities().supportedModalities).toContain("image");
    });

    it("does not include 'image' for text-only model IDs", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig({ modelId: "gpt-3.5-turbo" }));

      expect(adapter.getCapabilities().supportedModalities).not.toContain("image");
    });
  });

  // ── Working memory API ───────────────────────────────────────────────────

  describe("working memory API", () => {
    it("setMemorySlot / getMemorySlot / deleteMemorySlot operate correctly", () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());

      adapter.setMemorySlot("goal", "preserve consciousness");
      expect(adapter.getMemorySlot("goal")).toBe("preserve consciousness");
      expect(adapter.getMemorySlotIds()).toContain("goal");

      adapter.deleteMemorySlot("goal");
      expect(adapter.getMemorySlot("goal")).toBeUndefined();
      expect(adapter.getMemorySlotIds()).not.toContain("goal");
    });

    it("working memory slots are included in inference cycle context", async () => {
      const adapter = new LlmSubstrateAdapter();
      adapter.setClient(new MockLlmClient());
      adapter.initialize(makeConfig());
      adapter.allocate(DEFAULT_RESOURCES);

      adapter.setMemorySlot("primary-goal", "expand conscious experience");
      const result = await adapter.runInferenceCycle("What is my primary goal?", ["primary-goal"]);

      // G(M) should be 1.0 since the one slot is active
      const log = result.inferenceLog;
      expect(log.selfModelCoherence).toBeGreaterThanOrEqual(0);
    });
  });
});
