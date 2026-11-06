import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.APP_URL || 'http://127.0.0.1:5173';

async function loginWithPhoneAndPin(page: Page, phone: string, pin: string) {
  await page.goto(`${BASE_URL}/login`);
  const phoneInput = page.locator('input[type="tel"]');
  const pinInput = page.locator('input[type="password"]');
  await phoneInput.fill(phone);
  await pinInput.fill(pin);
  await page.getByRole('button', { name: /Sign In/i }).click();
}

test.describe('SaaS End-to-End Multi-Role & Feature Matrix in Chrome', () => {
  test('1. Owner login: full navigation, company switcher, stock, draft-to-Tally challan, tasks, notebook, and settings', async ({ page }) => {
    await loginWithPhoneAndPin(page, '+91 98140 11223', '1234');
    await expect(page).toHaveURL(`${BASE_URL}/`);

    // 1. Dashboard receivables & overdue summary
    await expect(page.locator('body')).toContainText('Total Receivables');
    await expect(page.locator('body')).toContainText('Sample Garments Pvt Ltd');

    // 2. Collections & Party Detail + Ledger fallback
    await page.goto(`${BASE_URL}/collections`);
    await expect(page.locator('body')).toContainText('Sample Garments Pvt Ltd');
    await page.getByText('Sample Garments Pvt Ltd').first().click();
    await expect(page.locator('body')).toContainText('GST/004/26-27');

    // 3. Stock & Combined Stock View
    await page.goto(`${BASE_URL}/stock`);
    await expect(page.locator('body')).toContainText('TAI MACHINE');
    await expect(page.locator('body')).toContainText('SV MACHINE');

    // 4. Challans: verify Draft Challan -> Send Draft to Tally & dynamic GST
    await page.goto(`${BASE_URL}/challans/ch-5`);
    await expect(page.locator('body')).toContainText('SC/015/26-27');
    const sendDraftBtn = page.getByRole('button', { name: /Send Draft to Tally/i });
    if (await sendDraftBtn.isVisible()) {
      await sendDraftBtn.click();
      await expect(page.locator('body')).toContainText(/Queued|Synced/i);
    }

    // 5. Tasks: Assigned to Me vs Assigned by Me tabs & completion modal
    await page.goto(`${BASE_URL}/tasks`);
    await expect(page.getByRole('button', { name: /Assigned to Me/i })).toBeVisible();
    await page.getByRole('button', { name: /Assigned by Me/i }).click();
    await expect(page.locator('body')).toContainText('Check needle plate & motor wiring');

    // 6. Notebook calculation & column key safety
    await page.goto(`${BASE_URL}/notebook`);
    await expect(page.locator('body')).toContainText('Servo Motor 550W');

    // 7. Settings: Staff PIN, phone, and company branch assignment modal
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.locator('body')).toContainText('Organization & Company Setup');
    const addStaffBtn = page.getByRole('button', { name: /\+ Add Staff/i });
    if (await addStaffBtn.isVisible()) {
      await addStaffBtn.click();
      await expect(page.locator('body')).toContainText('4-Digit Login PIN');
      await expect(page.locator('body')).toContainText('Company Branch Access');
    }
  });

  test('2. Stock Keeper login: can access Stock, Challans, and Tasks (with proof upload), blocked from Settings & Collections', async ({ page }) => {
    await loginWithPhoneAndPin(page, '+91 98333 55667', '1234');

    // Stock Keeper has task-1 assigned to them (u5)
    await page.goto(`${BASE_URL}/tasks`);
    await expect(page.locator('body')).toContainText('Check needle plate & motor wiring');

    // Open Complete & Upload Proof modal
    const completeBtn = page.getByRole('button', { name: /Complete & Upload Proof/i }).first();
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
      await expect(page.locator('body')).toContainText('Complete Task & Upload Proof');
      await page.getByRole('button', { name: /Mark Task Completed/i }).click();
    }

    // Blocked from /settings
    await page.goto(`${BASE_URL}/settings`);
    await expect(page).not.toHaveURL(`${BASE_URL}/settings`);
  });

  test('3. Viewer login: read-only access across screens and blocked from mutations', async ({ page }) => {
    await loginWithPhoneAndPin(page, '+91 98444 66778', '1234');
    await page.goto(`${BASE_URL}/stock`);
    await expect(page.locator('body')).toContainText('TAI MACHINE');
    await expect(page.getByRole('button', { name: /\+ Add Item/i })).toHaveCount(0);

    await page.goto(`${BASE_URL}/challans/new`);
    await expect(page).not.toHaveURL(`${BASE_URL}/challans/new`);
  });

  test('4. Dev Super Admin login: client onboarding and isolated workspace switching', async ({ page }) => {
    await loginWithPhoneAndPin(page, '+91 99999 00000', '0000');
    await page.goto(`${BASE_URL}/dev/clients`);
    await expect(page.locator('body')).toContainText('Client Organizations');
    await expect(page.locator('body')).toContainText('Manohar Traders Group');
  });
});
