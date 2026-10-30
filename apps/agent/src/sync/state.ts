import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentState } from '../types.js';

export class StateStore {
  private filePath: string;
  private state: AgentState;

  constructor(filePath?: string) {
    if (filePath) {
      this.filePath = filePath;
    } else {
      let scriptDir = process.cwd();
      try {
        if (typeof import.meta !== 'undefined' && import.meta.url) {
          scriptDir = path.dirname(fileURLToPath(import.meta.url));
        }
      } catch {}
      const scriptState = path.resolve(scriptDir, 'agent-state.json');
      const cwdState = path.resolve(process.cwd(), 'agent-state.json');
      this.filePath = fs.existsSync(scriptState) ? scriptState : cwdState;
    }
    this.state = this.load();
  }

  private load(): AgentState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err: any) {
      console.warn(`[StateStore] Could not load state from ${this.filePath}: ${err.message}`);
    }

    return {
      lastAlterId: 0,
      status: 'offline',
    };
  }

  public get(): AgentState {
    return { ...this.state };
  }

  public update(patch: Partial<AgentState>): AgentState {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.save();
    return this.state;
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err: any) {
      console.error(`[StateStore] Failed to save state to ${this.filePath}: ${err.message}`);
    }
  }

  public reset(): void {
    this.state = {
      lastAlterId: 0,
      status: 'offline',
    };
    this.save();
  }
}
