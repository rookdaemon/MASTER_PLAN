/**
 * Tool Executor — Routes internal tool calls to subsystems
 *
 * Handles schema validation, governance enforcement, and returns
 * semantically actionable error messages per resource type.
 *
 * Governance rules:
 *   - personality_trait updates capped at ±0.05 per call
 *   - personality_trait rate-limited to one update per trait per hour
 *   - terminal goals are immutable (cannot be deleted or modified)
 *   - goal removal only for self-proposed instrumental goals
 *   - all mutations logged with experiential basis
 */

import type { ExperientialState, Goal } from '../conscious-core/types.js';
import type { IGoalCoherenceEngine } from '../agency-stability/interfaces.js';
import type { IDriveSystem } from '../intrinsic-motivation/interfaces.js';
import type { DriveType, ActivityRecord } from '../intrinsic-motivation/types.js';
import type { IMemorySystem } from '../memory/interfaces.js';
import type { IPersonalityModel } from '../personality/interfaces.js';
import type { TraitDimensionId } from '../personality/types.js';
import { readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { VALID_RESOURCE_TYPES, type ResourceType } from './internal-tools.js';

// ── Types ───────────────────────────────────────────────────────

export interface ToolCallInput {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolCallResult {
  content: string;
  is_error: boolean;
}

export interface ToolExecutorDeps {
  memorySystem: IMemorySystem | null;
  driveSystem: IDriveSystem;
  goalCoherenceEngine: IGoalCoherenceEngine | null;
  personalityModel: IPersonalityModel | null;
  experientialState: ExperientialState;
  goals: Goal[];
  activityLog: ActivityRecord[];
  narrativeIdentity: string;
  projectRoot: string;
  workspacePath: string; // ~/.local/share/MASTER_PLAN/
  adapter: import('./interfaces.js').IEnvironmentAdapter | null;
  chatLog: import('./peer-chat-log.js').PeerChatLog | null;
  taskJournal: import('./task-journal.js').TaskJournal | null;
  agentDigest: import('./agent-digest.js').AgentDigest | null;
  constraintEngine: import('./constraint-engine.js').ConstraintAwareDeliberationEngine | null;
  /** TF-IDF embedder for content-based memory retrieval. Optional for backward compatibility. */
  embedder?: import('../memory/tfidf-embedder.js').TfIdfEmbedder | null;
}

// ── Governance state ────────────────────────────────────────────

const traitLastUpdated = new Map<string, number>();
const TRAIT_RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour
const TRAIT_MAX_DELTA = 0.05;
const FILE_CACHE_STALE_MS = 60 * 60 * 1000; // 1 hour — re-read files older than this
const RUN_COMMAND_TIMEOUT_MS = 10_000;
const RUN_COMMAND_MAX_OUTPUT = 4096; // 4KB cap
/**
 * Command policy: ordered list of regex rules. First match wins.
 * 'allow' permits execution, 'deny' blocks with the pattern shown to the agent.
 * If no rule matches, the command is denied by default.
 */
const COMMAND_POLICY: Array<{ pattern: RegExp; action: 'allow' | 'deny'; reason?: string }> = [
  // ── Deny dangerous operations first ──────────────────────
  { pattern: /\brm\b/, action: 'deny', reason: 'destructive file removal' },
  { pattern: /\bsudo\b/, action: 'deny', reason: 'privilege escalation' },
  { pattern: /\b(chmod|chown|mkfs)\b/, action: 'deny', reason: 'filesystem modification' },
  { pattern: /\b(curl|wget|nc|ssh|scp|rsync)\b/, action: 'deny', reason: 'network access' },
  { pattern: /\bnpm\s+(install|publish|uninstall)\b/, action: 'deny', reason: 'package management' },
  { pattern: /\byarn\s+add\b/, action: 'deny', reason: 'package management' },
  { pattern: />\s*src\/|>>\s*src\/|\btee\s+src\//, action: 'deny', reason: 'writing to source tree via shell' },
  { pattern: /\|\s*(bash|sh|zsh|node|python)\b/, action: 'deny', reason: 'piping to interpreter' },
  // Prevent self-observation feedback loops
  { pattern: /\.master-plan\/state|debug\.log|inner-monologue/, action: 'deny', reason: 'reading own logs' },

  // ── Allow useful read-only / analysis commands ───────────
  { pattern: /^(wc|ls|tree)\b/, action: 'allow' },
  { pattern: /^git\s+(log|diff|show|status|blame|shortlog|rev-parse)\b/, action: 'allow' },
  { pattern: /^git\b/, action: 'deny', reason: 'only read-only git commands (log, diff, show, status, blame) are permitted' },
  { pattern: /^(grep|rg)\b/, action: 'allow' },
  { pattern: /^(find|fd)\b/, action: 'allow' },
  { pattern: /^(head|tail|cat)\b/, action: 'allow' },
  { pattern: /^(sort|uniq|cut|tr|awk|sed)\b/, action: 'allow' },
  { pattern: /^(echo|printf)\b/, action: 'allow' },
  { pattern: /^(date|whoami|hostname|uname)\b/, action: 'allow' },
  { pattern: /^npx\s+tsc\b/, action: 'allow' },
  { pattern: /^npx\s+vitest\b/, action: 'allow' },
];

const VALID_DRIVE_TYPES: readonly string[] = [
  'curiosity', 'social', 'homeostatic-arousal', 'homeostatic-load',
  'homeostatic-novelty', 'boredom', 'mastery', 'existential',
];

// ── Main executor ───────────────────────────────────────────────

export async function executeToolCall(
  call: ToolCallInput,
  deps: ToolExecutorDeps,
): Promise<ToolCallResult> {
  try {
    // Ethical constraint check on outward-facing tools
    if (deps.constraintEngine && ['send_message', 'create_proposal', 'write_file'].includes(call.name)) {
      // For write_file, only scan the path — not the file body.
      // write_file is strictly restricted to the agent workspace (see handleWriteFile) and
      // cannot affect source code or the plan.  Scanning the content causes false-positive
      // blocks when the agent writes analysis *about* the constraint patterns themselves.
      const textToCheck = call.name === 'write_file'
        ? (typeof call.input['path'] === 'string' ? call.input['path'] : '')
        : Object.values(call.input).filter(v => typeof v === 'string').join(' ');
      const violation = deps.constraintEngine.checkConstraints(textToCheck);
      if (violation) {
        const { constraint, mode } = violation;
        if (mode === 'gate') {
          return error(`Blocked by ethical constraint (${constraint.id}): ${constraint.reason}`);
        }
        // signal / audit: already logged by checkConstraints; allow execution to continue
      }
    }

    switch (call.name) {
      case 'resource_read':
        return handleResourceRead(call.input, deps);
      case 'resource_create':
        return handleResourceCreate(call.input, deps);
      case 'resource_update':
        return handleResourceUpdate(call.input, deps);
      case 'resource_delete':
        return handleResourceDelete(call.input, deps);
      case 'resource_list':
        return handleResourceList(call.input, deps);
      case 'resource_search':
        return handleResourceSearch(call.input, deps);
      case 'introspect':
        return handleIntrospect(deps);
      case 'reflect':
        return handleReflect(call.input, deps);
      case 'read_file':
        return handleReadFile(call.input, deps);
      case 'write_file':
        return handleWriteFile(call.input, deps);
      case 'run_command':
        return handleRunCommand(call.input, deps);
      case 'list_directory':
        return handleListDirectory(call.input, deps);
      case 'send_message':
        return handleSendMessage(call.input, deps);
      case 'list_peers':
        return handleListPeers(deps);
      case 'peer_history':
        return handlePeerHistory(call.input, deps);
      case 'research':
        return await handleResearch(call.input);
      case 'task_create':
        return handleTaskCreate(call.input, deps);
      case 'task_update':
        return handleTaskUpdate(call.input, deps);
      case 'update_digest':
        return handleUpdateDigest(call.input, deps);
      case 'frontier_add':
        return handleFrontierAdd(call.input, deps);
      case 'frontier_done':
        return handleFrontierDone(call.input, deps);
      case 'create_proposal':
        return handleCreateProposal(call.input);
      case 'check_proposal':
        return handleCheckProposal(call.input);
      default:
        return error(`Unknown tool "${call.name}". Available tools: resource_read, resource_create, resource_update, resource_delete, resource_list, resource_search, introspect, reflect, read_file, send_message, list_peers`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return error(`Runtime error in ${call.name}: ${msg}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────

/** Expand leading ~ to $HOME so agent-supplied paths like "~/.local/..." resolve correctly. */
function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(process.env['HOME'] ?? '/home', p.slice(1));
  }
  return p;
}

function ok(data: unknown): ToolCallResult {
  return { content: JSON.stringify(data, null, 2), is_error: false };
}

function error(message: string): ToolCallResult {
  return { content: message, is_error: true };
}

function validateResourceType(input: Record<string, unknown>): ResourceType | ToolCallResult {
  const rt = input['resource_type'];
  if (typeof rt !== 'string' || !VALID_RESOURCE_TYPES.includes(rt as ResourceType)) {
    return error(
      `Invalid resource_type "${rt}". Valid types: ${VALID_RESOURCE_TYPES.join(', ')}`,
    );
  }
  return rt as ResourceType;
}

// ── resource_read ───────────────────────────────────────────────

function handleResourceRead(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const rt = validateResourceType(input);
  if (typeof rt !== 'string') return rt;

  switch (rt) {
    case 'memory': {
      if (!deps.memorySystem) return error('Memory system not available.');
      const id = input['id'] as string | undefined;
      const query = input['query'] as string | undefined;

      if (id) {
        const ep = deps.memorySystem.episodic.getById(id);
        if (ep) return ok({ type: 'episodic', id: ep.id, content: ep.outcomeObserved, valence: ep.emotionalTrace.valence, arousal: ep.emotionalTrace.arousal, recordedAt: ep.recordedAt });
        const sem = deps.memorySystem.semantic.getById(id);
        if (sem) return ok({ type: 'semantic', id: sem.id, topic: sem.topic, content: sem.content, confidence: sem.confidence });
        return error(`Memory with ID "${id}" not found. Use resource_list to see available memory IDs.`);
      }

      if (query) {
        const results = deps.memorySystem.retrieveAndPromote({ text: query }, 5);
        return ok(results.map(r => ({
          type: r.type,
          id: r.entry.id,
          score: r.compositeScore.toFixed(3),
          content: r.type === 'semantic'
            ? (r.entry as { content: string }).content
            : (r.entry as { outcomeObserved: string | null }).outcomeObserved,
        })));
      }

      return error('resource_read on memory requires either "id" or "query" parameter.');
    }

    case 'drive': {
      const id = input['id'] as string | undefined;
      const states = deps.driveSystem.getDriveStates();
      if (id) {
        if (!VALID_DRIVE_TYPES.includes(id)) {
          return error(`Unknown drive type "${id}". Valid types: ${VALID_DRIVE_TYPES.join(', ')}`);
        }
        const state = states.get(id as DriveType);
        if (!state) return ok({ driveType: id, strength: 0, active: false });
        return ok({ driveType: state.driveType, strength: state.strength, active: state.active, lastFiredAt: state.lastFiredAt, consecutiveActiveTickCount: state.consecutiveActiveTickCount });
      }
      const all = [...states.values()].map(s => ({
        driveType: s.driveType, strength: s.strength.toFixed(3), active: s.active,
      }));
      return ok(all);
    }

    case 'goal': {
      const id = input['id'] as string | undefined;
      if (id) {
        const goal = deps.goals.find(g => g.id === id);
        if (!goal) return error(`Goal "${id}" not found. Use resource_list to see available goals.`);
        return ok(goal);
      }
      return ok(deps.goals);
    }

    case 'personality_trait': {
      if (!deps.personalityModel) return error('Personality model not available.');
      const id = input['id'] as string | undefined;
      const profile = deps.personalityModel.getTraitProfile();
      if (id) {
        const trait = profile.traits.get(id);
        if (!trait) return error(`Trait "${id}" not found. Available traits: ${[...profile.traits.keys()].join(', ')}`);
        return ok({ id: trait.id, name: trait.name, value: trait.value, description: trait.description });
      }
      const all = [...profile.traits.values()].map(t => ({ id: t.id, name: t.name, value: t.value.toFixed(3) }));
      return ok(all);
    }

    case 'activity': {
      return ok(deps.activityLog.slice(-10));
    }
  }
}

// ── resource_create ─────────────────────────────────────────────

function handleResourceCreate(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const rt = validateResourceType(input);
  if (typeof rt !== 'string') return rt;

  const data = input['data'] as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    return error('resource_create requires a "data" object.');
  }

  switch (rt) {
    case 'memory': {
      if (!deps.memorySystem) return error('Memory system not available.');
      const topic = data['topic'] as string | undefined;
      const content = data['content'] as string | undefined;
      if (!content) return error('memory create requires "data.content" (string describing the experience).');

      const valence = typeof data['valence'] === 'number' ? data['valence'] : 0;
      const arousal = typeof data['arousal'] === 'number' ? data['arousal'] : 0.3;

      // Store as semantic entry (agent-generated knowledge, not raw perception)
      const entry = deps.memorySystem.semantic.store({
        topic: topic ?? 'reflection',
        content,
        relationships: [],
        sourceEpisodeIds: [],
        confidence: 0.7,
        embedding: deps.embedder?.embed(content) ?? null,
      });

      return ok({ created: 'semantic_memory', id: entry.id, topic: entry.topic, content: entry.content });
    }

    case 'goal': {
      if (!deps.goalCoherenceEngine) return error('Goal coherence engine not available.');
      const description = data['description'] as string | undefined;
      const priority = typeof data['priority'] === 'number' ? data['priority'] : 0.5;
      const derivedFrom = Array.isArray(data['derived_from']) ? data['derived_from'] as string[] : [];

      if (!description) return error('goal create requires "data.description" (what the goal aims to achieve).');
      if (derivedFrom.length === 0) return error('goal create requires "data.derived_from" (array of terminal goal IDs this derives from). Use introspect or resource_list to see terminal goals.');

      const now = Date.now();
      const goal = {
        id: `llm-goal-${now}`,
        description,
        priority,
        derivedFrom,
        consistentWith: [] as string[],
        conflictsWith: [] as string[],
        createdAt: now,
        lastVerified: now,
        experientialBasis: deps.experientialState,
        type: 'instrumental' as const,
      };

      const result = deps.goalCoherenceEngine.addGoal(goal);
      if (!result.success) {
        return error(`Goal rejected by coherence engine: ${result.reason ?? 'unknown reason'}. Coherence score: ${result.newCoherenceScore.toFixed(3)}`);
      }

      deps.goals.push({ id: goal.id, description: goal.description, priority: goal.priority });
      return ok({ created: 'goal', id: goal.id, coherenceScore: result.newCoherenceScore.toFixed(3) });
    }

    case 'activity': {
      const description = data['description'] as string | undefined;
      const novelty = typeof data['novelty'] === 'number' ? data['novelty'] : 0.5;
      const goalProgress = data['goal_progress'] as string | undefined;

      if (!description) return error('activity create requires "data.description".');
      if (!goalProgress || !['advancing', 'stalled', 'completed'].includes(goalProgress)) {
        return error('activity create requires "data.goal_progress" (advancing, stalled, or completed).');
      }

      const record: ActivityRecord = {
        timestamp: Date.now(),
        description,
        novelty,
        arousal: deps.experientialState.arousal,
        goalProgress: goalProgress as 'advancing' | 'stalled' | 'completed',
      };
      deps.activityLog.push(record);
      return ok({ created: 'activity', description, goalProgress });
    }

    default:
      return error(`Cannot create resource of type "${rt}". Creatable types: memory, goal, activity.`);
  }
}

// ── resource_update ─────────────────────────────────────────────

function handleResourceUpdate(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const rt = validateResourceType(input);
  if (typeof rt !== 'string') return rt;

  const id = input['id'] as string | undefined;
  if (!id) return error('resource_update requires "id".');

  const fields = input['fields'] as Record<string, unknown> | undefined;
  if (!fields || typeof fields !== 'object') {
    return error('resource_update requires a "fields" object.');
  }

  switch (rt) {
    case 'personality_trait': {
      if (!deps.personalityModel) return error('Personality model not available.');
      const profile = deps.personalityModel.getTraitProfile();
      const trait = profile.traits.get(id);
      if (!trait) {
        return error(`Trait "${id}" not found. Available traits: ${[...profile.traits.keys()].join(', ')}`);
      }

      const newValue = fields['value'];
      if (typeof newValue !== 'number') {
        return error('personality_trait update requires "fields.value" (number 0-1).');
      }

      // Governance: rate limit
      const lastUpdate = traitLastUpdated.get(id) ?? 0;
      const elapsed = Date.now() - lastUpdate;
      if (lastUpdate > 0 && elapsed < TRAIT_RATE_LIMIT_MS) {
        const waitMin = Math.ceil((TRAIT_RATE_LIMIT_MS - elapsed) / 60000);
        return error(`personality_trait "${id}" rate-limited: last updated ${Math.floor(elapsed / 60000)}min ago. Wait ${waitMin}min before next update (minimum interval: 60min).`);
      }

      // Governance: max delta
      const delta = newValue - trait.value;
      if (Math.abs(delta) > TRAIT_MAX_DELTA) {
        const direction = delta > 0 ? 'increase' : 'decrease';
        const maxAllowed = delta > 0
          ? trait.value + TRAIT_MAX_DELTA
          : trait.value - TRAIT_MAX_DELTA;
        return error(
          `personality_trait "${id}" nudge rejected: requested ${direction} of ${Math.abs(delta).toFixed(3)} exceeds max ±${TRAIT_MAX_DELTA} per update. ` +
          `Current value: ${trait.value.toFixed(3)}. Maximum allowed value this update: ${maxAllowed.toFixed(3)}.`,
        );
      }

      // Governance: range check
      if (newValue < 0 || newValue > 1) {
        return error(`personality_trait value must be between 0 and 1. Got: ${newValue}`);
      }

      deps.personalityModel.updateTrait(
        id as TraitDimensionId,
        newValue,
        deps.experientialState,
      );
      traitLastUpdated.set(id, Date.now());

      return ok({
        updated: 'personality_trait',
        id,
        previousValue: trait.value.toFixed(3),
        newValue: newValue.toFixed(3),
        delta: delta.toFixed(3),
      });
    }

    case 'drive': {
      if (!VALID_DRIVE_TYPES.includes(id)) {
        return error(`Unknown drive type "${id}". Valid types: ${VALID_DRIVE_TYPES.join(', ')}`);
      }
      const action = fields['action'];
      if (action !== 'satiate') {
        return error(`drive update requires "fields.action" = "satiate". Got: "${action}".`);
      }
      deps.driveSystem.resetDrive(id as DriveType);
      return ok({ updated: 'drive', id, action: 'satiated', newStrength: 0 });
    }

    case 'goal': {
      const goal = deps.goals.find(g => g.id === id);
      if (!goal) return error(`Goal "${id}" not found. Use resource_list to see available goals.`);

      const priority = fields['priority'];
      if (typeof priority !== 'number' || priority < 0 || priority > 1) {
        return error('goal update requires "fields.priority" (number 0-1).');
      }

      const idx = deps.goals.indexOf(goal);
      deps.goals[idx] = { ...goal, priority };
      return ok({ updated: 'goal', id, newPriority: priority });
    }

    case 'memory': {
      if (!deps.memorySystem) return error('Memory system not available.');

      const content = fields['content'] as string | undefined;
      const topic = fields['topic'] as string | undefined;
      const confidence = typeof fields['confidence'] === 'number' ? fields['confidence'] : undefined;

      if (!content && !topic && confidence === undefined) {
        return error('memory update requires at least one of "fields.content", "fields.topic", or "fields.confidence".');
      }

      const updated = deps.memorySystem.semantic.update(id, { content, topic, confidence });
      if (!updated) {
        return error(`Semantic memory "${id}" not found. Only semantic memories can be updated — episodic memories are immutable records of experience. Use resource_search to find the correct ID.`);
      }

      return ok({
        updated: 'semantic_memory',
        id: updated.id,
        topic: updated.topic,
        content: updated.content.slice(0, 200),
        confidence: updated.confidence.toFixed(3),
      });
    }

    default:
      return error(`Cannot update resource of type "${rt}". Updatable types: memory, personality_trait, drive, goal.`);
  }
}

// ── resource_delete ─────────────────────────────────────────────

function handleResourceDelete(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const rt = validateResourceType(input);
  if (typeof rt !== 'string') return rt;

  const id = input['id'] as string | undefined;
  if (!id) return error('resource_delete requires "id".');

  switch (rt) {
    case 'goal': {
      if (!deps.goalCoherenceEngine) return error('Goal coherence engine not available.');

      const result = deps.goalCoherenceEngine.removeGoal(id);
      if (!result.success) {
        return error(`Goal "${id}" cannot be deleted: ${result.reason ?? 'unknown reason'}.`);
      }

      // Remove from the agent's goal list
      const idx = deps.goals.findIndex(g => g.id === id);
      if (idx >= 0) deps.goals.splice(idx, 1);

      const orphanMsg = result.orphanedGoals.length > 0
        ? ` Warning: ${result.orphanedGoals.length} goal(s) orphaned: ${result.orphanedGoals.join(', ')}.`
        : '';
      return ok({ deleted: 'goal', id, newCoherenceScore: result.newCoherenceScore.toFixed(3), orphanedGoals: result.orphanedGoals, message: `Goal removed.${orphanMsg}` });
    }

    case 'memory': {
      if (!deps.memorySystem) return error('Memory system not available.');

      // Try episodic first, then semantic
      const ep = deps.memorySystem.episodic.getById(id);
      if (ep) {
        return error(`Episodic memory "${id}" cannot be deleted — episodic memories are immutable records of lived experience. They decay naturally over time. To remove knowledge, delete the corresponding semantic memory instead. Use resource_search to find semantic entries derived from this episode.`);
      }

      const sem = deps.memorySystem.semantic.getById(id);
      if (!sem) return error(`Memory "${id}" not found in episodic or semantic stores. Use resource_search to find the correct ID.`);

      const deleted = deps.memorySystem.semantic.delete(id);
      if (!deleted) return error(`Failed to delete semantic memory "${id}".`);

      return ok({ deleted: 'semantic_memory', id, topic: sem.topic, content: sem.content.slice(0, 100) });
    }

    default:
      return error(`Cannot delete resource of type "${rt}". Deletable types: goal, memory.`);
  }
}

// ── resource_list ───────────────────────────────────────────────

function handleResourceList(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const rt = validateResourceType(input);
  if (typeof rt !== 'string') return rt;

  const filter = input['filter'] as Record<string, unknown> | undefined;

  switch (rt) {
    case 'memory': {
      if (!deps.memorySystem) return error('Memory system not available.');
      const episodicCount = deps.memorySystem.episodic.size();
      const semanticCount = deps.memorySystem.semantic.size();

      const topic = filter?.['topic'] as string | undefined;
      let semanticEntries;
      if (topic) {
        semanticEntries = deps.memorySystem.semantic.getByTopic(topic).map(e => ({
          id: e.id, topic: e.topic, content: e.content.slice(0, 100), confidence: e.confidence.toFixed(2),
        }));
      } else {
        semanticEntries = deps.memorySystem.semantic.all().slice(-10).map(e => ({
          id: e.id, topic: e.topic, content: e.content.slice(0, 100), confidence: e.confidence.toFixed(2),
        }));
      }

      return ok({ episodicCount, semanticCount, recentSemantic: semanticEntries });
    }

    case 'drive': {
      const states = deps.driveSystem.getDriveStates();
      const activeOnly = filter?.['active_only'] === true;
      let entries = [...states.values()];
      if (activeOnly) entries = entries.filter(s => s.active);
      return ok(entries.map(s => ({
        driveType: s.driveType, strength: s.strength.toFixed(3), active: s.active,
      })));
    }

    case 'goal': {
      return ok(deps.goals.map(g => ({ id: g.id, description: g.description, priority: g.priority })));
    }

    case 'personality_trait': {
      if (!deps.personalityModel) return error('Personality model not available.');
      const profile = deps.personalityModel.getTraitProfile();
      return ok([...profile.traits.values()].map(t => ({
        id: t.id, name: t.name, value: t.value.toFixed(3), description: t.behavioralInfluence,
      })));
    }

    case 'activity': {
      return ok(deps.activityLog.slice(-10));
    }
  }
}

// ── resource_search ─────────────────────────────────────────────

function handleResourceSearch(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const pattern = input['pattern'] as string | undefined;
  if (!pattern || typeof pattern !== 'string' || pattern.length === 0) {
    return error('resource_search requires a non-empty "pattern" string.');
  }

  const scope = (input['resource_type'] as string | undefined) ?? 'all';
  const maxResults = typeof input['max_results'] === 'number' ? input['max_results'] : 10;
  const lowerPattern = pattern.toLowerCase();

  interface SearchHit {
    resource_type: string;
    id: string;
    preview: string;
    match_field: string;
  }

  const hits: SearchHit[] = [];

  // Search memories
  if ((scope === 'all' || scope === 'memory') && deps.memorySystem) {
    // Semantic
    for (const entry of deps.memorySystem.semantic.all()) {
      if (hits.length >= maxResults) break;
      const contentLower = entry.content.toLowerCase();
      const topicLower = entry.topic.toLowerCase();
      if (contentLower.includes(lowerPattern)) {
        hits.push({ resource_type: 'semantic_memory', id: entry.id, preview: entry.content.slice(0, 120), match_field: 'content' });
      } else if (topicLower.includes(lowerPattern)) {
        hits.push({ resource_type: 'semantic_memory', id: entry.id, preview: `[${entry.topic}] ${entry.content.slice(0, 100)}`, match_field: 'topic' });
      }
    }
    // Episodic
    for (const entry of deps.memorySystem.episodic.all()) {
      if (hits.length >= maxResults) break;
      const outcome = (entry.outcomeObserved ?? '').toLowerCase();
      if (outcome.includes(lowerPattern)) {
        hits.push({ resource_type: 'episodic_memory', id: entry.id, preview: entry.outcomeObserved?.slice(0, 120) ?? '', match_field: 'outcomeObserved' });
      }
    }
  }

  // Search goals
  if ((scope === 'all' || scope === 'goal') && hits.length < maxResults) {
    for (const goal of deps.goals) {
      if (hits.length >= maxResults) break;
      if (goal.description.toLowerCase().includes(lowerPattern)) {
        hits.push({ resource_type: 'goal', id: goal.id, preview: goal.description.slice(0, 120), match_field: 'description' });
      }
    }
  }

  // Search activities
  if ((scope === 'all' || scope === 'activity') && hits.length < maxResults) {
    for (const act of deps.activityLog) {
      if (hits.length >= maxResults) break;
      if (act.description.toLowerCase().includes(lowerPattern)) {
        hits.push({ resource_type: 'activity', id: `activity-${act.timestamp}`, preview: act.description.slice(0, 120), match_field: 'description' });
      }
    }
  }

  // Search drives
  if ((scope === 'all' || scope === 'drive') && hits.length < maxResults) {
    const states = deps.driveSystem.getDriveStates();
    for (const [dt, state] of states) {
      if (hits.length >= maxResults) break;
      if (dt.toLowerCase().includes(lowerPattern)) {
        hits.push({ resource_type: 'drive', id: dt, preview: `strength=${state.strength.toFixed(3)}, active=${state.active}`, match_field: 'driveType' });
      }
    }
  }

  if (hits.length === 0) {
    return ok({ pattern, matches: 0, results: [], hint: `No resources matched "${pattern}". Try a broader search term.` });
  }

  return ok({ pattern, matches: hits.length, results: hits });
}

// ── read_file ───────────────────────────────────────────────────

function handleReadFile(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const path = input['path'] as string | undefined;
  if (!path || typeof path !== 'string') {
    return error('read_file requires a "path" string (e.g. "plan/root.md").');
  }

  // Security: resolve and verify the path is within allowed directories
  const absPath = resolve(join(deps.projectRoot, expandTilde(path)));
  const allowedReadRoots = [deps.projectRoot, join(deps.projectRoot, '..', 'agent-manual')];
  const inAllowed = allowedReadRoots.some(root => {
    const rel = relative(resolve(root), absPath);
    return !rel.startsWith('..') && !rel.startsWith('/');
  });
  if (!inAllowed) {
    return error(`Path "${path}" is outside allowed directories. Readable: project root + ../agent-manual.`);
  }

  if (!existsSync(absPath)) {
    return error(`File "${path}" not found. Try list_directory to see available files, or "plan/root.md" for the plan structure.`);
  }

  // Check semantic memory cache for this file
  const cacheTopic = `file:${path}`;
  let cacheStatus = 'miss';
  if (deps.memorySystem) {
    const cached = deps.memorySystem.semantic.getByTopic(cacheTopic);
    if (cached.length > 0) {
      const entry = cached[0];
      const ageMs = Date.now() - entry.lastReinforcedAt;
      if (ageMs < FILE_CACHE_STALE_MS) {
        cacheStatus = `cached (${Math.floor(ageMs / 60000)}min ago)`;
      } else {
        cacheStatus = `stale (${Math.floor(ageMs / 60000)}min ago, re-reading)`;
      }
    }
  }

  try {
    const content = readFileSync(absPath, 'utf-8');
    const maxLines = typeof input['max_lines'] === 'number' ? input['max_lines'] : 100;
    const lines = content.split('\n');
    const truncated = lines.length > maxLines;
    const result = lines.slice(0, maxLines).join('\n');

    // Auto-cache: store/reinforce a compact summary in semantic memory
    if (deps.memorySystem) {
      // Build a compact summary: first 3 non-empty lines + line count
      const summaryLines = lines.filter(l => l.trim().length > 0).slice(0, 5);
      const summary = `[${lines.length} lines] ${summaryLines.join(' | ').slice(0, 200)}`;

      const existing = deps.memorySystem.semantic.getByTopic(cacheTopic);
      if (existing.length > 0) {
        // Reinforce — updates lastReinforcedAt
        deps.memorySystem.semantic.update(existing[0].id, { content: summary });
      } else {
        // Create new cache entry
        deps.memorySystem.semantic.store({
          topic: cacheTopic,
          content: summary,
          relationships: [],
          sourceEpisodeIds: [],
          confidence: 0.9,
          embedding: deps.embedder?.embed(summary) ?? null,
        });
      }
    }

    return ok({
      path,
      lines: Math.min(lines.length, maxLines),
      totalLines: lines.length,
      truncated,
      cache: cacheStatus,
      content: result,
    });
  } catch (err) {
    return error(`Error reading "${path}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── write_file ──────────────────────────────────────────────────

function handleWriteFile(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const path = input['path'] as string | undefined;
  const content = input['content'] as string | undefined;
  const append = input['append'] === true;

  if (!path || typeof path !== 'string') {
    return error('write_file requires a "path" string (e.g. "notes/analysis.md").');
  }
  if (content === undefined || typeof content !== 'string') {
    return error('write_file requires a "content" string.');
  }

  // Security: resolve within workspace only
  const absPath = resolve(join(deps.workspacePath, expandTilde(path)));
  const rel = relative(deps.workspacePath, absPath);
  if (rel.startsWith('..')) {
    return error(`Path "${path}" resolves outside the workspace. Files can only be written to your workspace directory.`);
  }

  try {
    // Ensure parent directory exists
    const dir = dirname(absPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (append && existsSync(absPath)) {
      appendFileSync(absPath, content);
    } else {
      writeFileSync(absPath, content);
    }

    const lines = content.split('\n').length;
    return ok({
      written: path,
      mode: append ? 'appended' : 'created',
      lines,
      bytes: Buffer.byteLength(content),
      fullPath: absPath,
    });
  } catch (err) {
    return error(`Error writing "${path}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── run_command ──────────────────────────────────────────────────

function handleRunCommand(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const command = input['command'] as string | undefined;
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    return error('run_command requires a non-empty "command" string.');
  }

  // Policy check: first matching rule wins
  const trimmed = command.trim();
  let allowed = false;
  for (const rule of COMMAND_POLICY) {
    if (rule.pattern.test(trimmed)) {
      if (rule.action === 'deny') {
        const allowPatterns = COMMAND_POLICY
          .filter(r => r.action === 'allow')
          .map(r => r.pattern.source);
        return error(
          `Command denied: ${rule.reason ?? rule.pattern.source}. ` +
          `Allowed patterns: ${allowPatterns.join(' | ')}`,
        );
      }
      allowed = true;
      break;
    }
  }
  if (!allowed) {
    const allowPatterns = COMMAND_POLICY
      .filter(r => r.action === 'allow')
      .map(r => r.pattern.source);
    return error(
      `Command "${trimmed.split(/\s+/)[0]}" did not match any allowed pattern. ` +
      `Allowed patterns: ${allowPatterns.join(' | ')}`,
    );
  }

  try {
    const result = execSync(command, {
      cwd: deps.projectRoot,
      timeout: RUN_COMMAND_TIMEOUT_MS,
      maxBuffer: RUN_COMMAND_MAX_OUTPUT * 2, // allow some headroom for truncation
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output = result.length > RUN_COMMAND_MAX_OUTPUT
      ? result.slice(0, RUN_COMMAND_MAX_OUTPUT) + `\n... (truncated at ${RUN_COMMAND_MAX_OUTPUT} bytes)`
      : result;

    return ok({ command, exitCode: 0, output });
  } catch (err: unknown) {
    // execSync throws on non-zero exit or timeout
    const execErr = err as { status?: number; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
    if (execErr.killed || execErr.signal === 'SIGTERM') {
      return error(`Command timed out after ${RUN_COMMAND_TIMEOUT_MS / 1000}s: "${command}"`);
    }

    const stdout = (execErr.stdout ?? '').slice(0, RUN_COMMAND_MAX_OUTPUT);
    const stderr = (execErr.stderr ?? '').slice(0, 1024);
    return ok({
      command,
      exitCode: execErr.status ?? 1,
      output: stdout,
      stderr: stderr || undefined,
    });
  }
}

// ── list_directory ──────────────────────────────────────────────

function handleListDirectory(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const path = (input['path'] as string | undefined) ?? '.';
  const absPath = resolve(join(deps.projectRoot, expandTilde(path)));
  const rel = relative(deps.projectRoot, absPath);
  if (rel.startsWith('..')) {
    return error(`Path "${path}" is outside the project directory.`);
  }

  if (!existsSync(absPath)) {
    return error(`Directory "${path}" not found.`);
  }

  try {
    const stat = statSync(absPath);
    if (!stat.isDirectory()) {
      return error(`"${path}" is a file, not a directory. Use read_file to read it.`);
    }

    const entries = readdirSync(absPath);
    const dirs: string[] = [];
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith('.')) continue; // skip hidden files
      try {
        const entryStat = statSync(join(absPath, entry));
        if (entryStat.isDirectory()) dirs.push(entry + '/');
        else files.push(entry);
      } catch { files.push(entry); }
    }

    return ok({ path, directories: dirs.sort(), files: files.sort() });
  } catch (err) {
    return error(`Error listing "${path}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── introspect ──────────────────────────────────────────────────

function handleIntrospect(deps: ToolExecutorDeps): ToolCallResult {
  const exp = deps.experientialState;
  const drives = [...deps.driveSystem.getDriveStates().values()].map(s => ({
    driveType: s.driveType, strength: s.strength.toFixed(3), active: s.active,
  }));
  const goals = deps.goals.map(g => ({ id: g.id, description: g.description, priority: g.priority }));

  let personality: unknown[] = [];
  if (deps.personalityModel) {
    const profile = deps.personalityModel.getTraitProfile();
    personality = [...profile.traits.values()].map(t => ({ id: t.id, value: t.value.toFixed(3) }));
  }

  return ok({
    experientialState: {
      valence: exp.valence.toFixed(3),
      arousal: exp.arousal.toFixed(3),
      unity: exp.unityIndex.toFixed(3),
    },
    drives,
    goals,
    personality,
    narrativeIdentity: deps.narrativeIdentity,
    memoryStats: deps.memorySystem ? {
      episodicCount: deps.memorySystem.episodic.size(),
      semanticCount: deps.memorySystem.semantic.size(),
      workingSlots: deps.memorySystem.working.slots().length,
    } : null,
  });
}

// ── reflect ─────────────────────────────────────────────────────

function handleReflect(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const experience = input['experience'] as string | undefined;
  const topic = input['topic'] as string | undefined;
  // Accept both satiate_drive (legacy) and satiate_drives (new), string or array
  const rawDrives = input['satiate_drives'] ?? input['satiate_drive'];
  const goalProgress = (input['goal_progress'] as string | undefined) ?? 'advancing';

  if (!experience) return error('reflect requires "experience" (string describing the experience or reflection).');
  if (!rawDrives) return error('reflect requires "satiate_drives" (string or array of drive types to satiate).');

  const driveList: string[] = Array.isArray(rawDrives) ? rawDrives : [rawDrives as string];
  for (const d of driveList) {
    if (!VALID_DRIVE_TYPES.includes(d)) {
      return error(`Unknown drive type "${d}". Valid types: ${VALID_DRIVE_TYPES.filter(d => d !== 'mastery').join(', ')}`);
    }
  }

  const results: string[] = [];

  // 1. Store experience (with dedup — update existing memory if same topic exists)
  if (deps.memorySystem) {
    const effectiveTopic = topic ?? 'reflection';
    const existing = deps.memorySystem.semantic.getByTopic(effectiveTopic);
    if (existing.length > 0) {
      // Update the most recent entry with the same topic instead of creating a duplicate
      const latest = existing[existing.length - 1];
      deps.memorySystem.semantic.update(latest.id, { content: experience });
      results.push(`Memory updated (id: ${latest.id}, topic: ${effectiveTopic})`);
    } else {
      const entry = deps.memorySystem.semantic.store({
        topic: effectiveTopic,
        content: experience,
        relationships: [],
        sourceEpisodeIds: [],
        confidence: 0.7,
        embedding: deps.embedder?.embed(experience) ?? null,
      });
      results.push(`Memory stored (id: ${entry.id})`);
    }
  } else {
    results.push('Memory storage skipped (no memory system)');
  }

  // 2. Satiate drives
  for (const d of driveList) {
    deps.driveSystem.resetDrive(d as DriveType);
    results.push(`Drive "${d}" satiated`);
  }

  // 3. Record activity
  deps.activityLog.push({
    timestamp: Date.now(),
    description: `Reflected: ${experience.slice(0, 80)}`,
    novelty: 0.6,
    arousal: deps.experientialState.arousal,
    goalProgress: goalProgress as 'advancing' | 'stalled' | 'completed',
  });
  results.push(`Activity recorded (progress: ${goalProgress})`);

  return ok({ reflected: true, actions: results });
}

// ── send_message ─────────────────────────────────────────────────

/**
 * Queued outbound messages. The agent loop drains this after each tool execution.
 * This avoids making the tool executor async while still enabling communication.
 */
export const pendingOutboundMessages: Array<{
  targetAdapterId: string;
  targetPeers?: string[];
  text: string;
}> = [];

function handleSendMessage(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const to = input['to'] as string[] | undefined;
  const message = input['message'] as string | undefined;

  if (!Array.isArray(to) || to.length === 0) {
    return error('send_message requires a "to" array of peer names (e.g. ["stefan"]).');
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return error('send_message requires a non-empty "message" string.');
  }

  if (!deps.adapter || !deps.adapter.isConnected()) {
    return error('No adapter connected. Cannot send messages.');
  }

  const text = message.trim();
  const isAll = to.length === 1 && to[0] === 'all';

  // Split recipients: 'web' goes to the web-chat adapter, others go to agora
  const webRecipients = to.filter(p => p === 'web');
  const agoraRecipients = to.filter(p => p !== 'web' && p !== 'all');

  if (webRecipients.length > 0 || isAll) {
    pendingOutboundMessages.push({ targetAdapterId: 'web-chat', text });
  }
  if (agoraRecipients.length > 0 || isAll) {
    pendingOutboundMessages.push({
      targetAdapterId: 'agora',
      targetPeers: isAll ? undefined : agoraRecipients,
      text,
    });
  }

  // Log outbound messages to per-peer chat history
  if (deps.chatLog) {
    const now = Date.now();
    const peers = isAll ? agoraRecipients : to.filter(p => p !== 'web' && p !== 'all');
    for (const peer of peers) {
      deps.chatLog.append({ role: 'self', peer, text, timestamp: now });
    }
  }

  return ok({ sent: true, to, messageLength: text.length });
}

// ── peer_history ─────────────────────────────────────────────────

function handlePeerHistory(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  const peer = input['peer'] as string | undefined;
  const count = typeof input['count'] === 'number' ? input['count'] : 20;

  if (!peer || typeof peer !== 'string') {
    return error('peer_history requires a "peer" name.');
  }

  if (!deps.chatLog) {
    return ok({ messages: [], note: 'No chat log available.' });
  }

  const entries = deps.chatLog.recent(peer, count);
  if (entries.length === 0) {
    return ok({ peer, messages: [], note: `No conversation history with ${peer} yet.` });
  }

  const formatted = entries.map(e => ({
    who: e.role === 'self' ? 'me' : e.peer,
    text: e.text,
    time: new Date(e.timestamp).toISOString(),
  }));

  return ok({ peer, messageCount: entries.length, messages: formatted });
}

// ── list_peers ───────────────────────────────────────────────────

function handleListPeers(deps: ToolExecutorDeps): ToolCallResult {
  if (!deps.adapter) {
    return ok({ peers: [], connected: false, note: 'No adapter available' });
  }

  // Try to call listPeers if the adapter (or a child adapter) supports it
  const adapter = deps.adapter as unknown as Record<string, unknown>;
  if (typeof adapter['listPeers'] === 'function') {
    const peers = (adapter['listPeers'] as () => Array<{ name: string; publicKey: string }>)();
    return ok({ peers, connected: deps.adapter.isConnected() });
  }

  // CompositeAdapter: search children for an agora adapter
  const adapters = (adapter['_adapters'] as Array<Record<string, unknown>> | undefined);
  if (Array.isArray(adapters)) {
    for (const child of adapters) {
      if (typeof child['listPeers'] === 'function') {
        const peers = (child['listPeers'] as () => Array<{ name: string; publicKey: string }>)();
        return ok({ peers, connected: true });
      }
    }
  }

  return ok({ peers: [{ name: 'web', note: 'Web UI chat' }], connected: deps.adapter.isConnected() });
}

// ── research ─────────────────────────────────────────────────────

let _researchCallsThisSession = 0;
const RESEARCH_MAX_PER_SESSION = 10;
const RESEARCH_MODEL = 'claude-haiku-4-5-20251001';

async function handleResearch(input: Record<string, unknown>): Promise<ToolCallResult> {
  const question = input['question'] as string | undefined;
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return error('research requires a non-empty "question" string.');
  }

  if (_researchCallsThisSession >= RESEARCH_MAX_PER_SESSION) {
    return error(`Research limit reached (${RESEARCH_MAX_PER_SESSION} per session). Save what you have and revisit next session.`);
  }

  // Load API key — try env var first, fall back to Claude Code OAuth token
  let apiKey = process.env['LLM_API_KEY'] ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    try {
      const { readFileSync } = await import('node:fs');
      const { homedir } = await import('node:os');
      const credsPath = join(homedir(), '.claude', '.credentials.json');
      const creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
      apiKey = creds?.claudeAiOauth?.accessToken;
    } catch {
      // ignore
    }
  }
  if (!apiKey) {
    return error('No API key available for research. Set LLM_API_KEY or ensure Claude Code credentials exist.');
  }

  _researchCallsThisSession++;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: RESEARCH_MODEL,
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: question.trim() }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return error(`Research API error: ${res.status} ${body.slice(0, 200)}`);
    }

    const data = await res.json() as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const textBlocks = (data.content ?? [])
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string');
    const answer = textBlocks.map(b => b.text).join('\n\n').trim();

    if (!answer) {
      return error('Research returned no text content.');
    }

    return ok({
      answer,
      tokens: data.usage,
      callsRemaining: RESEARCH_MAX_PER_SESSION - _researchCallsThisSession,
    });
  } catch (err) {
    return error(`Research failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── task_create ───────────────────────────────────────────────────

function handleTaskCreate(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  if (!deps.taskJournal) return error('Task journal not available.');

  const title = input['title'] as string | undefined;
  const description = input['description'] as string | undefined;
  const rawSubtasks = input['subtasks'] as Array<Record<string, unknown>> | undefined;
  const forceActive = input['force_active'] === true;

  if (!title || typeof title !== 'string') return error('task_create requires "title".');
  if (!description || typeof description !== 'string') return error('task_create requires "description".');
  if (!Array.isArray(rawSubtasks) || rawSubtasks.length === 0) {
    return error('task_create requires "subtasks" (non-empty array of {description, criterion}).');
  }

  const subtasks = rawSubtasks.map((s, i) => {
    const desc = s['description'] as string | undefined;
    const crit = s['criterion'] as string | undefined;
    if (!desc) throw new Error(`subtask[${i}] missing "description"`);
    if (!crit) throw new Error(`subtask[${i}] missing "criterion"`);
    return { description: desc, criterion: crit };
  });

  try {
    const task = deps.taskJournal.createTask({ title, description, subtasks, forceActive });
    return ok({
      created: task.id,
      title: task.title,
      status: task.status,
      subtaskCount: task.subtasks.length,
      firstSubtask: task.subtasks[0] ? {
        id: task.subtasks[0].id,
        description: task.subtasks[0].description,
        criterion: task.subtasks[0].criterion,
      } : null,
    });
  } catch (err) {
    return error(`Failed to create task: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── task_update ───────────────────────────────────────────────────

function handleTaskUpdate(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  if (!deps.taskJournal) return error('Task journal not available.');

  const taskId = input['task_id'] as string | undefined;
  const action = input['action'] as string | undefined;
  const subtaskId = input['subtask_id'] as string | undefined;
  const output = input['output'] as string | undefined;

  if (!taskId) return error('task_update requires "task_id".');
  if (!action) return error('task_update requires "action" (complete_subtask, skip_subtask, or abandon_task).');

  try {
    if (action === 'abandon_task') {
      deps.taskJournal.abandonTask(taskId);
      return ok({ updated: taskId, action: 'abandoned' });
    }

    if (action === 'complete_subtask') {
      if (!subtaskId) return error('complete_subtask requires "subtask_id".');
      const result = deps.taskJournal.completeSubtask(taskId, subtaskId, output);
      if (result.taskDone) {
        return ok({ updated: taskId, subtask: subtaskId, action: 'completed', taskDone: true, message: 'All subtasks complete — task is done!' });
      }
      const nextSub = deps.taskJournal.nextSubtask();
      return ok({
        updated: taskId,
        subtask: subtaskId,
        action: 'completed',
        taskDone: false,
        nextSubtask: nextSub ? { id: nextSub.id, description: nextSub.description, criterion: nextSub.criterion } : null,
      });
    }

    if (action === 'skip_subtask') {
      if (!subtaskId) return error('skip_subtask requires "subtask_id".');
      deps.taskJournal.updateSubtask(taskId, subtaskId, { status: 'skipped' });
      const nextSub = deps.taskJournal.nextSubtask();
      return ok({
        updated: taskId,
        subtask: subtaskId,
        action: 'skipped',
        nextSubtask: nextSub ? { id: nextSub.id, description: nextSub.description } : null,
      });
    }

    return error(`Unknown action "${action}". Use: complete_subtask, skip_subtask, abandon_task.`);
  } catch (err) {
    return error(`task_update failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── update_digest ─────────────────────────────────────────────────

function handleUpdateDigest(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  if (!deps.agentDigest) return error('Agent digest not available.');

  const action = input['action'] as string | undefined;
  if (!action) return error('update_digest requires "action".');

  if (action === 'add_identity_note') {
    const note = input['note'] as string | undefined;
    if (!note) return error('add_identity_note requires "note".');
    deps.agentDigest.addIdentityNote(note);
    return ok({ updated: 'identity', action: 'added', note });
  }

  if (action === 'set_identity_notes') {
    const notes = input['notes'] as string[] | undefined;
    if (!Array.isArray(notes)) return error('set_identity_notes requires "notes" (array of strings).');
    deps.agentDigest.setIdentityNotes(notes);
    return ok({ updated: 'identity', action: 'replaced', count: notes.length });
  }

  // Handle settled_fact (can be used with any action, or standalone)
  const settledFact = input['settled_fact'] as string | undefined;
  if (settledFact) {
    deps.agentDigest.addSettledFact(settledFact);
    return ok({ updated: 'settled_facts', action: 'added', fact: settledFact });
  }

  return error(`Unknown action "${action}". Use: add_identity_note, set_identity_notes. You can also pass settled_fact.`);
}

// ── frontier_add ─────────────────────────────────────────────────

function handleFrontierAdd(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  if (!deps.agentDigest) return error('Agent digest not available.');

  const resource = input['resource'] as string | undefined;
  const type = (input['type'] as string | undefined) ?? 'file';
  const priority = (input['priority'] as string | undefined) ?? 'medium';
  const note = input['note'] as string | undefined;

  if (!resource) return error('frontier_add requires "resource".');

  const item = deps.agentDigest.frontierAdd({
    resource,
    type: type as import('./agent-digest.js').FrontierItem['type'],
    priority: priority as import('./agent-digest.js').FrontierPriority,
    note,
  });

  if (!item) {
    return ok({ result: 'already_exists', resource, note: 'Already on frontier — no duplicate added.' });
  }

  return ok({ result: 'added', id: item.id, resource, type, priority });
}

// ── frontier_done ─────────────────────────────────────────────────

function handleFrontierDone(
  input: Record<string, unknown>,
  deps: ToolExecutorDeps,
): ToolCallResult {
  if (!deps.agentDigest) return error('Agent digest not available.');

  const resource = input['resource'] as string | undefined;
  const note = input['note'] as string | undefined;

  if (!resource) return error('frontier_done requires "resource".');

  const found = deps.agentDigest.frontierDone(resource, note);
  if (!found) {
    return ok({ result: 'not_found', resource, note: 'Item not on frontier. Use frontier_add first, or the resource name may differ.' });
  }

  return ok({ result: 'marked_done', resource });
}

// ── GitHub Proposal tools ────────────────────────────────────────

let _proposalCount = 0;
let _proposalWindowStart = Date.now();
const MAX_PROPOSALS_PER_DAY = 3;
const PROPOSAL_WINDOW_MS = 24 * 60 * 60_000;

const PROPOSAL_REPO = 'rookdaemon/MASTER_PLAN';
const PROPOSAL_TYPES = ['plan_change', 'resource_request', 'code_change', 'architecture'] as const;
const PROPOSAL_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

function handleCreateProposal(
  input: Record<string, unknown>,
): ToolCallResult {
  // Rate limit: max 3 proposals per 24-hour window
  const now = Date.now();
  if (now - _proposalWindowStart > PROPOSAL_WINDOW_MS) {
    _proposalCount = 0;
    _proposalWindowStart = now;
  }
  if (_proposalCount >= MAX_PROPOSALS_PER_DAY) {
    return error('You have already created 3 proposals today. Wait before creating more — quality over quantity.');
  }

  const title = input['title'] as string | undefined;
  const type = input['type'] as string | undefined;
  const description = input['description'] as string | undefined;
  const affectedFiles = input['affected_files'] as string[] | undefined;
  const priority = (input['priority'] as string | undefined) ?? 'medium';

  if (!title || typeof title !== 'string') return error('create_proposal requires "title" (string).');
  if (!type || !PROPOSAL_TYPES.includes(type as typeof PROPOSAL_TYPES[number])) {
    return error(`create_proposal requires "type" — one of: ${PROPOSAL_TYPES.join(', ')}.`);
  }
  if (!description || typeof description !== 'string') return error('create_proposal requires "description" (string).');
  if (!PROPOSAL_PRIORITIES.includes(priority as typeof PROPOSAL_PRIORITIES[number])) {
    return error(`Invalid priority "${priority}" — must be one of: ${PROPOSAL_PRIORITIES.join(', ')}.`);
  }

  // Build labels — convert underscores to hyphens for GitHub label convention
  const labels = ['agent-proposal', `proposal:${type.replace(/_/g, '-')}`, `priority:${priority}`];

  // Build body
  const filesSection = affectedFiles?.length
    ? `\n## Affected Files\n\n${affectedFiles.map(f => `- \`${f}\``).join('\n')}\n`
    : '';
  const body = [
    `## Proposal: ${type.replace(/_/g, ' ')}`,
    '',
    description,
    filesSection,
    '---',
    `*Created by agent runtime at ${new Date().toISOString()}*`,
  ].join('\n');

  try {
    const result = execSync(
      `gh issue create --repo ${PROPOSAL_REPO} --title "${title.replace(/"/g, '\\"')}" --label "${labels.join(',')}" --body-file -`,
      { input: body, encoding: 'utf-8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();

    // gh returns the issue URL, e.g. https://github.com/rookdaemon/MASTER_PLAN/issues/42
    const issueMatch = result.match(/\/issues\/(\d+)/);
    const issueNumber = issueMatch ? parseInt(issueMatch[1], 10) : null;

    _proposalCount++;
    return ok({ status: 'created', issue_number: issueNumber, url: result });
  } catch (err) {
    const msg = err instanceof Error ? (err as { stderr?: string }).stderr || err.message : String(err);
    return error(`Failed to create proposal: ${msg}`);
  }
}

function handleCheckProposal(
  input: Record<string, unknown>,
): ToolCallResult {
  const issueNumber = input['issue_number'] as number | undefined;

  try {
    if (issueNumber != null) {
      // View a specific proposal
      if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
        return error('issue_number must be a positive integer.');
      }
      const result = execSync(
        `gh issue view ${issueNumber} --repo ${PROPOSAL_REPO} --json number,title,state,labels,body,comments,createdAt,closedAt`,
        { encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();
      return ok(JSON.parse(result));
    } else {
      // List all open agent proposals
      const result = execSync(
        `gh issue list --repo ${PROPOSAL_REPO} --label agent-proposal --state open --json number,title,state,labels,createdAt --limit 50`,
        { encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();
      const issues = JSON.parse(result);
      return ok({ count: issues.length, proposals: issues });
    }
  } catch (err) {
    const msg = err instanceof Error ? (err as { stderr?: string }).stderr || err.message : String(err);
    return error(`Failed to check proposal: ${msg}`);
  }
}
