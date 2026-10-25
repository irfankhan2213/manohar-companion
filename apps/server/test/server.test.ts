import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/db/database.js';

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
});
