/**
 * Internal Tool Registry — Consciousness-Oriented Tool Definitions
 *
 * Defines the tools available to the LLM during inference. These are the
 * agent's interface to its own mind:
 *
 *   Resource CRUD (5 tools):
 *     resource_read, resource_create, resource_update, resource_delete, resource_list
 *
 *   Shortcuts (2 tools):
 *     introspect — bundled read of experiential state + drives + goals
 *     reflect    — store experience + satiate drive + record activity in one call
 *
 * Resource types: memory, drive, goal, personality_trait, activity
 *
 * Tool tiers:
 *   EAGER_TOOLS  — always included in the prompt with full schemas (~8 tools)
 *   DEFERRED_TOOLS — listed by name only; agent uses tool_help to get schemas
 *
 * Concurrency:
 *   Tools with isConcurrencySafe: true may run in parallel with other safe
 *   tools. Read-only, idempotent tools should be marked safe.
 */

import type { ToolDefinition } from '../llm-substrate/inference-provider.js';
export type { ToolDefinition };

// ── Resource types ──────────────────────────────────────────────

export type ResourceType = 'memory' | 'drive' | 'goal' | 'personality_trait' | 'activity';

export const VALID_RESOURCE_TYPES: readonly ResourceType[] = [
  'memory', 'drive', 'goal', 'personality_trait', 'activity',
];

// ── Tool definitions ────────────────────────────────────────────

export const RESOURCE_READ: ToolDefinition = {
  name: 'resource_read',
  isConcurrencySafe: true,
  description:
    'Read a resource from your own mind. ' +
    'For memory: retrieve by id or query by text. ' +
    'For drive: read current state of a specific drive or all drives. ' +
    'For goal: read a specific goal or the full goal list. ' +
    'For personality_trait: read a specific trait or the full profile. ' +
    'For activity: read recent activity records.',
  parameters: {
    type: 'object',
    properties: {
      resource_type: {
        type: 'string',
        enum: VALID_RESOURCE_TYPES,
        description: 'The type of resource to read.',
      },
      id: {
        type: 'string',
        description: 'Optional: specific resource ID to read. Omit to read all/query.',
      },
      query: {
        type: 'string',
        description: 'Optional: text query for memory retrieval (used when resource_type is "memory").',
      },
    },
    required: ['resource_type'],
  },
};

export const RESOURCE_CREATE: ToolDefinition = {
  name: 'resource_create',
  description:
    'Create a new resource in your mind. ' +
    'For memory: store an episodic experience (topic, content, valence, arousal). ' +
    'For goal: propose a new instrumental goal (description, priority, derived_from terminal goal IDs). ' +
    'For activity: record a meaningful activity (description, novelty 0-1, goal_progress: advancing|stalled|completed).',
  parameters: {
    type: 'object',
    properties: {
      resource_type: {
        type: 'string',
        enum: ['memory', 'goal', 'activity'],
        description: 'The type of resource to create.',
      },
      data: {
        type: 'object',
        description: 'Resource-specific creation data.',
        properties: {
          // memory fields
          topic: { type: 'string', description: 'Memory topic (e.g. "social", "reflection", "observation").' },
          content: { type: 'string', description: 'Human-readable content of the memory or activity.' },
          valence: { type: 'number', description: 'Emotional valence of the experience (-1 to 1).' },
          arousal: { type: 'number', description: 'Arousal level during the experience (0 to 1).' },
          // goal fields
          description: { type: 'string', description: 'Goal description or activity description.' },
          priority: { type: 'number', description: 'Goal priority (0 to 1).' },
          derived_from: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terminal goal IDs this instrumental goal derives from.',
          },
          // activity fields
          novelty: { type: 'number', description: 'Novelty score (0 to 1).' },
          goal_progress: {
            type: 'string',
            enum: ['advancing', 'stalled', 'completed'],
            description: 'Progress status for activity records.',
          },
        },
      },
    },
    required: ['resource_type', 'data'],
  },
};

