/**
 * CompositeAdapter — Multiplexes multiple IEnvironmentAdapters
 *
 * Polls all adapters and merges inputs. Broadcasts outputs to all.
 * Used to run ChatAdapter (human) and AgoraAdapter (agents) simultaneously.
 */

import type { IEnvironmentAdapter } from './interfaces.js';
import type { AgentOutput, RawInput } from './types.js';

export class CompositeAdapter implements IEnvironmentAdapter {
  readonly id: string;
  private readonly _adapters: IEnvironmentAdapter[];

  constructor(adapters: IEnvironmentAdapter[], id = 'composite') {
    this._adapters = adapters;
    this.id = id;
  }

  async connect(): Promise<void> {
    await Promise.all(this._adapters.map(a => a.connect()));
  }

  async disconnect(): Promise<void> {
    await Promise.all(this._adapters.map(a => a.disconnect()));
  }

  isConnected(): boolean {
    return this._adapters.some(a => a.isConnected());
  }

  async poll(): Promise<RawInput[]> {
    const results = await Promise.all(this._adapters.map(a => a.poll()));
    return results.flat();
  }

  async send(output: AgentOutput): Promise<void> {
    const targets = this._adapters.filter(a => {
      if (!a.isConnected()) return false;
      if (output.targetAdapterId) return a.id === output.targetAdapterId;
      return true;
    });
    await Promise.all(targets.map(a => a.send(output)));
  }
}
