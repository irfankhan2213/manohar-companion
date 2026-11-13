import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const agentRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(agentRoot, '../..');

const distMjs = path.resolve(agentRoot, 'dist/tally-agent.mjs');
const windowsSrcDir = path.resolve(agentRoot, 'windows');
const distWindowsDir = path.resolve(agentRoot, 'dist/windows');
const webPublicDir = path.resolve(repoRoot, 'apps/web/public/tally-agent-windows');
const webDistDir = path.resolve(repoRoot, 'apps/web/dist/tally-agent-windows');

console.log('[Sync] Starting Desktop Agent synchronization...');

if (!fs.existsSync(distMjs)) {
  console.error(`[Error] Built bundle not found at: ${distMjs}`);
  process.exit(1);
}

// 1. Ensure target directories exist
fs.mkdirSync(distWindowsDir, { recursive: true });
fs.mkdirSync(webPublicDir, { recursive: true });

// Locate node.exe from known sources
let nodeExePath = null;
const candidateNodePaths = [
  path.join(webPublicDir, 'node.exe'),
  path.join(distWindowsDir, 'node.exe'),
  path.join(webDistDir, 'node.exe'),
  path.join(windowsSrcDir, 'node.exe'),
];
for (const cand of candidateNodePaths) {
  if (fs.existsSync(cand) && fs.statSync(cand).size > 10 * 1024 * 1024) {
    nodeExePath = cand;
    break;
  }
}

if (nodeExePath) {
  console.log(`[Sync] Found portable Windows Node runtime at: ${nodeExePath} (${(fs.statSync(nodeExePath).size / (1024 * 1024)).toFixed(1)} MB)`);
} else {
  console.warn('[Warning] No pre-bundled node.exe found in candidate locations.');
}

// 2. Sync to apps/agent/dist/windows/
fs.copyFileSync(distMjs, path.join(distWindowsDir, 'tally-agent.mjs'));
if (fs.existsSync(windowsSrcDir)) {
  for (const file of fs.readdirSync(windowsSrcDir)) {
    if (file === 'node.exe' || file === 'tally-agent.mjs') continue;
    fs.copyFileSync(path.join(windowsSrcDir, file), path.join(distWindowsDir, file));
  }
}
if (nodeExePath && !fs.existsSync(path.join(distWindowsDir, 'node.exe'))) {
  fs.copyFileSync(nodeExePath, path.join(distWindowsDir, 'node.exe'));
}
console.log(`[Sync] Synced distribution files to ${distWindowsDir}`);

// 3. Sync to apps/web/public/tally-agent-windows/
fs.copyFileSync(distMjs, path.join(webPublicDir, 'tally-agent.mjs'));
if (fs.existsSync(windowsSrcDir)) {
  for (const file of fs.readdirSync(windowsSrcDir)) {
    if (file === 'node.exe' || file === 'tally-agent.mjs') continue;
    fs.copyFileSync(path.join(windowsSrcDir, file), path.join(webPublicDir, file));
  }
}
if (nodeExePath && (!fs.existsSync(path.join(webPublicDir, 'node.exe')) || fs.statSync(path.join(webPublicDir, 'node.exe')).size === 0)) {
  fs.copyFileSync(nodeExePath, path.join(webPublicDir, 'node.exe'));
}
console.log(`[Sync] Synced distribution files to ${webPublicDir}`);

// 4. Sync to apps/web/dist/tally-agent-windows/ if exists
if (fs.existsSync(path.dirname(webDistDir))) {
  fs.mkdirSync(webDistDir, { recursive: true });
  fs.copyFileSync(distMjs, path.join(webDistDir, 'tally-agent.mjs'));
  if (fs.existsSync(windowsSrcDir)) {
    for (const file of fs.readdirSync(windowsSrcDir)) {
      if (file === 'node.exe' || file === 'tally-agent.mjs') continue;
      fs.copyFileSync(path.join(windowsSrcDir, file), path.join(webDistDir, file));
    }
  }
  if (nodeExePath && (!fs.existsSync(path.join(webDistDir, 'node.exe')) || fs.statSync(path.join(webDistDir, 'node.exe')).size === 0)) {
    fs.copyFileSync(nodeExePath, path.join(webDistDir, 'node.exe'));
  }
  console.log(`[Sync] Synced distribution files to ${webDistDir}`);
}

// 5. Create tally-agent-windows.zip archive
console.log('[Zip] Creating tally-agent-windows.zip archive...');
const publicZipPath = path.resolve(repoRoot, 'apps/web/public/tally-agent-windows.zip');
const tempZipPath = path.resolve(repoRoot, 'apps/web/public/tally-agent-windows.tmp.zip');

try {
  // Use system zip utility with high compression (-9)
  execSync(`cd "${path.dirname(webPublicDir)}" && zip -q -9 -r "${tempZipPath}" tally-agent-windows`, {
    stdio: 'inherit',
  });
  fs.renameSync(tempZipPath, publicZipPath);
} catch (zipErr) {
  console.warn('[Zip] System zip failed, attempting Python zipfile fallback...', zipErr.message);
  try {
    const pyScript = `
import zipfile, os
web_public = "${path.dirname(webPublicDir)}"
zip_path = "${publicZipPath}"
folder_name = "tally-agent-windows"
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    folder_path = os.path.join(web_public, folder_name)
    for root, dirs, files in os.walk(folder_path):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, web_public)
            zf.write(full, rel)
`;
    execSync(`python3 -c '${pyScript}'`, { stdio: 'inherit' });
  } catch (pyErr) {
    console.error('[Error] Failed to build zip archive:', pyErr);
    process.exit(1);
  }
}

const zipStat = fs.statSync(publicZipPath);
console.log(`[Zip] Successfully generated ${publicZipPath} (${(zipStat.size / (1024 * 1024)).toFixed(2)} MB)`);

// 6. Propagate zip to artifacts and build outputs
const artifactDestinations = [
  path.resolve(repoRoot, 'apps/web/dist/tally-agent-windows.zip'),
  path.resolve(repoRoot, 'artifacts/tally-agent-windows.zip'),
  // Brain conversation artifact path if exists
  '/Users/irfan/.gemini/antigravity/brain/e0953962-38b0-4758-8369-c4077ef42b00/tally-agent-windows.zip',
];

for (const dest of artifactDestinations) {
  try {
    const parentDir = path.dirname(dest);
    if (fs.existsSync(parentDir)) {
      fs.copyFileSync(publicZipPath, dest);
      console.log(`[Zip] Mirrored zip to: ${dest}`);
    }
  } catch (err) {
    console.warn(`[Zip] Could not mirror zip to ${dest}:`, err.message);
  }
}

// 7. Verify outputs
console.log('\n=== Distribution & Artifacts Verification ===');
const publicFiles = fs.readdirSync(webPublicDir);
console.log(`Public files in ${webPublicDir}:`);
for (const f of publicFiles) {
  const fPath = path.join(webPublicDir, f);
  const s = fs.statSync(fPath);
  console.log(`  - ${f.padEnd(24)}: ${s.size.toLocaleString().padStart(12)} bytes`);
}

console.log('\nZip Archive Verification:');
const zipListing = execSync(`unzip -l "${publicZipPath}"`).toString();
console.log(zipListing.trim());
console.log('=== All files successfully built, synced, and packaged ===\n');