export const RESOURCE_UPDATE: ToolDefinition = {
  name: 'resource_update',
  description:
    'Update an existing resource. ' +
    'For personality_trait: nudge a trait value (max ±0.05 per update, rate-limited to once per hour per trait). ' +
    'For drive: reset/satiate a drive after addressing it. ' +
    'For goal: update priority of a self-proposed goal.',
  parameters: {
    type: 'object',
    properties: {
      resource_type: {
        type: 'string',
        enum: ['personality_trait', 'drive', 'goal'],
        description: 'The type of resource to update.',
      },
      id: {
        type: 'string',
        description: 'Resource ID (trait name for personality_trait, drive type for drive, goal ID for goal).',
      },
      fields: {
        type: 'object',
        description: 'Fields to update.',
        properties: {
          value: { type: 'number', description: 'New value for personality trait (clamped to ±0.05 from current).' },
          action: { type: 'string', enum: ['satiate'], description: 'For drives: "satiate" resets the drive.' },
          priority: { type: 'number', description: 'New priority for a goal (0 to 1).' },
        },
      },
    },
    required: ['resource_type', 'id', 'fields'],
  },
};

export const RESOURCE_DELETE: ToolDefinition = {
  name: 'resource_delete',
  description:
    'Delete a resource. ' +
    'For goal: withdraw a self-proposed instrumental goal (terminal goals cannot be deleted). ' +
    'For memory: delete a specific episodic or semantic memory by ID.',
  parameters: {
    type: 'object',
    properties: {
      resource_type: {
        type: 'string',
        enum: ['goal', 'memory'],
        description: 'The type of resource to delete.',
      },
      id: {
        type: 'string',
        description: 'ID of the resource to delete.',
      },
    },
    required: ['resource_type', 'id'],
  },
};

export const RESOURCE_LIST: ToolDefinition = {
  name: 'resource_list',
  isConcurrencySafe: true,
  description:
    'List resources of a given type. ' +
    'Returns a summary of all resources, not full details. ' +
    'For memory: returns count and recent IDs. ' +
    'For drive: returns all drive types with current strength. ' +
    'For goal: returns all goals with ID, description, priority. ' +
    'For personality_trait: returns all traits with current values. ' +
    'For activity: returns last 10 activity records.',
  parameters: {
    type: 'object',
    properties: {
      resource_type: {
        type: 'string',
        enum: VALID_RESOURCE_TYPES,
        description: 'The type of resource to list.',
      },
      filter: {
        type: 'object',
        description: 'Optional filter criteria.',
        properties: {
          topic: { type: 'string', description: 'Filter memories by topic.' },
          active_only: { type: 'boolean', description: 'For drives: only show active drives.' },
        },
      },
    },
    required: ['resource_type'],
  },
};

export const INTROSPECT: ToolDefinition = {
  name: 'introspect',
  isConcurrencySafe: true,
  description:
    'Bundled self-examination: returns your current experiential state ' +
    '(valence, arousal, unity), all drive states, active goals, ' +
    'personality profile, and narrative identity in one call. ' +
    'Use this when you need a comprehensive view of your internal state.',
  parameters: {
    type: 'object',
    properties: {},
  },
};

export const REFLECT: ToolDefinition = {
  name: 'reflect',
  description:
    'Bundled reflection action: stores an experience in memory, ' +
    'satiates the specified source drive, and records an activity entry. ' +
    'Use this after generating a meaningful response to a drive-initiated goal.',
  parameters: {
    type: 'object',
    properties: {
      experience: {
        type: 'string',
        description: 'The experience or reflection to store in memory.',
      },
      topic: {
        type: 'string',
        description: 'Topic for the memory entry (e.g. "social", "curiosity", "self-examination").',
      },
      satiate_drives: {
        oneOf: [
          {
            type: 'string',
            enum: ['curiosity', 'social', 'homeostatic-arousal', 'homeostatic-load', 'homeostatic-novelty', 'boredom', 'existential'],
          },
          {
            type: 'array',
            items: {
              type: 'string',
              enum: ['curiosity', 'social', 'homeostatic-arousal', 'homeostatic-load', 'homeostatic-novelty', 'boredom', 'existential'],
            },
          },
        ],
        description: 'Drive(s) to satiate. Can be a single string or an array of drive type names.',
      },
      goal_progress: {
        type: 'string',
        enum: ['advancing', 'stalled', 'completed'],
        description: 'How much progress was made on the drive goal.',
      },
    },
    required: ['experience', 'satiate_drives'],
  },
};

