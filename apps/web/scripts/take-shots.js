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

    // Challans List
    await mobilePage.goto('http://127.0.0.1:4173/challans', { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('text=DC/042/26-27');
    await new Promise((r) => setTimeout(r, 400));
    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, 'challans-phone-390x844.png'),
    });

    // Create Challan Flow
    await mobilePage.goto('http://127.0.0.1:4173/challans/new', { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('text=New Challan');
    await new Promise((r) => setTimeout(r, 400));
    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, 'challan-create-phone-390x844.png'),
    });

    // Challan Detail (ch-1)
    await mobilePage.goto('http://127.0.0.1:4173/challans/ch-1', { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('text=DC/042/26-27');
    await new Promise((r) => setTimeout(r, 400));
    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, 'challan-detail-phone-390x844.png'),
    });

    await mobileContext.close();

    // 2. Desktop viewport: 1280 x 800
    console.log('Capturing desktop views (1280x800)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const desktopPage = await desktopContext.newPage();

    // Challan Print View
    await desktopPage.goto('http://127.0.0.1:4173/print/challan/ch-1', { waitUntil: 'networkidle' });
    await desktopPage.waitForSelector('text=MANOHAR TRADERS');
    await new Promise((r) => setTimeout(r, 400));
    await desktopPage.screenshot({
      path: path.join(ARTIFACT_DIR, 'challan-print-desktop-1280x800.png'),
    });

    // Statement Print View
    await desktopPage.goto('http://127.0.0.1:4173/print/statement/p-sample', { waitUntil: 'networkidle' });
    await desktopPage.waitForSelector('text=STATEMENT OF ACCOUNT');
    await new Promise((r) => setTimeout(r, 400));
    await desktopPage.screenshot({
      path: path.join(ARTIFACT_DIR, 'statement-print-desktop-1280x800.png'),
    });

    await desktopContext.close();
    console.log('Phase 4 screenshots captured successfully.');
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error('Failed to take screenshots:', err);
  process.exit(1);
});
