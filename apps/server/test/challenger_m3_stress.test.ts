import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, getDB } from '../src/db/database.js';

describe('Challenger 2 Milestone 3 Adversarial Stress-Tests (R3 & R4)', () => {
  let app: any;
  let authToken: string;
  let db: any;

  beforeAll(async () => {
    initDatabase(':memory:');
    app = createApp();
    db = getDB();

    // Authenticate test suite session
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    authToken = loginRes.body.token;
    expect(authToken).toBeDefined();
  });

  describe('R3: Purchase Challan Creation & PUT /api/challans/:id Editing', () => {
    it('creates purchase challan with various roundOff values (integer, float rounding, negative, zero)', async () => {
      // 1. Positive integer roundOff
      const resPos = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          type: 'purchase',
          partyId: 'p-sample',
          date: '2026-10-01',
          roundOff: 48,
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              itemDescription: 'Direct purchase with motor set',
              qty: 1,
              unit: 'pcs',
              rate: 100000,
              amount: 100000,
            },
          ],
        });
      expect(resPos.status).toBe(201);
      expect(resPos.body.type).toBe('purchase');
      expect(resPos.body.roundOff).toBe(48);
      expect(resPos.body.lines[0].itemDescription).toBe('Direct purchase with motor set');

      // 2. Negative integer roundOff
      const resNeg = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          type: 'purchase',
          partyId: 'p-sample',
          date: '2026-10-02',
          roundOff: -52,
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              qty: 1,
              unit: 'pcs',
              rate: 100000,
              amount: 100000,
            },
          ],
        });
      expect(resNeg.status).toBe(201);
      expect(resNeg.body.roundOff).toBe(-52);

      // 3. Floating point roundOff should be rounded to integer paise
      const resFloat = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          type: 'purchase',
          partyId: 'p-sample',
          date: '2026-10-03',
          roundOff: 35.7,
          lines: [],
        });
      expect(resFloat.status).toBe(201);
      expect(resFloat.body.roundOff).toBe(36);

      // 4. Zero and omitted roundOff
      const resZero = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          type: 'purchase',
          partyId: 'p-sample',
          date: '2026-10-04',
          lines: [],
        });
      expect(resZero.status).toBe(201);
      expect(resZero.body.roundOff).toBe(0);
    });

    it('verifies itemDescription persistence on multiple lines (some present, some empty, some omitted)', async () => {
      const res = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          type: 'purchase',
          partyId: 'p-sample',
          date: '2026-10-05',
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              itemDescription: 'Line 1: Special heavy stand',
              qty: 2,
              unit: 'set',
              rate: 50000,
              amount: 100000,
            },
            {
              itemId: 's2',
              description: 'SV MACHINE',
              // itemDescription omitted
              qty: 1,
              unit: 'set',
              rate: 40000,
              amount: 40000,
            },
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              itemDescription: '', // empty string
              qty: 1,
              unit: 'set',
              rate: 50000,
              amount: 50000,
            },
          ],
        });
      expect(res.status).toBe(201);
      const chId = res.body.id;
      expect(res.body.lines[0].itemDescription).toBe('Line 1: Special heavy stand');
      expect(res.body.lines[1].itemDescription).toBeUndefined();
      expect(res.body.lines[2].itemDescription).toBe('');

      // Verify GET returns exact lines
      const getRes = await request(app)
        .get(`/api/challans/${chId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.lines).toHaveLength(3);
      expect(getRes.body.lines[0].itemDescription).toBe('Line 1: Special heavy stand');
      expect(getRes.body.lines[1].itemDescription).toBeUndefined();
      expect(getRes.body.lines[2].itemDescription).toBe('');
    });

    it('updates challan via PUT /api/challans/:id altering roundOff, lines, itemDescription, and transport metadata', async () => {
      // Create initial challan
      const createRes = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          type: 'purchase',
          partyId: 'p-sample',
          date: '2026-10-06',
          roundOff: 20,
          vehicleNo: 'PB-10-AA-1111',
          transporter: 'Transporter A',
          lrNo: 'LR-001',
          narration: 'Original purchase notes',
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              itemDescription: 'Original description',
              qty: 1,
              unit: 'set',
              rate: 50000,
              amount: 50000,
            },
          ],
        });
      expect(createRes.status).toBe(201);
      const chId = createRes.body.id;
      const chNumber = createRes.body.number;

      // Update via PUT
      const putRes = await request(app)
        .put(`/api/challans/${chId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roundOff: -30,
          vehicleNo: 'PB-10-BB-2222',
          transporter: 'Transporter B Updated',
          lrNo: 'LR-999-REV',
          narration: 'Updated notes after inspection',
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              itemDescription: 'Modified description: verified tested',
              qty: 4,
              unit: 'set',
              rate: 50000,
              amount: 200000,
            },
            {
              itemId: 's2',
              description: 'SV MACHINE',
              itemDescription: 'Added second machine with oil pump',
              qty: 2,
              unit: 'set',
              rate: 45000,
              amount: 90000,
            },
          ],
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.roundOff).toBe(-30);
      expect(putRes.body.vehicleNo).toBe('PB-10-BB-2222');
      expect(putRes.body.transporter).toBe('Transporter B Updated');
      expect(putRes.body.lrNo).toBe('LR-999-REV');
      expect(putRes.body.narration).toBe('Updated notes after inspection');
      expect(putRes.body.lines).toHaveLength(2);
      expect(putRes.body.lines[0].qty).toBe(4);
      expect(putRes.body.lines[0].itemDescription).toBe('Modified description: verified tested');
      expect(putRes.body.lines[1].qty).toBe(2);
      expect(putRes.body.lines[1].itemDescription).toBe('Added second machine with oil pump');

      // Verify activity logging
      const activity = db.prepare(
        "SELECT * FROM activities WHERE action = 'challan_updated' AND target = ? ORDER BY at DESC LIMIT 1"
      ).get(chNumber) as any;
      expect(activity).toBeDefined();
      expect(activity.action).toBe('challan_updated');
      expect(activity.target).toBe(chNumber);
    });

    it('verifies partial PUT updates without sending lines preserves existing lines and itemDescription', async () => {
      // Create initial challan
      const createRes = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          type: 'purchase',
          partyId: 'p-sample',
          date: '2026-10-07',
          roundOff: 15,
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              itemDescription: 'Precious cargo note',
              qty: 1,
              unit: 'set',
              rate: 50000,
              amount: 50000,
            },
          ],
        });
      const chId = createRes.body.id;

      // Update only narration and vehicleNo, omitting lines and roundOff
      const partialPut = await request(app)
        .put(`/api/challans/${chId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          narration: 'Only narration changed',
          vehicleNo: 'HR-26-9999',
        });
      expect(partialPut.status).toBe(200);
      expect(partialPut.body.narration).toBe('Only narration changed');
      expect(partialPut.body.vehicleNo).toBe('HR-26-9999');
      // Preserved lines and roundOff
      expect(partialPut.body.roundOff).toBe(15);
      expect(partialPut.body.lines).toHaveLength(1);
      expect(partialPut.body.lines[0].itemDescription).toBe('Precious cargo note');
    });

    it('returns 404 when updating non-existent challan via PUT', async () => {
      const res = await request(app)
        .put('/api/challans/ch-does-not-exist-xyz')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ narration: 'Test' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('verifies stock balances are not deducted for purchase challans, but are for sales challans', async () => {
      // Godown g1, item s1
      // Check initial stock
      const getInitialStock = () => {
        const row = db.prepare('SELECT qty FROM stock_balances WHERE itemId = ? AND godownId = ?').get('s1', 'g1') as any;
        return row?.qty ?? 0;
      };
      const initialStock = getInitialStock();

      // 1. Create a purchase challan
      const purchaseRes = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          godownId: 'g1',
          type: 'purchase',
          partyId: 'p-sample',
          status: 'queued',
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              qty: 5,
              unit: 'pcs',
              rate: 100000,
              amount: 500000,
            },
          ],
        });
      expect(purchaseRes.status).toBe(201);
      // Stock should remain completely unchanged by purchase challan creation
      expect(getInitialStock()).toBe(initialStock);

      // Edit purchase challan via PUT
      await request(app)
        .put(`/api/challans/${purchaseRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              qty: 10,
              unit: 'pcs',
              rate: 100000,
              amount: 1000000,
            },
          ],
        });
      // Stock should still be unchanged
      expect(getInitialStock()).toBe(initialStock);

      // 2. Create a sales challan (should deduct 3 items)
      const salesRes = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyId: 'c1',
          godownId: 'g1',
          type: 'sales',
          partyId: 'p-sample',
          status: 'queued',
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              qty: 3,
              unit: 'pcs',
              rate: 100000,
              amount: 300000,
            },
          ],
        });
      expect(salesRes.status).toBe(201);
      expect(getInitialStock()).toBe(initialStock - 3);

      // 3. Edit sales challan via PUT to change qty from 3 to 7 (should deduct 4 more)
      const salesPutRes = await request(app)
        .put(`/api/challans/${salesRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          lines: [
            {
              itemId: 's1',
              description: 'TAI MACHINE',
              qty: 7,
              unit: 'pcs',
              rate: 100000,
              amount: 700000,
            },
          ],
        });
      expect(salesPutRes.status).toBe(200);
      expect(getInitialStock()).toBe(initialStock - 7);
    });
  });

  describe('R4: History Query Filtering Stress-Tests (Bills & Challans)', () => {
    beforeAll(() => {
      // Seed specific test bills with distinct known dates and parties
      // Using direct SQL for deterministic test fixtures
      db.prepare(`
        INSERT OR REPLACE INTO bills (id, companyId, partyId, billNo, date, dueDate, dueDays, amount, pending, source)
        VALUES 
          ('b-hist-1', 'c1', 'p-hist-alpha', 'INV-HIST-101', '2026-06-01', '2026-07-01', 30, 10000, 10000, 'tally'),
          ('b-hist-2', 'c1', 'p-hist-alpha', 'INV-HIST-102', '2026-07-15', '2026-08-15', 30, 20000, 20000, 'tally'),
          ('b-hist-3', 'c1', 'p-hist-beta',  'INV-HIST-201', '2026-08-20', '2026-09-20', 30, 30000, 30000, 'tally'),
          ('b-hist-4', 'c1', 'p-hist-beta',  'INV-HIST-202', '2026-09-10', '2026-10-10', 30, 40000, 40000, 'tally'),
          ('b-hist-5', 'c1', 'p-hist-gamma', 'INV-HIST-301', '2026-10-31', '2026-11-30', 30, 50000, 50000, 'tally')
      `).run();

      // Seed party records matching these IDs
      db.prepare(`
        INSERT OR REPLACE INTO parties (id, tenantId, companyId, name, city, phones, closingBalance)
        VALUES
          ('p-hist-alpha', 'platform', 'c1', 'Alpha Industrial Corporation', 'Ludhiana', '[]', 30000),
          ('p-hist-beta',  'platform', 'c1', 'Beta Garments Exporters', 'Amritsar', '[]', 70000),
          ('p-hist-gamma', 'platform', 'c1', 'Gamma Thread Mills', 'Jalandhar', '[]', 50000)
      `).run();

      // Seed specific test challans with distinct known dates and parties
      db.prepare(`
        INSERT OR REPLACE INTO challans (id, companyId, type, number, date, partyId, godownId, lines, roundOff, vehicleNo, status, createdBy)
        VALUES
          ('ch-hist-1', 'c1', 'delivery', 'DC/HIST/001', '2026-06-01', 'p-hist-alpha', 'g1', '[]', 0, 'PB-01-A', 'synced', 'u-owner'),
          ('ch-hist-2', 'c1', 'delivery', 'DC/HIST/002', '2026-07-15', 'p-hist-alpha', 'g1', '[]', 0, 'PB-01-B', 'synced', 'u-owner'),
          ('ch-hist-3', 'c1', 'purchase', 'PC/HIST/001', '2026-08-20', 'p-hist-beta',  'g1', '[]', 0, 'PB-02-A', 'synced', 'u-owner'),
          ('ch-hist-4', 'c1', 'purchase', 'PC/HIST/002', '2026-09-10', 'p-hist-beta',  'g1', '[]', 0, 'PB-02-B', 'synced', 'u-owner'),
          ('ch-hist-5', 'c1', 'sales',    'SC/HIST/001', '2026-10-31', 'p-hist-gamma', 'g1', '[]', 0, 'PB-03-A', 'synced', 'u-owner')
      `).run();
    });

    it('stress-tests date range boundary conditions on GET /api/bills', async () => {
      // 1. Exact single-day boundary match (startDate === endDate === 2026-07-15)
      const resExact = await request(app)
        .get('/api/bills?companyId=c1&startDate=2026-07-15&endDate=2026-07-15')
        .set('Authorization', `Bearer ${authToken}`);
      expect(resExact.status).toBe(200);
      expect(resExact.body.some((b: any) => b.id === 'b-hist-2')).toBe(true);
      expect(resExact.body.every((b: any) => b.date === '2026-07-15')).toBe(true);

      // 2. Open-ended startDate only (date >= 2026-09-10)
      const resStartOnly = await request(app)
        .get('/api/bills?companyId=c1&startDate=2026-09-10')
        .set('Authorization', `Bearer ${authToken}`);
      expect(resStartOnly.status).toBe(200);
      expect(resStartOnly.body.every((b: any) => b.date >= '2026-09-10')).toBe(true);
      const startIds = resStartOnly.body.map((b: any) => b.id);
      expect(startIds).toContain('b-hist-4');
      expect(startIds).toContain('b-hist-5');
      expect(startIds).not.toContain('b-hist-1');

      // 3. Open-ended endDate only (date <= 2026-07-15)
      const resEndOnly = await request(app)
        .get('/api/bills?companyId=c1&endDate=2026-07-15')
        .set('Authorization', `Bearer ${authToken}`);
      expect(resEndOnly.status).toBe(200);
      expect(resEndOnly.body.every((b: any) => b.date <= '2026-07-15')).toBe(true);
      const endIds = resEndOnly.body.map((b: any) => b.id);
      expect(endIds).toContain('b-hist-1');
      expect(endIds).toContain('b-hist-2');
      expect(endIds).not.toContain('b-hist-5');

      // 4. Inverted range (startDate > endDate) must return empty array
      const resInverted = await request(app)
        .get('/api/bills?companyId=c1&startDate=2026-10-31&endDate=2026-06-01')
        .set('Authorization', `Bearer ${authToken}`);
      expect(resInverted.status).toBe(200);
      expect(resInverted.body).toEqual([]);

      // 5. Disjoint range outside any bill dates
      const resDisjoint = await request(app)
        .get('/api/bills?companyId=c1&startDate=2024-01-01&endDate=2024-12-31')
        .set('Authorization', `Bearer ${authToken}`);
      expect(resDisjoint.status).toBe(200);
      expect(resDisjoint.body).toEqual([]);
    });

    it('stress-tests date range boundary conditions on GET /api/challans', async () => {
      // 1. Exact single-day boundary match
      const resExact = await request(app)
        .get('/api/challans?companyId=c1&startDate=2026-08-20&endDate=2026-08-20')
        .set('Authorization', `Bearer ${authToken}`);
      expect(resExact.status).toBe(200);
      expect(resExact.body.some((c: any) => c.id === 'ch-hist-3')).toBe(true);
      expect(resExact.body.every((c: any) => c.date === '2026-08-20')).toBe(true);

      // 2. Open-ended startDate only
      const resStartOnly = await request(app)
        .get('/api/challans?companyId=c1&startDate=2026-09-10')
        .set('Authorization', `Bearer ${authToken}`);
      expect(resStartOnly.status).toBe(200);
      expect(resStartOnly.body.every((c: any) => c.date >= '2026-09-10')).toBe(true);

      // 3. Open-ended endDate only
      const resEndOnly = await request(app)
        .get('/api/challans?companyId=c1&endDate=2026-07-15')
        .set('Authorization', `Bearer ${authToken}`);
      expect(resEndOnly.status).toBe(200);
      expect(resEndOnly.body.every((c: any) => c.date <= '2026-07-15')).toBe(true);

      // 4. Inverted range (startDate > endDate) must return empty array
      const resInverted = await request(app)
        .get('/api/challans?companyId=c1&startDate=2026-10-31&endDate=2026-06-01')
        .set('Authorization', `Bearer ${authToken}`);
      expect(resInverted.status).toBe(200);
      expect(resInverted.body).toEqual([]);
    });

    it('verifies partyId and partyName searching across bills and challans', async () => {
      // 1. PartyId exact filtering on bills
      const billsByParty = await request(app)
        .get('/api/bills?companyId=c1&partyId=p-hist-beta')
        .set('Authorization', `Bearer ${authToken}`);
      expect(billsByParty.status).toBe(200);
      expect(billsByParty.body.length).toBeGreaterThanOrEqual(2);
      expect(billsByParty.body.every((b: any) => b.partyId === 'p-hist-beta')).toBe(true);

      // 2. Case-insensitive substring search for partyName on bills
      const billsByNameLower = await request(app)
        .get('/api/bills?companyId=c1&partyName=garments')
        .set('Authorization', `Bearer ${authToken}`);
      expect(billsByNameLower.status).toBe(200);
      expect(billsByNameLower.body.length).toBeGreaterThanOrEqual(2);
      expect(billsByNameLower.body.every((b: any) => b.partyName.toLowerCase().includes('garments'))).toBe(true);

      const billsByNameUpper = await request(app)
        .get('/api/bills?companyId=c1&partyName=GARMENTS')
        .set('Authorization', `Bearer ${authToken}`);
      expect(billsByNameUpper.status).toBe(200);
      expect(billsByNameUpper.body.length).toEqual(billsByNameLower.body.length);

      // 3. PartyId exact filtering on challans
      const challansByParty = await request(app)
        .get('/api/challans?companyId=c1&partyId=p-hist-alpha')
        .set('Authorization', `Bearer ${authToken}`);
      expect(challansByParty.status).toBe(200);
      expect(challansByParty.body.length).toBeGreaterThanOrEqual(2);
      expect(challansByParty.body.every((c: any) => c.partyId === 'p-hist-alpha')).toBe(true);

      // 4. Case-insensitive partyName filtering on challans
      const challansByName = await request(app)
        .get('/api/challans?companyId=c1&partyName=industrial')
        .set('Authorization', `Bearer ${authToken}`);
      expect(challansByName.status).toBe(200);
      expect(challansByName.body.length).toBeGreaterThanOrEqual(2);
      expect(challansByName.body.every((c: any) => c.partyId === 'p-hist-alpha')).toBe(true);

      // 5. Query parameter `q` matching partyName and billNo on bills
      const billsByQ = await request(app)
        .get('/api/bills?companyId=c1&q=HIST-101')
        .set('Authorization', `Bearer ${authToken}`);
      expect(billsByQ.status).toBe(200);
      expect(billsByQ.body.some((b: any) => b.billNo === 'INV-HIST-101')).toBe(true);
    });

    it('strictly preserves ORDER BY date DESC sorting invariant across all queries', async () => {
      // Helper to verify descending order
      const verifyDateDesc = (items: Array<{ date: string }>) => {
        for (let i = 0; i < items.length - 1; i++) {
          expect(items[i].date >= items[i + 1].date).toBe(true);
        }
      };

      // 1. All bills
      const allBills = await request(app)
        .get('/api/bills?companyId=c1')
        .set('Authorization', `Bearer ${authToken}`);
      expect(allBills.status).toBe(200);
      expect(allBills.body.length).toBeGreaterThan(1);
      verifyDateDesc(allBills.body);

      // 2. Bills with date range
      const rangeBills = await request(app)
        .get('/api/bills?companyId=c1&startDate=2026-06-01&endDate=2026-10-31')
        .set('Authorization', `Bearer ${authToken}`);
      expect(rangeBills.status).toBe(200);
      verifyDateDesc(rangeBills.body);

      // 3. Bills with partyName filter
      const partyBills = await request(app)
        .get('/api/bills?companyId=c1&partyName=a')
        .set('Authorization', `Bearer ${authToken}`);
      expect(partyBills.status).toBe(200);
      verifyDateDesc(partyBills.body);

      // 4. All challans
      const allChallans = await request(app)
        .get('/api/challans?companyId=c1')
        .set('Authorization', `Bearer ${authToken}`);
      expect(allChallans.status).toBe(200);
      expect(allChallans.body.length).toBeGreaterThan(1);
      verifyDateDesc(allChallans.body);

      // 5. Challans with date range
      const rangeChallans = await request(app)
        .get('/api/challans?companyId=c1&startDate=2026-06-01&endDate=2026-10-31')
        .set('Authorization', `Bearer ${authToken}`);
      expect(rangeChallans.status).toBe(200);
      verifyDateDesc(rangeChallans.body);

      // 6. Challans with partyName
      const partyChallans = await request(app)
        .get('/api/challans?companyId=c1&partyName=Industrial')
        .set('Authorization', `Bearer ${authToken}`);
      expect(partyChallans.status).toBe(200);
      verifyDateDesc(partyChallans.body);
    });

    it('safely handles SQL injection attempts and special characters in history query parameters', async () => {
      // 1. SQL injection in partyName on /api/bills
      const sqlInjBills = await request(app)
        .get("/api/bills?companyId=c1&partyName=' OR 1=1 --")
        .set('Authorization', `Bearer ${authToken}`);
      expect(sqlInjBills.status).toBe(200);
      // Parameterized query should treat the payload as literal string, matching 0 parties
      expect(sqlInjBills.body).toEqual([]);

      // 2. SQL injection in startDate on /api/bills
      const sqlInjStart = await request(app)
        .get("/api/bills?companyId=c1&startDate=' OR '1'='1")
        .set('Authorization', `Bearer ${authToken}`);
      expect(sqlInjStart.status).toBe(200);

      // 3. SQL injection in partyName on /api/challans
      const sqlInjChallans = await request(app)
        .get("/api/challans?companyId=c1&partyName=' UNION SELECT * FROM users --")
        .set('Authorization', `Bearer ${authToken}`);
      expect(sqlInjChallans.status).toBe(200);
      expect(sqlInjChallans.body).toEqual([]);

      // 4. Special regex characters in q
      const regexQChallans = await request(app)
        .get('/api/challans?companyId=c1&q=.*')
        .set('Authorization', `Bearer ${authToken}`);
      expect(regexQChallans.status).toBe(200);
    });

    it('blocks cross-tenant and unassigned branch access on PUT /api/challans/:id', async () => {
      // Create a company c2 belonging to another tenant / branch
      db.prepare(`
        INSERT OR IGNORE INTO companies (id, tenantId, name, tallyName, financialYear, agentStatus)
        VALUES ('c-unassigned', 't-other', 'Other Company Branch', 'Other Company Branch', '2026-27', 'offline')
      `).run();

      db.prepare(`
        INSERT OR IGNORE INTO challans (id, companyId, type, number, date, partyId, status, lines, createdBy)
        VALUES ('ch-other-tenant', 'c-unassigned', 'sales', 'SC/OTH/001', '2026-10-20', 'p-sample', 'queued', '[]', 'u-other')
      `).run();

      // Log in as a user with companyIds: ['c1'] (Ramesh Gupta: u3)
      const userLogin = await request(app)
        .post('/api/auth/login')
        .send({ phone: '+91 98111 33445', pin: '1234' });
      const userToken = userLogin.body.token;
      expect(userToken).toBeDefined();

      // Attempt to PUT to other tenant's challan
      const crossPutRes = await request(app)
        .put('/api/challans/ch-other-tenant')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ narration: 'Hacked narration' });
      expect(crossPutRes.status).toBe(403);
      expect(crossPutRes.body.error).toContain('Forbidden');
    });

  });
});