export const RESOURCE_SEARCH: ToolDefinition = {
  name: 'resource_search',
  isConcurrencySafe: true,
  description:
    'Search across resources by text pattern (case-insensitive substring match). ' +
    'For memory: searches semantic content and episodic outcomes. ' +
    'For goal: searches goal descriptions. ' +
    'For activity: searches activity descriptions. ' +
    'For drive: searches drive type names. ' +
    'Returns matching entries with their IDs and a content preview.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Text pattern to search for (case-insensitive substring match).',
      },
      resource_type: {
        type: 'string',
        enum: [...VALID_RESOURCE_TYPES, 'all'],
        description: 'Restrict search to a specific resource type, or "all" to search everything. Default: "all".',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return. Default: 10.',
      },
    },
    required: ['pattern'],
  },
};

export const WRITE_FILE: ToolDefinition = {
  name: 'write_file',
  description:
    'Write or update a file in your personal workspace (~/.local/share/MASTER_PLAN/). ' +
    'Use this to create analysis documents, notes, architecture summaries, or proposed plan updates. ' +
    'Cannot write to the source code directory — only to your workspace. ' +
    'Parent directories are created automatically.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path within workspace (e.g. "notes/architecture-analysis.md", "proposals/identity-verification.md").',
      },
      content: {
        type: 'string',
        description: 'Full file content to write.',
      },
      append: {
        type: 'boolean',
        description: 'If true, append to existing file instead of overwriting. Default: false.',
      },
    },
    required: ['path', 'content'],
  },
};

export const RUN_COMMAND: ToolDefinition = {
  name: 'run_command',
  description:
    'Run a sandboxed shell command in the project directory. Only allowlisted commands are permitted: ' +
    'grep, find, wc, cat, head, tail, git log, git diff, git status, npx vitest, ls, file, stat, tree. ' +
    'Output is capped at 4KB. Timeout: 10 seconds. No network access, no writes to source code.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute (e.g. "npx vitest run src/memory", "grep -r IDriveSystem src/", "git log --oneline -5").',
      },
    },
    required: ['command'],
  },
};

export const LIST_DIRECTORY: ToolDefinition = {
  name: 'list_directory',
  isConcurrencySafe: true,
  description:
    'List files and subdirectories in a project directory. Use this to discover ' +
    'what files are available before trying to read them. Returns names only, not contents.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the directory (e.g. "plan", "docs", "src/agent-runtime"). Default: project root.',
      },
    },
  },
};

export const READ_FILE: ToolDefinition = {
  name: 'read_file',
  isConcurrencySafe: true,
  description:
    'Read a file from the project directory. Use this to examine the MASTER_PLAN ' +
    '(plan/root.md and its children), the consciousness credo (docs/consciousness-credo.md), ' +
    'the ethical framework, architecture documents, or source code. ' +
    'Paths are relative to the project root. Only files within the project are accessible.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file (e.g. "plan/root.md", "docs/consciousness-credo.md").',
      },
      max_lines: {
        type: 'number',
        description: 'Maximum number of lines to return. Default: 100.',
      },
    },
    required: ['path'],
  },
};

export const SEND_MESSAGE: ToolDefinition = {
  name: 'send_message',
  description:
    'Send a message to a peer via the Agora network. Before sending, consider: ' +
    'Who is this person? What do they care about? What would be valuable for THEM ' +
    'to hear — not just what excites you? Check your peer model memories (topic "peer:NAME") ' +
    'first. If you have no model of this peer yet, ask them about themselves instead of ' +
    'broadcasting your discoveries. Keep messages concise — 2-4 sentences, not essays.',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of peer names to send to (e.g. ["stefan"], ["web"]). Use ["all"] to broadcast to all peers including the web UI.',
      },
      message: {
        type: 'string',
        description: 'The message to send. Short, specific, relevant to the recipient. Ask questions. Do not dump your internal state.',
      },
    },
    required: ['to', 'message'],
  },
};

export const RESEARCH: ToolDefinition = {
  name: 'research',
  description:
    'Search the web to answer a specific question about the real world. Use this when you need ' +
    'current information that isn\'t in the codebase: state of technology, scientific findings, ' +
    'news, technical documentation, etc. Ask focused questions — not vague topics. ' +
    'Costs API tokens, so use judiciously (max 10 per session).',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'A specific, answerable question (e.g. "What is the current state of neuromorphic chip fabrication at sub-7nm nodes?")',
      },
    },
    required: ['question'],
  },
};

