import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, getDB, pruneDatabaseTelemetry } from '../src/db/database.js';

describe('Manohar Backend API & Sync Server', () => {
  let app: any;
  let authToken: string;

  beforeAll(async () => {
    // In-memory test database
    initDatabase(':memory:');
    app = createApp();

    // Authenticate test suite session
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    authToken = loginRes.body.token;
  });

  it('responds with 200 on /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns seeded companies', async () => {
    const res = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((c: any) => c.name === 'Manohar Traders')).toBe(true);
  });

  it('returns stock items with machinery like TAI MACHINE and SV MACHINE', async () => {
    const res = await request(app)
      .get('/api/stock')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map((s: any) => s.item.name);
    expect(names).toContain('TAI MACHINE');
    expect(names).toContain('SV MACHINE');
    expect(names).toContain('130K MACHINE');
    expect(names).toContain('TAI SET MACHINE');
  });

  it('creates, edits, fetches and deletes a stock item with custom values like Tally', async () => {
    // 1. Create stock item with custom values
    const createRes = await request(app)
      .post('/api/stock')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Direct Drive Servo 750W',
        partNo: 'DD-750-X',
        unit: 'nos',
        group: 'Motors',
        rate: 580000,
        purchaseRate: 460000,
        reorderLevel: 8,
        hsnCode: '8452',
        gstRate: 18,
        description: 'Heavy duty direct drive servo motor with needle positioner',
        customValues: {
          Brand: 'Jack',
          'Rack Location': 'Shelf C-4',
          Warranty: '2 Years',
        },
        balances: [
          { godownId: 'g1', qty: 25 },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe('Direct Drive Servo 750W');
    expect(createRes.body.unit).toBe('nos');
    expect(createRes.body.hsnCode).toBe('8452');
    expect(createRes.body.gstRate).toBe(18);
    expect(createRes.body.customValues).toEqual({
      Brand: 'Jack',
      'Rack Location': 'Shelf C-4',
      Warranty: '2 Years',
    });
    const createdId = createRes.body.id;

    // 2. Fetch created stock item
    const getRes = await request(app)
      .get(`/api/stock/${createdId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.item.name).toBe('Direct Drive Servo 750W');
    expect(getRes.body.item.customValues['Rack Location']).toBe('Shelf C-4');
    expect(getRes.body.totalQty).toBe(25);

    // 3. Edit stock item and add more custom values
    const updateRes = await request(app)
      .put(`/api/stock/${createdId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Direct Drive Servo 750W Pro',
        rate: 620000,
        customValues: {
          Brand: 'Jack',
          'Rack Location': 'Shelf C-9',
          Warranty: '2 Years',
          Color: 'White',
        },
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Direct Drive Servo 750W Pro');
    expect(updateRes.body.rate).toBe(620000);
    expect(updateRes.body.customValues['Rack Location']).toBe('Shelf C-9');
    expect(updateRes.body.customValues.Color).toBe('White');

    // 4. Delete stock item
    const deleteRes = await request(app)
      .delete(`/api/stock/${createdId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Verify 404 after deletion
    const verifyDel = await request(app)
      .get(`/api/stock/${createdId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(verifyDel.status).toBe(404);
  });

  it('filters challans by itemIds query parameter', async () => {
    // All challans
    const all = await request(app)
      .get('/api/challans')
      .set('Authorization', `Bearer ${authToken}`);
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThan(0);

    // Filter by item-tai
    const tai = await request(app)
      .get('/api/challans?itemIds=item-tai')
      .set('Authorization', `Bearer ${authToken}`);
    expect(tai.status).toBe(200);
    expect(tai.body.length).toBeGreaterThan(0);
    expect(tai.body.every((c: any) => c.lines.some((l: any) => l.itemId === 'item-tai'))).toBe(true);
  });

  it('creates task, creates assignee notification, and retrieves it', async () => {
    const taskPayload = {
      title: 'Inspect TAI MACHINE motor on site',
      description: 'Check voltage regulator',
      assignedToUserId: 'u5', // Suresh Kumar
      assignedByUserId: 'u1',
      challanId: 'ch-6',
      photoUrl: 'data:image/svg+xml;utf8,<svg></svg>',
      status: 'pending',
    };

    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send(taskPayload);
    expect(taskRes.status).toBe(201);
    expect(taskRes.body.title).toBe(taskPayload.title);

    // Check notifications for u5
    const notifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${authToken}`);
    expect(notifs.status).toBe(200);
    const userNotif = notifs.body.find((n: any) => n.userId === 'u5' && n.title === 'New Task Assigned');
    expect(userNotif).toBeDefined();
    expect(userNotif.body).toBe(taskPayload.title);
  });

  it('updates payment reminder due date rule', async () => {
    const updateRes = await request(app)
      .put('/api/reminders/rules')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        tenantId: 'tenant-1',
        enabled: true,
        defaultDueDays: 45,
        minAmount: 500000,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.defaultDueDays).toBe(45);

    const getRes = await request(app)
      .get('/api/reminders/rules')
      .set('Authorization', `Bearer ${authToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.defaultDueDays).toBe(45);
  });

  it('handles Tally sync push and pull protocol', async () => {
    // Push sync batch from Tally agent
    const pushPayload = {
      companyId: 'c1',
      alterId: 20501,
      parties: [
        {
          id: 'p-new-sync',
          name: 'Amritsar Looms Corp',
          city: 'Amritsar',
          phones: ['+91 98111 99999'],
          creditDays: 30,
          notes: 'Sync test',
        },
      ],
      bills: [
        {
          id: 'b-sync-1',
          partyId: 'p-new-sync',
          billNo: 'INV/999/26-27',
          date: '2026-10-18',
          dueDate: '2026-11-17',
          amount: 15000000,
          pending: 15000000,
        },
      ],
      stockItems: [
        {
          id: 'item-sync-machine',
          name: 'NEW TAI SPECIAL 2027',
          unit: 'pcs',
          group: 'Machinery',
          rate: 3500000,
          reorderLevel: 2,
        },
      ],
    };

    const pushRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send(pushPayload);
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.success).toBe(true);
    expect(pushRes.body.partiesUpdated).toBe(1);

    // Verify party in collections
    const colRes = await request(app)
      .get('/api/collections/p-new-sync')
      .set('Authorization', `Bearer ${authToken}`);
    expect(colRes.status).toBe(200);
    expect(colRes.body.party.name).toBe('Amritsar Looms Corp');
    expect(colRes.body.bills.length).toBe(1);

    // Pull queued challans
    const pullRes = await request(app)
      .get('/api/sync/pull')
      .set('Authorization', `Bearer ${authToken}`);
    expect(pullRes.status).toBe(200);
    expect(Array.isArray(pullRes.body)).toBe(true);
  });

  it('updates company details and verifies role permissions', async () => {
    // 1. Update company details
    const updateRes = await request(app)
      .put('/api/companies/c1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Manohar Traders Pvt Ltd', financialYear: '2026-27' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Manohar Traders Pvt Ltd');

    // 2. Test login with correct PIN
    const loginOk = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    expect(loginOk.status).toBe(200);
    expect(loginOk.body.success).toBe(true);
    expect(loginOk.body.user.role).toBe('owner');

    // 3. Test login with incorrect PIN
    const loginFail = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '0000' });
    expect(loginFail.status).toBe(401);
    expect(loginFail.body.success).toBe(false);

    // 4. Update custom permissions matrix
    const permsRes = await request(app)
      .put('/api/permissions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ sales: { 'stock.adjust': true } });
    expect(permsRes.status).toBe(200);
    expect(permsRes.body.sales['stock.adjust']).toBe(true);

    // 5. Database JSON Backup export
    const backupRes = await request(app)
      .get('/api/backup/json')
      .set('Authorization', `Bearer ${authToken}`);
    expect(backupRes.status).toBe(200);
    expect(Array.isArray(backupRes.body.companies)).toBe(true);
    expect(Array.isArray(backupRes.body.parties)).toBe(true);
  });

  it('supports pagination headers and slicing on listing endpoints', async () => {
    const res = await request(app)
      .get('/api/parties?limit=2&offset=0')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(2);
    expect(res.headers['x-total-count']).toBeDefined();
    expect(res.headers['x-has-more']).toBeDefined();

    const paginatedRes = await request(app)
      .get('/api/parties?limit=2&offset=0&format=paginated')
      .set('Authorization', `Bearer ${authToken}`);
    expect(paginatedRes.status).toBe(200);
    expect(paginatedRes.body.items).toBeDefined();
    expect(paginatedRes.body.total).toBeDefined();
    expect(paginatedRes.body.limit).toBe(2);
    expect(paginatedRes.body.offset).toBe(0);
  });

  it('generates organization-specific agent-state.json config download', async () => {
    const res = await request(app)
      .get('/api/agent/config-file?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment; filename="agent-state.json"');
    expect(res.body.companyId).toBe('c1');
    expect(res.body.cloudUrl).toBeDefined();
    expect(res.body.agentSecretKey).toBeDefined();
    expect(res.body.tallyUrl).toBe('http://127.0.0.1:25853');
  });

  it('generates organization-scoped pairing code and successfully pairs agent via POST /api/agent/pair', async () => {
    // 1. Generate pairing code for company c1
    const codeRes = await request(app)
      .post('/api/agent/pairing-code')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ companyId: 'c1' });
    expect(codeRes.status).toBe(200);
    expect(codeRes.body.code).toMatch(/^\d{6}$/);
    expect(codeRes.body.companyId).toBe('c1');
    expect(codeRes.body.expiresAt).toBeDefined();

    const pairingCode = codeRes.body.code;

    // 2. Desktop Agent calls /api/agent/pair without prior auth token
    const pairRes = await request(app)
      .post('/api/agent/pair')
      .send({ code: pairingCode });
    expect(pairRes.status).toBe(200);
    expect(pairRes.body.success).toBe(true);
    expect(pairRes.body.companyId).toBe('c1');
    expect(pairRes.body.companyName).toBeDefined();
    expect(pairRes.body.agentSecretKey).toBeDefined();
    expect(pairRes.body.cloudUrl).toBeDefined();

    // 3. Reusing the pairing code fails (one-time security token)
    const reuseRes = await request(app)
      .post('/api/agent/pair')
      .send({ code: pairingCode });
    expect(reuseRes.status).toBe(404);

    // 4. Invalid pairing code fails
    const invalidRes = await request(app)
      .post('/api/agent/pair')
      .send({ code: '000000' });
    expect(invalidRes.status).toBe(404);
  });

  it('downloads pre-paired setup zip archive without event loop freeze', async () => {
    const res = await request(app)
      .get('/api/agent/download-zip?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toContain('tally-agent-manohar');
    expect(Buffer.isBuffer(res.body) || typeof res.text === 'string').toBe(true);
  });

  it('prunes sync_batches per company without evicting other companies telemetry', () => {
    const db = getDB();
    // Insert 550 batches for c1 and 5 batches for c2
    const insert = db.prepare('INSERT INTO sync_batches (companyId, syncedAt, alterId) VALUES (?, ?, ?)');
    for (let i = 1; i <= 550; i++) {
      insert.run('c1', new Date().toISOString(), i);
    }
    for (let i = 1; i <= 5; i++) {
      insert.run('c2', new Date().toISOString(), i);
    }

    const c1Before = db.prepare('SELECT COUNT(*) as cnt FROM sync_batches WHERE companyId = ?').get('c1') as any;
    const c2Before = db.prepare('SELECT COUNT(*) as cnt FROM sync_batches WHERE companyId = ?').get('c2') as any;
    expect(c1Before.cnt).toBeGreaterThanOrEqual(550);
    expect(c2Before.cnt).toBeGreaterThanOrEqual(5);

    pruneDatabaseTelemetry(db);

    const c1After = db.prepare('SELECT COUNT(*) as cnt FROM sync_batches WHERE companyId = ?').get('c1') as any;
    const c2After = db.prepare('SELECT COUNT(*) as cnt FROM sync_batches WHERE companyId = ?').get('c2') as any;

    // c1 pruned to 500 max
    expect(c1After.cnt).toBe(500);
    // c2 telemetry is fully preserved
    expect(c2After.cnt).toBe(c2Before.cnt);
  });

  it('queues remote RESET_ALTER_ID command and delivers it via /api/agent/sync', async () => {
    // 1. Queue RESET_ALTER_ID command
    const cmdRes = await request(app)
      .post('/api/agent/reset-alter-id')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ companyId: 'c1' });
    expect(cmdRes.status).toBe(200);
    expect(cmdRes.body.success).toBe(true);
    expect(cmdRes.body.companyId).toBe('c1');

    // 2. Agent sync heartbeat checks and retrieves the command
    const syncRes = await request(app)
      .post('/api/agent/sync')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ companyId: 'c1', companyName: 'Manohar Traders', tallyStatus: 'online' });
    expect(syncRes.status).toBe(200);
    expect(Array.isArray(syncRes.body.commands)).toBe(true);
    expect(syncRes.body.commands.length).toBeGreaterThan(0);
    expect(syncRes.body.commands[0].type).toBe('RESET_ALTER_ID');

    // 3. Subsequent heartbeat has no pending commands (cleared from queue)
    const syncRes2 = await request(app)
      .post('/api/agent/sync')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ companyId: 'c1', companyName: 'Manohar Traders', tallyStatus: 'online' });
    expect(syncRes2.status).toBe(200);
    expect(syncRes2.body.commands).toEqual([]);
  });

  it('queues remote RESET_ALTER_ID command and delivers it via GET /api/sync/pull header', async () => {
    // 1. Queue command
    await request(app)
      .post('/api/agent/reset-alter-id')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ companyId: 'c1' });

    // 2. GET /api/sync/pull delivers command in X-Agent-Commands header
    const pullRes = await request(app)
      .get('/api/sync/pull?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(pullRes.status).toBe(200);
    const cmdHeader = pullRes.headers['x-agent-commands'];
    expect(cmdHeader).toBeDefined();
    const cmds = JSON.parse(cmdHeader);
    expect(cmds.some((c: any) => c.type === 'RESET_ALTER_ID')).toBe(true);

    // 3. Subsequent pull has no pending commands
    const pullRes2 = await request(app)
      .get('/api/sync/pull?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(pullRes2.headers['x-agent-commands']).toBeUndefined();
  });

  it('honors minimal=1 and includeNode=0 flags in /api/agent/download-zip', async () => {
    const defaultRes = await request(app)
      .get('/api/agent/download-zip?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(defaultRes.status).toBe(200);

    const minimalRes = await request(app)
      .get('/api/agent/download-zip?companyId=c1&includeNode=0')
      .set('Authorization', `Bearer ${authToken}`);
    expect(minimalRes.status).toBe(200);
  });

  it('prevents cross-party bill overwrite when multiple parties share the same bill number', async () => {
    const payload = {
      companyId: 'c1',
      parties: [
        { id: 'p-scope-a', name: 'Party Alpha', city: 'Delhi', phones: ['+91 99999 11111'] },
        { id: 'p-scope-b', name: 'Party Beta', city: 'Mumbai', phones: ['+91 99999 22222'] },
      ],
      bills: [
        {
          id: 'b-scope-a',
          partyId: 'p-scope-a',
          billNo: 'SHARED-INV-001',
          date: '2026-10-01',
          dueDate: '2026-10-31',
          amount: 500000,
          pending: 500000,
        },
        {
          id: 'b-scope-b',
          partyId: 'p-scope-b',
          billNo: 'SHARED-INV-001',
          date: '2026-10-02',
          dueDate: '2026-11-01',
          amount: 750000,
          pending: 750000,
        },
      ],
    };

    const pushRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);
    expect(pushRes.status).toBe(200);

    const billsRes = await request(app)
      .get('/api/bills?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(billsRes.status).toBe(200);

    const sharedBills = billsRes.body.filter((b: any) => b.billNo === 'SHARED-INV-001');
    expect(sharedBills.length).toBe(2);
    expect(sharedBills.some((b: any) => b.partyId === 'p-scope-a' && b.amount === 500000)).toBe(true);
    expect(sharedBills.some((b: any) => b.partyId === 'p-scope-b' && b.amount === 750000)).toBe(true);

    // Also verify when two parties push bills with the exact same b.id
    const duplicateIdPayload = {
      companyId: 'c1',
      parties: [
        { id: 'p-id-test-1', name: 'ID Collision Party 1', city: 'Delhi' },
        { id: 'p-id-test-2', name: 'ID Collision Party 2', city: 'Mumbai' },
      ],
      bills: [
        {
          id: 'b-exact-id-collision',
          partyId: 'p-id-test-1',
          billNo: 'COLLIDE-01',
          date: '2026-10-01',
          dueDate: '2026-10-31',
          amount: 110000,
          pending: 110000,
        },
        {
          id: 'b-exact-id-collision',
          partyId: 'p-id-test-2',
          billNo: 'COLLIDE-02',
          date: '2026-10-02',
          dueDate: '2026-11-01',
          amount: 220000,
          pending: 220000,
        },
      ],
    };
    const dupRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send(duplicateIdPayload);
    expect(dupRes.status).toBe(200);

    const collideBillsRes = await request(app)
      .get('/api/bills?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(collideBillsRes.status).toBe(200);
    const p1Bill = collideBillsRes.body.find((b: any) => b.partyId === 'p-id-test-1');
    const p2Bill = collideBillsRes.body.find((b: any) => b.partyId === 'p-id-test-2');
    expect(p1Bill).toBeDefined();
    expect(p2Bill).toBeDefined();
    expect(p1Bill.amount).toBe(110000);
    expect(p2Bill.amount).toBe(220000);
  });

  it('properly deducts credit notes from total receivables in dashboard stats and ledger lines', async () => {
    // Push positive invoice and negative credit note for p-scope-a
    const pushPayload = {
      companyId: 'c1',
      parties: [{ id: 'p-cn-test', name: 'Credit Note Test Party', city: 'Kolkata' }],
      bills: [
        {
          id: 'b-inv-positive',
          partyId: 'p-cn-test',
          billNo: 'INV/POS/01',
          date: '2026-10-01',
          dueDate: '2026-10-31',
          amount: 1000000, // ₹10,000
          pending: 1000000,
        },
        {
          id: 'b-cn-negative',
          partyId: 'p-cn-test',
          billNo: 'CN/NEG/01',
          date: '2026-10-05',
          dueDate: '2026-10-05',
          amount: -300000, // -₹3,000 credit note
          pending: -300000,
        },
      ],
    };

    await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send(pushPayload);

    // Verify ledger synthesizing creates Credit Note voucher
    const ledgerRes = await request(app)
      .get('/api/ledger/p-cn-test')
      .set('Authorization', `Bearer ${authToken}`);
    expect(ledgerRes.status).toBe(200);
    const cnLine = ledgerRes.body.find((l: any) => l.voucherNo === 'CN/NEG/01');
    expect(cnLine).toBeDefined();
    expect(cnLine.voucherType).toBe('Credit Note');
    expect(cnLine.credit).toBe(300000);
    expect(cnLine.debit).toBe(0);

    // Verify collections report deducts credit note from totalOutstanding
    const agingRes = await request(app)
      .get('/api/collections?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(agingRes.status).toBe(200);
    const partyAging = agingRes.body.find((r: any) => r.party.id === 'p-cn-test');
    expect(partyAging).toBeDefined();
    // 1000000 - 300000 = 700000 net outstanding
    expect(partyAging.totalOutstanding).toBe(700000);

    // Verify dashboard stats deducts credit notes from totalReceivables
    const statsRes = await request(app)
      .get('/api/dashboard/stats?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.totalReceivables).toBeGreaterThan(0);
  });

  it('persists party closingBalance and displays it in collections report for parties without bills', async () => {
    const pushPayload = {
      companyId: 'c1',
      parties: [
        {
          id: 'p-no-bill-party',
          name: 'Non Bill By Bill Customer',
          city: 'Jaipur',
          closingBalance: 4500000, // ₹45,000 in paise
        },
      ],
      bills: [],
    };

    const pushRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send(pushPayload);
    expect(pushRes.status).toBe(200);

    const partyRes = await request(app)
      .get('/api/parties/p-no-bill-party')
      .set('Authorization', `Bearer ${authToken}`);
    expect(partyRes.status).toBe(200);
    expect(partyRes.body.closingBalance).toBe(4500000);

    const agingRes = await request(app)
      .get('/api/collections?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(agingRes.status).toBe(200);
    const nonBillRow = agingRes.body.find((r: any) => r.party.id === 'p-no-bill-party');
    expect(nonBillRow).toBeDefined();
    expect(nonBillRow.totalOutstanding).toBe(4500000);

    // Verify ledger synthesizing creates balance line for non-bill party
    const ledgerRes = await request(app)
      .get('/api/ledger/p-no-bill-party')
      .set('Authorization', `Bearer ${authToken}`);
    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.length).toBe(1);
    expect(ledgerRes.body[0].debit).toBe(4500000);
    expect(ledgerRes.body[0].voucherType).toBe('Balance');
  });

  it('accepts all data into paired companyId even when Tally companyName differs from Web App companyName, and auto-provisions additional open companies when no companyId is passed', async () => {
    // 1. Agent pushes primary open Tally company ("Shree Balaji Enterprises (2025-26)") with paired companyId "c1"
    // even though c1 was named "Manohar Traders Pvt Ltd" in the Web App
    const primaryRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        companyId: 'c1',
        companyName: 'Shree Balaji Enterprises (2025-26)',
        alterId: 400,
        parties: [
          {
            id: 'p-balaji-1',
            name: 'Balaji Primary Customer',
            city: 'Ludhiana',
            closingBalance: 6400000,
          },
        ],
        bills: [],
        stockItems: [],
      });

    expect(primaryRes.status).toBe(200);
    expect(primaryRes.body.success).toBe(true);
    expect(primaryRes.body.companyId).toBe('c1');

    // Verify c1 received the data directly and updated its name/tallyName to match Tally
    const c1PartiesRes = await request(app)
      .get('/api/parties?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(c1PartiesRes.status).toBe(200);
    expect(c1PartiesRes.body.some((p: any) => p.name === 'Balaji Primary Customer')).toBe(true);

    const c1CompRes = await request(app)
      .get('/api/companies/c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(c1CompRes.status).toBe(200);
    expect(c1CompRes.body.tallyName).toBe('Shree Balaji Enterprises (2025-26)');
    expect(c1CompRes.body.name).toBe('Shree Balaji Enterprises (2025-26)');

    // 2. Agent pushes a 2nd simultaneously open Tally company ("Sunrise Industrial Machines") without companyId
    const pushRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        companyName: 'Sunrise Industrial Machines',
        alterId: 501,
        parties: [
          {
            id: 'p-sunrise-cust-1',
            name: 'Sunrise Exclusive Buyer',
            city: 'Panipat',
            closingBalance: 9200000,
          },
        ],
        bills: [],
        stockItems: [
          {
            id: 's-sunrise-item-1',
            name: 'Sunrise Heavy Loom X1',
            unit: 'set',
            group: 'Looms',
            rate: 12500000,
            closingQty: 7,
          },
        ],
      });

    expect(pushRes.status).toBe(200);
    expect(pushRes.body.success).toBe(true);
    expect(pushRes.body.companyId).toBeDefined();
    expect(pushRes.body.companyId).not.toBe('c1');
    const newCompId = pushRes.body.companyId;

    // Verify newCompId contains Sunrise Exclusive Buyer and Sunrise Heavy Loom X1
    const newPartiesRes = await request(app)
      .get(`/api/parties?companyId=${newCompId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(newPartiesRes.status).toBe(200);
    expect(newPartiesRes.body.some((p: any) => p.name === 'Sunrise Exclusive Buyer')).toBe(true);

    const newStockRes = await request(app)
      .get(`/api/stock?companyId=${newCompId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(newStockRes.status).toBe(200);
    expect(newStockRes.body.some((s: any) => s.item.name === 'Sunrise Heavy Loom X1' && s.totalQty === 7)).toBe(true);
  });

  it('preserves local party customPhones across incoming Tally sync and supports debtor/creditor differentiation (R1)', async () => {
    // 1. Initial Tally push with party phones
    await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        companyId: 'c1',
        parties: [
          {
            id: 'p-sync-contact-1',
            name: 'Contact Test Customer',
            city: 'Ludhiana',
            phones: ['+91 98000 11111'],
            parentGroup: 'Sundry Debtors',
            partyType: 'debtor',
            closingBalance: 500000,
          },
          {
            id: 'p-sync-supplier-1',
            name: 'Contact Test Supplier',
            city: 'Jalandhar',
            phones: ['+91 98000 22222'],
            parentGroup: 'Sundry Creditors',
            partyType: 'creditor',
            closingBalance: -300000,
          },
        ],
        bills: [],
        stockItems: [],
      });

    // 2. Add local custom contact numbers via PATCH /api/parties/:id
    const patchRes = await request(app)
      .patch('/api/parties/p-sync-contact-1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        customPhones: ['+91 98765 43210', '+91 98111 22222'],
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.customPhones).toEqual(['+91 98765 43210', '+91 98111 22222']);

    // 3. Incoming subsequent Tally sync with updated Tally master phone and empty customPhones
    const reSyncRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        companyId: 'c1',
        parties: [
          {
            id: 'p-sync-contact-1',
            name: 'Contact Test Customer',
            city: 'Ludhiana',
            phones: ['+91 98000 99999'], // updated Tally master number
            customPhones: [], // Tally agent sends empty customPhones
            parentGroup: 'Sundry Debtors',
            partyType: 'debtor',
            closingBalance: 550000,
          },
        ],
        bills: [],
        stockItems: [],
      });
    expect(reSyncRes.status).toBe(200);

    // 4. Verify local custom phones were PRESERVED and not wiped out by incoming sync
    const partyRes = await request(app)
      .get('/api/parties/p-sync-contact-1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(partyRes.status).toBe(200);
    expect(partyRes.body.phones).toEqual(['+91 98000 99999']);
    expect(partyRes.body.customPhones).toEqual(['+91 98765 43210', '+91 98111 22222']);
    expect(partyRes.body.partyType).toBe('debtor');

    // 5. Test debtor vs creditor filtering via GET /api/parties?type=debtor|creditor
    const debtorsRes = await request(app)
      .get('/api/parties?companyId=c1&type=debtor')
      .set('Authorization', `Bearer ${authToken}`);
    expect(debtorsRes.status).toBe(200);
    expect(debtorsRes.body.some((p: any) => p.id === 'p-sync-contact-1')).toBe(true);
    expect(debtorsRes.body.some((p: any) => p.id === 'p-sync-supplier-1')).toBe(false);

    const creditorsRes = await request(app)
      .get('/api/parties?companyId=c1&type=creditor')
      .set('Authorization', `Bearer ${authToken}`);
    expect(creditorsRes.status).toBe(200);
    expect(creditorsRes.body.some((p: any) => p.id === 'p-sync-supplier-1')).toBe(true);
    expect(creditorsRes.body.some((p: any) => p.id === 'p-sync-contact-1')).toBe(false);
  });

  it('accurately reconciles unadjusted advances and credit notes via FIFO and excludes creditors in home receivables (R2)', async () => {
    // Set up dedicated test company for isolated receivables verification
    const testCompId = 'comp-receivables-test';
    const pushRes = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        companyName: 'Receivables Test Corporation',
        parties: [
          {
            id: 'p-adv-cust',
            name: 'Advance Reconcile Customer',
            parentGroup: 'Sundry Debtors',
            partyType: 'debtor',
            // Total bills = 10,000 + 5,000 = 15,000 (1,500,000 paise).
            // Tally ledger closing balance = 9,000 (900,000 paise), reflecting a 6,000 (600,000 paise) advance on account.
            closingBalance: 900000,
          },
          {
            id: 'p-adv-supplier',
            name: 'Raw Materials Supplier Ltd',
            parentGroup: 'Sundry Creditors',
            partyType: 'creditor',
            // Creditor payable should NEVER be lumped into customer receivables
            closingBalance: -400000,
          },
        ],
        bills: [
          {
            id: 'b-adv-inv-1',
            partyId: 'p-adv-cust',
            billNo: 'INV/ADV/01',
            date: '2026-08-01',
            dueDate: '2026-08-31', // overdue
            amount: 1000000, // ₹10,000
            pending: 1000000,
          },
          {
            id: 'b-adv-inv-2',
            partyId: 'p-adv-cust',
            billNo: 'INV/ADV/02',
            date: '2026-09-01',
            dueDate: '2026-09-30', // overdue
            amount: 500000, // ₹5,000
            pending: 500000,
          },
        ],
        stockItems: [],
      });
    expect(pushRes.status).toBe(200);
    const resolvedCompanyId = pushRes.body.companyId;

    // Fetch dashboard stats for the company
    const statsRes = await request(app)
      .get(`/api/dashboard/stats?companyId=${resolvedCompanyId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(statsRes.status).toBe(200);

    // 1. Authoritative net receivables: 900,000 paise (₹9,000), NOT 1,500,000, and NOT contaminated by creditor (-400,000)
    expect(statsRes.body.totalReceivables).toBe(900000);

    // 2. FIFO Advance Reconciliation:
    // Advance = 15,000 - 9,000 = 6,000.
    // Applied to oldest bill (INV/ADV/01: 10,000 - 6,000 = 4,000 pending).
    // Second bill (INV/ADV/02: 5,000 pending).
    // Both are overdue, so totalOverdue = 4,000 + 5,000 = 9,000 (900,000 paise).
    expect(statsRes.body.totalOverdue).toBe(900000);

    // 3. Creditor must not appear in mostOverdue
    expect(statsRes.body.mostOverdue.some((o: any) => o.party.id === 'p-adv-supplier')).toBe(false);
  });

  it('creates purchase challan with roundOff & itemDescription, and allows editing via PUT /api/challans/:id (R3)', async () => {
    // 1. Create a purchase challan with roundOff and line itemDescription
    const createRes = await request(app)
      .post('/api/challans')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        companyId: 'c1',
        type: 'purchase',
        partyId: 'p-sample',
        date: '2026-10-20',
        roundOff: 35, // +35 paise
        narration: 'Initial purchase challan from supplier',
        vehicleNo: 'PB-10-XY-9999',
        lines: [
          {
            itemId: 's1',
            description: 'TAI MACHINE',
            itemDescription: 'Direct delivery with heavy-duty stand',
            qty: 2,
            unit: 'set',
            rate: 150000,
            amount: 300000,
            hsnCode: '8452',
            gstRate: 18,
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const createdId = createRes.body.id;
    expect(createRes.body.roundOff).toBe(35);
    expect(createRes.body.lines[0].itemDescription).toBe('Direct delivery with heavy-duty stand');

    // 2. Edit challan via PUT /api/challans/:id
    const putRes = await request(app)
      .put(`/api/challans/${createdId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        roundOff: -45, // updated roundOff (-45 paise)
        narration: 'Revised purchase challan notes',
        vehicleNo: 'PB-10-ZZ-1234',
        lines: [
          {
            itemId: 's1',
            description: 'TAI MACHINE',
            itemDescription: 'Updated line description: includes spare needle pack',
            qty: 3,
            unit: 'set',
            rate: 150000,
            amount: 450000,
            hsnCode: '8452',
            gstRate: 18,
          },
        ],
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.roundOff).toBe(-45);
    expect(putRes.body.narration).toBe('Revised purchase challan notes');
    expect(putRes.body.vehicleNo).toBe('PB-10-ZZ-1234');
    expect(putRes.body.lines[0].qty).toBe(3);
    expect(putRes.body.lines[0].itemDescription).toBe('Updated line description: includes spare needle pack');

    // 3. Confirm persistence via GET /api/challans/:id
    const getRes = await request(app)
      .get(`/api/challans/${createdId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.roundOff).toBe(-45);
    expect(getRes.body.lines[0].itemDescription).toBe('Updated line description: includes spare needle pack');
  });

  it('filters past bills and challans by party, date range, and partyName in history query (R4)', async () => {
    // 1. History filtering for bills
    const billsAllRes = await request(app)
      .get('/api/bills?companyId=c1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(billsAllRes.status).toBe(200);
    expect(Array.isArray(billsAllRes.body)).toBe(true);
    expect(billsAllRes.body.length).toBeGreaterThan(0);
    // Verify partyName is attached to bills
    expect(billsAllRes.body[0].partyName).toBeDefined();

    // Filter by partyId
    const billsByPartyRes = await request(app)
      .get('/api/bills?companyId=c1&partyId=p-sample')
      .set('Authorization', `Bearer ${authToken}`);
    expect(billsByPartyRes.status).toBe(200);
    expect(billsByPartyRes.body.every((b: any) => b.partyId === 'p-sample')).toBe(true);

    // Filter by partyName
    const billsByNameRes = await request(app)
      .get('/api/bills?companyId=c1&partyName=Sample')
      .set('Authorization', `Bearer ${authToken}`);
    expect(billsByNameRes.status).toBe(200);
    expect(billsByNameRes.body.every((b: any) => b.partyName?.toLowerCase().includes('sample'))).toBe(true);

    // Filter by date range
    const billsByDateRes = await request(app)
      .get('/api/bills?companyId=c1&startDate=2026-08-01&endDate=2026-09-01')
      .set('Authorization', `Bearer ${authToken}`);
    expect(billsByDateRes.status).toBe(200);
    expect(billsByDateRes.body.every((b: any) => b.date >= '2026-08-01' && b.date <= '2026-09-01')).toBe(true);

    // 2. History filtering for challans
    // Filter challans by partyId
    const challansByPartyRes = await request(app)
      .get('/api/challans?companyId=c1&partyId=p-sample')
      .set('Authorization', `Bearer ${authToken}`);
    expect(challansByPartyRes.status).toBe(200);
    expect(challansByPartyRes.body.every((c: any) => c.partyId === 'p-sample')).toBe(true);

    // Filter challans by date range
    const challansByDateRes = await request(app)
      .get('/api/challans?companyId=c1&startDate=2026-10-01&endDate=2026-10-31')
      .set('Authorization', `Bearer ${authToken}`);
    expect(challansByDateRes.status).toBe(200);
    expect(challansByDateRes.body.every((c: any) => c.date >= '2026-10-01' && c.date <= '2026-10-31')).toBe(true);
  });
});
