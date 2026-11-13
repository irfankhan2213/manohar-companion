import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, getDB } from '../src/db/database.js';

describe('CHALLENGER M1-1: Server Tally Connector Empirical Verification', () => {
  let app: any;
  let authToken: string;
  let compId: string;

  beforeAll(async () => {
    initDatabase(':memory:');
    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    authToken = loginRes.body.token;

    const compRes = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${authToken}`);
    compId = compRes.body[0].id;
  });

  describe('1. Port 9999 and Candidate Port Telemetry Handling', () => {
    it('accurately stores port 9999 in agent_state without rewriting to 25853', async () => {
      const res = await request(app)
        .post('/api/agent/sync')
        .set('x-agent-key', 'dev-agent-secret-key')
        .send({
          tallyPort: 9999,
          tallyStatus: 'online',
          companyName: 'Manohar Traders',
        });
      expect(res.status).toBe(200);

      const db = getDB();
      const row = db.prepare("SELECT value FROM agent_state WHERE key LIKE 'tallyPort_%' LIMIT 1").get() as any;
      expect(row?.value).toBe('9999');
    });

    it('stores all standard candidate ports (9000, 25853, 9001, 9002) accurately', async () => {
      const candidatePorts = [9000, 25853, 9001, 9002];
      const db = getDB();

      for (const p of candidatePorts) {
        const res = await request(app)
          .post('/api/agent/sync')
          .set('x-agent-key', 'dev-agent-secret-key')
          .send({
            tallyPort: p,
            tallyStatus: 'online',
            companyName: 'Manohar Traders',
          });
        expect(res.status).toBe(200);

        const row = db.prepare("SELECT value FROM agent_state WHERE key LIKE 'tallyPort_%' LIMIT 1").get() as any;
        expect(row?.value).toBe(String(p));
      }
    });

    it('handles non-numeric tallyPort by defaulting to 9000', async () => {
      const res = await request(app)
        .post('/api/agent/sync')
        .set('x-agent-key', 'dev-agent-secret-key')
        .send({
          tallyPort: 'invalid-port',
          tallyStatus: 'online',
          companyName: 'Manohar Traders',
        });
      expect(res.status).toBe(200);

      const db = getDB();
      const row = db.prepare("SELECT value FROM agent_state WHERE key LIKE 'tallyPort_%' LIMIT 1").get() as any;
      expect(row?.value).toBe('9000');
    });
  });

  describe('2. Voucher Deletion Manifest Purging & Adversarial Injections', () => {
    it('purges deleted vouchers from both challans and bills tables', async () => {
      const db = getDB();

      // Seed challans and bills
      db.prepare(`
        INSERT OR REPLACE INTO challans (id, companyId, type, number, date, partyId, status, lines, roundOff)
        VALUES ('ch-adv-1', ?, 'sales', 'DC-ADV-1', '2026-10-15', 'p1', 'delivered', '[]', 0)
      `).run(compId);

      db.prepare(`
        INSERT OR REPLACE INTO challans (id, companyId, type, number, date, partyId, status, lines, roundOff)
        VALUES ('ch-adv-2', ?, 'sales', 'DC-ADV-2', '2026-10-15', 'p1', 'delivered', '[]', 0)
      `).run(compId);

      db.prepare(`
        INSERT OR REPLACE INTO bills (id, companyId, partyId, billNo, date, dueDate, amount, pending)
        VALUES ('bill-adv-1', ?, 'p1', 'INV-ADV-1', '2026-10-15', '2026-11-15', 50000, 50000)
      `).run(compId);

      db.prepare(`
        INSERT OR REPLACE INTO bills (id, companyId, partyId, billNo, date, dueDate, amount, pending)
        VALUES ('bill-adv-2', ?, 'p1', 'INV-ADV-2', '2026-10-15', '2026-11-15', 75000, 75000)
      `).run(compId);

      // Verify inserted
      expect(db.prepare('SELECT id FROM challans WHERE id = ?').get('ch-adv-1')).toBeTruthy();
      expect(db.prepare('SELECT id FROM bills WHERE id = ?').get('bill-adv-1')).toBeTruthy();

      // Send sync push with deletedVoucherMasterIds containing ch-adv-1 and bill-adv-1
      const pushRes = await request(app)
        .post('/api/sync/push')
        .set('x-agent-key', 'dev-agent-secret-key')
        .send({
          companyId: compId,
          companyName: 'Manohar Traders',
          deletedVoucherMasterIds: ['ch-adv-1', 'bill-adv-1'],
        });

      expect(pushRes.status).toBe(200);

      // Verify purged
      expect(db.prepare('SELECT id FROM challans WHERE id = ?').get('ch-adv-1')).toBeUndefined();
      expect(db.prepare('SELECT id FROM bills WHERE id = ?').get('bill-adv-1')).toBeUndefined();

      // Verify non-deleted records remain intact
      expect(db.prepare('SELECT id FROM challans WHERE id = ?').get('ch-adv-2')).toBeTruthy();
      expect(db.prepare('SELECT id FROM bills WHERE id = ?').get('bill-adv-2')).toBeTruthy();
    });

    it('handles adversarial SQL injection payloads in deletedVoucherMasterIds safely', async () => {
      const db = getDB();

      const pushRes = await request(app)
        .post('/api/sync/push')
        .set('x-agent-key', 'dev-agent-secret-key')
        .send({
          companyId: compId,
          companyName: 'Manohar Traders',
          deletedVoucherMasterIds: ["' OR '1'='1", "'; DROP TABLE bills; --", null, '   '],
        });

      expect(pushRes.status).toBe(200);

      // Verify table was NOT dropped and query succeeded safely
      const billCount = db.prepare('SELECT count(*) as cnt FROM bills').get() as any;
      expect(billCount.cnt).toBeGreaterThan(0);
    });

    it('handles empty or nonexistent IDs in deletedVoucherMasterIds gracefully', async () => {
      const pushRes = await request(app)
        .post('/api/sync/push')
        .set('x-agent-key', 'dev-agent-secret-key')
        .send({
          companyId: compId,
          companyName: 'Manohar Traders',
          deletedVoucherMasterIds: ['non-existent-id-999999', 'non-existent-id-888888'],
        });

      expect(pushRes.status).toBe(200);
      expect(pushRes.body.success).toBe(true);
    });
  });
});
