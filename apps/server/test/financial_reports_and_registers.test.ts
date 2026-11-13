import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Financial Reports & Registers API', () => {
  let app: any;
  let ownerToken: string;
  let companyId: string;

  beforeAll(async () => {
    app = createApp(':memory:');

    // Login as owner to get valid token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    expect(loginRes.status).toBe(200);
    ownerToken = loginRes.body.token;
    companyId = loginRes.body.companies[0].id;

    // Push test vouchers, parties, and stock to sync
    const syncRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        companyId,
        parties: [
          { id: 'p-1', name: 'Sharma Auto', closingBalance: 5000000, parentGroup: 'Sundry Debtors', partyType: 'debtor' },
          { id: 'p-2', name: 'Bosch Ltd', closingBalance: -3000000, parentGroup: 'Sundry Creditors', partyType: 'creditor' },
          { id: 'p-3', name: 'HDFC Bank', closingBalance: 10000000, parentGroup: 'Bank Accounts', partyType: 'other' },
        ],
        stockItems: [
          { id: 'it-1', name: 'Brake Pads Set', closingQty: 100, unit: 'set', rate: 500000 },
        ],
        vouchers: [
          {
            id: 'vch-101',
            voucherType: 'Sales',
            voucherNumber: 'INV-2026-001',
            date: '2026-10-15',
            partyName: 'Sharma Auto',
            amount: 5000000, // ₹50,000
            narration: 'Brake pads dispatch',
            ledgerEntries: [
              { ledger: 'Sharma Auto', amount: 5000000, isDebit: true },
              { ledger: 'Sales Account', amount: 5000000, isDebit: false },
            ],
            inventoryEntries: [
              { item: 'Brake Pads Set', qty: 10, rate: 500000, amount: 5000000, unit: 'set' },
            ],
          },
          {
            id: 'vch-102',
            voucherType: 'Purchase',
            voucherNumber: 'PUR-2026-001',
            date: '2026-10-10',
            partyName: 'Bosch Ltd',
            amount: 3000000, // ₹30,000
            narration: 'Raw materials stock',
            ledgerEntries: [
              { ledger: 'Purchase Account', amount: 3000000, isDebit: true },
              { ledger: 'Bosch Ltd', amount: 3000000, isDebit: false },
            ],
            inventoryEntries: [
              { item: 'Brake Pads Set', qty: 10, rate: 300000, amount: 3000000, unit: 'set' },
            ],
          },
          {
            id: 'vch-103',
            voucherType: 'Payment',
            voucherNumber: 'PAY-2026-001',
            date: '2026-10-12',
            partyName: 'Bosch Ltd',
            amount: 2000000, // ₹20,000
            narration: 'Vendor payment from HDFC Bank',
            ledgerEntries: [
              { ledger: 'Bosch Ltd', amount: 2000000, isDebit: true },
              { ledger: 'HDFC Bank', amount: 2000000, isDebit: false },
            ],
          },
        ],
      });
    expect(syncRes.status).toBe(200);
  });

  it('GET /api/reports/profit-and-loss returns trading account & net profit', async () => {
    const res = await request(app)
      .get(`/api/reports/profit-and-loss?companyId=${companyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.tradingAccount).toBeDefined();
    expect(res.body.tradingAccount.credits.sales).toBeGreaterThanOrEqual(5000000);
    expect(res.body.tradingAccount.debits.purchases).toBeGreaterThanOrEqual(3000000);
    expect(res.body.incomeStatement.grossProfit).toBeDefined();
    expect(res.body.incomeStatement.netProfit).toBeDefined();
  });

  it('GET /api/reports/trial-balance returns group hierarchy with debit and credit balancing', async () => {
    const res = await request(app)
      .get(`/api/reports/trial-balance?companyId=${companyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.groups).toBeInstanceOf(Array);
    expect(res.body.grandTotalDebit).toBeGreaterThan(0);
    expect(res.body.grandTotalCredit).toBeGreaterThan(0);
  });

  it('GET /api/reports/daybook returns filterable voucher log with drilldown', async () => {
    const res = await request(app)
      .get(`/api/reports/daybook?companyId=${companyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vouchers).toBeInstanceOf(Array);
    expect(res.body.vouchers.length).toBeGreaterThan(0);

    const vch = res.body.vouchers[0];
    const detailRes = await request(app)
      .get(`/api/reports/daybook/${vch.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.voucherNumber).toBe(vch.voucherNumber);
    expect(detailRes.body.ledgerEntries).toBeInstanceOf(Array);
  });

  it('GET /api/reports/sales-register and /purchase-register return 12-month turnover', async () => {
    const salesRes = await request(app)
      .get(`/api/reports/sales-register?companyId=${companyId}&year=2026`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(salesRes.status).toBe(200);
    expect(salesRes.body.months).toHaveLength(12);
    expect(salesRes.body.grandTotal).toBeGreaterThanOrEqual(5000000);

    const purRes = await request(app)
      .get(`/api/reports/purchase-register?companyId=${companyId}&year=2026`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(purRes.status).toBe(200);
    expect(purRes.body.months).toHaveLength(12);
    expect(purRes.body.grandTotal).toBeGreaterThanOrEqual(3000000);
  });

  it('GET /api/reports/cash-bank returns cash and bank balances', async () => {
    const res = await request(app)
      .get(`/api/reports/cash-bank?companyId=${companyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.accounts).toBeInstanceOf(Array);
    expect(typeof res.body.totalCash).toBe('number');
    expect(typeof res.body.totalBank).toBe('number');
  });

  it('GET /api/stock/items/:id/history returns item movements from vouchers and challans', async () => {
    // Get stock items array
    const stockRes = await request(app)
      .get(`/api/stock?companyId=${companyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(stockRes.status).toBe(200);
    expect(stockRes.body).toBeInstanceOf(Array);
    const item = stockRes.body[0].item;

    const histRes = await request(app)
      .get(`/api/stock/items/${item.id}/history`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(histRes.status).toBe(200);
    expect(histRes.body.movements).toBeInstanceOf(Array);
  });
});
