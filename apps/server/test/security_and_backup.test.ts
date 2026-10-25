import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, getDB } from '../src/db/database.js';

describe('Security Hardening & Automated Backup API', () => {
  let app: any;
  let devToken: string;
  let ownerToken: string;
  let tenant2CompanyId: string;

  beforeAll(async () => {
    initDatabase(':memory:');
    app = createApp();

    // 1. Dev login
    const devLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+91 99999 00000', pin: '0000' });
    devToken = devLogin.body.token;

    // 2. Owner login
    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+91 98140 11223', pin: '1234' });
    ownerToken = ownerLogin.body.token;

    // 3. Onboard tenant-2
    const newClient = await request(app)
      .post('/api/dev/clients')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        name: 'Malhotra Textiles',
        ownerName: 'Vikas Malhotra',
        ownerPhone: '+91 98888 77777',
        ownerPin: '4321',
        tallyCompanyName: 'Malhotra Fabrics',
      });
    tenant2CompanyId = newClient.body.company.id;
  });

  describe('PIN Hashing & Migration', () => {
    it('migrates plaintext PIN to scrypt hash on successful login and still authenticates', async () => {
      const db = getDB();
      db.prepare(`
        INSERT INTO users (id, tenantId, name, phone, pin, role, companyIds, active)
        VALUES ('u-migratetest', 'tenant-1', 'Legacy Plaintext User', '+91 91111 22222', '1234', 'sales', 'all', 1)
      `).run();

      const user = db.prepare('SELECT pin FROM users WHERE id = ?').get('u-migratetest') as any;
      expect(user.pin).toBe('1234');

      // Login with correct PIN
      const res = await request(app)
        .post('/api/auth/login')
        .send({ phone: '+91 91111 22222', pin: '1234' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // After login, PIN should be migrated to scrypt hash
      const migratedUser = db.prepare('SELECT pin FROM users WHERE id = ?').get('u-migratetest') as any;
      expect(migratedUser.pin.startsWith('scrypt:')).toBe(true);

      // Verify that another login with the correct PIN still succeeds with hashed PIN
      const res2 = await request(app)
        .post('/api/auth/login')
        .send({ phone: '+91 91111 22222', pin: '1234' });
      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);

      // Verify that incorrect PIN fails against hashed PIN
      const resBad = await request(app)
        .post('/api/auth/login')
        .send({ phone: '+91 91111 22222', pin: '0000' });
      expect(resBad.status).toBe(401);
    });
  });

  describe('Brute-Force Rate Limiting', () => {
    it('blocks login after 5 consecutive failed attempts on the same phone', async () => {
      const testPhone = '9800012345';
      const db = getDB();
      db.prepare(`
        INSERT INTO users (id, tenantId, name, phone, pin, role, companyIds, active)
        VALUES ('u-ratetest', 'tenant-1', 'Rate Test User', ?, '5555', 'sales', 'all', 1)
      `).run(testPhone);

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ phone: testPhone, pin: '0000' });
        expect(res.status).toBe(401);
      }

      // 6th attempt should be rate limited (429)
      const blockedRes = await request(app)
        .post('/api/auth/login')
        .send({ phone: testPhone, pin: '5555' }); // even correct pin is blocked during lockout
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toMatch(/too many failed login attempts/i);
    });
  });

  describe('Strict Cross-Tenant Authorization Guard', () => {
    it('blocks tenant-1 owner from accessing tenant-2 company data', async () => {
      // Manohar Lal (tenant-1) attempts to query Malhotra Fabrics (tenant-2)
      const res = await request(app)
        .get(`/api/parties?companyId=${tenant2CompanyId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('allows dev role to access any company across tenants', async () => {
      const res = await request(app)
        .get(`/api/parties?companyId=${tenant2CompanyId}`)
        .set('Authorization', `Bearer ${devToken}`);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('allows tenant-1 owner to access their own company', async () => {
      const res = await request(app)
        .get(`/api/parties?companyId=c1`)
        .set('Authorization', `Bearer ${ownerToken}`);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Database Snapshot & Backup API', () => {
    it('creates and lists database backup snapshots', async () => {
      const snapRes = await request(app)
        .post('/api/backup/snapshot')
        .set('Authorization', `Bearer ${devToken}`);
      
      expect(snapRes.status).toBe(200);
      expect(snapRes.body.success).toBe(true);
      expect(snapRes.body.filename).toBeDefined();

      const listRes = await request(app)
        .get('/api/backup/snapshots')
        .set('Authorization', `Bearer ${devToken}`);
      
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);
      expect(listRes.body.length).toBeGreaterThan(0);
      expect(listRes.body[0].filename).toBeDefined();
      expect(listRes.body[0].sizeBytes).toBeGreaterThan(0);
    });
  });
});
