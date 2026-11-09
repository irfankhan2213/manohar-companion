import fs from 'node:fs';
import path from 'node:path';

/**
 * Single-instance lock using a PID file to prevent concurrent agent daemons from conflicting on Tally.
 */
export function acquireSingleInstanceLock(
  lockFilePath: string,
  onConflict?: (existingPid: number) => void
): () => void {
  const lockDir = path.dirname(lockFilePath);
  if (!fs.existsSync(lockDir)) {
    try {
      fs.mkdirSync(lockDir, { recursive: true });
    } catch {}
  }

  try {
    if (fs.existsSync(lockFilePath)) {
      const content = fs.readFileSync(lockFilePath, 'utf8').trim();
      const existingPid = parseInt(content, 10);
      if (!isNaN(existingPid) && existingPid > 0 && existingPid !== process.pid) {
        let isRunning = false;
        try {
          process.kill(existingPid, 0);
          isRunning = true;
        } catch (e: any) {
          if (e.code === 'EPERM') {
            isRunning = true;
          }
        }
        if (isRunning) {
          if (onConflict) {
            onConflict(existingPid);
            return () => {};
          }
          console.error(`\n[Error] Another instance of Tally Agent is already running (PID: ${existingPid})!`);
          console.error('Only one instance may run at a time to prevent TallyPrime sync conflicts.');
          console.error(`If you believe this is in error, delete: ${lockFilePath}\n`);
          process.exit(1);
        } else {
          console.warn(`[Lock] Found stale lock file from inactive PID ${existingPid}. Reclaiming lock.`);
        }
      }
    }
    fs.writeFileSync(lockFilePath, String(process.pid), { flag: 'w' });
  } catch (err: any) {
    console.warn(`[Lock] Warning: Could not write lock file (${err.message}). Proceeding.`);
  }

  const releaseLock = () => {
    try {
      if (fs.existsSync(lockFilePath)) {
        const content = fs.readFileSync(lockFilePath, 'utf8').trim();
        if (parseInt(content, 10) === process.pid) {
          fs.unlinkSync(lockFilePath);
        }
      }
    } catch {}
  };

  process.on('exit', releaseLock);
  return releaseLock;
}
