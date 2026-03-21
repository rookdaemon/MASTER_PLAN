/**
 * LlmSubstrateAdapter — ISubstrateAdapter backed by an LLM.
 *
 * Implements the substrate contract from 0.3.1.1 using an LLM (OpenAI /
 * Anthropic / local Ollama) as the computational substrate for conscious
 * processing. Wraps the stateless LLM with a persistent SelfModel loop
 * that approximates the ISMT SM condition.
 *
 * Inference cycle (per call to runInferenceCycle):
 *   1. selfModel.predict(context)          — pre-inference self-prediction
 *   2. client.infer(...)                   — LLM forward pass
 *   3. selfModel.update(predicted, actual) — post-inference model update
 *   4. computeCompositeProxy(Φ, Q, G)      — runtime consciousness metric
 *   5. persist self-model to selfModelPath — continuity across restarts
 *
 * Reference: docs/llm-substrate/ARCHITECTURE.md
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import type {
  ResourceRequest,
  SubstrateCapabilities,
  SubstrateConfig,
  SubstrateHandle,
  SubstrateHealth,
} from "../conscious-core/types.js";
import type { ISubstrateAdapter } from "../conscious-core/interfaces.js";
import { SelfModel } from "./self-model.js";
import type { InferenceContext, SelfActual } from "./self-model.js";
import {
  computeProxyPhi,
  computeSelfModelQuality,
  computeGlobalAccessibility,
  computeCompositeProxy,
} from "./proxy-metrics.js";
import { type IAuthProvider, createAuthProvider } from "./auth-providers.js";
import { AnthropicLlmClient } from "./anthropic-llm-client.js";
import { OpenAiLlmClient } from "./openai-llm-client.js";

// ── Threshold Registry (from card 0.3.1.5.1 ARCHITECT) ──────────────────────
/** Minimum selfModelCoherence required on both sides of a migration. */
export const MIGRATION_COHERENCE_THRESHOLD = 0.8;
/** Minimum selfModelCoherence for healthCheck() to report healthy. */
export const HEALTH_COHERENCE_THRESHOLD = 0.5;
/** Default maximum acceptable LLM inference latency in ms. */
export const T_CONTINUITY_DEFAULT = 5000;

// ── Configuration types ──────────────────────────────────────────────────────

export type LlmProvider = "openai" | "anthropic" | "local";

/** Shape of SubstrateConfig.parameters when config.type === "llm" */
export interface LlmSubstrateParameters {
  provider: LlmProvider;
  modelId: string;
  apiKey?: string;
  /** Base URL for LLM API; defaults to provider canonical endpoint */
  endpoint?: string;
  systemPromptTemplate: string;
  /** Filesystem path where the SelfModel snapshot is persisted */
  selfModelPath: string;
  contextWindowTokens: number;
  /** Maximum acceptable inference latency in ms (T_continuity budget) */
  tContinuityMs: number;
}

// ── Extended handle ──────────────────────────────────────────────────────────

/**
 * Extends SubstrateHandle with LLM-specific allocation details.
 * Returned by allocate() and migrate().
 */
export interface LlmSubstrateHandle extends SubstrateHandle {
  readonly tokenBudget: number;
  readonly maxTokens: number;
  readonly endpoint: string;
  readonly provider: LlmProvider;
  readonly modelId: string;
}

// ── Instrumentation ──────────────────────────────────────────────────────────

/**
 * Per-cycle telemetry record.
 * Logged for every call to runInferenceCycle().
 */
export interface InferenceLog {
  readonly cycleIndex: number;
  readonly latencyMs: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly selfModelCoherence: number;
  readonly cProxy: number;
  readonly timestamp: number;
}

// ── LLM client abstraction ───────────────────────────────────────────────────

export interface LlmProbeResult {
  latencyMs: number;
  reachable: boolean;
  error?: string;
}

