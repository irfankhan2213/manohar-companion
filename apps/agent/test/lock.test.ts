import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { acquireSingleInstanceLock } from '../src/lock.js';

describe('Single-instance mutex lock', () => {
  const testLockPath = path.resolve(process.cwd(), 'test-agent.lock');

  it('acquires lock, writes current PID, and cleans up on release', () => {
    if (fs.existsSync(testLockPath)) fs.unlinkSync(testLockPath);

    const release = acquireSingleInstanceLock(testLockPath);
    expect(fs.existsSync(testLockPath)).toBe(true);
    const content = fs.readFileSync(testLockPath, 'utf8').trim();
    expect(content).toBe(String(process.pid));

    release();
    expect(fs.existsSync(testLockPath)).toBe(false);
  });

  it('reclaims stale lock file from dead PID', () => {
    // Write a PID that does not exist (99999999)
    fs.writeFileSync(testLockPath, '99999999', 'utf8');

    const release = acquireSingleInstanceLock(testLockPath);
    expect(fs.existsSync(testLockPath)).toBe(true);
    const content = fs.readFileSync(testLockPath, 'utf8').trim();
    expect(content).toBe(String(process.pid));

    release();
    expect(fs.existsSync(testLockPath)).toBe(false);
  });

  it('detects active running instance and triggers conflict callback', () => {
    // Write current process PID to simulate an active instance
    fs.writeFileSync(testLockPath, '1', 'utf8'); // PID 1 (init/launchd) is always alive on macOS/Linux

    let conflictPid: number | null = null;
    const release = acquireSingleInstanceLock(testLockPath, (pid) => {
      conflictPid = pid;
    });

    expect(conflictPid).toBe(1);
    release();
    if (fs.existsSync(testLockPath)) fs.unlinkSync(testLockPath);
  });
});
