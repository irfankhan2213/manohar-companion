import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDB } from '../src/db/database.js';
import { calculateRoundOff } from '@saas/shared';

describe('Milestone 5 Challenger Adversarial Stress Suite', () => {
  let app: any;
  let db: any;
  let authToken: string;

  beforeAll(async () => {
    app = createApp();
    db = getDB();

    // Login as dev admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    authToken = loginRes.body.token;
    expect(authToken).toBeDefined();

    // Clean test records
    try {
      db.prepare("DELETE FROM challans WHERE id LIKE 'ch-m5-%'").run();
      db.prepare("DELETE FROM bills WHERE id LIKE 'b-m5-%'").run();
      db.prepare("DELETE FROM parties WHERE id LIKE 'p-m5-%'").run();
    } catch {}
  });

  afterAll(() => {
    try {
      db.prepare("DELETE FROM challans WHERE id LIKE 'ch-m5-%'").run();
      db.prepare("DELETE FROM bills WHERE id LIKE 'b-m5-%'").run();
      db.prepare("DELETE FROM parties WHERE id LIKE 'p-m5-%'").run();
    } catch {}
  });

  describe('1. Mathematical Invariant & Stress Testing: calculateRoundOff', () => {
    it('satisfies core invariants for 1000 randomized and edge-case paise amounts', () => {
      const boundaryCases = [
        [0, 0],
        [100, 0],
        [10000, 0],
        [10049, 0],
        [10050, 0],
        [10051, 0],
        [10099, 0],
        [99, 0],
        [1, 0],
        [49, 0],
        [50, 0],
        [51, 0],
        [123456789, 22222222], // large numbers
        [1000000000, 180000000], // 10 crore
      ];

      // Add 1000 randomized cases
      for (let i = 0; i < 1000; i++) {
        const sub = Math.floor(Math.random() * 10000000);
        const tax = Math.floor(Math.random() * 1800000);
        boundaryCases.push([sub, tax]);
      }

      for (const [sub, tax] of boundaryCases) {
        const res = calculateRoundOff(sub, tax);
        const raw = Math.round(sub + tax);

        // Invariant 1: raw total matches subtotalWithTaxPaise
        expect(res.subtotalWithTaxPaise).toBe(raw);

        // Invariant 2: subtotalWithTaxPaise + roundOffPaise === grandTotalPaise
        expect(res.subtotalWithTaxPaise + res.roundOffPaise).toBe(res.grandTotalPaise);

        // Invariant 3: grandTotalPaise is an exact multiple of 100 (whole rupee)
        expect(res.grandTotalPaise % 100).toBe(0);

        // Invariant 4: roundOffPaise is bounded within [-50, +50]
        expect(res.roundOffPaise).toBeGreaterThanOrEqual(-50);
        expect(res.roundOffPaise).toBeLessThanOrEqual(50);
      }
    });

    it('handles exact boundary transitions properly: 49 paise rounds down, 50 paise rounds up', () => {
      // 100 rupees and 49 paise: rounds down to 100 rupees (-49 paise)
      const res49 = calculateRoundOff(10049, 0);
      expect(res49.roundOffPaise).toBe(-49);
      expect(res49.grandTotalPaise).toBe(10000);

      // 100 rupees and 50 paise: rounds up to 101 rupees (+50 paise)
      const res50 = calculateRoundOff(10050, 0);
      expect(res50.roundOffPaise).toBe(50);
      expect(res50.grandTotalPaise).toBe(10100);

      // 100 rupees and 0 paise: 0 round-off
      const res0 = calculateRoundOff(10000, 0);
      expect(res0.roundOffPaise).toBe(0);
      expect(res0.grandTotalPaise).toBe(10000);
    });
  });

  describe('2. Round-Off Persistence & SQLite Integer Paise Enforcement', () => {
    it('creates and updates challan with negative and positive integer paise roundOff', async () => {
      // Setup test party
      db.prepare(`
        INSERT INTO parties (id, tenantId, companyId, name, city, phones, closingBalance)
        VALUES ('p-m5-challan-1', 'tenant-1', 'c1', 'Adversarial Mills Ludhiana', 'Ludhiana', '["9814099999"]', 0)
      `).run();

      // 1. Create challan with negative roundOff: -45 paise
      const createRes = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          id: 'ch-m5-ro-1',
          companyId: 'c1',
          type: 'purchase',
          number: 'PC/ADV/001',
          date: '2026-10-15',
          partyId: 'p-m5-challan-1',
          lines: [
            {
              itemId: 'item-1',
              description: 'Sewing Needle Set',
              itemDescription: 'Titanium Coated #16',
              qty: 10,
              unit: 'box',
              rate: 55000,
              amount: 550000,
              hsnCode: '8452',
              gstRate: 18,
            },
          ],
          roundOff: -45, // -0.45 rupees in integer paise
          status: 'draft',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.roundOff).toBe(-45);

      // Verify directly from SQLite
      const row = db.prepare('SELECT roundOff FROM challans WHERE id = ?').get('ch-m5-ro-1') as any;
      expect(row.roundOff).toBe(-45);

      // 2. Update challan via PUT with manual positive roundOff override (+35 paise)
      const updateRes = await request(app)
        .put('/api/challans/ch-m5-ro-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roundOff: 35,
          narration: 'Overridden roundOff to +35 paise',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.roundOff).toBe(35);
      expect(updateRes.body.narration).toBe('Overridden roundOff to +35 paise');

      // 3. Test fractional float input: server should round float to nearest integer paise
      const floatUpdate = await request(app)
        .put('/api/challans/ch-m5-ro-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roundOff: 42.8, // fractional float
        });

      expect(floatUpdate.status).toBe(200);
      expect(floatUpdate.body.roundOff).toBe(43); // Math.round(42.8) === 43
    });
  });

  describe('3. Line Item itemDescription Persistence, Query Search & Escaping', () => {
    it('persists complex, multiline, unicode, and special characters in itemDescription', async () => {
      const complexDesc = 'Batch #B-902 / Serial [SN: 88123-A] — "High Grade" & 100% Tested; <XML_SAFE>';

      const challanPayload = {
        id: 'ch-m5-desc-1',
        companyId: 'c1',
        type: 'delivery',
        number: 'DC/ADV/DESC-1',
        date: '2026-10-20',
        partyId: 'p-m5-challan-1',
        lines: [
          {
            itemId: 'item-2',
            description: 'Main Motor Assembly',
            itemDescription: complexDesc,
            qty: 2,
            unit: 'set',
            rate: 150000,
            amount: 300000,
            hsnCode: '8452',
            gstRate: 18,
          },
          {
            itemId: '',
            description: 'Custom Calibration Fee',
            itemDescription: '', // empty optional notes
            qty: 1,
            unit: 'pcs',
            rate: 25000,
            amount: 25000,
            hsnCode: '8452',
            gstRate: 18,
          },
        ],
        roundOff: 0,
        status: 'draft',
      };

      const res = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send(challanPayload);

      expect(res.status).toBe(201);
      expect(res.body.lines[0].itemDescription).toBe(complexDesc);
      expect(res.body.lines[1].itemDescription).toBe('');

      // Fetch by ID
      const getRes = await request(app)
        .get('/api/challans/ch-m5-desc-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.lines[0].itemDescription).toBe(complexDesc);

      // Search by itemDescription substring via ?q=
      const searchRes = await request(app)
        .get('/api/challans?companyId=c1&q=88123-A')
        .set('Authorization', `Bearer ${authToken}`);

      expect(searchRes.status).toBe(200);
      const found = searchRes.body.find((c: any) => c.id === 'ch-m5-desc-1');
      expect(found).toBeDefined();
    });
  });

  describe('4. History Filtering: Inverted Dates, Exact Single Days, and SQL Injection Resistance', () => {
    beforeAll(() => {
      // Seed 3 dated challans for unique test party
      db.prepare(`
        INSERT INTO challans (id, companyId, type, number, date, partyId, lines, roundOff, status)
        VALUES
          ('ch-m5-date-1', 'c1', 'delivery', 'DC/DATE/1', '2026-10-10', 'p-m5-challan-1', '[]', 0, 'synced'),
          ('ch-m5-date-2', 'c1', 'sales', 'DC/DATE/2', '2026-10-15', 'p-m5-challan-1', '[]', 0, 'synced'),
          ('ch-m5-date-3', 'c1', 'purchase', 'DC/DATE/3', '2026-10-20', 'p-m5-challan-1', '[]', 0, 'synced')
      `).run();

      // Seed 3 dated bills for unique test party
      db.prepare(`
        INSERT INTO bills (id, companyId, partyId, billNo, date, dueDate, amount, pending, source)
        VALUES
          ('b-m5-date-1', 'c1', 'p-m5-challan-1', 'BILL/ADV/1', '2026-10-10', '2026-11-10', 100000, 100000, 'tally'),
          ('b-m5-date-2', 'c1', 'p-m5-challan-1', 'BILL/ADV/2', '2026-10-15', '2026-11-15', 200000, 200000, 'tally'),
          ('b-m5-date-3', 'c1', 'p-m5-challan-1', 'BILL/ADV/3', '2026-10-20', '2026-11-20', 300000, 300000, 'tally')
      `).run();
    });

    it('returns empty array when date range is inverted (startDate > endDate)', async () => {
      // Challans query
      const challanRes = await request(app)
        .get('/api/challans?companyId=c1&startDate=2026-10-25&endDate=2026-10-05')
        .set('Authorization', `Bearer ${authToken}`);

      expect(challanRes.status).toBe(200);
      expect(challanRes.body).toEqual([]);

      // Bills query
      const billRes = await request(app)
        .get('/api/bills?companyId=c1&startDate=2026-10-25&endDate=2026-10-05')
        .set('Authorization', `Bearer ${authToken}`);

      expect(billRes.status).toBe(200);
      expect(billRes.body).toEqual([]);
    });

    it('accurately isolates exact single-day range (startDate === endDate) for the given party', async () => {
      const challanRes = await request(app)
        .get('/api/challans?companyId=c1&partyId=p-m5-challan-1&startDate=2026-10-15&endDate=2026-10-15')
        .set('Authorization', `Bearer ${authToken}`);

      expect(challanRes.status).toBe(200);
      // All returned records must have date === '2026-10-15'
      expect(challanRes.body.length).toBeGreaterThanOrEqual(1);
      for (const c of challanRes.body) {
        expect(c.date).toBe('2026-10-15');
      }

      const billRes = await request(app)
        .get('/api/bills?companyId=c1&partyId=p-m5-challan-1&startDate=2026-10-15&endDate=2026-10-15')
        .set('Authorization', `Bearer ${authToken}`);

      expect(billRes.status).toBe(200);
      expect(billRes.body.length).toBe(1);
      expect(billRes.body[0].billNo).toBe('BILL/ADV/2');
      expect(billRes.body[0].date).toBe('2026-10-15');
    });

    it('performs case-insensitive party name search for both challans and bills', async () => {
      // Mixed-case query: "aDvErSaRiAl miLLs"
      const challanRes = await request(app)
        .get('/api/challans?companyId=c1&partyName=aDvErSaRiAl%20miLLs')
        .set('Authorization', `Bearer ${authToken}`);

      expect(challanRes.status).toBe(200);
      expect(challanRes.body.length).toBeGreaterThanOrEqual(3);

      const billRes = await request(app)
        .get('/api/bills?companyId=c1&partyName=aDvErSaRiAl%20miLLs')
        .set('Authorization', `Bearer ${authToken}`);

      expect(billRes.status).toBe(200);
      expect(billRes.body.length).toBeGreaterThanOrEqual(3);
    });

    it('safely handles SQL injection attempts in partyName and q parameters', async () => {
      const maliciousParty = "Adversarial' OR '1'='1";
      const res = await request(app)
        .get(`/api/bills?companyId=c1&partyName=${encodeURIComponent(maliciousParty)}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Parameterized query ensures it literally looks for that string and does NOT return all parties
      expect(res.body).toEqual([]);

      const maliciousQ = "'; DROP TABLE challans; --";
      const qRes = await request(app)
        .get(`/api/challans?companyId=c1&q=${encodeURIComponent(maliciousQ)}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(qRes.status).toBe(200);
      expect(qRes.body).toEqual([]);
      // Ensure challans table was not dropped
      const count = db.prepare('SELECT count(*) as count FROM challans').get() as any;
      expect(count.count).toBeGreaterThan(0);
    });
  });
});
