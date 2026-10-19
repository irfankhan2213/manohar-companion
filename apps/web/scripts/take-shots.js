import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';

const ARTIFACT_DIR = '/Users/irfan/.gemini/antigravity/brain/3d70dbf3-38d8-4f48-9d44-d78c190cc71c';

async function main() {
  console.log('Starting preview server...');
  const server = spawn('pnpm', ['preview', '--port', '4173', '--host', '127.0.0.1'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  server.stderr.on('data', (d) => console.error(`[server err] ${d.toString().trim()}`));

  await new Promise((r) => setTimeout(r, 2000));

  console.log('Launching browser...');
  const browser = await chromium.launch();

  try {
    // 1. Mobile iPhone viewport: 390 x 844
    console.log('Capturing mobile views (390x844)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();

    // Stock List
    await mobilePage.goto('http://127.0.0.1:4173/stock', { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('text=Servo Motor 550W');
    await new Promise((r) => setTimeout(r, 400));
    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, 'stock-phone-390x844.png'),
    });

    // Stock Detail (item-1: Servo Motor)
    await mobilePage.goto('http://127.0.0.1:4173/stock/item-1', { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('text=Available stock');
    await new Promise((r) => setTimeout(r, 400));
    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, 'stock-detail-phone-390x844.png'),
    });

    // Reminders Screen
    await mobilePage.goto('http://127.0.0.1:4173/reminders', { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('text=Automatic Reminders');
    await new Promise((r) => setTimeout(r, 400));
    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, 'reminders-phone-390x844.png'),
    });

    // Reminders Templates Screen
    await mobilePage.goto('http://127.0.0.1:4173/reminders/templates', { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('text=Due Soon Reminder');
    await new Promise((r) => setTimeout(r, 400));
    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, 'reminders-templates-phone-390x844.png'),
    });

    await mobileContext.close();

    // 2. Desktop viewport: 1280 x 800
    console.log('Capturing desktop views (1280x800)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const desktopPage = await desktopContext.newPage();

    // Stock Desktop
    await desktopPage.goto('http://127.0.0.1:4173/stock/item-1', { waitUntil: 'networkidle' });
    await desktopPage.waitForSelector('text=Available stock');
    await new Promise((r) => setTimeout(r, 400));
    await desktopPage.screenshot({
      path: path.join(ARTIFACT_DIR, 'stock-detail-desktop-1280x800.png'),
    });

    await desktopContext.close();
    console.log('Phase 3 screenshots captured successfully.');
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error('Failed to take screenshots:', err);
  process.exit(1);
});
