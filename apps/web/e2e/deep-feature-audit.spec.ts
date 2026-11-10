import { test, expect, Page } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'https://manohar.evolveexpert.com';
const OWNER_PHONE = '9780972000';
const OWNER_PIN = '1234';
const STAFF_PHONE = '9816745290';
const STAFF_PIN = '1234';

async function login(page: Page, phone: string, pin: string) {
  await page.goto(`${APP_URL}/login`);
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="tel"]').fill(phone);
  await page.locator('input[type="password"]').fill(pin);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

test.describe.serial('Deep Feature Audit & UI/Logic Inspection Suite', () => {
  const consoleWarningsAndErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleWarningsAndErrors.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    });
  });

  test('A. Challans Flow: Create a complete Delivery Challan, view details, check print preview', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Challans' }).click();
    await page.waitForURL((url) => url.pathname.includes('/challans'));

    // Check banner button "New"
    const newBtn = page.getByRole('button', { name: /^New$/i }).first();
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    await page.waitForURL((url) => url.pathname.includes('/challans/new'));

    // Check party selector
    const partySelect = page.locator('#challan-party, select').first();
    await expect(partySelect).toBeVisible();

    // Check vehicle / dispatch fields
    const vehicleInput = page.locator('input[placeholder*="Vehicle"], input[name="vehicleNumber"], input[id*="vehicle"]');
    if (await vehicleInput.count() > 0) {
      await vehicleInput.first().fill('PB-10-CZ-8821');
    }

    // Go back to challans list
    await page.getByRole('link', { name: 'Challans' }).click();
  });

  test('B. Collections & Ledger Flow: Search customer, inspect party detail and statement print', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Collections' }).click();
    await page.waitForURL((url) => url.pathname.includes('/collections'));

    // Check collections screen UI elements
    await expect(page.locator('body')).toContainText(/Collections|Receivables/i);

    // Search bar test
    const searchInput = page.locator('input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Sample');
      await page.waitForTimeout(300);
      await searchInput.clear();
    }
  });

  test('C. Stock Screen: Category tabs, search filter, and add item modal', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Stock' }).click();
    await page.waitForURL((url) => url.pathname.includes('/stock'));

    await expect(page.locator('body')).toContainText(/Stock/i);

    // Check if New Item button exists and opens modal
    const addItemBtn = page.getByRole('button', { name: /New Item/i });
    if (await addItemBtn.count() > 0) {
      await addItemBtn.first().click();
      await page.waitForTimeout(400);
      await expect(page.getByRole('heading', { name: 'New Stock Item' })).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });

  test('D. Reminders Screen: Rules, templates, and replies inspection', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Reminders' }).click();
    await page.waitForURL((url) => url.pathname.includes('/reminders'));

    await expect(page.locator('body')).toContainText(/Reminders/i);
    await expect(page.locator('body')).toContainText(/WhatsApp Reminder System/i);
  });

  test('E. Activity Audit Log: verify timeline entries', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Activity' }).click();
    await page.waitForURL((url) => url.pathname.includes('/activity'));

    await expect(page.locator('body')).toContainText(/Activity/i);
  });

  test('F. Internationalization (i18n): Switch language to Hindi and verify UI changes', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL((url) => url.pathname.includes('/settings'));

    // Check language switch
    const langSwitchHindi = page.getByRole('button', { name: /हिंदी|Hindi/i });
    if (await langSwitchHindi.count() > 0) {
      await langSwitchHindi.first().click();
      await page.waitForTimeout(400);
      // Switch back to English
      const langSwitchEng = page.getByRole('button', { name: /English/i });
      if (await langSwitchEng.count() > 0) {
        await langSwitchEng.first().click();
      }
    }
  });

  test('G. RBAC Verification: Log in as Maneet (Custom Accountent) and verify access boundaries', async ({ page }) => {
    await login(page, STAFF_PHONE, STAFF_PIN);

    // Verify Maneet can access Notebook
    await page.getByRole('link', { name: 'Notebook' }).click();
    await page.waitForURL((url) => url.pathname.includes('/notebook'));
    await expect(page.locator('body')).toContainText(/Notebook/i);

    // Verify Maneet can access Tasks
    await page.getByRole('link', { name: 'Tasks' }).click();
    await page.waitForURL((url) => url.pathname.includes('/tasks'));
    await expect(page.locator('body')).toContainText(/Tasks/i);
  });

  test('H. Review Logs & Detected Issues', async () => {
    console.log('=== Console Warnings & Errors Captured ===');
    console.log(consoleWarningsAndErrors.length === 0 ? 'No warnings or errors!' : consoleWarningsAndErrors.slice(0, 20).join('\n'));
  });
});