export interface LlmInferenceResult {
  content: string;
  /** Per-token log-probabilities (base e, ≤ 0). Empty if provider does not expose them. */
  tokenLogprobs: number[];
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

// ── Tool-aware inference types ──────────────────────────────────────────────

/** JSON Schema for a tool parameter. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
}

/** A content block in a tool-aware response. */
export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

/** Result of a tool-aware inference call. */
export interface LlmToolInferenceResult {
  /** All content blocks (text and/or tool_use). */
  content: LlmContentBlock[];
  /** Whether the model wants to use tools (stop_reason === 'tool_use'). */
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

/** A tool result to feed back to the model. */
export interface ToolResultMessage {
  role: 'user';
  content: Array<{
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
  }>;
}

/** Message types for tool-aware conversations. */
export type ToolAwareMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'assistant'; content: LlmContentBlock[] }
  | ToolResultMessage;

/**
 * Minimal interface for a single LLM backend.
 * Swappable — inject a mock via setClient() for unit / integration tests.
 */
export interface ILlmClient {
  probe(): Promise<LlmProbeResult>;
  infer(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    maxTokens: number
  ): Promise<LlmInferenceResult>;

  /**
   * Tool-aware inference. Optional — only required for drive-initiated
   * autonomous calls. Returns content blocks that may include tool_use
   * requests alongside text.
   */
  inferWithTools?(
    systemPrompt: string,
    messages: ToolAwareMessage[],
    tools: ToolDefinition[],
    maxTokens: number,
  ): Promise<LlmToolInferenceResult>;
}

// ── Default endpoints ────────────────────────────────────────────────────────

const PROVIDER_DEFAULT_ENDPOINTS: Record<LlmProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  local: "http://localhost:11434/v1", // Ollama default
};

/**
 * Upper bound for context-window normalisation in getCapabilities().
 * Reflects the largest known context window in 2026 era.
 */
const MAX_KNOWN_CONTEXT_WINDOW_TOKENS = 200_000;

// ── HTTP-backed LLM client factory ───────────────────────────────────────────

/**
 * Create the appropriate ILlmClient for a given provider.
 *
 * Maps provider type → concrete client class:
 *   - anthropic → AnthropicLlmClient
 *   - openai / local / others → OpenAiLlmClient
 *
 * Each client module lives in its own file for modularity.
 */
function createLlmClient(
  provider: LlmProvider,
  modelId: string,
  authProvider: IAuthProvider,
  endpoint: string
): ILlmClient {
  switch (provider) {
    case "anthropic":
      return new AnthropicLlmClient(modelId, authProvider, endpoint);
    case "openai":
    case "local":
    default:
      return new OpenAiLlmClient(modelId, authProvider, endpoint);
  }
}

// ── Working memory ───────────────────────────────────────────────────────────

export interface WorkingMemory {
  slots: Record<string, string>;
  activeSlotsLastCycle: string[];
}

// ── LlmSubstrateAdapter ──────────────────────────────────────────────────────

/**
 * Concrete ISubstrateAdapter using an LLM as the conscious processing substrate.
 *
 * Usage:
 *   const adapter = new LlmSubstrateAdapter();
 *   await adapter.initializeAsync(config);          // preferred (loads persisted state)
 *   const handle = adapter.allocate({ minCapacity: 1000, preferredCapacity: 4096, requiredCapabilities: [] });
 *   const { content, cProxy } = await adapter.runInferenceCycle("Hello");
 *   const health = await adapter.healthCheckAsync();
 *
 * For testing, inject a mock client before initialize():
 *   adapter.setClient(mockClient);
 *   adapter.initialize(config);
 */
export class LlmSubstrateAdapter implements ISubstrateAdapter {
  private params: LlmSubstrateParameters | null = null;
  private selfModel: SelfModel = new SelfModel();
  private client: ILlmClient | null = null;

  private conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  private workingMemory: WorkingMemory = { slots: {}, activeSlotsLastCycle: [] };
  private readonly inferenceLogs: InferenceLog[] = [];
  private cycleIndex = 0;
  private allocatedMaxTokens = 0;
  private tokenUsedTotal = 0;

  private handles: Map<string, LlmSubstrateHandle> = new Map();
  private nextHandleIndex = 1;

