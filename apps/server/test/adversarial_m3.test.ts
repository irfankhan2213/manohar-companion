import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDB } from '../src/db/database.js';

describe('Milestone 3 Empirical Adversarial Challenge Suite', () => {
  let app: any;
  let db: any;
  let authToken: string;

  beforeAll(async () => {
    app = createApp();
    db = getDB();

    // Dev admin login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    authToken = loginRes.body.token;
    expect(authToken).toBeDefined();
  });

  afterAll(() => {
    // Clean test records
    try {
      db.prepare("DELETE FROM bills WHERE companyId LIKE 'comp-adv-%'").run();
      db.prepare("DELETE FROM parties WHERE companyId LIKE 'comp-adv-%'").run();
      db.prepare("DELETE FROM companies WHERE id LIKE 'comp-adv-%'").run();
    } catch {}
  });

  describe('R1: Party Custom Phones Persistence & Tally Sync Protection', () => {
    const testCompanyId = 'comp-adv-r1';

    it('preserves custom contact numbers across repeated Tally sync cycles and name-matching syncs', async () => {
      // 1. Initial Tally sync push with phone A
      const pushRes1 = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: testCompanyId,
          companyName: 'Adversarial R1 Company',
          parties: [
            {
              id: 'p-adv-cust-1',
              name: 'Gupta Steel Traders',
              phones: ['+91 98000 11111'], // Tally phone A
              customPhones: [], // Tally agent sends empty
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 100000,
            },
            {
              id: 'p-adv-cred-1',
              name: 'National Metal Suppliers',
              phones: ['+91 98000 22222'],
              customPhones: [],
              parentGroup: 'Sundry Creditors',
              partyType: 'creditor',
              closingBalance: -300000,
            },
          ],
          bills: [],
          stockItems: [],
        });
      expect(pushRes1.status).toBe(200);

      // Verify initial state
      let party = (await request(app).get('/api/parties/p-adv-cust-1').set('Authorization', `Bearer ${authToken}`)).body;
      expect(party.phones).toEqual(['+91 98000 11111']);
      expect(party.customPhones).toEqual([]);
      expect(party.partyType).toBe('debtor');

      // 2. User adds custom local operational contact numbers via PATCH /api/parties/:id
      const patchRes = await request(app)
        .patch('/api/parties/p-adv-cust-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customPhones: ['+91 98111 22222', '+91 98333 44444'],
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.customPhones).toEqual(['+91 98111 22222', '+91 98333 44444']);

      // 3. Tally runs full synchronization cycle with updated master phone C and empty customPhones
      const pushRes2 = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: testCompanyId,
          parties: [
            {
              id: 'p-adv-cust-1',
              name: 'Gupta Steel Traders',
              phones: ['+91 98999 55555'], // Updated Tally master phone C
              customPhones: [], // Incoming Tally sync payload NEVER has custom phones
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 150000,
            },
          ],
          bills: [],
          stockItems: [],
        });
      expect(pushRes2.status).toBe(200);

      // Verify custom phones were NOT wiped out by incoming Tally sync
      party = (await request(app).get('/api/parties/p-adv-cust-1').set('Authorization', `Bearer ${authToken}`)).body;
      expect(party.phones).toEqual(['+91 98999 55555']); // Master phone C updated
      expect(party.customPhones).toEqual(['+91 98111 22222', '+91 98333 44444']); // Local custom phones PRESERVED!

      // 4. Test match-by-name branch when agent generates a different party ID
      const pushRes3 = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: testCompanyId,
          parties: [
            {
              id: 'p-adv-generated-id-999',
              name: 'Gupta Steel Traders', // Exact match on name
              phones: ['+91 98777 66666'], // Phone D
              customPhones: [],
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 200000,
            },
          ],
          bills: [],
          stockItems: [],
        });
      expect(pushRes3.status).toBe(200);

      // Verify name-matching preserved existing record & custom numbers
      party = (await request(app).get('/api/parties/p-adv-cust-1').set('Authorization', `Bearer ${authToken}`)).body;
      expect(party.phones).toEqual(['+91 98777 66666']);
      expect(party.customPhones).toEqual(['+91 98111 22222', '+91 98333 44444']);

      // 5. User intentionally removes one custom phone via PATCH
      const patchRemove = await request(app)
        .patch('/api/parties/p-adv-cust-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customPhones: ['+91 98111 22222'],
        });
      expect(patchRemove.status).toBe(200);
      expect(patchRemove.body.customPhones).toEqual(['+91 98111 22222']);

      // Another Tally sync push should preserve the user's updated single custom phone
      await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: testCompanyId,
          parties: [
            {
              id: 'p-adv-cust-1',
              name: 'Gupta Steel Traders',
              phones: ['+91 98777 66666'],
              customPhones: [],
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 220000,
            },
          ],
          bills: [],
          stockItems: [],
        });

      party = (await request(app).get('/api/parties/p-adv-cust-1').set('Authorization', `Bearer ${authToken}`)).body;
      expect(party.customPhones).toEqual(['+91 98111 22222']);
    });

    it('differentiates debtors and creditors with GET /api/parties?type=debtor|creditor', async () => {
      const debtors = (await request(app).get(`/api/parties?companyId=${testCompanyId}&type=debtor`).set('Authorization', `Bearer ${authToken}`)).body;
      expect(debtors.some((p: any) => p.name === 'Gupta Steel Traders')).toBe(true);
      expect(debtors.some((p: any) => p.name === 'National Metal Suppliers')).toBe(false);

      const creditors = (await request(app).get(`/api/parties?companyId=${testCompanyId}&type=creditor`).set('Authorization', `Bearer ${authToken}`)).body;
      expect(creditors.some((p: any) => p.name === 'National Metal Suppliers')).toBe(true);
      expect(creditors.some((p: any) => p.name === 'Gupta Steel Traders')).toBe(false);
    });
  });

  describe('R2: Home Screen "Customers Owe You" Receivables Adversarial Calculation', () => {
    const testCompanyId = 'comp-adv-r2-calc';

    it('accurately reconciles advances via FIFO, credit notes, and 100% excludes creditors', async () => {
      // Create complex accounting fixture:
      // Debtor 1: Has 3 bills totaling ₹45,000 (4,500,000 paise).
      //   - Bill 1: 2026-07-01 (due 2026-07-31) = ₹10,000 (overdue)
      //   - Bill 2: 2026-08-01 (due 2026-08-31) = ₹15,000 (overdue)
      //   - Bill 3: 2026-10-01 (due 2026-10-31) = ₹20,000 (not due on 2026-10-17)
      //   - Tally closing balance = ₹25,000 (2,500,000 paise), reflecting an on-account advance of ₹20,000 (2,000,000 paise).
      //   - FIFO Resolution:
      //       * Advance ₹20,000 extinguishes Bill 1 (₹10,000) completely (remaining advance: ₹10,000).
      //       * Advance ₹10,000 reduces Bill 2 (₹15,000) down to ₹5,000 (remaining advance: 0).
      //       * Bill 3 remains ₹20,000 not due.
      //       * Effective overdue = ₹5,000 (from Bill 2).
      //       * Effective not-due = ₹20,000 (from Bill 3).
      //       * Total receivable = ₹25,000.
      //
      // Debtor 2: Credit note scenario without Tally closing balance (fallback to billSum):
      //   - Bill 1: 2026-08-10 (due 2026-09-10) = ₹30,000 (3,000,000 paise, overdue)
      //   - Credit Note: 2026-08-20 = -₹10,000 (-1,000,000 paise)
      //   - Closing balance = 0.
      //   - Bill sum = 30,000 - 10,000 = ₹20,000 (2,000,000 paise).
      //   - Effective overdue = ₹20,000 (2,000,000 paise).
      //
      // Debtor 3: Customer with negative closing balance (advance paid in excess, closing balance = -₹50,000):
      //   - Must NOT be added to totalReceivables.
      //   - Must NOT be inverted by Math.abs.
      //
      // Creditor 1: Supplier we owe ₹500,000 (closing balance = -50,000,000 paise, bill = 50,000,000 paise):
      //   - Must be 100% EXCLUDED from totalReceivables, totalOverdue, and mostOverdue!
      //
      // Creditor 2: Supplier where we paid advance (+₹100,000 debit balance):
      //   - Must be 100% EXCLUDED from totalReceivables!

      const pushRes = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: testCompanyId,
          companyName: 'Receivables Stress Test Corp',
          parties: [
            {
              id: 'p-adv-d1',
              name: 'Debtor One Advances Corp',
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 2500000, // ₹25,000
            },
            {
              id: 'p-adv-d2',
              name: 'Debtor Two Credit Notes Corp',
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: 0, // Fallback to bill sum
            },
            {
              id: 'p-adv-d3',
              name: 'Debtor Three Excess Advance',
              parentGroup: 'Sundry Debtors',
              partyType: 'debtor',
              closingBalance: -5000000, // -₹50,000
            },
            {
              id: 'p-adv-c1',
              name: 'Supplier Payable Huge Corp',
              parentGroup: 'Sundry Creditors',
              partyType: 'creditor',
              closingBalance: -50000000, // -₹500,000
            },
            {
              id: 'p-adv-c2',
              name: 'Supplier Advance Given Corp',
              parentGroup: 'Sundry Creditors',
              partyType: 'creditor',
              closingBalance: 10000000, // +₹100,000 advance given
            },
          ],
          bills: [
            // Debtor 1 bills
            {
              id: 'b-adv-d1-1',
              partyId: 'p-adv-d1',
              billNo: 'INV/D1/01',
              date: '2026-07-01',
              dueDate: '2026-07-31',
              amount: 1000000, // ₹10,000
              pending: 1000000,
            },
            {
              id: 'b-adv-d1-2',
              partyId: 'p-adv-d1',
              billNo: 'INV/D1/02',
              date: '2026-08-01',
              dueDate: '2026-08-31',
              amount: 1500000, // ₹15,000
              pending: 1500000,
            },
            {
              id: 'b-adv-d1-3',
              partyId: 'p-adv-d1',
              billNo: 'INV/D1/03',
              date: '2026-10-01',
              dueDate: '2026-10-31',
              amount: 2000000, // ₹20,000
              pending: 2000000,
            },
            // Debtor 2 bills
            {
              id: 'b-adv-d2-1',
              partyId: 'p-adv-d2',
              billNo: 'INV/D2/01',
              date: '2026-08-10',
              dueDate: '2026-09-10',
              amount: 3000000, // ₹30,000
              pending: 3000000,
            },
            {
              id: 'b-adv-d2-cn',
              partyId: 'p-adv-d2',
              billNo: 'CN/D2/01',
              date: '2026-08-20',
              dueDate: '2026-08-20',
              amount: -1000000, // -₹10,000
              pending: -1000000,
            },
            // Creditor 1 purchase bill
            {
              id: 'b-adv-c1-1',
              partyId: 'p-adv-c1',
              billNo: 'PUR/C1/01',
              date: '2026-08-01',
              dueDate: '2026-08-31',
              amount: 50000000,
              pending: 50000000,
            },
          ],
          stockItems: [],
        });
      expect(pushRes.status).toBe(200);

      // Fetch dashboard / home summary for this test company
      const summaryRes = await request(app)
        .get(`/api/home/summary?companyId=${testCompanyId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(summaryRes.status).toBe(200);

      const stats = summaryRes.body;

      // 1. Total Receivables:
      // Debtor 1: ₹25,000 (2,500,000)
      // Debtor 2: ₹20,000 (2,000,000)
      // Debtor 3: ₹0 (negative balance excluded, not converted via Math.abs)
      // Creditor 1 & 2: 100% EXCLUDED
      // Expected totalReceivables: 2,500,000 + 2,000,000 = 4,500,000 paise (₹45,000).
      expect(stats.totalReceivables).toBe(4500000);

      // 2. Total Overdue:
      // Debtor 1: Bill 1 (₹10,000) extinguished by advance. Bill 2 (₹15,000) reduced to ₹5,000.
      // Debtor 2: Bill 1 (₹30,000) reduced to ₹20,000 by credit note.
      // Expected totalOverdue: 500,000 + 2,000,000 = 2,500,000 paise (₹25,000).
      expect(stats.totalOverdue).toBe(2500000);

      // 3. Not Due:
      // Debtor 1 Bill 3 (₹20,000) is due 2026-10-31 (today in seed comparison is 2026-10-17, or current IST).
      // Expected notDue: 2,000,000 paise (₹20,000).
      expect(stats.notDue).toBe(2000000);

      // 4. Overdue Parties List:
      // Must NOT contain any creditors
      expect(stats.overdueParties.some((p: any) => p.party.partyType === 'creditor')).toBe(false);
      expect(stats.overdueParties.some((p: any) => p.party.name.includes('Supplier'))).toBe(false);

      // Debtor 1 overdue amount in list must reflect post-FIFO pending (₹5,000, NOT ₹25,000)
      const debtor1Entry = stats.overdueParties.find((p: any) => p.party.id === 'p-adv-d1');
      expect(debtor1Entry).toBeDefined();
      expect(debtor1Entry.amount).toBe(500000); // exactly ₹5,000

      // Debtor 2 overdue amount in list must reflect post-credit-note pending (₹20,000)
      const debtor2Entry = stats.overdueParties.find((p: any) => p.party.id === 'p-adv-d2');
      expect(debtor2Entry).toBeDefined();
      expect(debtor2Entry.amount).toBe(2000000); // exactly ₹20,000

      // Debtor 3 (negative balance) must NOT appear in overdue list
      expect(stats.overdueParties.some((p: any) => p.party.id === 'p-adv-d3')).toBe(false);
    });
  });
});
