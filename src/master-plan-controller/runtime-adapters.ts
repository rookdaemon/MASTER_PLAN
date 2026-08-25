import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import type {
  ClockPort,
  ContentFingerprintPort,
  FileSystemPort,
  NetworkPort,
  NetworkRequest,
  NetworkResponse,
  ProcessPort,
  ProcessRequest,
  ProcessResult,
  SchedulerPort,
} from './ports.js';
import type { Timestamp } from './types.js';

function assertInsideRoot(root: string, candidate: string): void {
  const location = relative(root, candidate);
  if (location.startsWith('..') || resolve(root, location) !== candidate) {
    throw new Error(`Path escapes filesystem adapter root: ${candidate}`);
  }
}

export function normalizeRepositoryPath(path: string): string {
  return path.replaceAll('\\', '/');
}

export function normalizeRepositoryText(content: string): string {
  return content.replaceAll('\r\n', '\n');
}

export class NodeFileSystem implements FileSystemPort {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private location(path: string): string {
    const candidate = resolve(this.root, path);
    assertInsideRoot(this.root, candidate);
    return candidate;
  }

  async readText(path: string): Promise<string> {
    return normalizeRepositoryText(await readFile(this.location(path), 'utf8'));
  }

  async writeText(path: string, content: string): Promise<void> {
    const location = this.location(path);
    await mkdir(dirname(location), { recursive: true });
    await writeFile(location, content, 'utf8');
  }

  async listFiles(prefix: string): Promise<string[]> {
    const start = this.location(prefix);
    const results: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const location = resolve(directory, entry.name);
        if (entry.isDirectory()) await walk(location);
        else if (entry.isFile()) results.push(normalizeRepositoryPath(relative(this.root, location)));
      }
    };
    try {
      await walk(start);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return results.sort();
  }
}

export class SystemClock implements ClockPort {
  now(): Timestamp {
    return new Date().toISOString();
  }
}

export type FetchPort = (input: string, init: RequestInit) => Promise<Response>;

export class FetchNetwork implements NetworkPort {
  constructor(private readonly fetchRequest: FetchPort = globalThis.fetch) {}

  async request(request: NetworkRequest): Promise<NetworkResponse> {
    const response = await this.fetchRequest(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    return {
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
    };
  }
}

export class NodeSha256Fingerprint implements ContentFingerprintPort {
  digest(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }
}

export class NodeScheduler implements SchedulerPort {
  async wait(milliseconds: number): Promise<void> {
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, milliseconds));
  }
}

export class NodeProcess implements ProcessPort {
  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.timeoutMs !== undefined && (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs <= 0)) {
      throw new Error('process timeout must be positive');
    }
    return new Promise((resolveResult, reject) => {
      const child = spawn(request.command, request.args, {
        cwd: request.cwd,
        env: request.environment === undefined ? process.env : { ...process.env, ...request.environment },
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timeout = request.timeoutMs === undefined ? undefined : setTimeout(() => {
        timedOut = true;
        if (child.pid === undefined) return;
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
      }, request.timeoutMs);
      timeout?.unref();
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      child.on('error', (error) => {
        if (timeout) clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (exitCode) => {
        if (timeout) clearTimeout(timeout);
        resolveResult({
          exitCode: timedOut ? 124 : exitCode ?? 1,
          stdout,
          stderr: timedOut ? `${stderr}\nProcess timed out after ${request.timeoutMs}ms.`.trim() : stderr,
        });
      });
    });
  }
}