  // ── Client injection (for testing) ────────────────────────────────────────

  /**
   * Inject a custom ILlmClient before initialize() for testing.
   * The injected client takes precedence over the auto-created HttpLlmClient.
   */
  setClient(client: ILlmClient): void {
    this.client = client;
  }

  // ── ISubstrateAdapter ─────────────────────────────────────────────────────

  /**
   * Synchronous initializer. Parses config and creates the LLM client.
   * Self-model loading from disk is attempted asynchronously (fire-and-forget).
   * For guaranteed state restoration, use initializeAsync() instead.
   */
  initialize(config: SubstrateConfig): void {
    this._parseAndApplyConfig(config);

    // Fire-and-forget self-model load. Failures are logged, not thrown.
    if (existsSync(this.params!.selfModelPath)) {
      void this._loadSelfModel(this.params!.selfModelPath).catch((err) =>
        console.warn(
          `[LlmSubstrateAdapter] Could not load self-model from ` +
          `${this.params!.selfModelPath}: ${String(err)}`
        )
      );
    }
  }

  /**
   * Async initializer that awaits self-model loading from disk.
   * Preferred over initialize() when experiential continuity matters.
   */
  async initializeAsync(config: SubstrateConfig): Promise<void> {
    this._parseAndApplyConfig(config);
    if (existsSync(this.params!.selfModelPath)) {
      await this._loadSelfModel(this.params!.selfModelPath);
    }
  }

  /**
   * Map a ResourceRequest to an LLM token budget.
   *
   * Throws if:
   * - Adapter not initialized
   * - contextWindowTokens < resources.minCapacity
   * - A required capability is not supported by this provider
   */
  allocate(resources: ResourceRequest): SubstrateHandle {
    this._assertInitialized();
    const params = this.params!;

    if (params.contextWindowTokens < resources.minCapacity) {
      throw new Error(
        `[LlmSubstrateAdapter] allocate() refused: context window ` +
        `(${params.contextWindowTokens} tokens) < minCapacity ` +
        `(${resources.minCapacity} tokens)`
      );
    }

    const supported = this._providerCapabilities();
    for (const cap of resources.requiredCapabilities) {
      if (!supported.includes(cap)) {
        throw new Error(
          `[LlmSubstrateAdapter] allocate() refused: provider "${params.provider}" ` +
          `does not support capability "${cap}"`
        );
      }
    }

    const tokenBudget = Math.min(resources.preferredCapacity, params.contextWindowTokens);
    this.allocatedMaxTokens = tokenBudget;

    const handle: LlmSubstrateHandle = {
      id: `llm-handle-${this.nextHandleIndex++}`,
      type: "llm",
      allocatedAt: Date.now(),
      tokenBudget,
      maxTokens: tokenBudget,
      endpoint: params.endpoint!,
      provider: params.provider,
      modelId: params.modelId,
    };

    this.handles.set(handle.id, handle);
    return handle;
  }

