/**
 * Plan Guardian debug log with rotation-on-start.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

export class GuardianDebugLog {
  constructor(private readonly filePath: string) {}

  rotateOnStart(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (existsSync(this.filePath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveDir = join(dir, 'archive');
      if (!existsSync(archiveDir)) {
        mkdirSync(archiveDir, { recursive: true });
      }
      renameSync(this.filePath, join(archiveDir, `guardian-${ts}.log`));
    }

    this.log('lifecycle', 'debug log rotated and session started');
  }

  log(category: string, message: string, data?: Record<string, unknown>): void {
    const ts = new Date().toISOString();
    const payload = data ? ` | ${JSON.stringify(data)}` : '';
    appendFileSync(this.filePath, `[${ts}] [${category}] ${message}${payload}\n`);
  }

  get path(): string {
    return this.filePath;
  }
}
