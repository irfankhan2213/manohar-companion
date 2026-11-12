import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDB } from '../src/db/database.js';
import { calculateRoundOff } from '@saas/shared';

describe('Milestone 6 Challenger 1 Adversarial & Stress Verification Suite', () => {
  let app: any;
  let db: any;
  let authToken: string;

  beforeAll(async () => {
    app = createApp();
    db = getDB();

    // Authenticate test session as admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    authToken = loginRes.body.token;
    expect(authToken).toBeDefined();

    // Clean previous test artifacts if any
    try {
      db.prepare("DELETE FROM challans WHERE id LIKE 'ch-m6-%'").run();
      db.prepare("DELETE FROM bills WHERE id LIKE 'b-m6-%'").run();
      db.prepare("DELETE FROM parties WHERE id LIKE 'p-m6-%'").run();
      db.prepare("DELETE FROM companies WHERE id LIKE 'c-m6-%'").run();
    } catch {}
  });

  afterAll(() => {
    try {
      db.prepare("DELETE FROM challans WHERE id LIKE 'ch-m6-%'").run();
      db.prepare("DELETE FROM bills WHERE id LIKE 'b-m6-%'").run();
      db.prepare("DELETE FROM parties WHERE id LIKE 'p-m6-%'").run();
      db.prepare("DELETE FROM companies WHERE id LIKE 'c-m6-%'").run();
    } catch {}
  });

  describe('R1: Local Contact Numbers Persistence, Sync Isolation & Party Differentiation', () => {
    it('preserves multiple local contact numbers across hostile Tally sync attempts with empty, null, or differing customPhones', async () => {
      // 1. Setup company and initial party via Tally sync
      const syncRes1 = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'M6 Steel Mills',
          parties: [
            {
              id: 'p-m6-sync-1',
              name: 'Oswal Fabrics Ludhiana',
              phones: ['+91 98140 11111'],
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 500000,
            },
            {
              id: 'p-m6-sync-2',
              name: 'Vardhman Suppliers',
              phones: ['+91 98140 22222'],
              parentGroup: 'Sundry Creditors',
              partyType: 'creditor',
              closingBalance: 800000,
            },
          ],
        });
      expect(syncRes1.status).toBe(200);

      // 2. Add local custom contact numbers to debtor via PATCH /api/parties/:id
      const patchRes1 = await request(app)
        .patch('/api/parties/p-m6-sync-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customPhones: ['+91 98765 00001', '+91 98765 00002'],
        });
      expect(patchRes1.status).toBe(200);
      expect(patchRes1.body.customPhones).toEqual(['+91 98765 00001', '+91 98765 00002']);

      // 3. Hostile Tally sync attempt 1: Tally pushes with empty customPhones
      const syncRes2 = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'M6 Steel Mills',
          parties: [
            {
              id: 'p-m6-sync-1',
              name: 'Oswal Fabrics Ludhiana (Renamed by Tally)',
              phones: ['+91 98140 11111', '+91 98140 99999'], // Updated Tally phones
              customPhones: [], // Hostile attempt to wipe local phones
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 600000,
            },
          ],
        });
      expect(syncRes2.status).toBe(200);

      // Verify customPhones was NOT wiped
      const verifyParty1 = await request(app)
        .get('/api/parties?partyId=p-m6-sync-1')
        .set('Authorization', `Bearer ${authToken}`);
      const party1 = verifyParty1.body.find((p: any) => p.id === 'p-m6-sync-1');
      expect(party1).toBeDefined();
      expect(party1.name).toBe('Oswal Fabrics Ludhiana (Renamed by Tally)');
      expect(party1.customPhones).toEqual(['+91 98765 00001', '+91 98765 00002']);

      // Direct SQLite check
      const rawDbParty = db.prepare('SELECT customPhones FROM parties WHERE id = ?').get('p-m6-sync-1') as any;
      expect(JSON.parse(rawDbParty.customPhones)).toEqual(['+91 98765 00001', '+91 98765 00002']);

      // 4. Hostile Tally sync attempt 2: Tally pushes with conflicting customPhones array
      const syncRes3 = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'M6 Steel Mills',
          parties: [
            {
              id: 'p-m6-sync-1',
              name: 'Oswal Fabrics Ludhiana (Renamed Again)',
              phones: ['+91 98140 11111'],
              customPhones: ['+91 00000 00000'], // Tally must never overwrite local state
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 700000,
            },
          ],
        });
      expect(syncRes3.status).toBe(200);

      const rawDbParty2 = db.prepare('SELECT customPhones FROM parties WHERE id = ?').get('p-m6-sync-1') as any;
      expect(JSON.parse(rawDbParty2.customPhones)).toEqual(['+91 98765 00001', '+91 98765 00002']);
    });

    it('differentiates debtors and creditors in GET /api/parties?type=debtor|creditor', async () => {
      const debtorsRes = await request(app)
        .get('/api/parties?type=debtor')
        .set('Authorization', `Bearer ${authToken}`);
      expect(debtorsRes.status).toBe(200);
      const debtorIds = debtorsRes.body.map((p: any) => p.id);
      expect(debtorIds).toContain('p-m6-sync-1');
      expect(debtorIds).not.toContain('p-m6-sync-2');

      const creditorsRes = await request(app)
        .get('/api/parties?type=creditor')
        .set('Authorization', `Bearer ${authToken}`);
      expect(creditorsRes.status).toBe(200);
      const creditorIds = creditorsRes.body.map((p: any) => p.id);
      expect(creditorIds).toContain('p-m6-sync-2');
      expect(creditorIds).not.toContain('p-m6-sync-1');
    });
  });

  describe('R2: Home Receivables Calculation Under Complex Boundary Conditions', () => {
    let testCompId: string;

    beforeAll(() => {
      // Create isolated test company
      testCompId = 'c-m6-receivables';
      db.prepare(`
        INSERT INTO companies (id, tenantId, name)
        VALUES (?, 'tenant-1', 'M6 Receivables Test Co')
      `).run(testCompId);
    });

    it('accurately reconciles advances via FIFO, deducts credit notes, and ignores creditors completely', async () => {
      // Debtor A: 3 bills + 1 credit note.
      // Bill 1: 50,000 paise, overdue by 45 days (date: 2026-08-01, dueDate: 2026-09-01)
      // Bill 2: 70,000 paise, overdue by 10 days (date: 2026-09-15, dueDate: 2026-10-07)
      // Bill 3: 100,000 paise, not due (date: 2026-10-10, dueDate: 2026-11-15)
      // Credit note: -30,000 paise
      // Sum positive = 220,000 paise.
      // Tally closing balance = 140,000 paise (Customer paid 50,000 advance + 30,000 credit note = 80,000 reduction).
      // Reduction pool = 220,000 - 140,000 = 80,000 paise.
      // FIFO reduction:
      // - Bill 1 (50,000): fully wiped by reduction pool (50,000). Remaining pool = 30,000.
      // - Bill 2 (70,000): reduced by 30,000 -> effective pending = 40,000 paise (overdue).
      // - Bill 3 (100,000): untouched = 100,000 paise (not due).
      // Expected for Debtor A: totalReceivables = 140,000, totalOverdue = 40,000, notDue = 100,000.
      db.prepare(`
        INSERT INTO parties (id, tenantId, companyId, name, city, phones, closingBalance, parentGroup, partyType)
        VALUES ('p-m6-debtor-a', 'tenant-1', ?, 'Debtor A', 'Ludhiana', '["9999999991"]', 140000, 'Sundry Debtors', 'debtor')
      `).run(testCompId);

      db.prepare(`
        INSERT INTO bills (id, companyId, partyId, billNo, date, dueDate, amount, pending)
        VALUES 
          ('b-m6-a-1', ?, 'p-m6-debtor-a', 'INV-A-1', '2026-08-01', '2026-09-01', 50000, 50000),
          ('b-m6-a-2', ?, 'p-m6-debtor-a', 'INV-A-2', '2026-09-15', '2026-10-07', 70000, 70000),
          ('b-m6-a-3', ?, 'p-m6-debtor-a', 'INV-A-3', '2026-10-10', '2026-11-15', 100000, 100000),
          ('b-m6-a-cn', ?, 'p-m6-debtor-a', 'CN-A-1', '2026-10-12', '2026-10-12', -30000, -30000)
      `).run(testCompId, testCompId, testCompId, testCompId);

      // Debtor B: Has closing balance of 60,000 paise with NO individual bills
      db.prepare(`
        INSERT INTO parties (id, tenantId, companyId, name, city, phones, closingBalance, parentGroup, partyType)
        VALUES ('p-m6-debtor-b', 'tenant-1', ?, 'Debtor B', 'Jalandhar', '["9999999992"]', 60000, 'Sundry Debtors', 'debtor')
      `).run(testCompId);

      // Creditor C: Large creditor balance (5,000,000 paise) and large bill (5,000,000 paise)
      db.prepare(`
        INSERT INTO parties (id, tenantId, companyId, name, city, phones, closingBalance, parentGroup, partyType)
        VALUES ('p-m6-creditor-c', 'tenant-1', ?, 'Creditor C', 'Amritsar', '["9999999993"]', 5000000, 'Sundry Creditors', 'creditor')
      `).run(testCompId);

      db.prepare(`
        INSERT INTO bills (id, companyId, partyId, billNo, date, dueDate, amount, pending)
        VALUES ('b-m6-c-1', ?, 'p-m6-creditor-c', 'BILL-C-1', '2026-08-01', '2026-08-30', 5000000, 5000000)
      `).run(testCompId);

      // Fetch dashboard stats for this company
      const summaryRes = await request(app)
        .get(`/api/home/summary?companyId=${testCompId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(summaryRes.status).toBe(200);
      const data = summaryRes.body;

      // Assertions:
      // Total receivables = Debtor A (140,000) + Debtor B (60,000) = 200,000 paise.
      // Creditor C (5,000,000) MUST NOT be included!
      expect(data.totalReceivables).toBe(200000);

      // Total overdue: Debtor A effective overdue is 40,000. Debtor B has no bills (0 overdue). Creditor C is excluded.
      expect(data.totalOverdue).toBe(40000);

      // Verify mostOverdue list contains only Debtor A and does not contain Creditor C
      const overduePartyIds = data.mostOverdue.map((item: any) => item.party.id);
      expect(overduePartyIds).toContain('p-m6-debtor-a');
      expect(overduePartyIds).not.toContain('p-m6-creditor-c');
    });

    it('handles debtor with negative closing balance without corrupting totalReceivables', async () => {
      // Debtor with negative closing balance (-20,000 paise, customer gave advance)
      db.prepare(`
        INSERT INTO parties (id, tenantId, companyId, name, city, phones, closingBalance, parentGroup, partyType)
        VALUES ('p-m6-debtor-neg', 'tenant-1', ?, 'Debtor Advance Payer', 'Delhi', '["9999999994"]', -20000, 'Sundry Debtors', 'debtor')
      `).run(testCompId);

      const summaryRes = await request(app)
        .get(`/api/home/summary?companyId=${testCompId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(summaryRes.status).toBe(200);
      // Receivables remains 200,000 (negative closing balance is not added and does not reduce other debtors below zero)
      expect(summaryRes.body.totalReceivables).toBe(200000);
    });
  });

  describe('R3: Purchase Challan Line Items, Round-Off & Edit Persistence', () => {
    let challanId = 'ch-m6-test-1';

    it('creates purchase challan with custom itemDescription and integer roundOff, verifying zero stock impact', async () => {
      // Create initial stock item
      db.prepare(`
        INSERT OR IGNORE INTO stock_items (id, companyId, name, partNo)
        VALUES ('item-m6-1', 'c1', 'Heavy Duty Shuttles', 'SH-88')
      `).run();

      db.prepare(`
        INSERT OR IGNORE INTO stock_balances (itemId, godownId, qty)
        VALUES ('item-m6-1', 'g-c1-main', 100)
      `).run();

      const initialStock = db.prepare('SELECT qty FROM stock_balances WHERE itemId = ? AND godownId = ?').get('item-m6-1', 'g-c1-main') as any;

      const createRes = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          id: challanId,
          companyId: 'c1',
          type: 'purchase',
          number: 'PUR/2026/001',
          date: '2026-10-16',
          partyId: 'p-m6-sync-2', // Creditor
          lines: [
            {
              itemId: 'item-m6-1',
              description: 'Heavy Duty Shuttles',
              itemDescription: 'Batch A-42 import from Germany',
              qty: 25,
              unit: 'pcs',
              rate: 45000,
              amount: 1125000,
              gstRate: 18,
            },
          ],
          roundOff: -45, // -45 paise
          status: 'queued',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.type).toBe('purchase');
      expect(createRes.body.roundOff).toBe(-45);
      expect(createRes.body.lines[0].itemDescription).toBe('Batch A-42 import from Germany');

      // Crucial invariant: Purchase challans must NOT deduct stock balances
      const postStock = db.prepare('SELECT qty FROM stock_balances WHERE itemId = ? AND godownId = ?').get('item-m6-1', 'g-c1-main') as any;
      expect(postStock.qty).toBe(initialStock.qty);
    });

    it('updates purchase challan lines, roundOff, and notes via PUT /api/challans/:id', async () => {
      const updateRes = await request(app)
        .put(`/api/challans/${challanId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roundOff: 35, // Positive 35 paise
          lines: [
            {
              itemId: 'item-m6-1',
              description: 'Heavy Duty Shuttles',
              itemDescription: 'Updated: Inspected by QA',
              qty: 30,
              unit: 'pcs',
              rate: 45000,
              amount: 1350000,
            },
          ],
          narration: 'Verified and approved',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.roundOff).toBe(35);
      expect(updateRes.body.lines[0].itemDescription).toBe('Updated: Inspected by QA');
      expect(updateRes.body.narration).toBe('Verified and approved');

      // Verify DB persistence
      const row = db.prepare('SELECT roundOff, lines FROM challans WHERE id = ?').get(challanId) as any;
      expect(row.roundOff).toBe(35);
      const parsedLines = JSON.parse(row.lines);
      expect(parsedLines[0].itemDescription).toBe('Updated: Inspected by QA');
    });
  });

  describe('R4: Past Challans and Past Bills History Filtering', () => {
    let compId = 'c-m6-history';

    beforeAll(() => {
      db.prepare(`
        INSERT INTO companies (id, tenantId, name)
        VALUES (?, 'tenant-1', 'M6 History Filter Co')
      `).run(compId);

      // Party 1: Alpha Traders
      db.prepare(`
        INSERT INTO parties (id, tenantId, companyId, name, city, phones, partyType)
        VALUES ('p-m6-h-1', 'tenant-1', ?, 'Alpha Traders Ludhiana', 'Ludhiana', '["9814000001"]', 'debtor')
      `).run(compId);

      // Party 2: Beta Industries
      db.prepare(`
        INSERT INTO parties (id, tenantId, companyId, name, city, phones, partyType)
        VALUES ('p-m6-h-2', 'tenant-1', ?, 'Beta Industries Amritsar', 'Amritsar', '["9814000002"]', 'debtor')
      `).run(compId);

      // Insert Bills with spread dates
      db.prepare(`
        INSERT INTO bills (id, companyId, partyId, billNo, date, dueDate, amount, pending)
        VALUES 
          ('b-m6-h-1', ?, 'p-m6-h-1', 'BILL-ALPHA-01', '2026-10-01', '2026-10-15', 10000, 10000),
          ('b-m6-h-2', ?, 'p-m6-h-1', 'BILL-ALPHA-02', '2026-10-15', '2026-10-30', 20000, 20000),
          ('b-m6-h-3', ?, 'p-m6-h-2', 'BILL-BETA-01',  '2026-10-20', '2026-11-05', 30000, 30000)
      `).run(compId, compId, compId);

      // Insert Challans with spread dates
      db.prepare(`
        INSERT INTO challans (id, companyId, type, number, date, partyId, status, lines)
        VALUES 
          ('ch-m6-h-1', ?, 'delivery', 'DC-ALPHA-01', '2026-10-02', 'p-m6-h-1', 'delivered', '[]'),
          ('ch-m6-h-2', ?, 'delivery', 'DC-ALPHA-02', '2026-10-16', 'p-m6-h-1', 'delivered', '[]'),
          ('ch-m6-h-3', ?, 'purchase', 'PC-BETA-01',  '2026-10-22', 'p-m6-h-2', 'delivered', '[]')
      `).run(compId, compId, compId);
    });

    it('filters bills by partyName with case-insensitivity and partial matches', async () => {
      const resAlpha = await request(app)
        .get(`/api/bills?companyId=${compId}&partyName=alpha`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(resAlpha.status).toBe(200);
      expect(resAlpha.body.length).toBe(2);
      expect(resAlpha.body.every((b: any) => b.partyName.includes('Alpha'))).toBe(true);

      const resBeta = await request(app)
        .get(`/api/bills?companyId=${compId}&partyName=BETA`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(resBeta.status).toBe(200);
      expect(resBeta.body.length).toBe(1);
      expect(resBeta.body[0].billNo).toBe('BILL-BETA-01');
    });

    it('filters bills by date range boundaries and single-day matches', async () => {
      // Single day exact match
      const resSingleDay = await request(app)
        .get(`/api/bills?companyId=${compId}&startDate=2026-10-15&endDate=2026-10-15`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(resSingleDay.status).toBe(200);
      expect(resSingleDay.body.length).toBe(1);
      expect(resSingleDay.body[0].billNo).toBe('BILL-ALPHA-02');

      // Inverted date range (startDate > endDate) -> returns empty array gracefully
      const resInverted = await request(app)
        .get(`/api/bills?companyId=${compId}&startDate=2026-10-25&endDate=2026-10-10`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(resInverted.status).toBe(200);
      expect(resInverted.body).toEqual([]);
    });

    it('filters challans by partyName and date range simultaneously', async () => {
      const resFiltered = await request(app)
        .get(`/api/challans?companyId=${compId}&partyName=alpha&startDate=2026-10-10&endDate=2026-10-31`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(resFiltered.status).toBe(200);
      expect(resFiltered.body.length).toBe(1);
      expect(resFiltered.body[0].number).toBe('DC-ALPHA-02');
    });
  });

  describe('Mathematical Fuzz Test: calculateRoundOff Invariant Verification', () => {
    it('satisfies all rounding invariants across 5000 random paise inputs', () => {
      for (let i = 0; i < 5000; i++) {
        const subtotal = Math.floor(Math.random() * 500000000); // Up to 50 Lakh Rs in paise
        const tax = Math.floor(Math.random() * 50000000);

        const result = calculateRoundOff(subtotal, tax);

        // Invariant 1: raw total matches subtotal + tax
        expect(result.subtotalWithTaxPaise).toBe(subtotal + tax);

        // Invariant 2: subtotalWithTax + roundOff === grandTotal
        expect(result.subtotalWithTaxPaise + result.roundOffPaise).toBe(result.grandTotalPaise);

        // Invariant 3: grandTotal is whole rupee (multiple of 100 paise)
        expect(result.grandTotalPaise % 100).toBe(0);

        // Invariant 4: roundOff is within [-50, +50] paise
        expect(result.roundOffPaise).toBeGreaterThanOrEqual(-50);
        expect(result.roundOffPaise).toBeLessThanOrEqual(50);
      }
    });
  });
});