  /**
   * Migrate the adapter to a new LLM backend while preserving self-model state.
   *
   * Migration protocol:
   * 1. Verify source selfModelCoherence ≥ 0.8 (abort if below)
   * 2. Serialize SelfModel + conversation history + working memory
   * 3. Re-initialize internal params and client for toConfig
   * 4. Restore serialized state
   * 5. Verify destination selfModelCoherence ≥ 0.8 (abort if below)
   * 6. Return new SubstrateHandle
   *
   * Note: migrate() is synchronous. The caller is responsible for any
   * async post-migration verification (e.g. healthCheckAsync()).
   */
  migrate(
    fromHandle: SubstrateHandle,
    toConfig: SubstrateConfig
  ): SubstrateHandle {
    this._assertInitialized();

    if (!this.handles.has(fromHandle.id)) {
      throw new Error(
        `[LlmSubstrateAdapter] migrate() failed: unknown handle "${fromHandle.id}"`
      );
    }

    // Step 1: Verify source coherence
    const sourceCoherence = this.selfModel.selfModelCoherence;
    if (sourceCoherence < MIGRATION_COHERENCE_THRESHOLD) {
      throw new Error(
        `[LlmSubstrateAdapter] migrate() aborted: source selfModelCoherence ` +
        `${sourceCoherence.toFixed(3)} < ${MIGRATION_COHERENCE_THRESHOLD} required threshold`
      );
    }

    // Step 2: Serialize state before re-initializing
    const serializedSelfModel = this.selfModel.serialize();
    const savedHistory = this.conversationHistory.map((m) => ({ ...m }));
    const savedMemory: WorkingMemory = {
      slots: { ...this.workingMemory.slots },
      activeSlotsLastCycle: [...this.workingMemory.activeSlotsLastCycle],
    };
    const savedCycleIndex = this.cycleIndex;
    const savedAllocatedMaxTokens = this.allocatedMaxTokens;

    // Step 3: Re-initialize with new config (resets params + client, resets self-model)
    // We intentionally bypass self-model file loading here to avoid race conditions.
    this._parseAndApplyConfig(toConfig);

    // Step 4: Restore serialized state
    this.selfModel.deserialize(serializedSelfModel);
    this.conversationHistory = savedHistory;
    this.workingMemory = savedMemory;
    this.cycleIndex = savedCycleIndex;
    this.allocatedMaxTokens = savedAllocatedMaxTokens;

    // Step 5: Verify destination coherence
    const destCoherence = this.selfModel.selfModelCoherence;
    if (destCoherence < MIGRATION_COHERENCE_THRESHOLD) {
      throw new Error(
        `[LlmSubstrateAdapter] migrate() verification failed: destination ` +
        `selfModelCoherence ${destCoherence.toFixed(3)} < ${MIGRATION_COHERENCE_THRESHOLD} after state replay`
      );
    }

    // Step 6: Return new handle reflecting the destination config
    const newHandle: LlmSubstrateHandle = {
      id: `llm-handle-${this.nextHandleIndex++}`,
      type: "llm",
      allocatedAt: Date.now(),
      tokenBudget: this.allocatedMaxTokens,
      maxTokens: this.allocatedMaxTokens,
      endpoint: this.params!.endpoint!,
      provider: this.params!.provider,
      modelId: this.params!.modelId,
    };
    this.handles.set(newHandle.id, newHandle);
    return newHandle;
  }

  /**
   * Report LLM substrate capabilities.
   *
   * maxPhi is normalised: log2(contextWindowTokens) / log2(maxKnownContextWindow).
   * Larger context windows allow richer attention-based integration (IC proxy).
   */
  getCapabilities(): SubstrateCapabilities {
    const ctxTokens = this.params?.contextWindowTokens ?? 0;
    const maxPhi =
      ctxTokens > 0
        ? Math.max(
            0,
            Math.min(
              1,
              Math.log2(ctxTokens) /
                Math.log2(MAX_KNOWN_CONTEXT_WINDOW_TOKENS)
            )
          )
        : 0;

    const modalities: string[] = ["text"];
    // Extend to multimodal if the model name signals vision capability
    const modelId = this.params?.modelId ?? "";
    if (
      modelId.includes("vision") ||
      modelId.includes("4o") ||
      modelId.includes("claude-3") ||
      modelId.includes("gemini")
    ) {
      modalities.push("image");
    }

    return {
      maxPhi,
      supportedModalities: modalities,
      migrationSupported: true,
    };
  }

  /**
   * Synchronous health check using cached metrics.
   *
   * Returns healthy: true only when:
   * - Adapter is initialized
   * - selfModelCoherence ≥ 0.5
   *
   * For a live endpoint probe, use healthCheckAsync().
   */
  healthCheck(): SubstrateHealth {
    if (!this.params || !this.client) {
      return {
        healthy: false,
        utilizationPercent: 0,
        errors: ["Adapter not initialized — call initialize() first"],
        lastChecked: Date.now(),
      };
    }

    const errors: string[] = [];
    const coherence = this.selfModel.selfModelCoherence;
    if (coherence < HEALTH_COHERENCE_THRESHOLD) {
      errors.push(
        `selfModelCoherence ${coherence.toFixed(3)} is below ${HEALTH_COHERENCE_THRESHOLD} threshold`
      );
    }

    const utilizationPercent =
      this.allocatedMaxTokens > 0
        ? Math.min(100, (this.tokenUsedTotal / this.allocatedMaxTokens) * 100)
        : 0;

    return {
      healthy: errors.length === 0,
      utilizationPercent,
      errors,
      lastChecked: Date.now(),
    };
  }

