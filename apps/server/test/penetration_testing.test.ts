import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, getDB } from '../src/db/database.js';

describe('Penetration Testing & Security Vulnerability Audit Suite', () => {
  let app: any;
  let devToken: string;
  let ownerToken: string;
  let salesToken: string;
  let tenant2CompanyId: string;

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

    // 3. Client 1 Sales Staff login
    const salesLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+91 98222 44556', pin: '1234' });
    salesToken = salesLogin.body.token;

    // 4. Onboard Tenant 2
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
    tenant2CompanyId = newClient.body.company.id;
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

  describe('OWASP API5: Broken Function Level Authorization & Privilege Escalation', () => {
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

    it('ensures PIN hashes are stripped from /api/users listings', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      for (const u of res.body) {
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
