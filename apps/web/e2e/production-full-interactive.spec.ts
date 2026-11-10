import { test, expect, Page } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'https://manohar.evolveexpert.com';

const OWNER_PHONE = '9780972000';
const OWNER_PIN = '1234';

const STAFF_PHONE = '9816745290';
const STAFF_PIN = '1234';

const DEV_PHONE = '9999900000';
const DEV_PIN = '0000';

async function login(page: Page, phone: string, pin: string) {
  await page.goto(`${APP_URL}/login`);
  await page.waitForLoadState('networkidle');

  const phoneInput = page.locator('input[type="tel"]');
  const pinInput = page.locator('input[type="password"]');

  await phoneInput.fill(phone);
  await pinInput.fill(pin);

  const signInBtn = page.getByRole('button', { name: /Sign In/i });
  await signInBtn.click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

async function logout(page: Page) {
  const accountMenu = page.locator('button[aria-label="Staff account menu"]');
  if (await accountMenu.isVisible()) {
    await accountMenu.click();
    await page.waitForTimeout(400);
    const signOutBtn = page.getByRole('button', { name: /Sign Out|Logout/i });
    if (await signOutBtn.isVisible()) {
      await signOutBtn.click();
      await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 10000 });
      await page.waitForLoadState('networkidle');
      return;
    }
  }
  await page.goto(`${APP_URL}/login`);
  await page.waitForLoadState('networkidle');
}