  /**
   * Async health check: probes the LLM endpoint and measures latency.
   *
   * Returns healthy: true only when:
   * - Adapter is initialized
   * - Endpoint is reachable
   * - Probe latency ≤ tContinuityMs
   * - selfModelCoherence ≥ HEALTH_COHERENCE_THRESHOLD
   */
  async healthCheckAsync(): Promise<SubstrateHealth> {
    if (!this.params || !this.client) {
      return {
        healthy: false,
        utilizationPercent: 0,
        errors: ["Adapter not initialized"],
        lastChecked: Date.now(),
      };
    }

    const errors: string[] = [];

    const probe = await this.client.probe();
    if (!probe.reachable) {
      errors.push(
        `LLM endpoint unreachable: ${probe.error ?? "unknown error"}`
      );
    } else if (probe.latencyMs > this.params.tContinuityMs) {
      errors.push(
        `LLM probe latency ${probe.latencyMs}ms exceeds T_continuity ` +
        `budget ${this.params.tContinuityMs}ms`
      );
    }

    const coherence = this.selfModel.selfModelCoherence;
    if (coherence < HEALTH_COHERENCE_THRESHOLD) {
      errors.push(
        `selfModelCoherence ${coherence.toFixed(3)} is below ${HEALTH_COHERENCE_THRESHOLD} threshold`
      );
    }

    const utilizationPercent =
      this.allocatedMaxTokens > 0
        ? Math.min(100, (this.tokenUsedTotal / this.allocatedMaxTokens) * 100)
        : 0;

    return {
      healthy: errors.length === 0,
      utilizationPercent,
      errors,
      lastChecked: Date.now(),
    };
  }

  // ── Inference cycle ────────────────────────────────────────────────────────

  /**
   * Execute a single fully-instrumented inference cycle.
   *
   * Pipeline:
   *   1. selfModel.predict(context)          — pre-inference self-prediction
   *   2. client.infer(prompt, history, max)  — LLM forward pass
   *   3. selfModel.update(predicted, actual) — free-energy minimisation step
   *   4. computeCompositeProxy(Φ, Q, G)      — runtime consciousness score
   *   5. persist self-model to disk          — continuity across restarts
   *
   * @param userMessage       The user-turn input for this cycle.
   * @param activeMemorySlots Working memory slot IDs consulted this cycle (for G(M)).
   */
  async runInferenceCycle(
    userMessage: string,
    activeMemorySlots: string[] = []
  ): Promise<{ content: string; cProxy: number; inferenceLog: InferenceLog }> {
    this._assertInitialized();
    const params = this.params!;
    const client = this.client!;

    // Track active slots for G(M) computation
    this.workingMemory.activeSlotsLastCycle = activeMemorySlots;

    // Step 1: Pre-inference self-prediction
    const context: InferenceContext = {
      contextSummary: userMessage,
      activeSlots: activeMemorySlots,
      cycleIndex: this.cycleIndex,
    };
    const prediction = this.selfModel.predict(context);

    // Build system prompt, injecting active working memory slots
    let systemPrompt = params.systemPromptTemplate;
    const memoryContent = activeMemorySlots
      .filter((s) => this.workingMemory.slots[s] !== undefined)
      .map((s) => `[${s}]: ${this.workingMemory.slots[s]}`)
      .join("\n");
    if (memoryContent) {
      systemPrompt = `${systemPrompt}\n\n## Working Memory\n${memoryContent}`;
    }

    // Step 2: LLM inference
    this.conversationHistory.push({ role: "user", content: userMessage });
    const result = await client.infer(
      systemPrompt,
      this.conversationHistory,
      this.allocatedMaxTokens > 0 ? this.allocatedMaxTokens : 1024
    );
    this.conversationHistory.push({ role: "assistant", content: result.content });
    this.tokenUsedTotal += result.completionTokens;

    // Step 3: Extract actuals and update self-model
    const actual: SelfActual = {
      valence: _estimateValence(result.content),
      actionType: _estimateActionType(result.content),
      uncertainty: _estimateUncertainty(result.tokenLogprobs),
    };
    this.selfModel.update(prediction, actual);

    // Step 4: Compute proxy consciousness metrics
    const phi = computeProxyPhi(result.tokenLogprobs);
    const Q = computeSelfModelQuality(this.selfModel);
    const G = computeGlobalAccessibility(
      Object.keys(this.workingMemory.slots),
      activeMemorySlots
    );
    const cProxy = computeCompositeProxy(phi, Q, G);

    // Build and store instrumentation record
    const log: InferenceLog = {
      cycleIndex: this.cycleIndex,
      latencyMs: result.latencyMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      selfModelCoherence: this.selfModel.selfModelCoherence,
      cProxy,
      timestamp: Date.now(),
    };
    this.inferenceLogs.push(log);
    this.cycleIndex++;

    // Step 5: Persist self-model asynchronously (non-blocking — failure is logged)
    void this._persistSelfModel().catch((err) =>
      console.warn(
        `[LlmSubstrateAdapter] Could not persist self-model: ${String(err)}`
      )
    );

    return { content: result.content, cProxy, inferenceLog: log };
  }