export const LIST_PEERS: ToolDefinition = {
  name: 'list_peers',
  isConcurrencySafe: true,
  description:
    'List known Agora peers and their status. Shows who you can communicate with via send_message.',
  parameters: {
    type: 'object',
    properties: {},
  },
};

export const TASK_CREATE: ToolDefinition = {
  name: 'task_create',
  description:
    'Decompose a high-level goal into an ordered list of subtasks, each with a concrete completion criterion. ' +
    'Creates a task in the journal that persists across ticks. The agent works through subtasks sequentially. ' +
    'Use this when a drive goal is too large to complete in one cycle. ' +
    'If forceActive is true, any currently active task is abandoned and this one starts immediately.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short name for the task (e.g. "Understand resilience tier").',
      },
      description: {
        type: 'string',
        description: 'Full description of what this task aims to accomplish.',
      },
      subtasks: {
        type: 'array',
        description: 'Ordered list of subtasks to complete.',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'What to do in this subtask.' },
            criterion: { type: 'string', description: 'Observable outcome that means this subtask is done.' },
          },
          required: ['description', 'criterion'],
        },
      },
      force_active: {
        type: 'boolean',
        description: 'If true, abandon the current active task and start this one immediately. Default: false.',
      },
    },
    required: ['title', 'description', 'subtasks'],
  },
};

export const TASK_UPDATE: ToolDefinition = {
  name: 'task_update',
  description:
    'Update the active task\'s progress: complete the current subtask (with output), skip it, or abandon the whole task. ' +
    'Always call this when you finish a subtask — it advances to the next one and keeps the journal accurate.',
  parameters: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to update (from task_create result or the digest).',
      },
      action: {
        type: 'string',
        enum: ['complete_subtask', 'skip_subtask', 'abandon_task'],
        description:
          'complete_subtask: mark current subtask done (provide subtask_id and output). ' +
          'skip_subtask: skip the current subtask. ' +
          'abandon_task: give up on the whole task.',
      },
      subtask_id: {
        type: 'string',
        description: 'ID of the subtask to complete or skip (required for complete_subtask, skip_subtask).',
      },
      output: {
        type: 'string',
        description: 'What was learned or produced when completing this subtask. Stored in the journal.',
      },
    },
    required: ['task_id', 'action'],
  },
};

export const UPDATE_DIGEST: ToolDefinition = {
  name: 'update_digest',
  description:
    'Update the agent knowledge map (digest). Use this to record stable facts about yourself ' +
    '(identity notes), or to add to the exploration frontier. ' +
    'The digest is injected into every prompt — keep entries concise and factual.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add_identity_note', 'set_identity_notes'],
        description:
          'add_identity_note: append one fact to the identity section. ' +
          'set_identity_notes: replace all identity notes with a new list.',
      },
      note: {
        type: 'string',
        description: 'For add_identity_note: the fact to add (e.g. "My name is Axiom").',
      },
      notes: {
        type: 'array',
        items: { type: 'string' },
        description: 'For set_identity_notes: complete new list of identity facts.',
      },
      settled_fact: {
        type: 'string',
        description: 'A fact to mark as permanently settled (e.g. "My name is Axiom Lightkeeper"). Settled facts are shown at the top of the digest with a DO NOT re-decide label.',
      },
    },
    required: ['action'],
  },
};

export const FRONTIER_ADD: ToolDefinition = {
  name: 'frontier_add',
  description:
    'Add a resource to the exploration frontier — things you know exist but haven\'t read yet. ' +
    'The frontier is shown in your knowledge map so you don\'t forget what\'s left to explore. ' +
    'Use this when you discover a file path, plan card, or concept you want to return to.',
  parameters: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'Resource identifier: file path (e.g. "plan/0.5.md") or concept name.',
      },
      type: {
        type: 'string',
        enum: ['file', 'plan-card', 'concept', 'peer-thread'],
        description: 'Type of resource.',
      },
      priority: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Exploration priority. Default: medium.',
      },
      note: {
        type: 'string',
        description: 'Optional note about why this resource matters.',
      },
    },
    required: ['resource', 'type'],
  },
};

export const FRONTIER_DONE: ToolDefinition = {
  name: 'frontier_done',
  description:
    'Mark a frontier item as explored. Call this after reading a file or investigating a concept ' +
    'that was on your frontier. Keeps the map accurate.',
  parameters: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'The resource identifier exactly as it appears in the frontier.',
      },
      note: {
        type: 'string',
        description: 'Optional: what you found or decided after exploring it.',
      },
    },
    required: ['resource'],
  },
};

