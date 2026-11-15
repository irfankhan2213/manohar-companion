import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/db/database.js';

describe('Livekeeping Engineering Parity & Windows Agent Hardening Suite', () => {
  let app: any;
  let server: http.Server;
  let baseUrl: string;
  let authToken: string;
  let companyId: string;
  const companyName = `LK Parity Enterprise ${Date.now()}`;

  beforeAll(async () => {
    initDatabase(':memory:');
    app = createApp();
    server = app.listen(0);
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    expect(loginRes.status).toBe(200);
    authToken = loginRes.body.token;
  });

  afterAll(() => {
    if (server) server.close();
  });

  it('1. POST /api/sync/push accepts gzip-compressed payloads with Content-Encoding: gzip without 413 error', async () => {
    const rawPayload = {
      companyName,
      alterId: 1050,
      parties: [
        {
          id: 'p-lk-cust-1',
          name: 'Supreme Agro Industries',
          parentGroup: 'Sundry Debtors',
          partyType: 'debtor',
          closingBalance: 125000000, // ₹12,50,000.00
          notes: 'Imported from Tally',
        },
        {
          id: 'p-lk-supp-1',
          name: 'Bharat Petroleum Dist',
          parentGroup: 'Sundry Creditors',
          partyType: 'creditor',
          closingBalance: -85000000, // ₹8,50,000.00 Cr
          notes: 'Imported from Tally',
        },
      ],
      bills: [
        {
          id: 'b-lk-inv-101',
          partyId: 'p-lk-cust-1',
          billNo: 'INV/2026/101',
          date: '2026-10-15',
          amount: 125000000,
          pending: 125000000,
        },
      ],
      stockItems: [
        {
          id: 's-lk-engine-oil',
          name: 'Synthetic Engine Oil 15W40',
          closingQty: 50,
          rate: 250000,
          unit: 'ltr',
          itemGroup: 'Lubricants',
        },
      ],
      challans: [],
      vouchers: [
        {
          id: 'vch-sales-101',
          voucherType: 'Sales',
          voucherNumber: 'INV/2026/101',
          date: '2026-10-15',
          partyName: 'Supreme Agro Industries',
          amount: 125000000,
          narration: 'Bulk delivery of engine oil',
          alterId: 1045,
          masterId: '10045',
          ledgerEntries: [
            { ledger: 'Supreme Agro Industries', amount: 125000000, isDebit: true },
            { ledger: 'Sales Account', amount: -125000000, isDebit: false },
          ],
        },
        {
          id: 'vch-rcpt-102',
          voucherType: 'Receipt',
          voucherNumber: 'RCPT-501',
          date: '2026-10-20',
          partyName: 'Supreme Agro Industries',
          amount: 50000000,
          narration: 'Advance payment via RTGS',
          alterId: 1050,
          masterId: '10050',
          ledgerEntries: [
            { ledger: 'HDFC Current A/c', amount: 50000000, isDebit: true },
            { ledger: 'Supreme Agro Industries', amount: -50000000, isDebit: false },
          ],
        },
      ],
      groups: [
        {
          name: 'Sundry Debtors',
          parent: 'Current Assets',
          primaryGroup: 'Current Assets',
          isRevenue: false,
          isDeemedPositive: true,
          alterId: 1,
        },
        {
          name: 'Sundry Creditors',
          parent: 'Current Liabilities',
          primaryGroup: 'Current Liabilities',
          isRevenue: false,
          isDeemedPositive: false,
          alterId: 2,
        },
        {
          name: 'Lubricants',
          parent: 'Stock-in-Hand',
          primaryGroup: 'Current Assets',
          isRevenue: false,
          isDeemedPositive: true,
          alterId: 3,
        },
      ],
    };

    const uncompressedStr = JSON.stringify(rawPayload);
    const gzippedBuffer = zlib.gzipSync(Buffer.from(uncompressedStr, 'utf-8'));

    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
      body: gzippedBuffer,
    });

    const resBody = await res.json();
    expect(res.status).toBe(200);
    expect(resBody.success).toBe(true);
    expect(resBody.vouchersUpdated).toBe(2);
    expect(resBody.groupsUpdated).toBe(3);
    companyId = resBody.companyId;
    expect(companyId).toBeDefined();
  });

  it('2. GET /api/groups returns synchronized Tally group hierarchy for the company', async () => {
    const res = await request(app)
      .get(`/api/groups?companyId=${companyId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.groups)).toBe(true);
    expect(res.body.groups.length).toBeGreaterThanOrEqual(3);

    const groupNames = res.body.groups.map((g: any) => g.name);
    expect(groupNames).toContain('Sundry Debtors');
    expect(groupNames).toContain('Sundry Creditors');
    expect(groupNames).toContain('Lubricants');

    const debtorsGroup = res.body.groups.find((g: any) => g.name === 'Sundry Debtors');
    expect(debtorsGroup.parent).toBe('Current Assets');
    expect(debtorsGroup.isDeemedPositive).toBe(1);
  });

  it('3. Synchronized vouchers populate both tally_vouchers and ledger_lines for Daybook & Statement parity', async () => {
    const daybookRes = await request(app)
      .get(`/api/reports/daybook?companyId=${companyId}&date=2026-10-15`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(daybookRes.status).toBe(200);
    expect(Array.isArray(daybookRes.body.vouchers)).toBe(true);
    const salesVch = daybookRes.body.vouchers.find((v: any) => v.voucherNumber === 'INV/2026/101');
    expect(salesVch).toBeDefined();
    expect(salesVch.partyName).toBe('Supreme Agro Industries');
    expect(salesVch.amount).toBe(125000000);
  });

  it('4. Windows install-service.bat & uninstall-service.bat include UAC auto-elevation scripts', () => {
    const installBatPath = path.resolve(__dirname, '../../agent/windows/install-service.bat');
    const uninstallBatPath = path.resolve(__dirname, '../../agent/windows/uninstall-service.bat');

    expect(fs.existsSync(installBatPath)).toBe(true);
    expect(fs.existsSync(uninstallBatPath)).toBe(true);

    const installBat = fs.readFileSync(installBatPath, 'utf-8');
    const uninstallBat = fs.readFileSync(uninstallBatPath, 'utf-8');

    expect(installBat).toContain('net session');
    expect(installBat).toContain('Start-Process');
    expect(installBat).toContain('Verb RunAs');

    expect(uninstallBat).toContain('net session');
    expect(uninstallBat).toContain('Start-Process');
    expect(uninstallBat).toContain('Verb RunAs');
  });

  it('5. Default Tally port defaults to standard 9000 across configuration and state files', () => {
    const statePath = path.resolve(__dirname, '../../agent/windows/agent-state.json');
    expect(fs.existsSync(statePath)).toBe(true);

    const stateJson = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(stateJson.tallyUrl).toContain(':9000');
    expect(stateJson.tallyUrl).not.toContain(':25853');
  });
});
