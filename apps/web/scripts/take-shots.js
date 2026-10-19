import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = '/Users/irfan/.gemini/antigravity/brain/3d70dbf3-38d8-4f48-9d44-d78c190cc71c';

async function main() {
  console.log('Starting preview server...');
  const server = spawn('pnpm', ['preview', '--port', '4173', '--host', '127.0.0.1'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  server.stderr.on('data', (d) => console.error(`[server err] ${d.toString().trim()}`));

  // Wait for server to come online
  await new Promise((r) => setTimeout(r, 2000));

  console.log('Launching browser...');
  const browser = await chromium.launch();

  try {
    // 1. Mobile iPhone viewport: 390 x 844
    console.log('Capturing mobile view (390x844)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('text=Customers owe you');
    await new Promise((r) => setTimeout(r, 500)); // ensure fonts rendered

    const mobilePath = path.join(ARTIFACT_DIR, 'home-phone-390x844.png');
    await mobilePage.screenshot({ path: mobilePath, fullPage: false });
    console.log(`Saved mobile screenshot to ${mobilePath}`);
    await mobileContext.close();

    // 2. Desktop viewport: 1280 x 800
    console.log('Capturing desktop view (1280x800)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await desktopPage.waitForSelector('text=Customers owe you');
    await new Promise((r) => setTimeout(r, 500));

    const desktopPath = path.join(ARTIFACT_DIR, 'home-desktop-1280x800.png');
    await desktopPage.screenshot({ path: desktopPath, fullPage: false });
    console.log(`Saved desktop screenshot to ${desktopPath}`);
    await desktopContext.close();

  } finally {
    await browser.close();
    server.kill();
    console.log('Finished capturing screenshots.');
  }
}

main().catch((err) => {
  console.error('Failed to take screenshots:', err);
  process.exit(1);
});
