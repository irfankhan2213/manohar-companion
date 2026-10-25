import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/db/database.js';

describe('Authentication & Dev Client Onboarding API', () => {
  let app: any;

  beforeAll(() => {
    initDatabase(':memory:');
    app = createApp();
  });

  it('rejects login with invalid phone or pin', async () => {
    const res1 = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9999999999', pin: '1234' });
    expect(res1.status).toBe(401);
    expect(res1.body.success).toBe(false);

    const res2 = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '9999' });
    expect(res2.status).toBe(401);
    expect(res2.body.success).toBe(false);
  });

  it('logs in successfully as Client Owner and returns session token and tenant', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.name).toBe('Manohar Lal');
    expect(res.body.user.role).toBe('owner');
    expect(res.body.tenant.id).toBe('tenant-1');
    expect(Array.isArray(res.body.companies)).toBe(true);

    // Verify /api/auth/me with Bearer token
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.name).toBe('Manohar Lal');
    expect(meRes.body.tenant.id).toBe('tenant-1');
  });

  it('logs in successfully as Dev super admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9999900000', pin: '0000' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('dev');
    expect(res.body.token).toBeDefined();
  });

  it('allows Dev super admin to onboard a new client organization', async () => {
    // 1. Log in as Dev
    const devLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9999900000', pin: '0000' });
    const devToken = devLogin.body.token;

    // 2. Onboard new client
    const newClientPayload = {
      name: 'Ludhiana Woolens Group',
      ownerName: 'Harpreet Singh',
      ownerPhone: '+91 98141 88888',
      ownerPin: '4321',
      tallyCompanyName: 'Ludhiana Woolens Pvt Ltd',
      financialYear: '2026-27',
    };

    const onboardRes = await request(app)
      .post('/api/dev/clients')
      .set('Authorization', `Bearer ${devToken}`)
      .send(newClientPayload);

    expect(onboardRes.status).toBe(201);
    expect(onboardRes.body.success).toBe(true);
    expect(onboardRes.body.tenant.name).toBe(newClientPayload.name);
    expect(onboardRes.body.owner.name).toBe(newClientPayload.ownerName);
    expect(onboardRes.body.owner.role).toBe('owner');
    expect(onboardRes.body.company.name).toBe(newClientPayload.tallyCompanyName);

    // 3. Verify newly onboarded Client Owner can log in immediately
    const clientLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814188888', pin: '4321' });

    expect(clientLogin.status).toBe(200);
    expect(clientLogin.body.success).toBe(true);
    expect(clientLogin.body.user.name).toBe('Harpreet Singh');
    expect(clientLogin.body.user.role).toBe('owner');
    expect(clientLogin.body.tenant.id).toBe(onboardRes.body.tenant.id);
  });

  it('blocks non-dev roles from onboarding clients', async () => {
    // Log in as Manohar Lal (Owner)
    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    const ownerToken = ownerLogin.body.token;

    const res = await request(app)
      .post('/api/dev/clients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Unauthorized Attempt',
        ownerName: 'Test',
        ownerPhone: '1234567890',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Forbidden');
  });

  it('logs out and revokes the session token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9814011223', pin: '1234' });
    const token = loginRes.body.token;

    // Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // /api/auth/me should now fail
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
  });
});
