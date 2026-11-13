import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, getDB } from '../src/db/database.js';
import { calculateRoundOff, numberToIndianWords, formatINR } from '@saas/shared';

describe('Balance Sheet & Financials Empirical Verification Suite', () => {
  let app: any;
  let authToken: string;
  const companyName = 'Chinese Parts(M T M)';
  let companyId: string;

  beforeAll(async () => {
    initDatabase(':memory:');
    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    authToken = loginRes.body.token;

    // Seed the company with Tally Silver Prime financial data
    // Net Sundry Debtors: ₹81,56,715.25 (815671525 paise)
    // Comprising:
    // - Gross Debtor 1 (Customer Alpha): ₹85,00,000.00 (850000000 paise)
    // - Advance Credit Debtor 2 (Customer Beta): -₹3,43,284.75 (-34328475 paise)
    // Net totalDebit = 850000000 - 34328475 = 815671525 paise (₹81,56,715.25)
    // Gross Debit = 850000000 paise
    // Advance Credit = 34328475 paise
    //
    // Sundry Creditors: ₹63,59,117.00 (635911700 paise)
    // Comprising:
    // - Creditor 1 (Supplier Mega Parts): -₹63,59,117.00 (-635911700 paise)
    //
    // Duties & Taxes: -₹4,85,253.80 (-48525380 paise)
    // Cash-in-Hand: -₹94,80,001.26 (-948000126 paise)
    // Closing Stock: ₹1,34,39,038.21 (1343903821 paise)
    const pushRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        companyName,
        parties: [
          {
            id: 'p-alpha-debtor',
            name: 'Customer Alpha Prime',
            city: 'Ludhiana',
            phones: ['+91 98140 00001'],
            parentGroup: 'Sundry Debtors',
            partyType: 'debtor',
            closingBalance: 850000000, // ₹85,00,000.00
            notes: 'Imported from Tally',
          },
          {
            id: 'p-beta-debtor-advance',
            name: 'Customer Beta Advance',
            city: 'Jalandhar',
            phones: ['+91 98140 00002'],
            parentGroup: 'Sundry Debtors',
            partyType: 'debtor',
            closingBalance: -34328475, // -₹3,43,284.75 advance credit
            notes: 'Imported from Tally',
          },
          {
            id: 'p-mega-supplier',
            name: 'Supplier Mega Parts Corp',
            city: 'Delhi',
            phones: ['+91 98110 00003'],
            parentGroup: 'Sundry Creditors',
            partyType: 'creditor',
            closingBalance: -635911700, // -₹63,59,117.00
            notes: 'Imported from Tally',
          },
          {
            id: 'p-duties-taxes',
            name: 'Input CGST/SGST Ledger',
            city: 'Ludhiana',
            parentGroup: 'Duties & Taxes',
            closingBalance: -48525380, // -₹4,85,253.80
          },
          {
            id: 'p-cash-account',
            name: 'Cash Ledger',
            city: 'Ludhiana',
            parentGroup: 'Cash-in-Hand',
            closingBalance: -948000126, // -₹94,80,001.26
          },
        ],
        stockItems: [
          {
            id: 'item-silver-prime-stock',
            name: 'Industrial Machinery Component A',
            rate: 1343903821,
            closingQty: 1,
            unit: 'pcs',
            group: 'Machinery',
          },
        ],
        bills: [],
        challans: [],
      });

    expect(pushRes.status).toBe(200);
    companyId = pushRes.body.companyId;
    expect(companyId).toBeDefined();
  });

  describe('1. Tally Silver Prime Balance Sheet Structure: GET /api/reports/balance-sheet', () => {
    it('returns exact Tally Silver Prime Balance Sheet structure with Current Assets and Current Liabilities', async () => {
      const res = await request(app)
        .get(`/api/reports/balance-sheet?companyId=${companyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const sheet = res.body;

      // Top-level structure verification
      expect(sheet).toHaveProperty('asOfDate');
      expect(typeof sheet.asOfDate).toBe('string');
      expect(sheet).toHaveProperty('companyName');
      expect(sheet.companyName).toBe(companyName);
      expect(sheet).toHaveProperty('liabilities');
      expect(sheet).toHaveProperty('assets');

      // Current Liabilities structure verification
      const liabilities = sheet.liabilities;
      expect(liabilities).toHaveProperty('capitalAccount');
      expect(liabilities).toHaveProperty('loansLiability');
      expect(liabilities).toHaveProperty('currentLiabilities');
      expect(liabilities).toHaveProperty('profitAndLoss');
      expect(liabilities).toHaveProperty('total');

      const currentLiabilities = liabilities.currentLiabilities;
      expect(currentLiabilities).toHaveProperty('total');
      expect(currentLiabilities).toHaveProperty('dutiesAndTaxes');
      expect(currentLiabilities).toHaveProperty('sundryCreditors');

      // Check Duties & Taxes and Sundry Creditors amounts
      expect(currentLiabilities.dutiesAndTaxes).toBe(-48525380);
      expect(currentLiabilities.sundryCreditors).toBe(635911700); // ₹63,59,117.00
      expect(currentLiabilities.total).toBe(-48525380 + 635911700); // 587386320

      // Current Assets structure verification
      const assets = sheet.assets;
      expect(assets).toHaveProperty('fixedAssets');
      expect(assets).toHaveProperty('currentAssets');
      expect(assets).toHaveProperty('total');

      const currentAssets = assets.currentAssets;
      expect(currentAssets).toHaveProperty('total');
      expect(currentAssets).toHaveProperty('closingStock');
      expect(currentAssets).toHaveProperty('sundryDebtors');
      expect(currentAssets).toHaveProperty('cashInHand');
      expect(currentAssets).toHaveProperty('bankAccounts');

      // Check Closing Stock, Sundry Debtors, and Cash-in-Hand
      expect(currentAssets.closingStock).toBe(1343903821); // ₹1,34,39,038.21
      expect(currentAssets.sundryDebtors).toBe(815671525); // ₹81,56,715.25
      expect(currentAssets.cashInHand).toBe(-948000126); // -₹94,80,001.26
      expect(currentAssets.bankAccounts).toBe(0);

      // Verify asset and liability totals balance
      expect(currentAssets.total).toBe(1343903821 + 815671525 - 948000126); // 1211575220
      expect(assets.total).toBe(1211575220);
      expect(liabilities.total).toBe(1211575220);
    });

    it('requires ledgers.view permission to access balance sheet report', async () => {
      // Unauthenticated request
      const noAuthRes = await request(app).get(`/api/reports/balance-sheet?companyId=${companyId}`);
      expect(noAuthRes.status).toBe(401);
    });
  });

  describe('2. Dashboard Stats & Sundry Debtors/Creditors Reconciliation: GET /api/dashboard/stats', () => {
    it('returns net totalDebit matching Sundry Debtors (₹81,56,715.25) and net totalCredit matching Sundry Creditors (₹63,59,117.00)', async () => {
      const res = await request(app)
        .get(`/api/dashboard/stats?companyId=${companyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const stats = res.body;

      // 1. Net Sundry Debtors totalDebit: ₹81,56,715.25 in paise (815671525)
      expect(stats.totalDebit).toBe(815671525);

      // 2. Net Sundry Creditors totalCredit: ₹63,59,117.00 in paise (635911700)
      expect(stats.totalCredit).toBe(635911700);

      // 3. Gross Debit and Advance Credit properly reported
      expect(stats.grossDebit).toBe(850000000); // ₹85,00,000.00
      expect(stats.advanceCredit).toBe(34328475); // ₹3,43,284.75
      expect(stats.totalDebit).toBe(stats.grossDebit - stats.advanceCredit);

      // 4. totalReceivables matches gross receivables
      expect(stats.totalReceivables).toBe(850000000);
    });

    it('returns identical financial stats on /api/home/summary endpoint', async () => {
      const res = await request(app)
        .get(`/api/home/summary?companyId=${companyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const summary = res.body;

      expect(summary.totalDebit).toBe(815671525);
      expect(summary.totalCredit).toBe(635911700);
      expect(summary.grossDebit).toBe(850000000);
      expect(summary.advanceCredit).toBe(34328475);
    });
  });

  describe('3. Challan Print Round-Off Calculation & Amount in Words Invariants', () => {
    it('ensures grandTotal is an exact whole rupee with 0 paise remainder for any challan', async () => {
      const lineQty = 7;
      const lineRate = 154329; // ₹1,543.29 per unit
      const lineAmount = lineQty * lineRate; // 1080303 paise (₹10,803.03)
      const gstAmount = Math.round(lineAmount * 0.18); // 194455 paise (18% GST)
      const autoRound = calculateRoundOff(lineAmount, gstAmount);

      // Create a purchase challan with non-integer subtotal and tax
      const createRes = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId,
          partyId: 'p-alpha-debtor',
          type: 'purchase',
          number: 'CH-FIN-2026-001',
          date: '2026-11-13',
          lines: [
            {
              itemId: 'item-silver-prime-stock',
              description: 'Precision Gear Shaft',
              qty: lineQty,
              rate: lineRate,
              amount: lineAmount,
              gstRate: 18,
            },
          ],
          roundOff: autoRound.roundOffPaise, // exact round-off calculated via calculateRoundOff
        });

      expect(createRes.status).toBe(201);
      const challanId = createRes.body.id;

      // Retrieve challan from server
      const getRes = await request(app)
        .get(`/api/challans/${challanId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.status).toBe(200);
      const challan = getRes.body;

      // Verify Challan Print calculation invariants (as performed in ChallanPrintScreen)
      const subtotalPaise = challan.lines.reduce((acc: number, l: any) => acc + (l.amount || l.qty * l.rate), 0);
      const gstPaise = challan.lines.reduce(
        (acc: number, l: any) => acc + Math.round((l.amount || l.qty * l.rate) * ((l.gstRate ?? 18) / 100)),
        0
      );
      const rawGrandTotalPaise = subtotalPaise + gstPaise;

      // Commercial round-off calculation
      const roundOffPaise = typeof challan.roundOff === 'number'
        ? challan.roundOff
        : (Math.round(rawGrandTotalPaise / 100) * 100 - rawGrandTotalPaise);

      const grandTotalPaise = rawGrandTotalPaise + roundOffPaise;

      // 1. Invariant: grandTotal is an exact whole rupee (divisible by 100 paise)
      expect(grandTotalPaise % 100).toBe(0);

      // 2. Amount in Words verification
      const words = numberToIndianWords(grandTotalPaise);
      expect(words).toMatch(/^Rupees .+ Only$/);
      expect(words).not.toContain('Paise');

      // Verify exact words for the computed grand total
      const rupees = grandTotalPaise / 100;
      expect(formatINR(grandTotalPaise)).toContain(rupees.toLocaleString('en-IN'));
    });

    it('verifies calculateRoundOff mathematical boundary invariants across various decimal paise values', () => {
      const testCases = [
        { subtotal: 100000, tax: 18060, expectedRound: 40, expectedTotal: 118100 }, // .60 rounds up +40
        { subtotal: 100000, tax: 18040, expectedRound: -40, expectedTotal: 118000 }, // .40 rounds down -40
        { subtotal: 100000, tax: 18050, expectedRound: 50, expectedTotal: 118100 }, // .50 rounds up +50
        { subtotal: 100000, tax: 18000, expectedRound: 0, expectedTotal: 118000 }, // exact 0 round-off
        { subtotal: 815671525, tax: 0, expectedRound: -25, expectedTotal: 815671500 }, // .25 paise
        { subtotal: 635911700, tax: 0, expectedRound: 0, expectedTotal: 635911700 }, // exact whole rupee
      ];

      for (const tc of testCases) {
        const result = calculateRoundOff(tc.subtotal, tc.tax);
        expect(result.roundOffPaise).toBe(tc.expectedRound);
        expect(result.grandTotalPaise).toBe(tc.expectedTotal);
        expect(result.grandTotalPaise % 100).toBe(0);

        const words = numberToIndianWords(result.grandTotalPaise);
        expect(words).toMatch(/^Rupees .+ Only$/);
      }
    });

    it('matches exact Indian Words for Tally Silver Prime financial statement totals', () => {
      // Net Debtors: ₹81,56,715 (rounded to nearest rupee)
      const debtorsWords = numberToIndianWords(815671500);
      expect(debtorsWords).toBe('Rupees Eighty One Lakh Fifty Six Thousand Seven Hundred Fifteen Only');

      // Net Creditors: ₹63,59,117 (exact whole rupee)
      const creditorsWords = numberToIndianWords(635911700);
      expect(creditorsWords).toBe('Rupees Sixty Three Lakh Fifty Nine Thousand One Hundred Seventeen Only');
    });
  });
});
