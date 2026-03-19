/**
 * File System Abstraction — Agent Runtime
 *
 * Provides an injectable IFileSystem interface so persistence code can
 * be tested without touching the real disk.
 *
 * Two implementations:
 *   - NodeFileSystem: production adapter over node:fs/promises
 *   - InMemoryFileSystem: in-memory map for deterministic tests
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

// ── Interface ────────────────────────────────────────────────

export interface IFileSystem {
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, content: string, encoding: string): Promise<void>;
  exists(path: string): boolean;
  mkdir(path: string, options?: { recursive: boolean }): Promise<void>;
}

// ── Node production implementation ───────────────────────────

export class NodeFileSystem implements IFileSystem {
  async readFile(path: string, encoding: string): Promise<string> {
    return readFile(path, encoding as BufferEncoding);
  }
  async writeFile(path: string, content: string, encoding: string): Promise<void> {
    await writeFile(path, content, encoding as BufferEncoding);
  }
  exists(path: string): boolean {
    return existsSync(path);
  }
  async mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
    await mkdir(path, options);
  }
}

// ── In-memory test implementation ────────────────────────────

export class InMemoryFileSystem implements IFileSystem {
  private _files = new Map<string, string>();

  async readFile(path: string, _encoding: string): Promise<string> {
    const content = this._files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }
  async writeFile(path: string, content: string, _encoding: string): Promise<void> {
    this._files.set(path, content);
  }
  exists(path: string): boolean {
    return this._files.has(path);
  }
  async mkdir(_path: string, _options?: { recursive: boolean }): Promise<void> {
    // No-op for in-memory implementation
  }

  /** Test helper: returns all stored file paths. */
  files(): string[] {
    return [...this._files.keys()];
  }
}