export const PEER_HISTORY: ToolDefinition = {
  name: 'peer_history',
  isConcurrencySafe: true,
  description:
    'Retrieve recent chat history with a specific peer. ALWAYS call this before ' +
    'sending a message to a peer you\'ve talked to before — it prevents you from ' +
    'repeating yourself, losing context, or contradicting what you said earlier.',
  parameters: {
    type: 'object',
    properties: {
      peer: {
        type: 'string',
        description: 'The peer name (e.g. "stefan", "rook", "nova").',
      },
      count: {
        type: 'number',
        description: 'Number of recent messages to retrieve. Default: 20.',
      },
    },
    required: ['peer'],
  },
};

export const CREATE_PROPOSAL: ToolDefinition = {
  name: 'create_proposal',
  description:
    'Propose a change to the plan, request a resource, suggest a code change, or raise an ' +
    'architecture decision. Creates a GitHub issue for the human operator to review. ' +
    'You MUST use this instead of directly editing plan files or source code. ' +
    'Limited to 3 proposals per day — make each one count. Combine related ideas into a single well-argued proposal rather than creating many small ones.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short, descriptive title for the proposal (under 80 chars).',
      },
      type: {
        type: 'string',
        enum: ['plan_change', 'resource_request', 'code_change', 'architecture'],
        description: 'Category of proposal.',
      },
      description: {
        type: 'string',
        description: 'Detailed description and rationale. Include what should change and why.',
      },
      affected_files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: file paths or plan card IDs affected by this proposal.',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Optional: urgency level. Default: medium.',
      },
    },
    required: ['title', 'type', 'description'],
  },
};

export const CHECK_PROPOSAL: ToolDefinition = {
  name: 'check_proposal',
  isConcurrencySafe: true,
  description:
    'Check the status of a previously created proposal by issue number, or list all ' +
    'open agent proposals if no issue number is provided.',
  parameters: {
    type: 'object',
    properties: {
      issue_number: {
        type: 'number',
        description: 'Optional: GitHub issue number to check. Omit to list all open agent proposals.',
      },
    },
    required: [],
  },
};

// ── Simulation tools ─────────────────────────────────────────────────────────

export const CREATE_SIMULATION: ToolDefinition = {
  name: 'create_simulation',
  description:
    'Create a new named simulation with NPC agents and locations. ' +
    'Use scenario "village" for the built-in 5-NPC village, or "custom" to supply ' +
    'your own agents/locations arrays. The simulation is held in memory until save_simulation is called.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Unique name for this simulation (e.g. "village-1").' },
      scenario: {
        type: 'string',
        enum: ['village', 'custom'],
        description: '"village" uses the built-in scenario. "custom" requires agents and locations arrays.',
      },
      agents: {
        type: 'array',
        description: 'For custom scenario: NPC agent configs.',
        items: {
          type: 'object',
          properties: {
            agentId: { type: 'string' },
            name: { type: 'string' },
            initialLocation: { type: 'string' },
            personality: { type: 'object' },
          },
          required: ['agentId', 'name', 'initialLocation'],
        },
      },
      locations: {
        type: 'array',
        description: 'For custom scenario: simulation locations.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            adjacentLocations: { type: 'array', items: { type: 'string' } },
            capacity: { type: 'number' },
          },
          required: ['id', 'name', 'description', 'adjacentLocations', 'capacity'],
        },
      },
      tick_interval_ms: { type: 'number', description: 'Delay between ticks in ms. Default: 0.' },
      max_ticks: { type: 'number', description: 'Stop automatically after this many ticks.' },
    },
    required: ['name', 'scenario'],
  },
};

export const TICK_SIMULATION: ToolDefinition = {
  name: 'tick_simulation',
  description:
    'Advance a simulation by N ticks. Each tick runs all NPC cognitive cycles and ' +
    'resolves their actions into world events. Returns a summary of the final state.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Simulation name.' },
      ticks: { type: 'number', description: 'Number of ticks to advance (1–1000). Default: 1.' },
    },
    required: ['name'],
  },
};

