import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/db/database.js';

describe('Universal Tally Sync & Financial Statements Parity Suite', () => {
  let app: any;
  let authToken: string;
  let companyId: string;
  const companyName = `Chinese Parts(M T M) Parity ${Date.now()}`;

  beforeAll(async () => {
    initDatabase(':memory:');
    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    expect(loginRes.status).toBe(200);
    authToken = loginRes.body.token;
  });

  it('1. Syncs all ledger types (Cash, Bank, Duties & Taxes, Capital) into parties catalog', async () => {
    const pushRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        companyName,
        parties: [
          {
            id: 'p-parity-customer-1',
            name: 'Premier Customer A',
            parentGroup: 'Sundry Debtors',
            partyType: 'debtor',
            closingBalance: 815671525, // ₹81,56,715.25 Dr
            notes: 'Imported from Tally',
          },
          {
            id: 'p-parity-supplier-1',
            name: 'Premier Supplier B',
            parentGroup: 'Sundry Creditors',
            partyType: 'creditor',
            closingBalance: -635911700, // ₹63,59,117.00 Cr
            notes: 'Imported from Tally',
          },
          {
            id: 'p-parity-cash',
            name: 'Cash Ledger',
            parentGroup: 'Cash-in-Hand',
            partyType: 'cash',
            closingBalance: -948000126, // (-)₹94,80,001.26 overdrawn cash
            notes: 'Imported from Tally',
          },
          {
            id: 'p-parity-taxes',
            name: 'GST Input Tax Credit',
            parentGroup: 'Duties & Taxes',
            partyType: 'tax',
            closingBalance: -48525380, // (-)₹4,85,253.80 ITC on liability side
            notes: 'Imported from Tally',
          },
          {
            id: 'p-parity-bank',
            name: 'HDFC Current A/c',
            parentGroup: 'Bank Accounts',
            partyType: 'bank',
            closingBalance: 50000000, // ₹5,00,000.00 Dr
            notes: 'Imported from Tally',
          },
        ],
        stockItems: [
          {
            id: 's-parity-item-1',
            name: 'Industrial Valve A',
            closingQty: 1,
            rate: 1343903821, // ₹1,34,39,038.21
            unit: 'pcs',
          },
        ],
        bills: [],
        challans: [],
      });

    expect(pushRes.status).toBe(200);
    expect(pushRes.body.success).toBe(true);
    companyId = pushRes.body.companyId;
    expect(companyId).toBeDefined();
  });

  it('2. GET /api/parties only returns trade Debtors and Creditors by default, excluding Cash and Tax ledgers', async () => {
    const res = await request(app)
      .get(`/api/parties?companyId=${companyId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const parties = res.body;
    expect(Array.isArray(parties)).toBe(true);

    const names = parties.map((p: any) => p.name);
    expect(names).toContain('Premier Customer A');
    expect(names).toContain('Premier Supplier B');
    expect(names).not.toContain('Cash Ledger');
    expect(names).not.toContain('GST Input Tax Credit');
  });

  it('3. GET /api/reports/balance-sheet calculates exact Tally Silver Prime figures with negative cash and duties', async () => {
    const res = await request(app)
      .get(`/api/reports/balance-sheet?companyId=${companyId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const sheet = res.body;

    // Current Assets
    const ca = sheet.assets.currentAssets;
    expect(ca.sundryDebtors).toBe(815671525); // ₹81,56,715.25
    expect(ca.cashInHand).toBe(-948000126);   // (-)₹94,80,001.26
    expect(ca.bankAccounts).toBe(50000000);   // ₹5,00,000.00

    // Current Liabilities
    const cl = sheet.liabilities.currentLiabilities;
    expect(cl.sundryCreditors).toBe(635911700); // ₹63,59,117.00
    expect(cl.dutiesAndTaxes).toBe(-48525380);   // (-)₹4,85,253.80
    expect(cl.total).toBe(635911700 - 48525380); // ₹58,73,863.20

    // Total Assets & Liabilities Balance
    expect(sheet.assets.total).toBe(sheet.liabilities.total);
  });

  it('4. GET /api/reports/cash-bank lists Cash and Bank accounts from synchronized ledgers', async () => {
    const res = await request(app)
      .get(`/api/reports/cash-bank?companyId=${companyId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accounts');
    expect(res.body.accounts.length).toBeGreaterThanOrEqual(2);

    const cashAcct = res.body.accounts.find((a: any) => a.name.includes('Cash'));
    expect(cashAcct).toBeDefined();
    expect(cashAcct.closingBalance).toBe(-948000126);

    const bankAcct = res.body.accounts.find((a: any) => a.name.includes('HDFC'));
    expect(bankAcct).toBeDefined();
    expect(bankAcct.closingBalance).toBe(50000000);
  });

  it('5. GET /api/home/summary returns exact Sundry Debtors and Creditors matching Tally Balance Sheet', async () => {
    const res = await request(app)
      .get(`/api/home/summary?companyId=${companyId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalDebit).toBe(815671525);   // ₹81,56,715.25
    expect(res.body.totalCredit).toBe(635911700);  // ₹63,59,117.00
  });
});
