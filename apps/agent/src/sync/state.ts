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
    const bakPath = `${this.filePath}.bak`;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8').replace(/^\uFEFF/, '').trim();
        if (raw.length > 0) {
          const parsed = JSON.parse(raw);
          // Keep a backup copy of known valid state
          try {
            fs.copyFileSync(this.filePath, bakPath);
          } catch {}
          return parsed;
        }
      }
    } catch (err: any) {
      console.warn(`[StateStore] Could not load state from ${this.filePath}: ${err.message}`);
    }

    // Try recovering from backup file if primary was damaged or empty
    try {
      if (fs.existsSync(bakPath)) {
        const rawBak = fs.readFileSync(bakPath, 'utf-8');
        if (rawBak.trim().length > 0) {
          const parsedBak = JSON.parse(rawBak);
          console.warn(`[StateStore] Successfully recovered state from backup: ${bakPath}`);
          // Immediately heal primary file so it's not corrupt on disk
          try {
            fs.writeFileSync(this.filePath, JSON.stringify(parsedBak, null, 2), 'utf-8');
          } catch {}
          return parsedBak;
        }
      }
    } catch (err: any) {
      console.warn(`[StateStore] Could not load backup state from ${bakPath}: ${err.message}`);
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
      const tmpPath = `${this.filePath}.tmp`;
      const bakPath = `${this.filePath}.bak`;
      const serialized = JSON.stringify(this.state, null, 2);

      // Write atomically via temporary file
      fs.writeFileSync(tmpPath, serialized, 'utf-8');

      // Maintain backup copy from known-valid serialized state
      try {
        fs.copyFileSync(tmpPath, bakPath);
      } catch {}

      // Atomically replace target file (with fallback for Windows NTFS lock/replace quirks)
      try {
        fs.renameSync(tmpPath, this.filePath);
      } catch {
        fs.copyFileSync(tmpPath, this.filePath);
        try {
          fs.unlinkSync(tmpPath);
        } catch {}
      }
    } catch (err: any) {
      console.error(`[StateStore] Failed to save state to ${this.filePath}: ${err.message}`);
    }
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public reset(): void {
    const companies = Array.isArray(this.state.companies)
      ? this.state.companies.map((c) => ({ ...c, lastAlterId: 0, lastSyncedAt: undefined }))
      : this.state.companies;

    this.state = {
      ...this.state,
      lastAlterId: 0,
      lastSyncedAt: undefined,
      companies,
      status: 'offline',
    };
    this.save();
  }
}