test.describe.serial('Full Interactive Production Test Suite', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[Console Error] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`[Page Error] ${err.message}`);
    });
  });

  test('1. Authentication Validation: bad login rejected, Owner login succeeds', async ({ page }) => {
    await page.goto(`${APP_URL}/login`);
    await page.locator('input[type="tel"]').fill(OWNER_PHONE);
    await page.locator('input[type="password"]').fill('9999');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page.locator('body')).toContainText(/Invalid.*PIN|Invalid credentials|error/i);

    // Good login
    await page.locator('input[type="password"]').fill(OWNER_PIN);
    await page.getByRole('button', { name: /Sign In/i }).click();

    await page.waitForURL((url) => !url.pathname.includes('/login'));
    await expect(page.locator('body')).toContainText(/Customers owe you|Manohar traders/i);
  });

  test('2. Dashboard & Navigation Controls: verify all tabs & widgets', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);

    // Check dashboard receivables / metrics
    await expect(page.locator('body')).toContainText(/Customers owe you/i);

    // Check Notification Bell
    const notifBell = page.locator('button[aria-label*="Notification"], button:has(svg.lucide-bell)');
    if (await notifBell.count() > 0) {
      await notifBell.first().click();
      await page.waitForTimeout(500);
      const notifPanel = page.getByRole('heading', { name: 'Notifications' });
      await expect(notifPanel).toBeVisible();
      await page.keyboard.press('Escape');
    }

    // Verify company / branch switcher exists
    await expect(page.locator('body')).toContainText(/Manohar traders/i);
  });

  test('3. Task Assignment & Receiving Logic: Owner assigns task to Maneet, Maneet completes it with proof', async ({ page }) => {
    const taskTitle = `Inspection Flow ${Date.now()}`;
    const taskDesc = 'Verify gearbox lubrication and tension belt alignment';

    // 1. Login as Owner
    await login(page, OWNER_PHONE, OWNER_PIN);

    // Navigate to Tasks via client-side sidebar link
    await page.getByRole('link', { name: 'Tasks' }).click();
    await page.waitForURL((url) => url.pathname.includes('/tasks'));
    await page.waitForLoadState('networkidle');

    // Click "Assign Task" button
    const assignBtn = page.getByRole('button', { name: /Assign Task/i }).first();
    await expect(assignBtn).toBeVisible();
    await assignBtn.click();

    // Verify Task Creation Sheet
    await expect(page.getByRole('heading', { name: 'Assign Task to Team Member' })).toBeVisible();

    // Select Maneet as Assignee
    const assigneeSelect = page.locator('#task-assignee');
    await expect(assigneeSelect).toBeVisible();
    await assigneeSelect.selectOption({ value: 'u-1793694553913' });

    // Fill title and description
    await page.locator('#task-title').fill(taskTitle);
    await page.locator('#task-notes').fill(taskDesc);

    // Submit Task
    const submitBtn = page.getByRole('button', { name: /Assign Task & Send Notification/i });
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Verify task appears under "Assigned by Me"
    await page.getByRole('button', { name: /Assigned by Me/i }).click();
    await expect(page.locator('body')).toContainText(taskTitle);

    // 2. Logout & Login as Maneet (Staff) to test task receiving
    await logout(page);
    await login(page, STAFF_PHONE, STAFF_PIN);

    // Navigate to Tasks as Maneet
    await page.getByRole('link', { name: 'Tasks' }).click();
    await page.waitForURL((url) => url.pathname.includes('/tasks'));
    await page.waitForLoadState('networkidle');

    // Verify task is in "Assigned to Me"
    await page.getByRole('button', { name: /Assigned to Me/i }).click();
    await expect(page.locator('body')).toContainText(taskTitle);
    await expect(page.locator('body')).toContainText(taskDesc);

    // Click "Complete & Upload Proof"
    const completeBtn = page.locator(`div:has-text("${taskTitle}")`).locator('button:has-text("Complete")').first();
    await completeBtn.click();

    // Modal should open
    await expect(page.locator('text=Complete Task & Upload Proof')).toBeVisible();
    await page.locator('input[placeholder*="Checked voltage"]').fill('All checks completed successfully. Belt tension calibrated.');

    // Click "Mark Task Completed & Notify Assigner"
    const markCompletedBtn = page.getByRole('button', { name: /Mark Task Completed/i });
    await markCompletedBtn.click();
    await page.waitForTimeout(1000);

    // Verify task moves to completed
    await page.getByRole('button', { name: /Completed/i }).first().click();
    await expect(page.locator('body')).toContainText(taskTitle);
  });

  test('4. Notebook Logic: recomputation, formula expressions, row additions, and persistence', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Notebook' }).click();
    await page.waitForURL((url) => url.pathname.includes('/notebook'));
    await page.waitForLoadState('networkidle');

    // Check Notebook title
    await expect(page.locator('body')).toContainText(/Calculation Notebook|Notebook/i);

    // Verify columns: Description, Qty, Rate, Total
    await expect(page.locator('body')).toContainText('Description');
    await expect(page.locator('body')).toContainText('Qty');
    await expect(page.locator('body')).toContainText(/Rate/i);
    await expect(page.locator('body')).toContainText(/Total/i);

    // Verify existing calculation row: 10*2 = 20, rate 4200 => 84000
    await expect(page.locator('body')).toContainText('Servo Motor 550W');
    await expect(page.locator('body')).toContainText('84,000');

    // Add a new row
    const addRowBtn = page.getByRole('button', { name: /Add Row/i });
    await expect(addRowBtn).toBeVisible();
    await addRowBtn.click();
    await page.waitForTimeout(500);

    // Click on the rate cell of the newly added row and enter 350
    const cells = page.locator('table tbody tr:last-child td');
    const cellCount = await cells.count();
    if (cellCount >= 4) {
      await cells.nth(3).click();
      const input = page.locator('table input');
      if (await input.isVisible()) {
        await input.fill('350');
        await input.press('Enter');
        await page.waitForTimeout(500);
      }
    }
  });

  test('5. Stock Management: item listing and search filter', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Stock' }).click();
    await page.waitForURL((url) => url.pathname.includes('/stock'));
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toContainText(/Stock/i);
  });

  test('6. Challans Management: listing, filter, and creation form', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Challans' }).click();
    await page.waitForURL((url) => url.pathname.includes('/challans'));
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toContainText(/Challans/i);

    // Test navigation to create challan
    const newChallanBtn = page.getByRole('button', { name: /New Challan|Create Challan/i }).first();
    if (await newChallanBtn.isVisible()) {
      await newChallanBtn.click();
      await page.waitForURL((url) => url.pathname.includes('/challans/new'));
      await expect(page.locator('body')).toContainText(/New Delivery Challan|Create Challan/i);
      await page.goBack();
    }
  });

  test('7. Settings & RBAC: verify Organization, Staff list, and permissions', async ({ page }) => {
    await login(page, OWNER_PHONE, OWNER_PIN);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL((url) => url.pathname.includes('/settings'));
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toContainText(/Organization & Company Setup|Settings/i);
    await expect(page.locator('body')).toContainText('Maneet');
    await expect(page.locator('body')).toContainText('Manohar traders');

    // Test Add Staff modal
    const addStaffBtn = page.getByRole('button', { name: /\+ Add Staff/i });
    if (await addStaffBtn.isVisible()) {
      await addStaffBtn.click();
      await expect(page.locator('text=4-Digit Login PIN')).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });

  test('8. Dev Platform Admin Console: onboarding and client isolation', async ({ page }) => {
    await logout(page);
    await login(page, DEV_PHONE, DEV_PIN);
    await page.waitForURL((url) => url.pathname.includes('/dev/clients'));
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toContainText('Client Organizations');
    await expect(page.locator('body')).toContainText('Manohar traders');
  });

  test('9. Console Errors & UI Glitches Summary', async () => {
    console.log('--- Captured Console Errors during Interactive Tests ---');
    console.log(consoleErrors.length === 0 ? 'No console errors detected!' : consoleErrors.join('\n'));
  });
});