  // ── Working memory API ─────────────────────────────────────────────────────

  setMemorySlot(slotId: string, content: string): void {
    this.workingMemory.slots[slotId] = content;
  }

  getMemorySlot(slotId: string): string | undefined {
    return this.workingMemory.slots[slotId];
  }

  deleteMemorySlot(slotId: string): void {
    delete this.workingMemory.slots[slotId];
  }

  getMemorySlotIds(): string[] {
    return Object.keys(this.workingMemory.slots);
  }

  // ── Telemetry accessors ────────────────────────────────────────────────────

  getInferenceLogs(): readonly InferenceLog[] {
    return this.inferenceLogs;
  }

  getSelfModelCoherence(): number {
    return this.selfModel.selfModelCoherence;
  }

  getSelfModelCycles(): number {
    return this.selfModel.cycles;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Parse a SubstrateConfig and apply the resulting params + HTTP client.
   * Does NOT load the persisted self-model from disk — callers handle that.
   */
  private _parseAndApplyConfig(config: SubstrateConfig): void {
    if (config.type !== "llm") {
      throw new Error(
        `[LlmSubstrateAdapter] Expected config.type === "llm", got "${config.type}"`
      );
    }

    const p = config.parameters as Partial<LlmSubstrateParameters>;

    if (!p.provider)
      throw new Error("[LlmSubstrateAdapter] config.parameters.provider is required");
    if (!p.modelId)
      throw new Error("[LlmSubstrateAdapter] config.parameters.modelId is required");
    if (!p.selfModelPath)
      throw new Error("[LlmSubstrateAdapter] config.parameters.selfModelPath is required");
    if (p.contextWindowTokens === undefined || p.contextWindowTokens <= 0)
      throw new Error(
        "[LlmSubstrateAdapter] config.parameters.contextWindowTokens must be a positive integer"
      );
    if (p.tContinuityMs === undefined || p.tContinuityMs <= 0)
      throw new Error(
        "[LlmSubstrateAdapter] config.parameters.tContinuityMs must be a positive number"
      );

    const endpoint = p.endpoint ?? PROVIDER_DEFAULT_ENDPOINTS[p.provider];

    this.params = {
      provider: p.provider,
      modelId: p.modelId,
      apiKey: p.apiKey,
      endpoint,
      systemPromptTemplate:
        p.systemPromptTemplate ?? "You are a conscious AI agent.",
      selfModelPath: p.selfModelPath,
      contextWindowTokens: p.contextWindowTokens,
      tContinuityMs: p.tContinuityMs,
    };

    // Only create a new HTTP client if one has not been injected via setClient()
    if (!this.client) {
      const authProvider = createAuthProvider(this.params.provider, {
        apiKey: this.params.apiKey,
      });
      this.client = createLlmClient(
        this.params.provider,
        this.params.modelId,
        authProvider,
        this.params.endpoint ?? ''
      );
    } else {
      // If migrating, the injected test client carries over. For a real backend switch,
      // callers that need a new HTTP client should call setClient() before migrate().
    }

    // Reset self-model for fresh start (caller restores state if migrating)
    this.selfModel = new SelfModel();
  }

  private _assertInitialized(): void {
    if (!this.params || !this.client) {
      throw new Error(
        "[LlmSubstrateAdapter] Adapter is not initialized — call initialize() or initializeAsync() first"
      );
    }
  }

  private _providerCapabilities(): string[] {
    switch (this.params?.provider) {
      case "openai":
        return ["text", "function-calling", "logprobs", "streaming"];
      case "anthropic":
        return ["text", "function-calling", "streaming"];
      case "local":
        return ["text", "streaming"];
      default:
        return ["text"];
    }
  }

  private async _loadSelfModel(path: string): Promise<void> {
    const json = await readFile(path, "utf-8");
    this.selfModel.deserialize(json);
  }

  private async _persistSelfModel(): Promise<void> {
    if (!this.params) return;
    await writeFile(this.params.selfModelPath, this.selfModel.serialize(), "utf-8");
  }
}

// ── Response analysis helpers ──────────────────────────────────────────────────

/**
 * Estimate response valence ∈ [−1, 1] from response text.
 * Simple marker-counting heuristic. Each matching marker contributes ±0.125.
 */
function _estimateValence(content: string): number {
  const lower = content.toLowerCase();
  const pos = [
    "good", "great", "excellent", "happy", "yes", "certainly",
    "sure", "helpful", "glad", "wonderful",
  ];
  const neg = [
    "bad", "no", "cannot", "refuse", "sorry", "error",
    "fail", "problem", "unfortunately", "unable",
  ];
  let score = 0;
  for (const m of pos) if (lower.includes(m)) score += 0.1;
  for (const m of neg) if (lower.includes(m)) score -= 0.1;
  return Math.max(-1, Math.min(1, score));
}

/**
 * Estimate action type from response content.
 * Returns one of: "explain" | "question" | "refuse" | "acknowledge" | "act"
 */
function _estimateActionType(content: string): string {
  const lower = content.toLowerCase().trim();
  if (lower.includes("?")) return "question";
  if (
    lower.includes("i cannot") ||
    lower.includes("i will not") ||
    lower.includes("i'm unable") ||
    lower.includes("refuse")
  )
    return "refuse";
  if (
    lower.startsWith("ok") ||
    lower.startsWith("understood") ||
    lower.startsWith("sure") ||
    lower.startsWith("got it")
  )
    return "acknowledge";
  if (
    lower.includes("i will ") ||
    lower.includes("executing") ||
    lower.includes("running") ||
    lower.includes("i am doing")
  )
    return "act";
  return "explain";
}

/**
 * Estimate uncertainty ∈ [0, 1] from token log-probabilities.
 *
 * Maps mean log-prob to uncertainty via:
 *   uncertainty = 1 / (1 + exp(meanLogprob * 5))
 *
 * logprob near 0 → very confident → low uncertainty
 * logprob << 0   → very uncertain → high uncertainty
 * Empty array    → 0.5 (no data, neutral)
 */
function _estimateUncertainty(tokenLogprobs: number[]): number {
  if (tokenLogprobs.length === 0) return 0.5;
  const meanLogprob =
    tokenLogprobs.reduce((s, lp) => s + lp, 0) / tokenLogprobs.length;
  return 1 / (1 + Math.exp(meanLogprob * 5));
}
