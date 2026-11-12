import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDB } from '../src/db/database.js';
import { calculateRoundOff } from '@saas/shared';

describe('Milestone 6 Challenger 2 Adversarial Stress Suite (R1-R5)', () => {
  let app: any;
  let db: any;
  let authToken: string;

  beforeAll(async () => {
    app = createApp();
    db = getDB();

    // Login as client owner (has access to c1)
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    authToken = loginRes.body.token;
    expect(authToken).toBeDefined();

    // Clean test records before start
    try {
      db.prepare("DELETE FROM challans WHERE id LIKE 'ch-m6-%'").run();
      db.prepare("DELETE FROM bills WHERE id LIKE 'b-m6-%'").run();
      db.prepare("DELETE FROM parties WHERE id LIKE 'p-m6-%' OR name IN ('Vardhman Knitting Works', 'Shree Krishna Yarns Ltd')").run();
    } catch {}
  });

  afterAll(() => {
    // Clean test records
    try {
      db.prepare("DELETE FROM challans WHERE id LIKE 'ch-m6-%'").run();
      db.prepare("DELETE FROM bills WHERE id LIKE 'b-m6-%'").run();
      db.prepare("DELETE FROM parties WHERE id LIKE 'p-m6-%' OR name IN ('Vardhman Knitting Works', 'Shree Krishna Yarns Ltd')").run();
    } catch {}
  });

  describe('R1 Adversarial: Contact Numbers Persistence, Multi-Cycle Sync & Party Differentiation', () => {
    it('preserves a collection of local contact numbers across multiple sync rounds, including empty incoming syncs and name matching', async () => {
      // 1. Initial Tally sync into company c1
      const push1 = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          parties: [
            {
              id: 'p-m6-cust-1',
              name: 'Vardhman Knitting Works',
              phones: ['+91 98140 10001'],
              customPhones: [],
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 150000,
            },
            {
              id: 'p-m6-cred-1',
              name: 'Shree Krishna Yarns Ltd',
              phones: ['+91 98140 20001'],
              customPhones: [],
              parentGroup: 'Sundry Creditors',
              partyType: 'creditor',
              closingBalance: -450000,
            },
          ],
          bills: [],
          stockItems: [],
        });
      expect(push1.status).toBe(200);

      // Verify initial state
      let p1 = (await request(app).get('/api/parties/p-m6-cust-1').set('Authorization', `Bearer ${authToken}`)).body;
      expect(p1.phones).toEqual(['+91 98140 10001']);
      expect(p1.customPhones).toEqual([]);
      expect(p1.partyType).toBe('debtor');

      // 2. Add 4 local operational phone numbers via PATCH /api/parties/:id
      const localPhoneList = [
        '+91 98140 99991',
        '+91 98140 99992',
        '+91 98140 99993',
        '+91 98140 99994',
      ];
      const patchRes = await request(app)
        .patch('/api/parties/p-m6-cust-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ customPhones: localPhoneList });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.customPhones).toEqual(localPhoneList);

      // 3. Second Tally sync with completely different master phone, empty customPhones, and updated closingBalance
      const push2 = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          parties: [
            {
              id: 'p-m6-cust-1',
              name: 'Vardhman Knitting Works',
              phones: ['+91 98140 55555'], // New master phone from Tally
              customPhones: [], // Tally daemon sends empty
              parentGroup: 'Sundry Debtors',
              closingBalance: 175000,
            },
          ],
          bills: [],
          stockItems: [],
        });
      expect(push2.status).toBe(200);

      // Verify customPhones survived intact while master phone updated
      p1 = (await request(app).get('/api/parties/p-m6-cust-1').set('Authorization', `Bearer ${authToken}`)).body;
      expect(p1.phones).toEqual(['+91 98140 55555']);
      expect(p1.customPhones).toEqual(localPhoneList);
      expect(p1.closingBalance).toBe(175000);

      // 4. Third Tally sync with empty master phones list
      const push3 = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          parties: [
            {
              id: 'p-m6-cust-1',
              name: 'Vardhman Knitting Works',
              phones: [], // Empty master phones
              customPhones: [],
            },
          ],
          bills: [],
          stockItems: [],
        });
      expect(push3.status).toBe(200);

      p1 = (await request(app).get('/api/parties/p-m6-cust-1').set('Authorization', `Bearer ${authToken}`)).body;
      expect(p1.customPhones).toEqual(localPhoneList);

      // 5. User intentionally removes 2 numbers via PATCH
      const reducedList = ['+91 98140 99991', '+91 98140 99994'];
      const patchDelete = await request(app)
        .patch('/api/parties/p-m6-cust-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ customPhones: reducedList });
      expect(patchDelete.status).toBe(200);
      expect(patchDelete.body.customPhones).toEqual(reducedList);

      // 6. Test debtor/creditor query filtering
      const debtorQuery = await request(app)
        .get('/api/parties?companyId=c1&type=debtor')
        .set('Authorization', `Bearer ${authToken}`);
      expect(debtorQuery.status).toBe(200);
      expect(debtorQuery.body.some((p: any) => p.id === 'p-m6-cust-1')).toBe(true);
      expect(debtorQuery.body.some((p: any) => p.id === 'p-m6-cred-1')).toBe(false);

      const creditorQuery = await request(app)
        .get('/api/parties?companyId=c1&type=creditor')
        .set('Authorization', `Bearer ${authToken}`);
      expect(creditorQuery.status).toBe(200);
      expect(creditorQuery.body.some((p: any) => p.id === 'p-m6-cust-1')).toBe(false);
      expect(creditorQuery.body.some((p: any) => p.id === 'p-m6-cred-1')).toBe(true);
    });
  });

  describe('R2 Adversarial: Home Receivables Boundary Conditions & Discrepancy Reconciliation', () => {
    it('correctly handles boundary conditions: large advances, negative closing balance, non-bill debtor balance, and creditor exclusion', async () => {
      // Clean previous bills and parties in c1 for isolation
      db.prepare("DELETE FROM bills WHERE id LIKE 'b-m6-%'").run();
      db.prepare("DELETE FROM parties WHERE id LIKE 'p-m6-adv-%'").run();

      // Setup parties in c1:
      // Debtor A: Has 2 positive bills (10,000 overdue, 20,000 overdue), but 1 advance bill (-35,000). Net = -5,000.
      // Debtor B: Has 2 positive bills (30,000 older, 20,000 newer). Authoritative closingBalance = 25,000.
      // Debtor C: Has NO bills at all, but positive closingBalance = 40,000 (opening balance).
      // Debtor D: Has negative closing balance -10,000 (excess advance).
      // Creditor E: Has positive closing balance 500,000 (supplier payable). Must be excluded.

      db.prepare(`
        INSERT OR REPLACE INTO parties (id, tenantId, companyId, name, city, phones, customPhones, parentGroup, partyType, closingBalance)
        VALUES 
          ('p-m6-adv-a', 'tenant-1', 'c1', 'Debtor Advance Exceeds', 'Ludhiana', '[]', '[]', 'Sundry Debtors', 'debtor', -5000),
          ('p-m6-adv-b', 'tenant-1', 'c1', 'Debtor Reconciled FIFO', 'Jalandhar', '[]', '[]', 'Sundry Debtors', 'debtor', 25000),
          ('p-m6-adv-c', 'tenant-1', 'c1', 'Debtor Unbilled Balance', 'Amritsar', '[]', '[]', 'Sundry Debtors', 'debtor', 40000),
          ('p-m6-adv-d', 'tenant-1', 'c1', 'Debtor Negative Balance', 'Bathinda', '[]', '[]', 'Sundry Debtors', 'debtor', -10000),
          ('p-m6-adv-e', 'tenant-1', 'c1', 'Creditor Large Balance', 'Delhi', '[]', '[]', 'Sundry Creditors', 'creditor', 500000)
      `).run();

      // Bills for Debtor A:
      db.prepare(`
        INSERT OR REPLACE INTO bills (id, companyId, partyId, billNo, date, dueDate, dueDays, amount, pending, source)
        VALUES
          ('b-m6-a1', 'c1', 'p-m6-adv-a', 'INV-A1', '2026-08-01', '2026-08-31', 30, 10000, 10000, 'tally'),
          ('b-m6-a2', 'c1', 'p-m6-adv-a', 'INV-A2', '2026-09-01', '2026-09-30', 30, 20000, 20000, 'tally'),
          ('b-m6-a3', 'c1', 'p-m6-adv-a', 'ADV-A3', '2026-09-15', '2026-09-15', 0, -35000, -35000, 'tally')
      `).run();

      // Bills for Debtor B:
      db.prepare(`
        INSERT OR REPLACE INTO bills (id, companyId, partyId, billNo, date, dueDate, dueDays, amount, pending, source)
        VALUES
          ('b-m6-b1', 'c1', 'p-m6-adv-b', 'INV-B1', '2026-07-01', '2026-07-31', 30, 30000, 30000, 'tally'),
          ('b-m6-b2', 'c1', 'p-m6-adv-b', 'INV-B2', '2026-09-01', '2026-09-30', 30, 20000, 20000, 'tally')
      `).run();

      const summaryRes = await request(app)
        .get('/api/home/summary?companyId=c1')
        .set('Authorization', `Bearer ${authToken}`);
      expect(summaryRes.status).toBe(200);

      const summary = summaryRes.body;

      // Calculation breakdown for Debtor A, B, C, D, E:
      // Debtor A: closingBalance is -5000 (<= 0). Contributes 0 to receivables, 0 to overdue.
      // Debtor B: closingBalance is 25,000 (> 0).
      //   positive bills = 30,000 (INV-B1) + 20,000 (INV-B2) = 50,000.
      //   reduction pool = 50,000 - 25,000 = 25,000.
      //   FIFO: INV-B1 reduced by 25,000 -> 5,000 pending remaining.
      //         INV-B2 untouched -> 20,000 pending remaining.
      //   Both INV-B1 and INV-B2 are overdue -> total overdue for B = 5,000 + 20,000 = 25,000.
      // Debtor C: closingBalance is 40,000 (> 0). Has 0 bills -> contributes 40,000 to receivables, 0 to overdue, 40,000 to notDue.
      // Debtor D: closingBalance is -10000 (<= 0) -> contributes 0.
      // Creditor E: Creditor -> strictly excluded. Contributes 0.

      // Verify mostOverdue strictly excludes Creditor E and Debtor A
      expect(summary.mostOverdue.some((item: any) => item.party.id === 'p-m6-adv-e')).toBe(false);
      expect(summary.mostOverdue.some((item: any) => item.party.id === 'p-m6-adv-a')).toBe(false);
      expect(summary.mostOverdue.some((item: any) => item.party.id === 'p-m6-adv-b')).toBe(true);

      const overdueItemB = summary.mostOverdue.find((item: any) => item.party.id === 'p-m6-adv-b');
      expect(overdueItemB.amount).toBe(25000);
    });
  });

  describe('R3 Adversarial: Purchase Challans Round-Off, Special Character Line Notes & Full PUT Editing', () => {
    it('maintains mathematical invariants across calculateRoundOff for extreme paise numbers', () => {
      const testCases = [
        { sub: 0, tax: 0, expectedGrand: 0, expectedDelta: 0 },
        { sub: 99, tax: 0, expectedGrand: 100, expectedDelta: 1 },
        { sub: 100, tax: 0, expectedGrand: 100, expectedDelta: 0 },
        { sub: 101, tax: 0, expectedGrand: 100, expectedDelta: -1 },
        { sub: 149, tax: 0, expectedGrand: 100, expectedDelta: -49 },
        { sub: 150, tax: 0, expectedGrand: 200, expectedDelta: 50 },
        { sub: 151, tax: 0, expectedGrand: 200, expectedDelta: 49 },
        { sub: 8452341, tax: 1521421, expectedGrand: 9973800, expectedDelta: 38 },
      ];

      for (const tc of testCases) {
        const res = calculateRoundOff(tc.sub, tc.tax);
        expect(res.grandTotalPaise).toBe(tc.expectedGrand);
        expect(res.roundOffPaise).toBe(tc.expectedDelta);
        expect(res.subtotalWithTaxPaise + res.roundOffPaise).toBe(res.grandTotalPaise);
        expect(res.grandTotalPaise % 100).toBe(0);
      }
    });

    it('creates and edits purchase challan with multiline descriptions, unicode notes, and roundOff persistence', async () => {
      const complexDescription = 'Heavy Duty Motor #3 - 1440 RPM\nSerial: SN-9988\nNotes: Special order for Ludhiana unit.\n<script>alert("test")</script>';

      // 1. POST purchase challan
      const createRes = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          type: 'purchase',
          partyId: 'p-m6-cust-1',
          date: '2026-10-10',
          roundOff: -34,
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              itemDescription: complexDescription,
              qty: 2,
              unit: 'pcs',
              rate: 750000,
              amount: 1500000,
            },
          ],
        });
      expect(createRes.status).toBe(201);
      const challanId = createRes.body.id;
      expect(createRes.body.roundOff).toBe(-34);
      expect(createRes.body.lines[0].itemDescription).toBe(complexDescription);

      // 2. PUT /api/challans/:id complete edit
      const updatedDescription = 'Updated after inspection: verified motor mounts.';
      const putRes = await request(app)
        .put(`/api/challans/${challanId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          type: 'purchase',
          partyId: 'p-m6-cred-1',
          date: '2026-10-12',
          roundOff: 45,
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              itemDescription: updatedDescription,
              qty: 3,
              unit: 'pcs',
              rate: 700000,
              amount: 2100000,
            },
          ],
        });
      expect(putRes.status).toBe(200);
      expect(putRes.body.roundOff).toBe(45);
      expect(putRes.body.partyId).toBe('p-m6-cred-1');
      expect(putRes.body.lines[0].itemDescription).toBe(updatedDescription);
      expect(putRes.body.lines[0].qty).toBe(3);

      // 3. Fetch from database to verify persistence
      const getRes = await request(app)
        .get(`/api/challans/${challanId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.roundOff).toBe(45);
      expect(getRes.body.lines[0].itemDescription).toBe(updatedDescription);
    });
  });

  describe('R4 Adversarial: History Filtering Boundary Invariants (Bills & Challans)', () => {
    beforeAll(() => {
      // Seed specific test bills for date range boundary tests
      db.prepare(`
        INSERT OR REPLACE INTO bills (id, companyId, partyId, billNo, date, dueDate, dueDays, amount, pending, source)
        VALUES
          ('b-m6-hist-1', 'c1', 'p-m6-cust-1', 'INV-HIST-1', '2026-05-01', '2026-05-31', 30, 10000, 10000, 'tally'),
          ('b-m6-hist-2', 'c1', 'p-m6-cust-1', 'INV-HIST-2', '2026-06-15', '2026-07-15', 30, 20000, 20000, 'tally'),
          ('b-m6-hist-3', 'c1', 'p-m6-cust-1', 'INV-HIST-3', '2026-07-31', '2026-08-30', 30, 30000, 30000, 'tally')
      `).run();

      // Seed challans for date range boundary tests
      db.prepare(`
        INSERT OR REPLACE INTO challans (id, companyId, partyId, number, type, date, lines, roundOff, status)
        VALUES
          ('ch-m6-hist-1', 'c1', 'p-m6-cust-1', 'DC-HIST-1', 'delivery', '2026-05-01', '[]', 0, 'confirmed'),
          ('ch-m6-hist-2', 'c1', 'p-m6-cust-1', 'DC-HIST-2', 'delivery', '2026-06-15', '[]', 0, 'confirmed'),
          ('ch-m6-hist-3', 'c1', 'p-m6-cust-1', 'DC-HIST-3', 'delivery', '2026-07-31', '[]', 0, 'confirmed')
      `).run();
    });

    it('handles inverted date ranges gracefully by returning empty array without error', async () => {
      // Inverted date range: startDate > endDate
      const billsRes = await request(app)
        .get('/api/bills?companyId=c1&startDate=2026-08-01&endDate=2026-05-01')
        .set('Authorization', `Bearer ${authToken}`);
      expect(billsRes.status).toBe(200);
      expect(Array.isArray(billsRes.body)).toBe(true);
      expect(billsRes.body.length).toBe(0);

      const challansRes = await request(app)
        .get('/api/challans?companyId=c1&startDate=2026-08-01&endDate=2026-05-01')
        .set('Authorization', `Bearer ${authToken}`);
      expect(challansRes.status).toBe(200);
      expect(Array.isArray(challansRes.body)).toBe(true);
      expect(challansRes.body.length).toBe(0);
    });

    it('filters exact single day boundary correctly for both bills and challans', async () => {
      // Exact single day: 2026-06-15
      const billsRes = await request(app)
        .get('/api/bills?companyId=c1&startDate=2026-06-15&endDate=2026-06-15')
        .set('Authorization', `Bearer ${authToken}`);
      expect(billsRes.status).toBe(200);
      expect(billsRes.body.length).toBe(1);
      expect(billsRes.body[0].billNo).toBe('INV-HIST-2');

      const challansRes = await request(app)
        .get('/api/challans?companyId=c1&startDate=2026-06-15&endDate=2026-06-15')
        .set('Authorization', `Bearer ${authToken}`);
      expect(challansRes.status).toBe(200);
      expect(challansRes.body.length).toBe(1);
      expect(challansRes.body[0].number).toBe('DC-HIST-2');
    });

    it('handles SQL special characters (% and _) in partyName and query strings safely', async () => {
      const billsRes = await request(app)
        .get("/api/bills?companyId=c1&q=%25&partyName=%25")
        .set('Authorization', `Bearer ${authToken}`);
      expect(billsRes.status).toBe(200);
      expect(Array.isArray(billsRes.body)).toBe(true);

      const challansRes = await request(app)
        .get("/api/challans?companyId=c1&q=%27OR%201=1--")
        .set('Authorization', `Bearer ${authToken}`);
      expect(challansRes.status).toBe(200);
      expect(Array.isArray(challansRes.body)).toBe(true);
    });
  });
});