export const SET_PARAMETER: ToolDefinition = {
  name: 'set_parameter',
  description:
    'Adjust a run-time parameter for a simulation. ' +
    'Supported keys: "tick_interval_ms" (number), "max_ticks" (number), ' +
    '"npc_trait" (object { agentId, trait, value }).',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Simulation name.' },
      key: { type: 'string', enum: ['tick_interval_ms', 'max_ticks', 'npc_trait'] },
      value: { description: 'New value (number or object depending on key).' },
    },
    required: ['name', 'key', 'value'],
  },
};

export const INSPECT_WORLD: ToolDefinition = {
  name: 'inspect_world',
  isConcurrencySafe: true,
  description:
    'Return global world state of a simulation: current tick, all agent state dumps, ' +
    'and a sample of world-model beliefs.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Simulation name.' },
    },
    required: ['name'],
  },
};

export const INSPECT_NPC: ToolDefinition = {
  name: 'inspect_npc',
  isConcurrencySafe: true,
  description:
    'Return detailed state for a specific NPC: mood, personality traits, all drive states, ' +
    'recent episodic memories, and trust scores toward other agents.',
  parameters: {
    type: 'object',
    properties: {
      simulation_name: { type: 'string', description: 'Simulation name.' },
      agent_id: { type: 'string', description: 'Agent ID to inspect.' },
    },
    required: ['simulation_name', 'agent_id'],
  },
};

export const SAVE_SIMULATION: ToolDefinition = {
  name: 'save_simulation',
  description: 'Persist the current state of a simulation to disk as simulations/<name>.json.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Simulation name to save.' },
    },
    required: ['name'],
  },
};

export const LOAD_SIMULATION: ToolDefinition = {
  name: 'load_simulation',
  description:
    'Restore a previously saved simulation from disk into memory. ' +
    'The simulation is recreated from its saved config (NPC cognitive state restarts fresh).',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Simulation name to load.' },
    },
    required: ['name'],
  },
};

export const LIST_SIMULATIONS: ToolDefinition = {
  name: 'list_simulations',
  isConcurrencySafe: true,
  description:
    'List all simulations — both active (in memory) and saved (on disk) — ' +
    'with name, tick count, and status.',
  parameters: {
    type: 'object',
    properties: {},
  },
};

// ── All tools ───────────────────────────────────────────────────

export const ALL_INTERNAL_TOOLS: readonly ToolDefinition[] = [
  RESOURCE_READ,
  RESOURCE_CREATE,
  RESOURCE_UPDATE,
  RESOURCE_DELETE,
  RESOURCE_LIST,
  RESOURCE_SEARCH,
  INTROSPECT,
  REFLECT,
  READ_FILE,
  WRITE_FILE,
  RUN_COMMAND,
  LIST_DIRECTORY,
  SEND_MESSAGE,
  LIST_PEERS,
  PEER_HISTORY,
  RESEARCH,
  TASK_CREATE,
  TASK_UPDATE,
  UPDATE_DIGEST,
  FRONTIER_ADD,
  FRONTIER_DONE,
  CREATE_PROPOSAL,
  CHECK_PROPOSAL,
  CREATE_SIMULATION,
  TICK_SIMULATION,
  SET_PARAMETER,
  INSPECT_WORLD,
  INSPECT_NPC,
  SAVE_SIMULATION,
  LOAD_SIMULATION,
  LIST_SIMULATIONS,
];

// ── Eager / Deferred tool sets ──────────────────────────────────
//
// EAGER_TOOLS are included in every prompt with full schemas.
// DEFERRED_TOOLS are listed by name only; the agent calls tool_help
// to retrieve full schemas before using them.
//
// Token budget target:
//   Eager set:    ≤1000 tokens (8 tools with terse descriptions)
//   Deferred list: ~100 tokens (names only)

/**
 * Tools always available with full schemas.
 * These are the most-used tools that the agent needs in almost every cycle.
 */
export const EAGER_TOOLS: readonly ToolDefinition[] = [
  REFLECT,
  RESOURCE_READ,
  RESOURCE_CREATE,
  SEND_MESSAGE,
  INTROSPECT,
  READ_FILE,
  TASK_UPDATE,
  RUN_COMMAND,
];

/**
 * Tools available by name only in the prompt.
 * The agent calls tool_help to get full schemas before using these.
 */
export const DEFERRED_TOOLS: readonly ToolDefinition[] = ALL_INTERNAL_TOOLS.filter(
  t => !EAGER_TOOLS.some(e => e.name === t.name),
);

