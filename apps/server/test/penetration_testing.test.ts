import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/db/database.js';

describe('Penetration Testing & Security Vulnerability Audit Suite', () => {
  let app: any;
  let devToken: string;
  let ownerToken: string;
  let salesToken: string;
  let stockKeeperToken: string;
  let tenant2Id: string;
  let tenant2CompanyId: string;
  let tenant2OwnerToken: string;

  beforeAll(async () => {
    initDatabase(':memory:');
    app = createApp();

    // 1. Dev Super Admin login
    const devLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+91 99999 00000', pin: '0000' });
    devToken = devLogin.body.token;

    // 2. Client 1 Owner login
    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+91 98140 11223', pin: '1234' });
    ownerToken = ownerLogin.body.token;

    // 3. Client 1 Sales Staff login (sales role: party.edit=false, stock.adjust=false, settings.manage=false)
    const salesLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+91 98222 44556', pin: '1234' });
    salesToken = salesLogin.body.token;

    // 4. Client 1 Stock Keeper login (stock_keeper role: ledgers.view=false, reminders.view=false)
    const skLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+91 98333 55667', pin: '1234' });
    stockKeeperToken = skLogin.body.token;

    // 5. Onboard Tenant 2
    const newClient = await request(app)
      .post('/api/dev/clients')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        name: 'Sharma Spinning Mills',
        ownerName: 'Sunil Sharma',
        ownerPhone: '+91 98777 66554',
        ownerPin: '4321',
        tallyCompanyName: 'Sharma Textiles',
      });
    tenant2Id = newClient.body.tenant.id;
    tenant2CompanyId = newClient.body.company.id;

    const t2Login = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+91 98777 66554', pin: '4321' });
    tenant2OwnerToken = t2Login.body.token;
  });

  describe('OWASP API1 & API2: Broken Object Level Authorization & Broken Authentication', () => {
    it('blocks unauthenticated access to /api/parties with 401', async () => {
      const res = await request(app).get('/api/parties');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('blocks unauthenticated access to /api/bills with 401', async () => {
      const res = await request(app).get('/api/bills');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('blocks unauthenticated access to /api/stock with 401', async () => {
      const res = await request(app).get('/api/stock');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('blocks unauthenticated access to /api/challans with 401', async () => {
      const res = await request(app).get('/api/challans');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('blocks unauthenticated access to /api/dev/clients with 401', async () => {
      const res = await request(app).get('/api/dev/clients');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('blocks unauthenticated client creation on /api/dev/clients with 401', async () => {
      const res = await request(app).post('/api/dev/clients').send({
        name: 'Hacker Corp',
        ownerName: 'Attacker',
        ownerPhone: '+91 90000 00000',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('blocks unauthenticated access to /api/backup/snapshots with 401', async () => {
      const res = await request(app).get('/api/backup/snapshots');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });
  });

  describe('OWASP API5: Broken Function Level Authorization & Granular RBAC', () => {
    it('prevents regular owner or sales staff from accessing /api/dev/clients (403 Forbidden)', async () => {
      const ownerRes = await request(app)
        .get('/api/dev/clients')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ownerRes.status).toBe(403);

      const salesRes = await request(app)
        .get('/api/dev/clients')
        .set('Authorization', `Bearer ${salesToken}`);
      expect(salesRes.status).toBe(403);
    });

    it('prevents sales staff from mutating user roles via PATCH /api/users/:id/role', async () => {
      const res = await request(app)
        .patch('/api/users/u3/role')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ role: 'owner' });
      expect(res.status).toBe(403);
    });

    it('prevents sales staff from modifying global permission matrix via PUT /api/permissions', async () => {
      const res = await request(app)
        .put('/api/permissions')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ sales: { 'ledgers.view': true } });
      expect(res.status).toBe(403);
    });

    it('prevents sales staff (missing settings.manage) from creating or modifying companies', async () => {
      const createRes = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ name: 'Rogue Branch' });
      expect(createRes.status).toBe(403);

      const updateRes = await request(app)
        .put('/api/companies/c1')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ name: 'Hijacked Name' });
      expect(updateRes.status).toBe(403);
    });

    it('prevents sales staff (missing party.edit) from creating or modifying parties', async () => {
      const createRes = await request(app)
        .post('/api/parties')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ name: 'Unauthorized Party', city: 'Ludhiana' });
      expect(createRes.status).toBe(403);

      const patchRes = await request(app)
        .patch('/api/parties/p1')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ remindersPaused: true });
      expect(patchRes.status).toBe(403);
    });

    it('prevents stock_keeper (missing ledgers.view) from viewing parties, bills, or collections', async () => {
      const partiesRes = await request(app)
        .get('/api/parties')
        .set('Authorization', `Bearer ${stockKeeperToken}`);
      expect(partiesRes.status).toBe(403);

      const billsRes = await request(app)
        .get('/api/bills')
        .set('Authorization', `Bearer ${stockKeeperToken}`);
      expect(billsRes.status).toBe(403);

      const colRes = await request(app)
        .get('/api/collections')
        .set('Authorization', `Bearer ${stockKeeperToken}`);
      expect(colRes.status).toBe(403);
    });

    it('prevents sales staff (missing settings.manage) from generating pairing codes or downloading agent config', async () => {
      const pairCodeRes = await request(app)
        .post('/api/agent/pairing-code')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ companyId: 'c1' });
      expect(pairCodeRes.status).toBe(403);

      const cfgRes = await request(app)
        .get('/api/agent/config-file?companyId=c1')
        .set('Authorization', `Bearer ${salesToken}`);
      expect(cfgRes.status).toBe(403);
    });

    it('prevents owner from assigning platform clients.manage permission via POST /api/users', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Privilege Escalation Attempt',
          phone: '+91 99991 11111',
          role: 'sales',
          customPermissions: ['clients.manage', 'stock.view'],
        });
      expect(res.status).toBe(201);
      expect(res.body.customPermissions).not.toContain('clients.manage');
      expect(res.body.customPermissions).toContain('stock.view');
    });

    it('prevents owner from setting clients.manage: true in PUT /api/permissions matrix', async () => {
      const res = await request(app)
        .put('/api/permissions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sales: { 'clients.manage': true, 'stock.view': true } });
      expect(res.status).toBe(200);
      expect(res.body.sales['clients.manage']).toBe(false);
      expect(res.body.sales['stock.view']).toBe(true);
    });

    it('prevents non-dev callers from assigning dev role', async () => {
      const res = await request(app)
        .patch('/api/users/u3/role')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'dev' });
      expect(res.status).toBe(403);
    });
  });

  describe('OWASP API3: Sensitive Data Exposure & PIN Protection', () => {
    it('ensures PIN hashes and plaintext PINs are never returned in /api/dev/clients', async () => {
      const res = await request(app)
        .get('/api/dev/clients')
        .set('Authorization', `Bearer ${devToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      for (const client of res.body) {
        if (client.owner) {
          expect(client.owner.pin).toBeUndefined();
        }
      }
    });

    it('ensures PIN hashes are stripped from /api/users listings and /api/backup/json exports', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      for (const u of res.body) {
        expect(u.pin).toBeUndefined();
      }

      const backupRes = await request(app)
        .get('/api/backup/json')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(backupRes.status).toBe(200);
      for (const u of backupRes.body.users) {
        expect(u.pin).toBeUndefined();
      }
    });
  });

  describe('Multi-Tenant Isolation & IDOR Prevention', () => {
    it('blocks Client 1 from accessing Client 2 company data via cross-tenant companyId parameter', async () => {
      const res = await request(app)
        .get(`/api/parties?companyId=${tenant2CompanyId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('blocks Client 1 from enumerating Client 2 staff via GET /api/users?tenantId=...', async () => {
      const res = await request(app)
        .get(`/api/users?tenantId=${tenant2Id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
    });

    it('forces newly created companies by non-dev owners to stay inside their own tenantId', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Attempted Spoof Company',
          tenantId: tenant2Id,
        });
      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe('tenant-1');
    });

    it('scopes tenant agent keys so Tenant 2 agent key cannot push or pull Tenant 1 company data', async () => {
      const statusRes = await request(app)
        .get('/api/agent/status')
        .set('Authorization', `Bearer ${tenant2OwnerToken}`);
      expect(statusRes.status).toBe(200);
      const tenant2AgentKey = statusRes.body.agentApiKey;
      expect(tenant2AgentKey).toBeDefined();

      // Tenant 2 agent key attempting to push to Tenant 1 company c1 must fail with 403
      const crossPush = await request(app)
        .post('/api/sync/push')
        .set('x-agent-key', tenant2AgentKey)
        .send({ companyId: 'c1', parties: [] });
      expect(crossPush.status).toBe(403);

      // Tenant 2 agent key pushing to its own company succeeds
      const ownPush = await request(app)
        .post('/api/sync/push')
        .set('x-agent-key', tenant2AgentKey)
        .send({ companyId: tenant2CompanyId, parties: [] });
      expect(ownPush.status).toBe(200);
    });
  });

  describe('SQL Injection & Malformed Input Resistance', () => {
    it('handles SQL injection payloads safely on parameterized endpoints', async () => {
      const sqlPayload = "' OR '1'='1' --";
      const res = await request(app)
        .get(`/api/companies/${encodeURIComponent(sqlPayload)}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('HTTP Security Headers & Infrastructure Hardening', () => {
    it('sets critical security response headers on all requests', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['strict-transport-security']).toContain('max-age=');
    });
  });

  describe('Tally Desktop Sync Agent Authentication & Secret Key', () => {
    it('blocks anonymous push attempts to /api/sync/push with 401', async () => {
      const res = await request(app)
        .post('/api/sync/push')
        .send({ companyId: 'c1', parties: [] });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Valid agent key or authentication token required');
    });

    it('blocks anonymous pull attempts to /api/sync/pull with 401', async () => {
      const res = await request(app).get('/api/sync/pull');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Valid agent key or authentication token required');
    });

    it('allows sync requests passing valid x-agent-key header', async () => {
      const res = await request(app)
        .post('/api/sync/push')
        .set('x-agent-key', 'dev-agent-secret-key')
        .send({ companyId: 'c1', parties: [] });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('blocks sync requests passing invalid x-agent-key header with 401', async () => {
      const res = await request(app)
        .post('/api/sync/push')
        .set('x-agent-key', 'attacker-spoofed-key')
        .send({ companyId: 'c1', parties: [] });
      expect(res.status).toBe(401);
    });
  });
});
