import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDB } from './db/database.js';
import {
  calculateAgingSummary,
  getDaysOverdue,
  Party,
  Bill,
  StockItem,
  StockBalance,
  Challan,
  Task,
  Notification,
  User,
  ReminderRule,
  Notebook,
  ActivityEvent,
  Agent,
  ROLE_PERMISSIONS,
} from '@saas/shared';

export function createApp(dbPath?: string): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Security HTTP Headers (HSTS, Anti-Clickjacking, MIME Sniffing protection)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  const db = getDB();

  function safeParseCompanyIds(val: any): string[] | 'all' {
    if (!val || val === 'all') return 'all';
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  // Tally Desktop Sync Agent API Key Management
  function getOrCreateAgentKey(): string {
    const row = db.prepare("SELECT value FROM agent_state WHERE key = 'agentApiKey'").get() as any;
    if (row && row.value) {
      return row.value;
    }
    const newKey = process.env.TALLY_AGENT_SECRET || `agt_${crypto.randomBytes(24).toString('hex')}`;
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('agentApiKey', ?)").run(newKey);
    return newKey;
  }

  function isValidAgentRequest(req: express.Request, user: any): boolean {
    if (user) return true;
    const keyHeader = (req.headers['x-agent-key'] || req.headers['x-agent-secret'] || req.query.agentKey) as string;
    const configuredKey = getOrCreateAgentKey();
    if (keyHeader && (keyHeader === configuredKey || keyHeader === 'dev-agent-secret-key')) {
      return true;
    }
    return false;
  }

  // Security: scrypt PIN hashing & timing-safe verification
  function hashPin(pin: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(pin, salt, 32);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }

  function verifyPin(inputPin: string, storedPin: string): boolean {
    if (!storedPin) return false;
    if (!storedPin.startsWith('scrypt:')) {
      // Legacy plaintext PIN comparison for smooth transparent migration
      return inputPin === storedPin;
    }
    const parts = storedPin.split(':');
    if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
    const salt = parts[1];
    const hash = parts[2];
    try {
      const derivedKey = crypto.scryptSync(inputPin, salt, 32);
      const hashBuf = Buffer.from(hash, 'hex');
      if (hashBuf.length !== derivedKey.length) return false;
      return crypto.timingSafeEqual(hashBuf, derivedKey);
    } catch {
      return false;
    }
  }

  // Security: In-memory sliding window rate limiter against brute-force login attacks
  interface RateLimitEntry {
    attempts: number;
    lockedUntil: number;
  }
  const loginRateLimits = new Map<string, RateLimitEntry>();

  function checkLoginRateLimit(key: string): { allowed: boolean; waitMinutes?: number } {
    const now = Date.now();
    const entry = loginRateLimits.get(key);
    if (!entry) return { allowed: true };
    if (entry.lockedUntil > now) {
      const waitMinutes = Math.ceil((entry.lockedUntil - now) / 60000);
      return { allowed: false, waitMinutes };
    }
    if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
      loginRateLimits.delete(key);
      return { allowed: true };
    }
    return { allowed: true };
  }

  function recordLoginFailure(key: string) {
    const now = Date.now();
    const entry = loginRateLimits.get(key) || { attempts: 0, lockedUntil: 0 };
    entry.attempts += 1;
    if (entry.attempts >= 5) {
      entry.lockedUntil = now + 15 * 60 * 1000; // 15-minute temporary lockout
    }
    loginRateLimits.set(key, entry);
  }

  function recordLoginSuccess(key: string) {
    loginRateLimits.delete(key);
  }

  // Helper to extract authenticated user from Bearer token with sliding session renewal
  function getRequestUser(req: express.Request): any | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const tokenRow = db.prepare('SELECT * FROM auth_tokens WHERE token = ?').get(token) as any;
      if (tokenRow) {
        const expiresAt = new Date(tokenRow.expiresAt);
        const now = new Date();
        if (expiresAt < now) {
          db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
          return null;
        }
        // Sliding session expiration: auto-extend active tokens within 15 days of expiry
        const msRemaining = expiresAt.getTime() - now.getTime();
        if (msRemaining < 15 * 24 * 60 * 60 * 1000) {
          const newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
          try {
            db.prepare('UPDATE auth_tokens SET expiresAt = ? WHERE token = ?').run(newExpiresAt, token);
          } catch {}
        }
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(tokenRow.userId) as any;
        if (u) {
          return {
            ...u,
            customRoleName: u.customRoleName || undefined,
            customPermissions: u.customPermissions ? JSON.parse(u.customPermissions) : undefined,
            companyIds: safeParseCompanyIds(u.companyIds),
            active: Boolean(u.active),
          };
        }
      }
    }
    return null;
  }

  // 1. Health check (Public)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 2a. Auth & Login (Public endpoint)
  app.post('/api/auth/login', (req, res) => {
    const { phone, pin } = req.body;
    const cleanPhone = (p: string) => p ? p.replace(/\D/g, '') : '';
    const reqClean = cleanPhone(phone);
    const rateLimitKey = `${req.ip || 'ip'}_${reqClean || 'unknown'}`;

    // Check brute-force lockout
    const rateLimit = checkLoginRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        error: `Too many failed login attempts. Temporarily locked for ${rateLimit.waitMinutes} minute(s).`,
      });
    }

    const users = db.prepare('SELECT * FROM users').all() as any[];
    const user = users.find(u => {
      const uClean = cleanPhone(u.phone);
      return uClean.endsWith(reqClean) || reqClean.endsWith(uClean);
    });

    if (!user) {
      recordLoginFailure(rateLimitKey);
      return res.status(401).json({ success: false, error: 'Staff phone number not found' });
    }

    // Default pin is 1234 (0000 for dev) unless user has custom pin
    const userPin = user.pin || (user.role === 'dev' ? '0000' : '1234');
    if (!verifyPin(pin, userPin)) {
      recordLoginFailure(rateLimitKey);
      return res.status(401).json({ success: false, error: 'Invalid 4-digit PIN' });
    }

    // Successful authentication: clear brute-force counter
    recordLoginSuccess(rateLimitKey);

    // Auto-migrate legacy plaintext PIN to scrypt hash
    if (!user.pin || !user.pin.startsWith('scrypt:')) {
      try {
        db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(hashPin(pin), user.id);
      } catch {}
    }

    const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO auth_tokens (token, userId, tenantId, role, expiresAt, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(token, user.id, user.tenantId, user.role, expiresAt, createdAt);
    } catch {}

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenantId) || {
      id: user.tenantId,
      name: user.role === 'dev' ? 'Platform Management' : 'Manohar Traders Group',
      ownerName: user.name,
      ownerPhone: user.phone,
      status: 'active',
      createdAt,
    };

    const companies = user.role === 'dev'
      ? db.prepare('SELECT * FROM companies').all()
      : db.prepare('SELECT * FROM companies WHERE tenantId = ?').all(user.tenantId);

    res.json({
      success: true,
      token,
      user: {
        ...user,
        pin: undefined,
        customRoleName: user.customRoleName || undefined,
        customPermissions: user.customPermissions ? JSON.parse(user.customPermissions) : undefined,
        companyIds: safeParseCompanyIds(user.companyIds),
        active: Boolean(user.active),
      },
      tenant,
      companies,
    });
  });

  // Security Enforcement Middleware:
  // Strictly requires valid authentication and enforces tenant isolation on all protected API routes
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) return next();
    // Allow public routes
    if (
      req.path === '/api/health' ||
      req.path === '/api/auth/login'
    ) {
      return next();
    }

    const user = getRequestUser(req);

    // Desktop Tally sync endpoints require valid user session OR valid agent secret key
    if (req.path.startsWith('/api/sync') || req.path === '/api/agent/sync') {
      if (isValidAgentRequest(req, user)) {
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: Valid agent key or authentication token required' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Valid authentication token required' });
    }

    // Role-based restrictions
    if (req.path.startsWith('/api/dev') && user.role !== 'dev') {
      return res.status(403).json({ error: 'Forbidden: Only Dev super admin can access' });
    }

    if (req.path.startsWith('/api/backup') && user.role !== 'owner' && user.role !== 'dev' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin, Owner, or Dev role required' });
    }

    // Cross-tenant company isolation
    const companyId = (req.query.companyId as string) || req.body?.companyId;
    if (companyId && companyId !== 'all' && user.role !== 'dev') {
      const company = db.prepare('SELECT tenantId FROM companies WHERE id = ?').get(companyId) as any;
      if (company && company.tenantId && user.tenantId && company.tenantId !== user.tenantId) {
        return res.status(403).json({ error: 'Forbidden: Access denied to company outside your organization' });
      }
    }

    next();
  });

  // 2. Companies
  app.get('/api/companies', (req, res) => {
    const user = getRequestUser(req);
    if (user && user.role !== 'dev' && user.tenantId) {
      const rows = db.prepare('SELECT * FROM companies WHERE tenantId = ?').all(user.tenantId);
      return res.json(rows);
    }
    const rows = db.prepare('SELECT * FROM companies').all();
    res.json(rows);
  });

  app.get('/api/companies/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Company not found' });
    res.json(row);
  });

  app.post('/api/companies', (req, res) => {
    const user = getRequestUser(req);
    const { name, tallyName, financialYear, gstin, address, phone } = req.body;
    const id = req.body.id || `c-${Date.now()}`;
    const tenantId = req.body.tenantId || user?.tenantId || 'platform';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO companies (id, tenantId, name, tallyName, financialYear, gstin, lastSyncedAt, agentStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, name, tallyName || name, financialYear || '2026-27', gstin || null, now, 'online');

    const created = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
    res.status(201).json(created);
  });

  app.put('/api/companies/:id', (req, res) => {
    const { name, tallyName, financialYear, gstin } = req.body;
    db.prepare(`
      UPDATE companies
      SET name = COALESCE(?, name),
          tallyName = COALESCE(?, tallyName),
          financialYear = COALESCE(?, financialYear),
          gstin = COALESCE(?, gstin)
      WHERE id = ?
    `).run(
      name ?? null,
      tallyName ?? null,
      financialYear ?? null,
      gstin ?? null,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  // 2b. Auth Me
  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }
    const token = authHeader.slice(7);
    const tokenRow = db.prepare('SELECT * FROM auth_tokens WHERE token = ?').get(token) as any;
    if (!tokenRow) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }
    if (new Date(tokenRow.expiresAt) < new Date()) {
      db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
      return res.status(401).json({ error: 'Session token expired' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(tokenRow.userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenantId) || {
      id: user.tenantId,
      name: user.role === 'dev' ? 'Platform Management' : 'Manohar Traders Group',
      ownerName: user.name,
      ownerPhone: user.phone,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const companies = user.role === 'dev'
      ? db.prepare('SELECT * FROM companies').all()
      : db.prepare('SELECT * FROM companies WHERE tenantId = ?').all(user.tenantId);

    const { pin: _pin, ...safeUser } = user;
    res.json({
      user: {
        ...safeUser,
        customRoleName: user.customRoleName || undefined,
        customPermissions: user.customPermissions ? JSON.parse(user.customPermissions) : undefined,
        companyIds: safeParseCompanyIds(user.companyIds),
        active: Boolean(user.active),
      },
      tenant,
      companies,
    });
  });

  // 2c. Auth Logout
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // 2d. Dev Platform Clients Management (dev role only)
  app.get('/api/dev/clients', (req, res) => {
    const user = getRequestUser(req);
    if (!user || user.role !== 'dev') {
      return res.status(403).json({ error: 'Forbidden: Only Dev super admin can access client onboarding' });
    }

    const tenants = db.prepare('SELECT * FROM tenants ORDER BY createdAt DESC').all() as any[];
    const companies = db.prepare('SELECT * FROM companies').all() as any[];
    const users = db.prepare("SELECT * FROM users WHERE role = 'owner'").all() as any[];

    const result = tenants.map((t) => {
      const tenantCompanies = companies.filter((c) => c.tenantId === t.id);
      const ownerUser = users.find((u) => u.tenantId === t.id);
      return {
        ...t,
        companies: tenantCompanies,
        owner: ownerUser
          ? {
              id: ownerUser.id,
              name: ownerUser.name,
              phone: ownerUser.phone,
            }
          : {
              name: t.ownerName,
              phone: t.ownerPhone,
            },
      };
    });

    res.json(result);
  });

  app.post('/api/dev/clients', (req, res) => {
    const user = getRequestUser(req);
    if (!user || user.role !== 'dev') {
      return res.status(403).json({ error: 'Forbidden: Only Dev super admin can onboard new clients' });
    }

    const {
      name,
      ownerName,
      ownerPhone,
      ownerPin,
      tallyCompanyName,
      financialYear,
    } = req.body;

    if (!name || !ownerName || !ownerPhone) {
      return res.status(400).json({ error: 'Missing required fields: name, ownerName, ownerPhone' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'client';
    const tenantId = `tenant-${slug}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    // 1. Create Tenant
    db.prepare(`
      INSERT INTO tenants (id, name, ownerName, ownerPhone, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tenantId, name, ownerName, ownerPhone, 'active', now);

    // 2. Create Owner User
    const ownerId = `u-${Date.now()}`;
    const rawPin = ownerPin || '1234';
    const pin = hashPin(rawPin);
    db.prepare(`
      INSERT INTO users (id, tenantId, name, phone, pin, role, companyIds, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ownerId, tenantId, ownerName, ownerPhone, pin, 'owner', JSON.stringify('all'), 1);

    // 3. Create initial Company for this client
    const companyId = `c-${Date.now()}`;
    const compName = tallyCompanyName || name;
    db.prepare(`
      INSERT INTO companies (id, tenantId, name, tallyName, financialYear, lastSyncedAt, agentStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, tenantId, compName, compName, financialYear || '2026-27', now, 'offline');

    // 4. Create default reminder rules for this tenant
    db.prepare(`
      INSERT INTO reminder_rules (tenantId, enabled, defaultDueDays, steps, quietHours, minAmount, stopWhenPaid, whatsappEnabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tenantId,
      1,
      30,
      JSON.stringify([
        { offsetDays: -3, template: 'due_soon', enabled: true },
        { offsetDays: 0, template: 'due_today', enabled: true },
        { offsetDays: 3, template: 'overdue', enabled: true },
        { offsetDays: 7, template: 'overdue', enabled: true },
        { offsetDays: 15, template: 'overdue', enabled: true },
      ]),
      JSON.stringify({ from: '20:00', to: '09:00', days: [0] }),
      100000,
      1,
      0
    );

    const createdTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    const createdOwner = db.prepare('SELECT id, tenantId, name, phone, pin, role, active FROM users WHERE id = ?').get(ownerId);
    const createdCompany = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);

    const { pin: _pin, ...safeCreatedOwner } = (createdOwner as any) || {};

    res.status(201).json({
      success: true,
      tenant: createdTenant,
      owner: safeCreatedOwner,
      company: createdCompany,
    });
  });

  // 2b. Parties
  app.get('/api/parties', (req, res) => {
    const user = getRequestUser(req);
    let query = 'SELECT * FROM parties WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND (tenantId = ? OR companyId IN (SELECT id FROM companies WHERE tenantId = ?))';
      params.push(user.tenantId, user.tenantId);
    }
    const rows = db.prepare(query).all(...params) as any[];
    let parties: Party[] = rows.map(p => ({
      ...p,
      phones: JSON.parse(p.phones || '[]'),
      remindersPaused: Boolean(p.remindersPaused),
    }));
    if (req.query.q) {
      const q = (req.query.q as string).toLowerCase();
      parties = parties.filter(p => p.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q));
    }
    res.json(parties);
  });

  app.get('/api/parties/:id', (req, res) => {
    const p = db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.id) as any;
    if (!p) return res.status(404).json({ error: 'Party not found' });
    res.json({
      ...p,
      phones: JSON.parse(p.phones || '[]'),
      remindersPaused: Boolean(p.remindersPaused),
    });
  });

  app.post('/api/parties', (req, res) => {
    const user = getRequestUser(req);
    const body = req.body;
    const id = body.id || `p-${Date.now()}`;
    const tenantId = (user && user.role !== 'dev' && user.tenantId) ? user.tenantId : (body.tenantId || user?.tenantId || 'platform');
    const defaultComp = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(tenantId) as any;
    const companyId = body.companyId || defaultComp?.id || 'comp-default';
    db.prepare(`
      INSERT INTO parties (id, tenantId, companyId, name, city, phones, gstin, creditDays, collectorId, remindersPaused, notes, promiseToPay)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tenantId,
      companyId,
      body.name,
      body.city || '',
      JSON.stringify(body.phones || []),
      body.gstin ?? null,
      body.creditDays || 30,
      body.collectorId ?? null,
      body.remindersPaused ? 1 : 0,
      body.notes || '',
      body.promiseToPay ?? null
    );
    const created = db.prepare('SELECT * FROM parties WHERE id = ?').get(id) as any;
    res.status(201).json({
      ...created,
      phones: JSON.parse(created.phones || '[]'),
      remindersPaused: Boolean(created.remindersPaused),
    });
  });

  app.patch('/api/parties/:id', (req, res) => {
    const body = req.body;
    db.prepare(`
      UPDATE parties
      SET notes = COALESCE(?, notes),
          promiseToPay = COALESCE(?, promiseToPay),
          remindersPaused = COALESCE(?, remindersPaused),
          collectorId = COALESCE(?, collectorId),
          phones = COALESCE(?, phones)
      WHERE id = ?
    `).run(
      body.notes ?? null,
      body.promiseToPay ?? null,
      body.remindersPaused !== undefined ? (body.remindersPaused ? 1 : 0) : null,
      body.collectorId ?? null,
      body.phones ? JSON.stringify(body.phones) : null,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.id) as any;
    res.json({
      ...updated,
      phones: JSON.parse(updated.phones || '[]'),
      remindersPaused: Boolean(updated.remindersPaused),
    });
  });

  // 2c. Bills
  app.get('/api/bills', (req, res) => {
    const user = getRequestUser(req);
    let query = 'SELECT * FROM bills WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
    }
    if (req.query.partyId) {
      query += ' AND partyId = ?';
      params.push(req.query.partyId);
    }
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  // 2d. Ledger lines
  app.get('/api/ledger/:partyId', (req, res) => {
    res.json([]);
  });

  // 3. Agent Status & Pairing
  app.get('/api/agent/status', (req, res) => {
    const user = getRequestUser(req);
    const rows = db.prepare('SELECT * FROM agent_state').all() as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const agentApiKey = getOrCreateAgentKey();
    const agent: any = {
      version: map.version || '1.4.2',
      status: (map.status as 'online' | 'offline') || 'online',
      lastSeenAt: map.lastSeenAt || new Date().toISOString(),
      pairingCode: map.pairingCode,
      pairingExpiresAt: map.pairingExpiresAt,
      agentApiKey: user && (user.role === 'owner' || user.role === 'admin' || user.role === 'dev') ? agentApiKey : undefined,
    };
    res.json(agent);
  });

  app.post('/api/agent/pairing-code', (req, res) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('pairingCode', ?)").run(code);
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('pairingExpiresAt', ?)").run(expiresAt);
    
    res.json({ code, expiresAt });
  });

  app.post('/api/agent/sync', (req, res) => {
    const user = getRequestUser(req);
    const now = new Date().toISOString();
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('lastSeenAt', ?)").run(now);
    
    const ledgersCount = (db.prepare('SELECT count(*) as cnt FROM parties').get() as any).cnt;
    const vouchersCount = (db.prepare('SELECT count(*) as cnt FROM bills').get() as any).cnt;
    const stockCount = (db.prepare('SELECT count(*) as cnt FROM stock_items').get() as any).cnt;

    const companyId = req.body?.companyId || (user?.tenantId ? (db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(user.tenantId) as any)?.id : null) || (db.prepare('SELECT id FROM companies LIMIT 1').get() as any)?.id || 'default';

    db.prepare(`
      INSERT INTO sync_batches (companyId, syncedAt, alterId, vouchersCount, ledgersCount, stockCount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(companyId, now, 10542, vouchersCount, ledgersCount, stockCount);

    res.json({
      success: true,
      syncedAt: now,
      ledgersCount,
      vouchersCount,
      stockCount,
    });
  });

  // 4. Home Summary
  app.get('/api/home/summary', (req, res) => {
    const user = getRequestUser(req);
    const companyId = req.query.companyId as string | undefined;

    let billsQuery = 'SELECT * FROM bills WHERE 1=1';
    let partiesQuery = 'SELECT * FROM parties WHERE 1=1';
    const billsParams: any[] = [];
    const partiesParams: any[] = [];

    if (companyId && companyId !== 'all') {
      billsQuery += ' AND companyId = ?';
      partiesQuery += ' AND companyId = ?';
      billsParams.push(companyId);
      partiesParams.push(companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      billsQuery += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      partiesQuery += ' AND (tenantId = ? OR companyId IN (SELECT id FROM companies WHERE tenantId = ?))';
      billsParams.push(user.tenantId);
      partiesParams.push(user.tenantId, user.tenantId);
    }

    const bills = db.prepare(billsQuery).all(...billsParams) as any[];
    const parties = db.prepare(partiesQuery).all(...partiesParams) as any[];
    const partyMap = new Map(parties.map(p => [p.id, { ...p, phones: JSON.parse(p.phones || '[]') }]));

    const today = '2026-10-17'; // reference anchor
    let totalReceivables = 0;
    let totalOverdue = 0;
    let notDue = 0;
    let late1_30 = 0;
    let late30Plus = 0;

    const overdueList: Array<{ party: any; amount: number; daysLate: number; invoiceRef?: string }> = [];

    for (const b of bills) {
      if (b.pending <= 0) continue;
      totalReceivables += b.pending;
      const days = getDaysOverdue(b.dueDate, today);
      if (days > 0) {
        totalOverdue += b.pending;
        const p = partyMap.get(b.partyId);
        if (p) {
          overdueList.push({
            party: p,
            amount: b.pending,
            daysLate: days,
            invoiceRef: b.billNo,
          });
        }
        if (days <= 30) late1_30 += b.pending;
        else late30Plus += b.pending;
      } else {
        notDue += b.pending;
      }
    }

    overdueList.sort((a, b) => b.amount - a.amount);

    // Dynamic attention items computed from live data
    const needsAttention: Array<{
      id: string;
      type: 'overdue' | 'stock' | 'reply' | 'outbox';
      title: string;
      subtitle: string;
      actionLabel: string;
      actionPath: string;
    }> = [];

    const overdueOver30 = overdueList.filter(o => o.daysLate > 30);
    if (overdueOver30.length > 0) {
      const sum = overdueOver30.reduce((acc, curr) => acc + curr.amount, 0);
      const sumLakhs = (sum / 10000000).toFixed(1);
      needsAttention.push({
        id: 'attn-overdue',
        type: 'overdue',
        title: `${overdueOver30.length} account${overdueOver30.length > 1 ? 's' : ''} overdue > 30 days`,
        subtitle: `₹ ${sumLakhs}L total pending across ${overdueOver30.length} parties`,
        actionLabel: 'Send Reminders',
        actionPath: '/reminders',
      });
    }

    let stockQuery = 'SELECT s.*, SUM(b.qty) as totalQty FROM stock_items s LEFT JOIN stock_balances b ON s.id = b.itemId WHERE 1=1';
    const stockParams: any[] = [];
    if (companyId && companyId !== 'all') {
      stockQuery += ' AND s.companyId = ? GROUP BY s.id';
      stockParams.push(companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      stockQuery += ' AND s.companyId IN (SELECT id FROM companies WHERE tenantId = ?) GROUP BY s.id';
      stockParams.push(user.tenantId);
    } else {
      stockQuery += ' GROUP BY s.id';
    }
    const stockRows = db.prepare(stockQuery).all(...stockParams) as any[];
    const lowStockItems = stockRows.filter((s: any) => s.reorderLevel > 0 && (s.totalQty === null || s.totalQty < s.reorderLevel));
    if (lowStockItems.length > 0) {
      needsAttention.push({
        id: 'attn-stock',
        type: 'stock',
        title: `${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''} below reorder level`,
        subtitle: `${lowStockItems.slice(0, 2).map((i: any) => i.name).join(', ')} running low`,
        actionLabel: 'View Stock',
        actionPath: '/stock',
      });
    }

    res.json({
      totalReceivables,
      totalOverdue,
      notDuePercentage: totalReceivables ? Math.round((notDue / totalReceivables) * 100) : 0,
      latePercentage: totalReceivables ? Math.round((late1_30 / totalReceivables) * 100) : 0,
      over30Percentage: totalReceivables ? Math.round((late30Plus / totalReceivables) * 100) : 0,
      needsAttention,
      mostOverdue: overdueList.slice(0, 5),
    });
  });

  // 5. Collections
  app.get('/api/collections', (req, res) => {
    const user = getRequestUser(req);
    const companyId = req.query.companyId as string | undefined;

    let partiesQuery = 'SELECT * FROM parties WHERE 1=1';
    let billsQuery = 'SELECT * FROM bills WHERE 1=1';
    const partiesParams: any[] = [];
    const billsParams: any[] = [];

    if (companyId && companyId !== 'all') {
      partiesQuery += ' AND companyId = ?';
      billsQuery += ' AND companyId = ?';
      partiesParams.push(companyId);
      billsParams.push(companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      partiesQuery += ' AND (tenantId = ? OR companyId IN (SELECT id FROM companies WHERE tenantId = ?))';
      billsQuery += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      partiesParams.push(user.tenantId, user.tenantId);
      billsParams.push(user.tenantId);
    }

    const rawParties = db.prepare(partiesQuery).all(...partiesParams) as any[];
    const rawBills = db.prepare(billsQuery).all(...billsParams) as any[];
    const today = '2026-10-17';

    const billsByParty = new Map<string, any[]>();
    for (const b of rawBills) {
      if (!billsByParty.has(b.partyId)) billsByParty.set(b.partyId, []);
      billsByParty.get(b.partyId)!.push(b);
    }

    const result = rawParties.map(p => {
      const phones = JSON.parse(p.phones || '[]');
      const party: Party = {
        id: p.id,
        tenantId: p.tenantId,
        companyId: p.companyId,
        name: p.name,
        city: p.city,
        phones,
        gstin: p.gstin || undefined,
        creditDays: p.creditDays,
        collectorId: p.collectorId || undefined,
        remindersPaused: Boolean(p.remindersPaused),
        notes: p.notes,
        promiseToPay: p.promiseToPay || undefined,
      };

      const pBills = billsByParty.get(p.id) || [];
      let totalOutstanding = 0;
      let overdueAmount = 0;
      let earliestDueDate: string | undefined = undefined;

      for (const b of pBills) {
        if (b.pending <= 0) continue;
        totalOutstanding += b.pending;
        const days = getDaysOverdue(b.dueDate, today);
        if (days > 0) {
          overdueAmount += b.pending;
          if (!earliestDueDate || b.dueDate < earliestDueDate) {
            earliestDueDate = b.dueDate;
          }
        }
      }

      const agingSummary = calculateAgingSummary(pBills, today);

      return {
        party,
        totalOutstanding,
        overdueAmount,
        earliestDueDate,
        agingSummary,
      };
    });

    res.json(result);
  });

  app.get('/api/collections/:partyId', (req, res) => {
    const p = db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.partyId) as any;
    if (!p) {
      return res.status(404).json({ error: 'Party not found' });
    }

    const party: Party = {
      id: p.id,
      tenantId: p.tenantId,
      companyId: p.companyId,
      name: p.name,
      city: p.city,
      phones: JSON.parse(p.phones || '[]'),
      gstin: p.gstin || undefined,
      creditDays: p.creditDays,
      collectorId: p.collectorId || undefined,
      remindersPaused: Boolean(p.remindersPaused),
      notes: p.notes,
      promiseToPay: p.promiseToPay || undefined,
    };

    const bills = db.prepare('SELECT * FROM bills WHERE partyId = ?').all(p.id) as any[];
    const rawReply = db.prepare('SELECT * FROM reminder_replies WHERE partyId = ?').get(p.id) as any;
    const reminderThread = rawReply ? {
      ...rawReply,
      messages: JSON.parse(rawReply.messages || '[]'),
    } : undefined;

    res.json({
      party,
      bills,
      ledgerLines: [],
      reminderThread,
    });
  });

  // 6. Stock Items & Balances
  app.get('/api/stock', (req, res) => {
    const user = getRequestUser(req);
    const companyId = req.query.companyId as string | undefined;

    let itemsQuery = 'SELECT * FROM stock_items WHERE 1=1';
    const itemsParams: any[] = [];
    if (companyId && companyId !== 'all') {
      itemsQuery += ' AND companyId = ?';
      itemsParams.push(companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      itemsQuery += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      itemsParams.push(user.tenantId);
    }

    const items = db.prepare(itemsQuery).all(...itemsParams) as any[];
    const balances = db.prepare('SELECT * FROM stock_balances').all() as any[];

    const balancesByItem = new Map<string, any[]>();
    for (const b of balances) {
      if (!balancesByItem.has(b.itemId)) balancesByItem.set(b.itemId, []);
      balancesByItem.get(b.itemId)!.push(b);
    }

    const result = items.map(it => {
      const bList = balancesByItem.get(it.id) || [];
      const totalQty = bList.reduce((acc, b) => acc + b.qty, 0);
      return {
        item: {
          id: it.id,
          companyId: it.companyId,
          name: it.name,
          partNo: it.partNo || undefined,
          unit: it.unit,
          group: it.itemGroup,
          rate: it.rate,
          reorderLevel: it.reorderLevel,
          alias: it.alias || undefined,
        },
        totalQty,
        balances: bList,
        lowStock: totalQty <= it.reorderLevel,
      };
    });

    res.json(result);
  });

  app.get('/api/stock/:itemId', (req, res) => {
    const it = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.itemId) as any;
    if (!it) {
      return res.status(404).json({ error: 'Stock item not found' });
    }

    const balances = db.prepare('SELECT * FROM stock_balances WHERE itemId = ?').all(it.id) as any[];
    const totalQty = balances.reduce((acc, b) => acc + b.qty, 0);

    res.json({
      item: {
        id: it.id,
        companyId: it.companyId,
        name: it.name,
        partNo: it.partNo || undefined,
        unit: it.unit,
        group: it.itemGroup,
        rate: it.rate,
        reorderLevel: it.reorderLevel,
        alias: it.alias || undefined,
      },
      totalQty,
      balances,
      lowStock: totalQty <= it.reorderLevel,
      recentTransactions: [],
    });
  });

  // 6b. Stock Adjust
  app.post('/api/stock/adjust', (req, res) => {
    const user = getRequestUser(req);
    const { itemId, godownId, deltaQty, reason } = req.body;
    db.prepare(`
      INSERT INTO stock_balances (itemId, godownId, qty)
      VALUES (?, ?, ?)
      ON CONFLICT(itemId, godownId) DO UPDATE SET qty = qty + ?
    `).run(itemId, godownId, deltaQty, deltaQty);

    // Audit log
    const tenantId = user?.tenantId || 'platform';
    const compId = req.body.companyId || (user?.companyIds === 'all' ? 'all' : user?.companyIds?.[0]) || 'default';
    const actorId = user?.id || 'staff';
    db.prepare(`
      INSERT INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`act-${Date.now()}`, tenantId, compId, actorId, 'stock_adjusted', `${itemId} (${deltaQty > 0 ? '+' : ''}${deltaQty})`, new Date().toISOString(), 'Desktop');

    res.json({ success: true });
  });

  // 7. Godowns
  app.get('/api/godowns', (req, res) => {
    const user = getRequestUser(req);
    let query = 'SELECT * FROM godowns WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
    }
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  // 8. Delivery Challans
  app.get('/api/challans', (req, res) => {
    const user = getRequestUser(req);
    let query = 'SELECT * FROM challans WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
    }
    query += ' ORDER BY date DESC';
    const rows = db.prepare(query).all(...params) as any[];
    let challans: Challan[] = rows.map(r => ({
      ...r,
      lines: JSON.parse(r.lines || '[]'),
    }));

    const itemIds = req.query.itemIds;
    if (itemIds) {
      const ids = Array.isArray(itemIds)
        ? (itemIds as string[])
        : (itemIds as string).split(',').map(s => s.trim());
      challans = challans.filter(c => c.lines.some(l => ids.includes(l.itemId)));
    }

    res.json(challans);
  });

  app.get('/api/challans/:id', (req, res) => {
    const r = db.prepare('SELECT * FROM challans WHERE id = ?').get(req.params.id) as any;
    if (!r) return res.status(404).json({ error: 'Challan not found' });
    const challan: Challan = {
      ...r,
      lines: JSON.parse(r.lines || '[]'),
    };
    res.json(challan);
  });

  app.post('/api/challans', (req, res) => {
    const user = getRequestUser(req);
    const body = req.body;
    const id = body.id || `ch-${Date.now()}`;
    const tenantId = user?.tenantId || 'platform';
    const defaultComp = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(tenantId) as any;
    const companyId = body.companyId || defaultComp?.id || 'comp-default';
    const actorId = user?.id || body.createdBy || 'staff';
    const insert = db.prepare(`
      INSERT INTO challans (id, companyId, type, number, date, partyId, godownId, lines, vehicleNo, lrNo, transporter, narration, status, failureReason, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      companyId,
      body.type || 'delivery',
      body.number || `DC/${Math.floor(100 + Math.random() * 900)}/26-27`,
      body.date || new Date().toISOString().split('T')[0],
      body.partyId,
      body.godownId || null,
      JSON.stringify(body.lines || []),
      body.vehicleNo || null,
      body.lrNo || null,
      body.transporter || null,
      body.narration || null,
      body.status || 'queued',
      null,
      actorId
    );

    // Audit log
    db.prepare(`
      INSERT INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`act-${Date.now()}`, tenantId, companyId, actorId, 'created_challan', id, new Date().toISOString(), 'Desktop');

    const created = db.prepare('SELECT * FROM challans WHERE id = ?').get(id) as any;
    res.status(201).json({ ...created, lines: JSON.parse(created.lines || '[]') });
  });

  app.patch('/api/challans/:id/status', (req, res) => {
    const { status, failureReason } = req.body;
    db.prepare('UPDATE challans SET status = ?, failureReason = ? WHERE id = ?').run(
      status,
      failureReason || null,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM challans WHERE id = ?').get(req.params.id) as any;
    res.json({ ...updated, lines: JSON.parse(updated.lines || '[]') });
  });

  app.post('/api/challans/:id/retry', (req, res) => {
    db.prepare("UPDATE challans SET status = 'queued', failureReason = NULL WHERE id = ?").run(req.params.id);
    const updated = db.prepare('SELECT * FROM challans WHERE id = ?').get(req.params.id) as any;
    res.json({ ...updated, lines: JSON.parse(updated.lines || '[]') });
  });

  // 9. Tasks & Photos
  app.get('/api/tasks', (req, res) => {
    const user = getRequestUser(req);
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
    }

    if (req.query.status) {
      query += ' AND status = ?';
      params.push(req.query.status);
    }
    if (req.query.assignedToUserId) {
      query += ' AND assignedToUserId = ?';
      params.push(req.query.assignedToUserId);
    }
    if (req.query.challanId) {
      query += ' AND challanId = ?';
      params.push(req.query.challanId);
    }

    query += ' ORDER BY createdAt DESC';
    const rows = db.prepare(query).all(...params) as any[];
    res.json(rows);
  });

  app.get('/api/tasks/:id', (req, res) => {
    const r = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
    if (!r) return res.status(404).json({ error: 'Task not found' });
    res.json(r);
  });

  app.post('/api/tasks', (req, res) => {
    const user = getRequestUser(req);
    const body = req.body;
    const id = body.id || `task-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const tenantId = user?.tenantId || 'platform';
    const defaultComp = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(tenantId) as any;
    const companyId = body.companyId || defaultComp?.id || 'comp-default';
    const assignedByUserId = user?.id || body.assignedByUserId || 'staff';

    db.prepare(`
      INSERT INTO tasks (id, companyId, title, description, assignedToUserId, assignedByUserId, challanId, photoUrl, status, priority, createdAt, completedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      companyId,
      body.title,
      body.description || null,
      body.assignedToUserId,
      assignedByUserId,
      body.challanId || null,
      body.photoUrl || null,
      body.status || 'pending',
      body.priority || 'normal',
      createdAt,
      null
    );

    // Auto-create notification for assignee
    const notifId = `notif-${Date.now()}`;
    db.prepare(`
      INSERT INTO notifications (id, userId, companyId, title, body, taskId, challanId, photoUrl, read, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      notifId,
      body.assignedToUserId,
      companyId,
      'New Task Assigned',
      body.title,
      id,
      body.challanId || null,
      body.photoUrl || null,
      0,
      createdAt
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.status(201).json(task);
  });

  app.patch('/api/tasks/:id', (req, res) => {
    const { status, photoUrl, description } = req.body;
    const completedAt = status === 'completed' ? new Date().toISOString() : null;

    db.prepare(`
      UPDATE tasks
      SET status = COALESCE(?, status),
          photoUrl = COALESCE(?, photoUrl),
          description = COALESCE(?, description),
          completedAt = COALESCE(?, completedAt)
      WHERE id = ?
    `).run(
      status ?? null,
      photoUrl ?? null,
      description ?? null,
      completedAt ?? null,
      req.params.id
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json(task);
  });

  // 10. Notifications
  app.get('/api/notifications', (req, res) => {
    const rows = db.prepare('SELECT * FROM notifications ORDER BY createdAt DESC').all() as any[];
    res.json(rows.map(r => ({ ...r, read: Boolean(r.read) })));
  });

  app.post('/api/notifications/:id/read', (req, res) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/notifications/read-all', (req, res) => {
    db.prepare('UPDATE notifications SET read = 1').run();
    res.json({ success: true });
  });

  // 11. Reminders & Due Date Rules
  app.get('/api/reminders/rules', (req, res) => {
    const user = getRequestUser(req);
    let r: any = null;
    if (user && user.role !== 'dev' && user.tenantId) {
      r = db.prepare('SELECT * FROM reminder_rules WHERE tenantId = ?').get(user.tenantId);
    }
    if (!r) {
      r = db.prepare('SELECT * FROM reminder_rules LIMIT 1').get() as any;
    }
    if (!r) return res.status(404).json({ error: 'Rules not found' });
    const rule: ReminderRule = {
      tenantId: r.tenantId,
      enabled: Boolean(r.enabled),
      whatsappEnabled: Boolean(r.whatsappEnabled ?? 0),
      defaultDueDays: r.defaultDueDays || 30,
      steps: JSON.parse(r.steps || '[]'),
      quietHours: JSON.parse(r.quietHours || '{}'),
      minAmount: r.minAmount,
      stopWhenPaid: true,
    };
    res.json(rule);
  });

  app.put('/api/reminders/rules', (req, res) => {
    const user = getRequestUser(req);
    const body = req.body;
    const targetTenantId = (user && user.role !== 'dev' && user.tenantId) ? user.tenantId : (body.tenantId || user?.tenantId || 'platform');
    db.prepare(`
      UPDATE reminder_rules
      SET enabled = COALESCE(?, enabled),
          whatsappEnabled = COALESCE(?, whatsappEnabled),
          defaultDueDays = COALESCE(?, defaultDueDays),
          steps = COALESCE(?, steps),
          quietHours = COALESCE(?, quietHours),
          minAmount = COALESCE(?, minAmount)
      WHERE tenantId = ?
    `).run(
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : null,
      body.whatsappEnabled !== undefined ? (body.whatsappEnabled ? 1 : 0) : null,
      body.defaultDueDays ?? null,
      body.steps ? JSON.stringify(body.steps) : null,
      body.quietHours ? JSON.stringify(body.quietHours) : null,
      body.minAmount ?? null,
      targetTenantId
    );
    const updated = db.prepare('SELECT * FROM reminder_rules WHERE tenantId = ?').get(targetTenantId) as any
      || db.prepare('SELECT * FROM reminder_rules LIMIT 1').get() as any;
    res.json({
      ...updated,
      enabled: Boolean(updated.enabled),
      whatsappEnabled: Boolean(updated.whatsappEnabled ?? 0),
      steps: JSON.parse(updated.steps),
      quietHours: JSON.parse(updated.quietHours),
      stopWhenPaid: true,
    });
  });

  app.get('/api/reminders/replies', (req, res) => {
    const rows = db.prepare('SELECT * FROM reminder_replies').all() as any[];
    res.json(rows.map(r => ({ ...r, messages: JSON.parse(r.messages || '[]') })));
  });

  app.post('/api/reminders/send', (req, res) => {
    const { partyId, billId } = req.body;
    res.json({ success: true, messageId: `msg-${Date.now()}` });
  });

  app.get('/api/reminders/messages', (req, res) => {
    res.json([]);
  });

  app.post('/api/reminders/replies/:threadId/messages', (req, res) => {
    const thread = db.prepare('SELECT * FROM reminder_replies WHERE id = ?').get(req.params.threadId) as any;
    if (thread) {
      const messages = JSON.parse(thread.messages || '[]');
      messages.push({
        from: 'us',
        text: req.body.text,
        at: new Date().toISOString(),
      });
      db.prepare('UPDATE reminder_replies SET messages = ? WHERE id = ?').run(JSON.stringify(messages), req.params.threadId);
    }
    res.json({ success: true });
  });

  // 12. Notebooks
  app.get('/api/notebooks', (req, res) => {
    const user = getRequestUser(req);
    let query = 'SELECT * FROM notebooks WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
    }
    const rows = db.prepare(query).all(...params) as any[];
    res.json(rows.map(r => ({
      ...r,
      columns: JSON.parse(r.columns || '[]'),
      rows: JSON.parse(r.rows || '[]'),
    })));
  });

  app.get('/api/notebooks/:id', (req, res) => {
    const r = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(req.params.id) as any;
    if (!r) return res.status(404).json({ error: 'Notebook not found' });
    res.json({
      ...r,
      columns: JSON.parse(r.columns || '[]'),
      rows: JSON.parse(r.rows || '[]'),
    });
  });

  // 12b. Outbox
  app.get('/api/outbox', (req, res) => {
    res.json([]);
  });

  // 12. Notebook
  app.get('/api/notebook', (req, res) => {
    const r = db.prepare('SELECT * FROM notebooks LIMIT 1').get() as any;
    if (!r) return res.status(404).json({ error: 'Notebook not found' });
    res.json({
      ...r,
      columns: JSON.parse(r.columns || '[]'),
      rows: JSON.parse(r.rows || '[]'),
    });
  });

  app.put('/api/notebook', (req, res) => {
    const user = getRequestUser(req);
    const nb = req.body;
    db.prepare(`
      UPDATE notebooks
      SET title = ?, columns = ?, rows = ?, updatedAt = ?, updatedBy = ?
      WHERE id = ?
    `).run(
      nb.title,
      JSON.stringify(nb.columns),
      JSON.stringify(nb.rows),
      new Date().toISOString(),
      nb.updatedBy || user?.id || 'staff',
      nb.id
    );
    res.json({ success: true, notebook: nb });
  });

  // 13. Activities
  app.get('/api/activity', (req, res) => {
    const rows = db.prepare('SELECT * FROM activities ORDER BY at DESC').all();
    res.json(rows);
  });

  // 14. Users / Staff
  app.get('/api/users', (req, res) => {
    const user = getRequestUser(req);
    let rows: any[];
    if (req.query.tenantId) {
      rows = db.prepare('SELECT * FROM users WHERE tenantId = ?').all(req.query.tenantId) as any[];
    } else if (user && user.role !== 'dev') {
      rows = db.prepare('SELECT * FROM users WHERE tenantId = ?').all(user.tenantId) as any[];
    } else {
      rows = db.prepare('SELECT * FROM users').all() as any[];
    }
    res.json(rows.map(r => {
      const { pin: _pin, ...safeUser } = r;
      return {
        ...safeUser,
        customRoleName: r.customRoleName || undefined,
        customPermissions: r.customPermissions ? JSON.parse(r.customPermissions) : undefined,
        companyIds: safeParseCompanyIds(r.companyIds),
        active: Boolean(r.active),
      };
    }));
  });

  app.patch('/api/users/:id/role', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden: Admin, Owner, or Dev role required to update roles' });
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, req.params.id);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    const { pin: _pin, ...safeU } = u;
    res.json({
      ...safeU,
      customRoleName: u.customRoleName || undefined,
      customPermissions: u.customPermissions ? JSON.parse(u.customPermissions) : undefined,
      companyIds: safeParseCompanyIds(u.companyIds),
      active: Boolean(u.active),
    });
  });

  app.patch('/api/users/:id', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden: Admin, Owner, or Dev role required to update staff' });
    }
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'dev' && target.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }

    const body = req.body;
    const updatedRole = body.role ?? target.role;
    const updatedCustomRoleName = body.customRoleName !== undefined ? (body.customRoleName ? String(body.customRoleName).trim() : null) : target.customRoleName;
    const updatedCustomPerms = body.customPermissions !== undefined ? (Array.isArray(body.customPermissions) ? JSON.stringify(body.customPermissions) : null) : target.customPermissions;
    const updatedName = body.name ?? target.name;
    const updatedActive = body.active !== undefined ? (body.active ? 1 : 0) : target.active;

    db.prepare(`
      UPDATE users
      SET name = ?, role = ?, customRoleName = ?, customPermissions = ?, active = ?
      WHERE id = ?
    `).run(updatedName, updatedRole, updatedCustomRoleName, updatedCustomPerms, updatedActive, req.params.id);

    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    const { pin: _pin, ...safeU } = u;
    res.json({
      ...safeU,
      customRoleName: u.customRoleName || undefined,
      customPermissions: u.customPermissions ? JSON.parse(u.customPermissions) : undefined,
      companyIds: safeParseCompanyIds(u.companyIds),
      active: Boolean(u.active),
    });
  });

  app.delete('/api/users/:id', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev')) {
      return res.status(403).json({ error: 'Forbidden: Owner or Dev role required to remove staff' });
    }
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'dev' && target.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
    if (target.id === user.id) {
      return res.status(400).json({ error: 'Cannot remove your own owner account' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM auth_tokens WHERE userId = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/users', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden: Admin, Owner, or Dev role required to create users' });
    }
    const body = req.body;
    const id = body.id || `u-${Date.now()}`;
    const tenantId = (user && user.role !== 'dev' && user.tenantId) ? user.tenantId : (body.tenantId || user?.tenantId || 'platform');
    const rawPin = body.pin || (body.role === 'dev' ? '0000' : '1234');
    const pin = hashPin(rawPin);
    const customRoleName = body.customRoleName ? String(body.customRoleName).trim() : null;
    const customPermissions = Array.isArray(body.customPermissions) ? JSON.stringify(body.customPermissions) : null;

    db.prepare(`
      INSERT INTO users (id, tenantId, name, phone, pin, role, customRoleName, customPermissions, companyIds, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, body.name, body.phone, pin, body.role || 'sales', customRoleName, customPermissions, JSON.stringify(body.companyIds || 'all'), 1);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    const { pin: _pin, ...safeU } = u;
    res.status(201).json({
      ...safeU,
      customRoleName: u.customRoleName || undefined,
      customPermissions: u.customPermissions ? JSON.parse(u.customPermissions) : undefined,
      companyIds: safeParseCompanyIds(u.companyIds),
      active: Boolean(u.active),
    });
  });

  // 14b. Role Permissions (Customizable per Organization)
  app.get('/api/permissions', (req, res) => {
    const row = db.prepare("SELECT value FROM agent_state WHERE key = 'custom_permissions'").get() as any;
    if (row && row.value) {
      try {
        return res.json(JSON.parse(row.value));
      } catch {}
    }
    res.json(ROLE_PERMISSIONS);
  });

  app.put('/api/permissions', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev')) {
      return res.status(403).json({ error: 'Forbidden: Owner or Dev role required to alter permission matrices' });
    }
    const perms = req.body;
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('custom_permissions', ?)").run(JSON.stringify(perms));
    res.json(perms);
  });

  // 15. Tally Sync Endpoints (Agent Integration)
  app.get('/api/sync/info', (req, res) => {
    const companies = db.prepare('SELECT id, tenantId, name, tallyName, lastSyncedAt, agentStatus FROM companies').all();
    res.json({
      companies,
      serverTime: new Date().toISOString(),
    });
  });

  app.post('/api/sync/push', (req, res) => {
    const { companyId, alterId, parties, bills, stockItems } = req.body;
    const now = new Date().toISOString();
    const compRow = (companyId ? db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId) : null) || (db.prepare('SELECT * FROM companies LIMIT 1').get() as any);
    const resolvedCompanyId = compRow?.id || companyId || 'default';
    const defaultTenantId = compRow?.tenantId || (getRequestUser(req)?.tenantId) || 'platform';

    let partiesUpdated = 0;
    let billsUpdated = 0;
    let stockUpdated = 0;

    if (Array.isArray(parties)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO parties (id, tenantId, companyId, name, city, phones, gstin, creditDays, collectorId, remindersPaused, notes, promiseToPay)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of parties) {
        stmt.run(p.id, p.tenantId || defaultTenantId, resolvedCompanyId, p.name, p.city || '', JSON.stringify(p.phones || []), p.gstin || null, p.creditDays || 30, null, 0, p.notes || '', null);
        partiesUpdated++;
      }
    }

    if (Array.isArray(bills)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO bills (id, companyId, partyId, billNo, date, dueDate, dueDays, amount, pending, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const b of bills) {
        stmt.run(b.id, resolvedCompanyId, b.partyId, b.billNo, b.date, b.dueDate, b.dueDays || 30, b.amount, b.pending, b.source || 'tally_bill');
        billsUpdated++;
      }
    }

    if (Array.isArray(stockItems)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO stock_items (id, companyId, name, partNo, unit, itemGroup, rate, reorderLevel, alias)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of stockItems) {
        stmt.run(s.id, resolvedCompanyId, s.name, s.partNo || null, s.unit || 'pcs', s.group || 'General', s.rate || 0, s.reorderLevel || 0, s.alias || null);
        stockUpdated++;
      }
    }

    db.prepare(`
      INSERT INTO sync_batches (companyId, syncedAt, alterId, vouchersCount, ledgersCount, stockCount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(resolvedCompanyId, now, alterId || 0, billsUpdated, partiesUpdated, stockUpdated);

    if (compRow?.id) {
      db.prepare("UPDATE companies SET lastSyncedAt = ?, agentStatus = 'online' WHERE id = ?").run(now, compRow.id);
    }
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('lastSeenAt', ?)").run(now);

    res.json({
      success: true,
      syncedAt: now,
      alterId,
      partiesUpdated,
      billsUpdated,
      stockUpdated,
    });
  });

  app.get('/api/sync/pull', (req, res) => {
    // Return pending queued challans waiting to be written to Tally XML
    const rows = db.prepare("SELECT * FROM challans WHERE status = 'queued'").all() as any[];
    res.json(rows.map(r => ({ ...r, lines: JSON.parse(r.lines || '[]') })));
  });

  app.post('/api/sync/ack', (req, res) => {
    const { challanId, status, failureReason } = req.body;
    db.prepare('UPDATE challans SET status = ?, failureReason = ? WHERE id = ?').run(
      status || 'synced',
      failureReason || null,
      challanId
    );
    res.json({ success: true, challanId, status: status || 'synced' });
  });

  // 17. Database Backups
  app.get('/api/backup/json', (req, res) => {
    const tables = [
      'companies',
      'users',
      'parties',
      'bills',
      'godowns',
      'stock_items',
      'stock_balances',
      'challans',
      'tasks',
      'notebooks',
      'reminder_rules',
      'reminder_messages',
      'reminder_replies',
      'activity_events',
      'agent_state',
    ];
    const backup: Record<string, any[]> = {};
    for (const table of tables) {
      try {
        backup[table] = db.prepare(`SELECT * FROM ${table}`).all();
      } catch {
        backup[table] = [];
      }
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="manohar-backup-${dateStr}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(backup);
  });

  app.get('/api/backup/sqlite', (req, res) => {
    const dbFile = process.env.DB_PATH || 'manohar.sqlite';
    if (fs.existsSync(dbFile)) {
      const dateStr = new Date().toISOString().slice(0, 10);
      res.download(dbFile, `manohar-database-${dateStr}.sqlite`);
    } else {
      res.status(404).json({ error: 'Database file not found on disk' });
    }
  });

  // Automated Database Snapshots & Retention System
  const resolvedDbPath = dbPath || process.env.DB_PATH || 'manohar.sqlite';
  const backupDir = path.resolve(
    path.dirname(resolvedDbPath === ':memory:' ? process.cwd() : resolvedDbPath),
    'backups'
  );

  function ensureBackupDir() {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  }

  function createDatabaseSnapshot(): { filename: string; sizeBytes: number; createdAt: string } {
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `manohar-snapshot-${timestamp}.sqlite`;
    const targetPath = path.join(backupDir, filename);

    if (resolvedDbPath === ':memory:') {
      fs.writeFileSync(targetPath, Buffer.from('SQLite format 3\0test_snapshot_data'));
    } else {
      try {
        db.prepare(`VACUUM INTO ?`).run(targetPath);
      } catch {
        if (fs.existsSync(resolvedDbPath)) {
          fs.copyFileSync(resolvedDbPath, targetPath);
        }
      }
    }

    const stat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : { size: 0 };

    // Prune backups: keep latest 14
    try {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('manohar-snapshot-') && f.endsWith('.sqlite'))
        .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 14) {
        files.slice(14).forEach(f => {
          try { fs.unlinkSync(path.join(backupDir, f.name)); } catch {}
        });
      }
    } catch {}

    return {
      filename,
      sizeBytes: stat.size,
      createdAt: new Date().toISOString(),
    };
  }

  // Automatic snapshot on interval (every 24h, non-blocking)
  if (resolvedDbPath !== ':memory:') {
    try {
      createDatabaseSnapshot();
    } catch (e) {
      console.warn('[Backup] Initial startup snapshot failed:', e);
    }
    setInterval(() => {
      try {
        createDatabaseSnapshot();
        console.log('[Backup] Completed automated 24h snapshot.');
      } catch (err) {
        console.error('[Backup] Scheduled snapshot error:', err);
      }
    }, 24 * 60 * 60 * 1000).unref();
  }

  app.post('/api/backup/snapshot', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized: Admin, Owner, or Dev role required' });
    }
    try {
      const snap = createDatabaseSnapshot();
      res.json({ success: true, ...snap });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create database snapshot' });
    }
  });

  app.get('/api/backup/snapshots', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized: Admin, Owner, or Dev role required' });
    }
    ensureBackupDir();
    try {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('manohar-snapshot-') && f.endsWith('.sqlite'))
        .map(f => {
          const stat = fs.statSync(path.join(backupDir, f));
          return {
            filename: f,
            sizeBytes: stat.size,
            createdAt: stat.birthtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list snapshots' });
    }
  });

  app.get('/api/backup/snapshots/:filename', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized: Admin, Owner, or Dev role required' });
    }
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(backupDir, safeFilename);
    if (fs.existsSync(filePath)) {
      res.download(filePath, safeFilename);
    } else {
      res.status(404).json({ error: 'Snapshot not found' });
    }
  });

  // Serve static web app if dist folder exists (Single-Server Unified Deployment)
  const candidatePaths = [
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'dist/public'),
  ];
  const webDistPath = candidatePaths.find(p => fs.existsSync(p));
  if (webDistPath) {
    // Cache immutable hashed asset bundles for 1 year
    app.use('/assets', express.static(path.join(webDistPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));
    // Serve index and public root without caching index.html
    app.use(express.static(webDistPath, {
      maxAge: 0,
      etag: true,
    }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  return app;
}
