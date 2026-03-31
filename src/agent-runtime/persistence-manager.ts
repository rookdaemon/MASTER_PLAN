/**
 * Persistence Manager — Agent Runtime
 *
 * Manages save/load of subsystem state to a state directory on disk.
 * All file I/O goes through an injectable IFileSystem so tests run
 * against InMemoryFileSystem without touching real disk.
 *
 * Persisted artifacts:
 *   - memory-snapshot.json:            MemorySnapshot (three-tier memory state)
 *   - personality-snapshot.json:       PersonalitySnapshot (trait profile)
 *   - drive-snapshot.json:             DriveSnapshot (drive accumulation, cooldowns)
 *   - simulations/<name>.json:         SimulationSnapshot (named simulation state)
 */

import type { IFileSystem } from "./filesystem.js";
import type { MemorySnapshot } from "../memory/types.js";
import type { PersonalitySnapshot } from "../personality/types.js";
import type { DriveSnapshot } from "../intrinsic-motivation/types.js";
import type { SimulationSnapshot } from "../simulation/types.js";
import { join } from "node:path";

// ── File names ───────────────────────────────────────────────

const MEMORY_SNAPSHOT_FILE = "memory-snapshot.json";
const PERSONALITY_SNAPSHOT_FILE = "personality-snapshot.json";
export const DRIVE_SNAPSHOT_FILE = "drive-snapshot.json";
const SIMULATIONS_DIR = "simulations";

// ── PersistenceManager ───────────────────────────────────────

export class PersistenceManager {
  private readonly _stateDir: string;
  private readonly _fs: IFileSystem;

  constructor(stateDir: string, fs: IFileSystem) {
    this._stateDir = stateDir;
    this._fs = fs;
  }

  /** Ensure the state directory exists. */
  async initialize(): Promise<void> {
    await this._fs.mkdir(this._stateDir, { recursive: true });
  }

  /** Whether any persisted state exists in the state directory. */
  hasState(): boolean {
    return (
      this._fs.exists(this._memoryPath()) ||
      this._fs.exists(this._personalityPath()) ||
      this._fs.exists(this._drivePath())
    );
  }

  // ── Memory ─────────────────────────────────────────────────

  async saveMemorySnapshot(snapshot: MemorySnapshot): Promise<void> {
    const json = JSON.stringify(snapshot);
    await this._fs.writeFile(this._memoryPath(), json, "utf-8");
  }

  async loadMemorySnapshot(): Promise<MemorySnapshot | null> {
    if (!this._fs.exists(this._memoryPath())) return null;
    const json = await this._fs.readFile(this._memoryPath(), "utf-8");
    return JSON.parse(json) as MemorySnapshot;
  }

  // ── Personality ────────────────────────────────────────────

  async savePersonalitySnapshot(snapshot: PersonalitySnapshot): Promise<void> {
    const json = JSON.stringify(snapshot);
    await this._fs.writeFile(this._personalityPath(), json, "utf-8");
  }

  async loadPersonalitySnapshot(): Promise<PersonalitySnapshot | null> {
    if (!this._fs.exists(this._personalityPath())) return null;
    const json = await this._fs.readFile(this._personalityPath(), "utf-8");
    return JSON.parse(json) as PersonalitySnapshot;
  }

  // ── Drive ──────────────────────────────────────────────────

  async saveDriveSnapshot(snapshot: DriveSnapshot): Promise<void> {
    const json = JSON.stringify(snapshot);
    await this._fs.writeFile(this._drivePath(), json, "utf-8");
  }

  async loadDriveSnapshot(): Promise<DriveSnapshot | null> {
    if (!this._fs.exists(this._drivePath())) return null;
    const json = await this._fs.readFile(this._drivePath(), "utf-8");
    return JSON.parse(json) as DriveSnapshot;
  }

  // ── Simulation snapshots ───────────────────────────────────

  /** Persist a simulation snapshot under simulations/<name>.json. */
  async saveSimulationSnapshot(snapshot: SimulationSnapshot): Promise<void> {
    await this._fs.mkdir(this._simulationsDir(), { recursive: true });
    await this._fs.writeFile(
      this._simulationPath(snapshot.name),
      JSON.stringify(snapshot),
      "utf-8",
    );
  }

  /** Load a previously saved simulation snapshot by name. Returns null if not found. */
  async loadSimulationSnapshot(name: string): Promise<SimulationSnapshot | null> {
    const path = this._simulationPath(name);
    if (!this._fs.exists(path)) return null;
    const json = await this._fs.readFile(path, "utf-8");
    return JSON.parse(json) as SimulationSnapshot;
  }

  /** List names of all saved simulation snapshots. */
  async listSimulationSnapshots(): Promise<string[]> {
    const files = await this._fs.listFiles(this._simulationsDir());
    return files
      .filter(f => f.endsWith(".json"))
      .map(f => f.slice(0, -".json".length));
  }

  // ── Internal paths ─────────────────────────────────────────

  private _memoryPath(): string {
    return join(this._stateDir, MEMORY_SNAPSHOT_FILE);
  }

  private _personalityPath(): string {
    return join(this._stateDir, PERSONALITY_SNAPSHOT_FILE);
  }

  private _drivePath(): string {
    return join(this._stateDir, DRIVE_SNAPSHOT_FILE);
  }

  private _simulationsDir(): string {
    return join(this._stateDir, SIMULATIONS_DIR);
  }

  private _simulationPath(name: string): string {
    return join(this._simulationsDir(), `${name}.json`);
  }
}
