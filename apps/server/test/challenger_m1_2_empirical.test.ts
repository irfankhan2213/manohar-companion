import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { createApp } from '../src/app.js';
import { initDatabase, getDB } from '../src/db/database.js';

describe('CHALLENGER M1-2: Server-Side Deletion Purging & Port Telemetry Empirical Suite', () => {
  let app: any;
  let authToken: string;

  beforeAll(async () => {
    initDatabase(':memory:');
    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    authToken = loginRes.body.token;
  });

  describe('1. SQLite Voucher Deletion Purging: Scenario [V1, V2, V3] -> Manifest [V1, V3]', () => {
    let compId: string;
    const compName = 'Empirical Purge Test Co';

    it('seeds vouchers [V1, V2, V3] across challans and bills in SQLite', async () => {
      // 1. Seed company, party, challans, and bills
      const pushRes = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: compName,
          parties: [
            { id: 'p-m1-2', name: 'M1-2 Test Debtor', parentGroup: 'Sundry Debtors', partyType: 'debtor' },
          ],
          bills: [
            { id: 'bill-v1', billNo: 'V1', date: '2026-10-01', dueDate: '2026-10-31', amount: 10000, pending: 10000, partyId: 'p-m1-2' },
            { id: 'bill-v2', billNo: 'V2', date: '2026-10-02', dueDate: '2026-10-31', amount: 20000, pending: 20000, partyId: 'p-m1-2' },
            { id: 'bill-v3', billNo: 'V3', date: '2026-10-03', dueDate: '2026-10-31', amount: 30000, pending: 30000, partyId: 'p-m1-2' },
          ],
          challans: [
            { id: 'ch-v1', number: 'V1', partyName: 'M1-2 Test Debtor', lines: [{ description: 'Item 1', qty: 10, rate: 1000 }] },
            { id: 'ch-v2', number: 'V2', partyName: 'M1-2 Test Debtor', lines: [{ description: 'Item 2', qty: 20, rate: 1000 }] },
            { id: 'ch-v3', number: 'V3', partyName: 'M1-2 Test Debtor', lines: [{ description: 'Item 3', qty: 30, rate: 1000 }] },
          ],
        });

      expect(pushRes.status).toBe(200);
      compId = pushRes.body.companyId;
      expect(compId).toBeDefined();

      // Verify all 3 exist in SQLite directly via database handle
      const db = getDB();
      const challans = db.prepare('SELECT id, number FROM challans WHERE companyId = ? ORDER BY number ASC').all(compId) as any[];
      expect(challans.map((c) => c.number)).toEqual(['V1', 'V2', 'V3']);

      const bills = db.prepare('SELECT id, billNo FROM bills WHERE companyId = ? ORDER BY billNo ASC').all(compId) as any[];
      expect(bills.map((b) => b.billNo)).toEqual(['V1', 'V2', 'V3']);
    });

    it('purges V2 when manifest diff reports deletedVoucherMasterIds = [V2], keeping V1 and V3 intact', async () => {
      // Manifest returns [V1, V3] -> Agent computes deletedVoucherMasterIds = ['V2']
      const purgePush = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: compId,
          companyName: compName,
          deletedVoucherMasterIds: ['V2'],
        });

      expect(purgePush.status).toBe(200);

      const db = getDB();

      // Assert V2 is deleted from challans table
      const remainingChallans = db.prepare('SELECT id, number FROM challans WHERE companyId = ? ORDER BY number ASC').all(compId) as any[];
      expect(remainingChallans.map((c) => c.number)).toEqual(['V1', 'V3']);
      expect(remainingChallans.some((c) => c.number === 'V2')).toBe(false);

      // Assert V2 is deleted from bills table
      const remainingBills = db.prepare('SELECT id, billNo FROM bills WHERE companyId = ? ORDER BY billNo ASC').all(compId) as any[];
      expect(remainingBills.map((b) => b.billNo)).toEqual(['V1', 'V3']);
      expect(remainingBills.some((b) => b.billNo === 'V2')).toBe(false);
    });

    it('matches deletion by voucher primary key id (e.g. ch-v1) as well as number', async () => {
      const db = getDB();

      // Delete V1 by its primary key ID ('ch-v1')
      const purgeRes = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: compId,
          companyName: compName,
          deletedVoucherMasterIds: ['ch-v1', 'bill-v1'],
        });

      expect(purgeRes.status).toBe(200);

      const remainingChallans = db.prepare('SELECT id, number FROM challans WHERE companyId = ?').all(compId) as any[];
      expect(remainingChallans.map((c) => c.number)).toEqual(['V3']);

      const remainingBills = db.prepare('SELECT id, billNo FROM bills WHERE companyId = ?').all(compId) as any[];
      expect(remainingBills.map((b) => b.billNo)).toEqual(['V3']);
    });
  });

  describe('2. Multi-Company Tenant Isolation of Deletion Purging', () => {
    it('does NOT delete identically numbered vouchers in another company', async () => {
      // Seed both companies with voucher "V-SHARED"
      const resA = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'Company A Isolation Test',
          challans: [{ id: 'ch-a-shared', number: 'V-SHARED', partyName: 'Party A', lines: [] }],
          bills: [{ id: 'b-a-shared', billNo: 'V-SHARED', date: '2026-10-01', dueDate: '2026-10-31', amount: 5000, pending: 5000, partyId: 'p-a' }],
        });

      const resB = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'Company B Isolation Test',
          challans: [{ id: 'ch-b-shared', number: 'V-SHARED', partyName: 'Party B', lines: [] }],
          bills: [{ id: 'b-b-shared', billNo: 'V-SHARED', date: '2026-10-01', dueDate: '2026-10-31', amount: 5000, pending: 5000, partyId: 'p-b' }],
        });

      if (resA.status !== 200) console.error('resA error:', resA.status, resA.text);
      if (resB.status !== 200) console.error('resB error:', resB.status, resB.text);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      const compA = resA.body.companyId;
      const compB = resB.body.companyId;
      expect(compA).toBeDefined();
      expect(compB).toBeDefined();
      expect(compA).not.toBe(compB);

      const db = getDB();
      expect(db.prepare('SELECT count(*) as cnt FROM challans WHERE number = ?').get('V-SHARED')).toEqual({ cnt: 2 });

      // Purge V-SHARED in Company A only
      const purgeA = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: compA,
          companyName: 'Company A Isolation Test',
          deletedVoucherMasterIds: ['V-SHARED'],
        });
      expect(purgeA.status).toBe(200);

      // Company A records must be deleted
      const aChallans = db.prepare('SELECT * FROM challans WHERE companyId = ? AND number = ?').all(compA, 'V-SHARED');
      expect(aChallans.length).toBe(0);

      // Company B records MUST remain untouched!
      const bChallans = db.prepare('SELECT * FROM challans WHERE companyId = ? AND number = ?').all(compB, 'V-SHARED');
      expect(bChallans.length).toBe(1);

      const bBills = db.prepare('SELECT * FROM bills WHERE companyId = ? AND billNo = ?').all(compB, 'V-SHARED');
      expect(bBills.length).toBe(1);
    });
  });

  describe('3. Edge Cases, SQL Injection Safety & Null Handling in Deletion Purging', () => {
    it('handles empty arrays, null, undefined, and blank strings gracefully without errors', async () => {
      const initRes = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ companyName: 'Edge Test Co' });
      const compId = initRes.body.companyId;

      const cases = [
        { deletedVoucherMasterIds: [] },
        { deletedVoucherMasterIds: null },
        { deletedVoucherMasterIds: undefined },
        { deletedVoucherMasterIds: ['', '   ', null, undefined] },
      ];

      for (const payload of cases) {
        const res = await request(app)
          .post('/api/sync/push')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            companyId: compId,
            companyName: 'Edge Test Co',
            ...payload,
          });
        expect(res.status).toBe(200);
      }
    });

    it('safely handles adversarial SQL injection payloads in deletedVoucherMasterIds', async () => {
      const db = getDB();

      // Seed a legitimate challan
      const seedRes = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'SQLi Safe Co',
          challans: [{ id: 'ch-safe-1', number: 'SAFE-1', partyName: 'Party Safe', lines: [] }],
        });
      const compId = seedRes.body.companyId;

      // Attempt SQL injection via deletedVoucherMasterIds
      const injectionPayloads = [
        "SAFE-1' OR '1'='1",
        "'; DROP TABLE challans; --",
        "' UNION SELECT * FROM challans --",
      ];

      const res = await request(app)
        .post('/api/sync/push')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: compId,
          companyName: 'SQLi Safe Co',
          deletedVoucherMasterIds: injectionPayloads,
        });

      expect(res.status).toBe(200);

      // The legitimate challan MUST NOT be deleted by the SQL injection attempt
      const safeChallan = db.prepare('SELECT * FROM challans WHERE companyId = ? AND number = ?').get(compId, 'SAFE-1');
      expect(safeChallan).toBeDefined();

      // Challans table MUST NOT have been dropped
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='challans'").get();
      expect(tableCheck).toBeDefined();
    });
  });

  describe('4. Dynamic Port Discovery & Port 9999 Preservation Telemetry', () => {
    it('records and preserves reported port 9999 without resetting to 25853 in /api/agent/sync', async () => {
      const res = await request(app)
        .post('/api/agent/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tallyStatus: 'online',
          tallyPort: 9999,
          tallyUrl: 'http://127.0.0.1:9999',
          openTallyCompanies: ['Manohar Traders'],
        });

      expect(res.status).toBe(200);

      const db = getDB();
      const portRow = db.prepare("SELECT value FROM agent_state WHERE key LIKE 'tallyPort_%' ORDER BY key DESC LIMIT 1").get() as any;
      expect(portRow).toBeDefined();
      expect(portRow.value).toBe('9999');
      expect(portRow.value).not.toBe('25853');
    });

    it('AUDIT: verifies port 9999 suppression is removed in apps/web/src/features/settings/SettingsScreen.tsx', () => {
      const settingsPath = path.resolve(process.cwd(), '../web/src/features/settings/SettingsScreen.tsx');
      expect(fs.existsSync(settingsPath)).toBe(true);

      const content = fs.readFileSync(settingsPath, 'utf8');
      // Verify SettingsScreen does not suppress valid port 9999
      const isSuppressed = content.includes('agent.tallyPort !== 9999 ? agent.tallyPort : 25853');
      expect(isSuppressed).toBe(false);
    });
  });
});
