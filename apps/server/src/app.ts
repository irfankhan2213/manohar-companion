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
  PERMISSION_KEYS,
  PermissionKey,
  Role,
} from '@saas/shared';

export function createApp(dbPath?: string): express.Express {
  const app = express();
  app.set('trust proxy', 1);
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
      const parsed = JSON.parse(val);
      return parsed;
    } catch {
      return val;
    }
  }

  // Tenant-Scoped Tally Desktop Sync Agent API Key Management
  function getOrCreateAgentKey(tenantId?: string): string {
    const scopedKeyName = tenantId && tenantId !== 'platform' ? `agentApiKey_${tenantId}` : 'agentApiKey';
    const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(scopedKeyName) as any;
    if (row && row.value) {
      return row.value;
    }
    const newKey =
      (!tenantId || tenantId === 'platform') && process.env.TALLY_AGENT_SECRET
        ? process.env.TALLY_AGENT_SECRET
        : `agt_${crypto.randomBytes(24).toString('hex')}`;
    db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(scopedKeyName, newKey);
    // Keep global fallback populated for default tenant
    const globalRow = db.prepare("SELECT value FROM agent_state WHERE key = 'agentApiKey'").get() as any;
    if (!globalRow) {
      db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('agentApiKey', ?)").run(newKey);
    }
    return newKey;
  }

  function resolveAgentAuth(req: express.Request, user: any): { valid: boolean; tenantId?: string; isGlobal: boolean } {
    if (user) {
      return {
        valid: true,
        tenantId: user.role === 'dev' ? undefined : user.tenantId,
        isGlobal: user.role === 'dev',
      };
    }
    const keyHeader = (req.headers['x-agent-key'] || req.headers['x-agent-secret'] || req.query.agentKey) as string;
    if (!keyHeader) return { valid: false, isGlobal: false };

    if (process.env.NODE_ENV !== 'production' && keyHeader === 'dev-agent-secret-key') {
      return { valid: true, isGlobal: true };
    }

    // Check tenant-specific keys first
    const rows = db.prepare("SELECT key, value FROM agent_state WHERE key LIKE 'agentApiKey%'").all() as Array<{ key: string; value: string }>;
    for (const r of rows) {
      if (r.value === keyHeader) {
        if (r.key.startsWith('agentApiKey_')) {
          return { valid: true, tenantId: r.key.slice('agentApiKey_'.length), isGlobal: false };
        }
        return { valid: true, isGlobal: true };
      }
    }

    const configuredGlobalKey = getOrCreateAgentKey();
    if (keyHeader === configuredGlobalKey) {
      return { valid: true, isGlobal: true };
    }

    return { valid: false, isGlobal: false };
  }

  // Per-Tenant RBAC Permission Check (avoids global singleton mutation across tenants)
  function getTenantPermissionsMatrix(tenantId?: string): Record<Role, Record<PermissionKey, boolean>> {
    const tenantKey = tenantId ? `custom_permissions_${tenantId}` : null;
    let row: any = null;
    if (tenantKey) {
      row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(tenantKey);
    }
    if (!row) {
      row = db.prepare("SELECT value FROM agent_state WHERE key = 'custom_permissions'").get() as any;
    }
    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        return { ...ROLE_PERMISSIONS, ...parsed };
      } catch {}
    }
    return ROLE_PERMISSIONS;
  }

  function hasPermission(user: any, permission: PermissionKey): boolean {
    if (!user) return false;
    if (user.role === 'dev') return true;
    if (permission === 'clients.manage') return false;
    if (Array.isArray(user.customPermissions)) {
      return user.customPermissions.includes(permission);
    }
    const matrix = getTenantPermissionsMatrix(user.tenantId);
    const rolePerms = matrix[user.role as Role] || ROLE_PERMISSIONS[user.role as Role];
    return rolePerms ? rolePerms[permission] === true : false;
  }

  function canAccessCompany(user: any, companyId: string): boolean {
    if (!user || user.role === 'dev') return true;
    const comp = db.prepare('SELECT tenantId FROM companies WHERE id = ?').get(companyId) as any;
    if (!comp) return false;
    if (comp.tenantId && user.tenantId && comp.tenantId !== user.tenantId) {
      return false;
    }
    if (Array.isArray(user.companyIds) && !user.companyIds.includes(companyId)) {
      return false;
    }
    return true;
  }

  // Security: scrypt PIN hashing & timing-safe verification
  function hashPin(pin: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(pin, salt, 32);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }

  function verifyPin(inputPin: string, storedPin: string): boolean {
    if (!storedPin || typeof inputPin !== 'string') return false;
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
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token && req.query.token && typeof req.query.token === 'string') {
      token = req.query.token;
    }
    if (token) {
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
        if (u && u.active !== 0 && u.active !== false) {
          // Verify tenant is active for non-dev users
          if (u.role !== 'dev' && u.tenantId) {
            const tenantRow = db.prepare('SELECT status FROM tenants WHERE id = ?').get(u.tenantId) as any;
            if (tenantRow && tenantRow.status === 'inactive') {
              return null;
            }
          }
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
    const cleanPhone = (p: string) => (p ? p.replace(/\D/g, '') : '');
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

    if (!reqClean || reqClean.length < 10) {
      recordLoginFailure(rateLimitKey);
      return res.status(400).json({ success: false, error: 'Valid 10-digit phone number is required' });
    }

    const last10 = reqClean.slice(-10);
    const users = db.prepare('SELECT * FROM users').all() as any[];
    const matchingUsers = users.filter(u => {
      const uClean = cleanPhone(u.phone);
      return uClean.slice(-10) === last10;
    });

    if (matchingUsers.length === 0) {
      recordLoginFailure(rateLimitKey);
      return res.status(401).json({ success: false, error: 'Staff phone number not found' });
    }

    const activeUsers = matchingUsers.filter(u => u.active !== false && u.active !== 0);
    if (activeUsers.length === 0) {
      return res.status(403).json({ success: false, error: 'Account deactivated' });
    }

    // Disambiguate across tenants if multiple users share the same phone number
    const user = activeUsers.find(u => {
      const userPin = u.pin || (u.role === 'dev' ? '0000' : '1234');
      return verifyPin(String(pin ?? ''), userPin);
    });

    if (!user) {
      recordLoginFailure(rateLimitKey);
      return res.status(401).json({ success: false, error: 'Invalid 4-digit PIN' });
    }

    // Check if tenant organization is deactivated
    const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenantId) as any;
    if (user.role !== 'dev' && tenantRow && tenantRow.status === 'inactive') {
      return res.status(403).json({ success: false, error: 'Organization account is deactivated' });
    }

    // Successful authentication: clear brute-force counter
    recordLoginSuccess(rateLimitKey);

    // Auto-migrate legacy plaintext PIN to scrypt hash
    if (!user.pin || !user.pin.startsWith('scrypt:')) {
      try {
        db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(hashPin(String(pin)), user.id);
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

    const tenant = tenantRow || {
      id: user.tenantId,
      name: user.role === 'dev' ? 'Platform Management' : 'Manohar Traders Group',
      ownerName: user.name,
      ownerPhone: user.phone,
      status: 'active',
      createdAt,
    };

    const parsedCompanyIds = safeParseCompanyIds(user.companyIds);
    let companies =
      user.role === 'dev'
        ? (db.prepare('SELECT * FROM companies').all() as any[])
        : (db.prepare('SELECT * FROM companies WHERE tenantId = ?').all(user.tenantId) as any[]);

    if (user.role !== 'dev' && Array.isArray(parsedCompanyIds)) {
      companies = companies.filter(c => parsedCompanyIds.includes(c.id));
    }

    res.json({
      success: true,
      token,
      user: {
        ...user,
        pin: undefined,
        customRoleName: user.customRoleName || undefined,
        customPermissions: user.customPermissions ? JSON.parse(user.customPermissions) : undefined,
        companyIds: parsedCompanyIds,
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
      req.path === '/api/auth/login' ||
      req.path === '/api/agent/pair'
    ) {
      return next();
    }

    const user = getRequestUser(req);

    // Desktop Tally sync endpoints require valid user session OR valid agent secret key
    if (req.path.startsWith('/api/sync') || req.path === '/api/agent/sync') {
      const agentAuth = resolveAgentAuth(req, user);
      if (agentAuth.valid) {
        // Enforce tenant-scoped agent key isolation when companyId is passed
        const targetCompId = (req.query.companyId as string) || req.body?.companyId;
        if (targetCompId && targetCompId !== 'all' && !agentAuth.isGlobal && agentAuth.tenantId) {
          const comp = db.prepare('SELECT tenantId FROM companies WHERE id = ?').get(targetCompId) as any;
          if (comp && comp.tenantId && comp.tenantId !== agentAuth.tenantId) {
            return res.status(403).json({ error: 'Forbidden: Agent key is not authorized for this organization' });
          }
        }
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

    // Cross-tenant and branch-level company isolation
    const companyId = (req.query.companyId as string) || req.body?.companyId;
    if (companyId && companyId !== 'all' && user.role !== 'dev') {
      const company = db.prepare('SELECT tenantId FROM companies WHERE id = ?').get(companyId) as any;
      if (company && company.tenantId && user.tenantId && company.tenantId !== user.tenantId) {
        return res.status(403).json({ error: 'Forbidden: Access denied to company outside your organization' });
      }
      if (Array.isArray(user.companyIds) && !user.companyIds.includes(companyId)) {
        return res.status(403).json({ error: 'Forbidden: Access denied to unassigned company branch' });
      }
    }

    next();
  });

  // 2. Companies
  app.get('/api/companies', (req, res) => {
    const user = getRequestUser(req);
    if (user && user.role !== 'dev' && user.tenantId) {
      let rows = db.prepare('SELECT * FROM companies WHERE tenantId = ?').all(user.tenantId) as any[];
      if (Array.isArray(user.companyIds)) {
        rows = rows.filter(r => user.companyIds.includes(r.id));
      }
      return res.json(rows);
    }
    const rows = db.prepare('SELECT * FROM companies').all();
    res.json(rows);
  });

  app.get('/api/companies/:id', (req, res) => {
    const user = getRequestUser(req);
    const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Company not found' });
    if (!canAccessCompany(user, row.id)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access denied' });
    }
    res.json(row);
  });

  app.post('/api/companies', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'settings.manage')) {
      return res.status(403).json({ error: 'Forbidden: Missing settings.manage permission to create companies' });
    }
    const { name, tallyName, financialYear, gstin, address, phone } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    const id = req.body.id || `c-${Date.now()}`;
    // Non-dev users are strictly locked to their own tenantId
    const tenantId = user && user.role !== 'dev' ? user.tenantId : (req.body.tenantId || user?.tenantId || 'platform');
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT id FROM companies WHERE id = ?').get(id);
    if (existing) {
      return res.status(409).json({ error: 'Company ID already exists' });
    }

    db.prepare(`
      INSERT INTO companies (id, tenantId, name, tallyName, financialYear, gstin, address, phone, lastSyncedAt, agentStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, name.trim(), tallyName || name.trim(), financialYear || '2026-27', gstin || null, address || null, phone || null, now, 'online');

    // Ensure every new company has a default Main Location godown
    db.prepare('INSERT OR IGNORE INTO godowns (id, companyId, name) VALUES (?, ?, ?)').run(`g-${id}-main`, id, 'Main Location');

    const created = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
    res.status(201).json(created);
  });

  app.put('/api/companies/:id', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'settings.manage')) {
      return res.status(403).json({ error: 'Forbidden: Missing settings.manage permission to update company' });
    }
    const existing = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Company not found' });
    if (user && user.role !== 'dev' && user.tenantId && existing.tenantId && existing.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
    const { name, tallyName, financialYear, gstin, address, phone } = req.body;
    db.prepare(`
      UPDATE companies
      SET name = COALESCE(?, name),
          tallyName = COALESCE(?, tallyName),
          financialYear = COALESCE(?, financialYear),
          gstin = COALESCE(?, gstin),
          address = COALESCE(?, address),
          phone = COALESCE(?, phone)
      WHERE id = ?
    `).run(
      name ?? null,
      tallyName ?? null,
      financialYear ?? null,
      gstin ?? null,
      address ?? null,
      phone ?? null,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  // 2b. Auth Me
  app.get('/api/auth/me', (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Invalid, expired, or deactivated session token' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenantId) || {
      id: user.tenantId,
      name: user.role === 'dev' ? 'Platform Management' : 'Manohar Traders Group',
      ownerName: user.name,
      ownerPhone: user.phone,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    let companies =
      user.role === 'dev'
        ? (db.prepare('SELECT * FROM companies').all() as any[])
        : (db.prepare('SELECT * FROM companies WHERE tenantId = ?').all(user.tenantId) as any[]);

    if (user.role !== 'dev' && Array.isArray(user.companyIds)) {
      companies = companies.filter(c => user.companyIds.includes(c.id));
    }

    const { pin: _pin, ...safeUser } = user;
    res.json({
      user: safeUser,
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

    const result = tenants.map(t => {
      const tenantCompanies = companies.filter(c => c.tenantId === t.id);
      const ownerUser = users.find(u => u.tenantId === t.id);
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
    const ownerId = `u-${Date.now()}`;
    const rawPin = ownerPin || '1234';
    const pin = hashPin(rawPin);
    const companyId = `c-${Date.now()}`;
    const compName = tallyCompanyName || name;

    try {
      db.exec('BEGIN');
      // 1. Create Tenant
      db.prepare(`
        INSERT INTO tenants (id, name, ownerName, ownerPhone, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(tenantId, name, ownerName, ownerPhone, 'active', now);

      // 2. Create Owner User
      db.prepare(`
        INSERT INTO users (id, tenantId, name, phone, pin, role, companyIds, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ownerId, tenantId, ownerName, ownerPhone, pin, 'owner', JSON.stringify('all'), 1);

      // 3. Create initial Company and default Main Location godown for this client
      db.prepare(`
        INSERT INTO companies (id, tenantId, name, tallyName, financialYear, lastSyncedAt, agentStatus)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(companyId, tenantId, compName, compName, financialYear || '2026-27', now, 'offline');
      db.prepare('INSERT OR IGNORE INTO godowns (id, companyId, name) VALUES (?, ?, ?)').run(`g-${companyId}-main`, companyId, 'Main Location');

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

      // 5. Provision dedicated agent key for this tenant
      getOrCreateAgentKey(tenantId);
      db.exec('COMMIT');
    } catch (err: any) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      return res.status(500).json({ error: err.message || 'Failed to onboard client' });
    }

    const createdTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    const createdOwner = db.prepare('SELECT id, tenantId, name, phone, role, active FROM users WHERE id = ?').get(ownerId);
    const createdCompany = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);

    res.status(201).json({
      success: true,
      tenant: createdTenant,
      owner: createdOwner,
      company: createdCompany,
    });
  });

  app.patch('/api/dev/clients/:id/status', (req, res) => {
    const user = getRequestUser(req);
    if (!user || user.role !== 'dev') {
      return res.status(403).json({ error: 'Forbidden: Only Dev super admin can change tenant status' });
    }
    const status = req.body?.status;
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ error: 'Invalid status: must be active or inactive' });
    }
    const existing = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Tenant not found' });

    db.prepare('UPDATE tenants SET status = ? WHERE id = ?').run(status, req.params.id);
    if (status === 'inactive') {
      db.prepare('DELETE FROM auth_tokens WHERE tenantId = ?').run(req.params.id);
    }
    const updated = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  // 2b. Parties
  app.get('/api/parties', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'ledgers.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing ledgers.view permission' });
    }
    let query = 'SELECT * FROM parties WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND (tenantId = ? OR companyId IN (SELECT id FROM companies WHERE tenantId = ?))';
      params.push(user.tenantId, user.tenantId);
      if (Array.isArray(user.companyIds) && user.companyIds.length > 0) {
        const placeholders = user.companyIds.map(() => '?').join(',');
        query += ` AND companyId IN (${placeholders})`;
        params.push(...user.companyIds);
      }
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
    const total = parties.length;
    res.setHeader('X-Total-Count', total.toString());
    const limit = req.query.limit !== undefined ? Math.max(1, parseInt(req.query.limit as string, 10) || 50) : undefined;
    const offset = req.query.offset !== undefined ? Math.max(0, parseInt(req.query.offset as string, 10) || 0) : 0;
    const paged = limit !== undefined ? parties.slice(offset, offset + limit) : parties;
    const hasMore = offset + paged.length < total;
    res.setHeader('X-Has-More', String(hasMore));
    if (req.query.format === 'paginated') {
      return res.json({ items: paged, total, limit: limit ?? total, offset, hasMore });
    }
    res.json(paged);
  });

  app.get('/api/parties/:id', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'ledgers.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing ledgers.view permission' });
    }
    const p = db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.id) as any;
    if (!p) return res.status(404).json({ error: 'Party not found' });
    if (user && user.role !== 'dev' && user.tenantId && p.tenantId && p.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access denied' });
    }
    if (p.companyId && !canAccessCompany(user, p.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Access denied to company branch' });
    }
    res.json({
      ...p,
      phones: JSON.parse(p.phones || '[]'),
      remindersPaused: Boolean(p.remindersPaused),
    });
  });

  app.post('/api/parties', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'party.edit')) {
      return res.status(403).json({ error: 'Forbidden: Missing party.edit permission' });
    }
    const body = req.body;
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return res.status(400).json({ error: 'Party name is required' });
    }
    const tenantId = user && user.role !== 'dev' && user.tenantId ? user.tenantId : (body.tenantId || user?.tenantId || 'platform');
    const defaultComp = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(tenantId) as any;
    const companyId = body.companyId || defaultComp?.id || 'comp-default';
    if (body.companyId && !canAccessCompany(user, body.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cannot create party in another organization or unassigned company' });
    }
    const id = body.id || `p-${companyId}-${Date.now()}`;
    const existing = db.prepare('SELECT tenantId FROM parties WHERE id = ?').get(id) as any;
    if (existing && existing.tenantId && existing.tenantId !== tenantId && user?.role !== 'dev') {
      return res.status(409).json({ error: 'Party ID collision with another organization' });
    }

    db.prepare(`
      INSERT INTO parties (id, tenantId, companyId, name, city, phones, gstin, creditDays, collectorId, remindersPaused, notes, promiseToPay)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tenantId,
      companyId,
      body.name.trim(),
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
    const user = getRequestUser(req);
    if (!hasPermission(user, 'party.edit')) {
      return res.status(403).json({ error: 'Forbidden: Missing party.edit permission' });
    }
    const existing = db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Party not found' });
    if (user && user.role !== 'dev' && user.tenantId && existing.tenantId && existing.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
    if (existing.companyId && !canAccessCompany(user, existing.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Access denied to company branch' });
    }
    const body = req.body;
    db.prepare(`
      UPDATE parties
      SET name = COALESCE(?, name),
          city = COALESCE(?, city),
          gstin = COALESCE(?, gstin),
          creditDays = COALESCE(?, creditDays),
          notes = COALESCE(?, notes),
          promiseToPay = COALESCE(?, promiseToPay),
          remindersPaused = COALESCE(?, remindersPaused),
          collectorId = COALESCE(?, collectorId),
          phones = COALESCE(?, phones)
      WHERE id = ?
    `).run(
      body.name !== undefined ? String(body.name).trim() : null,
      body.city !== undefined ? String(body.city).trim() : null,
      body.gstin !== undefined ? String(body.gstin).trim() : null,
      typeof body.creditDays === 'number' ? body.creditDays : null,
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
    if (!hasPermission(user, 'ledgers.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing ledgers.view permission' });
    }
    let query = 'SELECT * FROM bills WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
      if (Array.isArray(user.companyIds) && user.companyIds.length > 0) {
        const placeholders = user.companyIds.map(() => '?').join(',');
        query += ` AND companyId IN (${placeholders})`;
        params.push(...user.companyIds);
      }
    }
    if (req.query.partyId) {
      query += ' AND partyId = ?';
      params.push(req.query.partyId);
    }
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  // 2d. Ledger lines (falls back to synthesized bill entries when raw ledger_lines are not yet populated)
  app.get('/api/ledger/:partyId', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'ledgers.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing ledgers.view permission' });
    }
    const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.partyId) as any;
    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }
    if (user && user.role !== 'dev' && user.tenantId && party.tenantId && party.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access denied' });
    }
    let rows = db.prepare('SELECT date, particulars, voucherType, voucherNo, debit, credit FROM ledger_lines WHERE partyId = ? ORDER BY date ASC').all(req.params.partyId) as any[];
    if (rows.length === 0) {
      const partyBills = db.prepare('SELECT * FROM bills WHERE partyId = ? ORDER BY date ASC').all(req.params.partyId) as any[];
      rows = [];
      for (const b of partyBills) {
        rows.push({
          date: b.date,
          particulars: 'Sales Account',
          voucherType: 'Sales',
          voucherNo: b.billNo,
          debit: b.amount,
          credit: 0,
        });
        if (b.amount > b.pending) {
          rows.push({
            date: b.date,
            particulars: 'Bank / Receipt Settlement',
            voucherType: 'Receipt',
            voucherNo: `RCPT-${b.billNo}`,
            debit: 0,
            credit: b.amount - b.pending,
          });
        }
      }
    }
    res.json(rows);
  });

  // 3. Agent Status & Pairing
  app.get('/api/agent/status', (req, res) => {
    const user = getRequestUser(req);
    const tenantId = user?.tenantId;
    const rows = db.prepare('SELECT * FROM agent_state').all() as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const agentApiKey = getOrCreateAgentKey(tenantId);
    const scopedPairingCode = (tenantId && map[`pairingCode_${tenantId}`]) || map.pairingCode;
    const scopedPairingExpiresAt = (tenantId && map[`pairingExpiresAt_${tenantId}`]) || map.pairingExpiresAt;
    const scopedLastSeenAt = (tenantId && map[`lastSeenAt_${tenantId}`]) || map.lastSeenAt || new Date().toISOString();
    const scopedStatus = ((tenantId && map[`status_${tenantId}`]) || map.status || 'online') as 'online' | 'offline';

    const agent: any = {
      version: map.version || '1.4.2',
      status: scopedStatus,
      lastSeenAt: scopedLastSeenAt,
      pairingCode: scopedPairingCode,
      pairingExpiresAt: scopedPairingExpiresAt,
      agentApiKey: user && hasPermission(user, 'settings.manage') ? agentApiKey : undefined,
    };
    res.json(agent);
  });

  app.get('/api/agent/config-file', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'settings.manage')) {
      return res.status(403).json({ error: 'Forbidden: Missing settings.manage permission to download agent config' });
    }
    let targetCompanyId = (req.query.companyId as string) || '';
    if (!targetCompanyId || targetCompanyId === 'all') {
      if (user && user.tenantId && user.role !== 'dev') {
        const comp = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(user.tenantId) as any;
        targetCompanyId = comp?.id || '';
      } else {
        const comp = db.prepare('SELECT id FROM companies LIMIT 1').get() as any;
        targetCompanyId = comp?.id || 'c1';
      }
    }

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(targetCompanyId) as any;
    if (company && user && user.role !== 'dev' && user.tenantId && company.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cannot download config for another organization' });
    }

    const host = req.get('host') || '127.0.0.1:3000';
    const protocol = req.protocol || 'http';
    const cloudUrl = `${protocol}://${host}`;
    const resolvedTenantId = company?.tenantId || user?.tenantId;
    const agentSecretKey = getOrCreateAgentKey(resolvedTenantId);

    const config = {
      cloudUrl,
      companyId: targetCompanyId,
      agentSecretKey,
      tenantId: resolvedTenantId,
      companyName: company?.name || 'Tally Company',
      tallyUrl: 'http://127.0.0.1:9000',
      pollIntervalMs: 30000,
      lastAlterId: 0,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="agent-state.json"');
    res.send(JSON.stringify(config, null, 2));
  });

  app.post('/api/agent/pairing-code', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'settings.manage')) {
      return res.status(403).json({ error: 'Forbidden: Missing settings.manage permission to generate pairing code' });
    }
    let targetCompanyId = req.body?.companyId || (req.query.companyId as string) || '';

    if (!targetCompanyId || targetCompanyId === 'all') {
      if (user && user.tenantId && user.role !== 'dev') {
        const comp = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(user.tenantId) as any;
        targetCompanyId = comp?.id || '';
      } else {
        const comp = db.prepare('SELECT id FROM companies LIMIT 1').get() as any;
        targetCompanyId = comp?.id || 'c1';
      }
    }

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(targetCompanyId) as any;
    if (company && user && user.role !== 'dev' && user.tenantId && company.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cannot create pairing code for another organization' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const resolvedTenantId = company?.tenantId || user?.tenantId;

    const pairingData = {
      code,
      companyId: company ? company.id : targetCompanyId,
      companyName: company ? company.name : 'Tally Company',
      tenantId: resolvedTenantId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(`pairing_${code}`, JSON.stringify(pairingData));
    if (resolvedTenantId) {
      db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(`pairingCode_${resolvedTenantId}`, code);
      db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(`pairingExpiresAt_${resolvedTenantId}`, expiresAt);
    }
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('pairingCode', ?)").run(code);
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('pairingExpiresAt', ?)").run(expiresAt);

    res.json({
      code,
      expiresAt,
      companyId: pairingData.companyId,
      companyName: pairingData.companyName,
    });
  });

  app.post('/api/agent/pair', (req, res) => {
    const code = (req.body?.code || '').toString().trim();
    if (!code || code.length !== 6) {
      return res.status(400).json({ error: 'Invalid pairing code: must be a 6-digit code' });
    }

    const pairingRow = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(`pairing_${code}`) as any;
    let targetCompanyId = '';
    let isExpired = false;

    if (pairingRow && pairingRow.value) {
      try {
        const parsed = JSON.parse(pairingRow.value);
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
          isExpired = true;
        } else {
          targetCompanyId = parsed.companyId;
        }
      } catch {}
    } else {
      // Fallback to legacy single pairing code
      const legacyCode = db.prepare("SELECT value FROM agent_state WHERE key = 'pairingCode'").get() as any;
      const legacyExpires = db.prepare("SELECT value FROM agent_state WHERE key = 'pairingExpiresAt'").get() as any;
      if (legacyCode && legacyCode.value === code) {
        if (legacyExpires && legacyExpires.value && new Date(legacyExpires.value).getTime() < Date.now()) {
          isExpired = true;
        } else {
          const firstComp = db.prepare('SELECT id FROM companies LIMIT 1').get() as any;
          targetCompanyId = firstComp?.id || 'c1';
        }
      }
    }

    if (isExpired) {
      return res.status(400).json({ error: 'Pairing code expired. Please generate a new code in the Web App.' });
    }

    if (!targetCompanyId) {
      return res.status(404).json({ error: 'Pairing code not found or already used. Please generate a new code.' });
    }

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(targetCompanyId) as any;
    if (!company) {
      return res.status(404).json({ error: `Associated company ${targetCompanyId} not found.` });
    }

    const host = req.get('host') || '127.0.0.1:3000';
    const protocol = req.protocol || 'http';
    const cloudUrl = `${protocol}://${host}`;
    const agentSecretKey = getOrCreateAgentKey(company.tenantId);

    // Consume the pairing code so it cannot be reused
    db.prepare('DELETE FROM agent_state WHERE key = ?').run(`pairing_${code}`);
    if (company.tenantId) {
      db.prepare('DELETE FROM agent_state WHERE key = ? AND value = ?').run(`pairingCode_${company.tenantId}`, code);
    }
    db.prepare("DELETE FROM agent_state WHERE key = 'pairingCode' AND value = ?").run(code);

    res.json({
      success: true,
      companyId: company.id,
      companyName: company.name,
      tenantId: company.tenantId,
      agentSecretKey,
      cloudUrl,
    });
  });

  app.post('/api/agent/sync', (req, res) => {
    const user = getRequestUser(req);
    const agentAuth = resolveAgentAuth(req, user);
    const now = new Date().toISOString();

    const companyId =
      req.body?.companyId ||
      (user?.tenantId ? (db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(user.tenantId) as any)?.id : null) ||
      (agentAuth.tenantId ? (db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(agentAuth.tenantId) as any)?.id : null) ||
      (db.prepare('SELECT id FROM companies LIMIT 1').get() as any)?.id ||
      'default';

    const targetComp = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId) as any;
    const resolvedTenantId = targetComp?.tenantId || user?.tenantId || agentAuth.tenantId;

    if (resolvedTenantId) {
      db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(`lastSeenAt_${resolvedTenantId}`, now);
      db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(`status_${resolvedTenantId}`, 'online');
    }
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('lastSeenAt', ?)").run(now);

    const ledgersCount = resolvedTenantId
      ? (db.prepare('SELECT count(*) as cnt FROM parties WHERE tenantId = ?').get(resolvedTenantId) as any).cnt
      : (db.prepare('SELECT count(*) as cnt FROM parties').get() as any).cnt;
    const vouchersCount = targetComp
      ? (db.prepare('SELECT count(*) as cnt FROM bills WHERE companyId = ?').get(targetComp.id) as any).cnt
      : (db.prepare('SELECT count(*) as cnt FROM bills').get() as any).cnt;
    const stockCount = targetComp
      ? (db.prepare('SELECT count(*) as cnt FROM stock_items WHERE companyId = ?').get(targetComp.id) as any).cnt
      : (db.prepare('SELECT count(*) as cnt FROM stock_items').get() as any).cnt;

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
    if (!hasPermission(user, 'dashboard.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing dashboard.view permission' });
    }
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

    const partyOverdueMap = new Map<string, { party: any; amount: number; daysLate: number; invoiceRef?: string }>();

    for (const b of bills) {
      if (b.pending <= 0) continue;
      totalReceivables += b.pending;
      const days = getDaysOverdue(b.dueDate, today);
      if (days > 0) {
        totalOverdue += b.pending;
        const p = partyMap.get(b.partyId);
        if (p) {
          const existing = partyOverdueMap.get(b.partyId);
          if (existing) {
            existing.amount += b.pending;
            if (days > existing.daysLate) {
              existing.daysLate = days;
              existing.invoiceRef = b.billNo;
            }
          } else {
            partyOverdueMap.set(b.partyId, {
              party: p,
              amount: b.pending,
              daysLate: days,
              invoiceRef: b.billNo,
            });
          }
        }
        if (days <= 30) late1_30 += b.pending;
        else late30Plus += b.pending;
      } else {
        notDue += b.pending;
      }
    }

    const overdueList = Array.from(partyOverdueMap.values()).sort((a, b) => b.daysLate - a.daysLate || b.amount - a.amount);

    let rRules: any = null;
    if (user && user.role !== 'dev' && user.tenantId) {
      rRules = db.prepare('SELECT whatsappEnabled FROM reminder_rules WHERE tenantId = ?').get(user.tenantId);
    } else {
      rRules = db.prepare('SELECT whatsappEnabled FROM reminder_rules LIMIT 1').get() as any;
    }
    const isWhatsAppAttached = Boolean(rRules?.whatsappEnabled ?? 0);

    // Dynamic attention items computed from live data
    const needsAttention: Array<{
      id: string;
      type: 'overdue' | 'stock' | 'reply' | 'outbox';
      title: string;
      subtitle: string;
      actionLabel: string;
      actionPath: string;
    }> = [];

    const overdueOver30 = overdueList.filter(o => o.daysLate >= 30);
    if (overdueOver30.length > 0) {
      const sum = overdueOver30.reduce((acc, curr) => acc + curr.amount, 0);
      const sumLakhs = (sum / 10000000).toFixed(1);
      needsAttention.push({
        id: 'attn-overdue',
        type: 'overdue',
        title: `${overdueOver30.length} account${overdueOver30.length > 1 ? 's' : ''} overdue > 30 days`,
        subtitle: `₹ ${sumLakhs}L total pending across ${overdueOver30.length} parties`,
        actionLabel: isWhatsAppAttached ? 'Send Reminders' : 'View Dues',
        actionPath: isWhatsAppAttached ? '/reminders' : '/collections',
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
    const lowStockItems = stockRows.filter((s: any) => s.reorderLevel > 0 && (s.totalQty === null || s.totalQty <= s.reorderLevel));
    if (lowStockItems.length > 0) {
      needsAttention.push({
        id: 'attn-stock',
        type: 'stock',
        title: `${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''} at or below reorder level`,
        subtitle: `${lowStockItems.slice(0, 2).map((i: any) => i.name).join(', ')} running low`,
        actionLabel: 'View Stock',
        actionPath: '/stock',
      });
    }

    // Compute per-company breakdown when viewing 'all'
    let companyBreakdown: Array<{ company: any; totalAmount: number; overdueAmount: number }> | undefined = undefined;
    if (!companyId || companyId === 'all') {
      let comps = user && user.role !== 'dev' && user.tenantId
        ? (db.prepare('SELECT * FROM companies WHERE tenantId = ?').all(user.tenantId) as any[])
        : (db.prepare('SELECT * FROM companies').all() as any[]);
      if (user && user.role !== 'dev' && Array.isArray(user.companyIds)) {
        comps = comps.filter(c => user.companyIds.includes(c.id));
      }
      companyBreakdown = comps.map(comp => {
        const cBills = bills.filter(b => b.companyId === comp.id && b.pending > 0);
        const cAging = calculateAgingSummary(cBills, today);
        return {
          company: comp,
          totalAmount: cAging.total,
          overdueAmount: cAging.overdue,
        };
      });
    }

    const notDuePct = totalReceivables > 0 ? Math.round((notDue / totalReceivables) * 100) : 100;
    const latePct = totalReceivables > 0 ? Math.round((late1_30 / totalReceivables) * 100) : 0;
    const over30Pct = totalReceivables > 0 ? Math.max(0, 100 - notDuePct - latePct) : 0;

    res.json({
      totalReceivables,
      totalOverdue,
      notDuePercentage: notDuePct,
      latePercentage: latePct,
      over30Percentage: over30Pct,
      whatsappAttached: isWhatsAppAttached,
      needsAttention,
      mostOverdue: overdueList.slice(0, 5),
      companyBreakdown,
    });
  });

  // 5. Collections
  app.get('/api/collections', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'ledgers.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing ledgers.view permission' });
    }
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
    const user = getRequestUser(req);
    if (!hasPermission(user, 'ledgers.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing ledgers.view permission' });
    }
    const p = db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.partyId) as any;
    if (!p) {
      return res.status(404).json({ error: 'Party not found' });
    }
    if (user && user.role !== 'dev' && user.tenantId && p.tenantId && p.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access denied' });
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
    const ledgerLines = db.prepare('SELECT date, particulars, voucherType, voucherNo, debit, credit FROM ledger_lines WHERE partyId = ? ORDER BY date ASC').all(p.id) as any[];
    const rawReply = db.prepare('SELECT * FROM reminder_replies WHERE partyId = ?').get(p.id) as any;
    const reminderThread = rawReply
      ? {
          ...rawReply,
          messages: JSON.parse(rawReply.messages || '[]'),
        }
      : undefined;

    res.json({
      party,
      bills,
      ledgerLines,
      reminderThread,
    });
  });

  // 6. Stock Items & Balances
  app.get('/api/stock', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'stock.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing stock.view permission' });
    }
    const companyId = req.query.companyId as string | undefined;

    let itemsQuery = 'SELECT * FROM stock_items WHERE 1=1';
    const itemsParams: any[] = [];
    if (companyId && companyId !== 'all') {
      itemsQuery += ' AND companyId = ?';
      itemsParams.push(companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      itemsQuery += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      itemsParams.push(user.tenantId);
      if (Array.isArray(user.companyIds) && user.companyIds.length > 0) {
        const placeholders = user.companyIds.map(() => '?').join(',');
        itemsQuery += ` AND companyId IN (${placeholders})`;
        itemsParams.push(...user.companyIds);
      }
    }

    let items = db.prepare(itemsQuery).all(...itemsParams) as any[];
    if (req.query.q) {
      const q = (req.query.q as string).toLowerCase();
      items = items.filter(it => it.name.toLowerCase().includes(q) || (it.partNo && it.partNo.toLowerCase().includes(q)));
    }
    const balances = db.prepare('SELECT * FROM stock_balances').all() as any[];

    const balancesByItem = new Map<string, any[]>();
    for (const b of balances) {
      if (!balancesByItem.has(b.itemId)) balancesByItem.set(b.itemId, []);
      balancesByItem.get(b.itemId)!.push(b);
    }

    const parseCustomValues = (val: any): Record<string, string> => {
      if (!val) return {};
      if (typeof val === 'object' && !Array.isArray(val)) return val;
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
      } catch {}
      return {};
    };

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
          purchaseRate: it.purchaseRate !== null && it.purchaseRate !== undefined ? it.purchaseRate : undefined,
          reorderLevel: it.reorderLevel,
          alias: it.alias || undefined,
          hsnCode: it.hsnCode || undefined,
          gstRate: it.gstRate !== null && it.gstRate !== undefined ? it.gstRate : undefined,
          description: it.description || undefined,
          customValues: parseCustomValues(it.customValues),
        },
        totalQty,
        balances: bList,
        lowStock: totalQty <= it.reorderLevel,
      };
    });

    res.json(result);
  });

  app.get('/api/stock/:itemId', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'stock.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing stock.view permission' });
    }
    const it = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.itemId) as any;
    if (!it) {
      return res.status(404).json({ error: 'Stock item not found' });
    }
    if (it.companyId && !canAccessCompany(user, it.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access denied' });
    }

    const parseCustomValues = (val: any): Record<string, string> => {
      if (!val) return {};
      if (typeof val === 'object' && !Array.isArray(val)) return val;
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
      } catch {}
      return {};
    };

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
        purchaseRate: it.purchaseRate !== null && it.purchaseRate !== undefined ? it.purchaseRate : undefined,
        reorderLevel: it.reorderLevel,
        alias: it.alias || undefined,
        hsnCode: it.hsnCode || undefined,
        gstRate: it.gstRate !== null && it.gstRate !== undefined ? it.gstRate : undefined,
        description: it.description || undefined,
        customValues: parseCustomValues(it.customValues),
      },
      totalQty,
      balances,
      lowStock: totalQty <= it.reorderLevel,
      recentTransactions: [],
    });
  });

  // 6c. Create Stock Item
  app.post('/api/stock', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'stock.adjust') && !hasPermission(user, 'tally.write.stock')) {
      return res.status(403).json({ error: 'Forbidden: Missing stock modification permission' });
    }
    const {
      id: customId,
      companyId,
      name,
      partNo,
      unit,
      group,
      rate,
      purchaseRate,
      reorderLevel,
      alias,
      hsnCode,
      gstRate,
      description,
      customValues,
      balances,
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const defaultTenantComp = user?.tenantId
      ? (db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(user.tenantId) as any)
      : null;
    const requestedCompanyId = companyId && companyId !== 'all' ? companyId : null;
    const resolvedCompanyId =
      (requestedCompanyId && canAccessCompany(user, requestedCompanyId) ? requestedCompanyId : null) ||
      (Array.isArray(user?.companyIds) && user.companyIds.length > 0 ? user.companyIds[0] : null) ||
      defaultTenantComp?.id ||
      requestedCompanyId ||
      'c1';
    if (!canAccessCompany(user, resolvedCompanyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant creation denied' });
    }

    const itemId = customId || `s-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const parsedCustomValues = customValues && typeof customValues === 'object' ? JSON.stringify(customValues) : '{}';

    db.prepare(`
      INSERT INTO stock_items (id, companyId, name, partNo, unit, itemGroup, rate, purchaseRate, reorderLevel, alias, hsnCode, gstRate, description, customValues)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      itemId,
      resolvedCompanyId,
      name.trim(),
      partNo ? String(partNo).trim() : null,
      unit ? String(unit).trim() : 'pcs',
      group ? String(group).trim() : 'General',
      typeof rate === 'number' ? Math.round(rate) : 0,
      typeof purchaseRate === 'number' ? Math.round(purchaseRate) : 0,
      typeof reorderLevel === 'number' ? reorderLevel : 0,
      alias ? String(alias).trim() : null,
      hsnCode ? String(hsnCode).trim() : null,
      typeof gstRate === 'number' ? gstRate : 0,
      description ? String(description).trim() : null,
      parsedCustomValues
    );

    if (Array.isArray(balances)) {
      for (const b of balances) {
        if (b.godownId && typeof b.qty === 'number') {
          db.prepare(`
            INSERT INTO stock_balances (itemId, godownId, qty)
            VALUES (?, ?, ?)
            ON CONFLICT(itemId, godownId) DO UPDATE SET qty = excluded.qty
          `).run(itemId, b.godownId, b.qty);
        }
      }
    }

    const parseCustomValues = (val: any): Record<string, string> => {
      if (!val) return {};
      if (typeof val === 'object' && !Array.isArray(val)) return val;
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
      } catch {}
      return {};
    };

    const tenantId = user?.tenantId || 'platform';
    const actorId = user?.id || 'staff';
    db.prepare(`
      INSERT INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`act-${Date.now()}`, tenantId, resolvedCompanyId, actorId, 'stock_created', `Created stock item: ${name}`, new Date().toISOString(), 'Desktop');

    const created = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(itemId) as any;
    const bList = db.prepare('SELECT * FROM stock_balances WHERE itemId = ?').all(itemId) as any[];

    res.status(201).json({
      id: created.id,
      companyId: created.companyId,
      name: created.name,
      partNo: created.partNo || undefined,
      unit: created.unit,
      group: created.itemGroup,
      rate: created.rate,
      purchaseRate: created.purchaseRate || undefined,
      reorderLevel: created.reorderLevel,
      alias: created.alias || undefined,
      hsnCode: created.hsnCode || undefined,
      gstRate: created.gstRate ?? undefined,
      description: created.description || undefined,
      customValues: parseCustomValues(created.customValues),
      balances: bList,
    });
  });

  // 6d. Update Stock Item
  app.put('/api/stock/:itemId', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'stock.adjust') && !hasPermission(user, 'tally.write.stock')) {
      return res.status(403).json({ error: 'Forbidden: Missing stock modification permission' });
    }
    const it = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.itemId) as any;
    if (!it) {
      return res.status(404).json({ error: 'Stock item not found' });
    }
    if (it.companyId && !canAccessCompany(user, it.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }

    const {
      name,
      partNo,
      unit,
      group,
      rate,
      purchaseRate,
      reorderLevel,
      alias,
      hsnCode,
      gstRate,
      description,
      customValues,
      balances,
    } = req.body;

    const updatedName = name !== undefined ? String(name).trim() : it.name;
    const updatedPartNo = partNo !== undefined ? (partNo ? String(partNo).trim() : null) : it.partNo;
    const updatedUnit = unit !== undefined ? String(unit).trim() : it.unit;
    const updatedGroup = group !== undefined ? String(group).trim() : it.itemGroup;
    const updatedRate = typeof rate === 'number' ? Math.round(rate) : it.rate;
    const updatedPurchaseRate = typeof purchaseRate === 'number' ? Math.round(purchaseRate) : (purchaseRate === null ? null : it.purchaseRate);
    const updatedReorderLevel = typeof reorderLevel === 'number' ? reorderLevel : it.reorderLevel;
    const updatedAlias = alias !== undefined ? (alias ? String(alias).trim() : null) : it.alias;
    const updatedHsnCode = hsnCode !== undefined ? (hsnCode ? String(hsnCode).trim() : null) : it.hsnCode;
    const updatedGstRate = typeof gstRate === 'number' ? gstRate : (gstRate === null ? null : it.gstRate);
    const updatedDescription = description !== undefined ? (description ? String(description).trim() : null) : it.description;
    
    let updatedCustomValues = it.customValues || '{}';
    if (customValues !== undefined) {
      updatedCustomValues = customValues && typeof customValues === 'object' ? JSON.stringify(customValues) : '{}';
    }

    db.prepare(`
      UPDATE stock_items SET
        name = ?,
        partNo = ?,
        unit = ?,
        itemGroup = ?,
        rate = ?,
        purchaseRate = ?,
        reorderLevel = ?,
        alias = ?,
        hsnCode = ?,
        gstRate = ?,
        description = ?,
        customValues = ?
      WHERE id = ?
    `).run(
      updatedName,
      updatedPartNo,
      updatedUnit,
      updatedGroup,
      updatedRate,
      updatedPurchaseRate,
      updatedReorderLevel,
      updatedAlias,
      updatedHsnCode,
      updatedGstRate,
      updatedDescription,
      updatedCustomValues,
      it.id
    );

    if (Array.isArray(balances)) {
      for (const b of balances) {
        if (b.godownId && typeof b.qty === 'number') {
          db.prepare(`
            INSERT INTO stock_balances (itemId, godownId, qty)
            VALUES (?, ?, ?)
            ON CONFLICT(itemId, godownId) DO UPDATE SET qty = excluded.qty
          `).run(it.id, b.godownId, b.qty);
        }
      }
    }

    const parseCustomValues = (val: any): Record<string, string> => {
      if (!val) return {};
      if (typeof val === 'object' && !Array.isArray(val)) return val;
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
      } catch {}
      return {};
    };

    const tenantId = user?.tenantId || 'platform';
    const actorId = user?.id || 'staff';
    db.prepare(`
      INSERT INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`act-${Date.now()}`, tenantId, it.companyId || 'c1', actorId, 'stock_updated', `Updated stock item: ${updatedName}`, new Date().toISOString(), 'Desktop');

    const updated = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(it.id) as any;
    const bList = db.prepare('SELECT * FROM stock_balances WHERE itemId = ?').all(it.id) as any[];

    res.json({
      id: updated.id,
      companyId: updated.companyId,
      name: updated.name,
      partNo: updated.partNo || undefined,
      unit: updated.unit,
      group: updated.itemGroup,
      rate: updated.rate,
      purchaseRate: updated.purchaseRate || undefined,
      reorderLevel: updated.reorderLevel,
      alias: updated.alias || undefined,
      hsnCode: updated.hsnCode || undefined,
      gstRate: updated.gstRate ?? undefined,
      description: updated.description || undefined,
      customValues: parseCustomValues(updated.customValues),
      balances: bList,
    });
  });

  // 6e. Delete Stock Item
  app.delete('/api/stock/:itemId', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'stock.adjust') && !hasPermission(user, 'tally.write.stock')) {
      return res.status(403).json({ error: 'Forbidden: Missing stock modification permission' });
    }
    const it = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.itemId) as any;
    if (!it) {
      return res.status(404).json({ error: 'Stock item not found' });
    }
    if (it.companyId && !canAccessCompany(user, it.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }

    db.prepare('DELETE FROM stock_balances WHERE itemId = ?').run(it.id);
    db.prepare('DELETE FROM stock_items WHERE id = ?').run(it.id);

    const tenantId = user?.tenantId || 'platform';
    const actorId = user?.id || 'staff';
    db.prepare(`
      INSERT INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`act-${Date.now()}`, tenantId, it.companyId || 'c1', actorId, 'stock_deleted', `Deleted stock item: ${it.name}`, new Date().toISOString(), 'Desktop');

    res.json({ success: true, id: it.id });
  });

  // 6b. Stock Adjust
  app.post('/api/stock/adjust', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'stock.adjust')) {
      return res.status(403).json({ error: 'Forbidden: Missing stock.adjust permission' });
    }
    const { itemId, godownId, deltaQty, reason } = req.body;
    const it = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(itemId) as any;
    if (!it) {
      return res.status(404).json({ error: 'Stock item not found' });
    }
    if (it.companyId && !canAccessCompany(user, it.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
    db.prepare(`
      INSERT INTO stock_balances (itemId, godownId, qty)
      VALUES (?, ?, ?)
      ON CONFLICT(itemId, godownId) DO UPDATE SET qty = qty + ?
    `).run(itemId, godownId, deltaQty, deltaQty);

    const compId = it.companyId || req.body.companyId || (user?.companyIds === 'all' ? 'all' : user?.companyIds?.[0]) || 'default';
    const godownRow = godownId ? (db.prepare('SELECT name FROM godowns WHERE id = ?').get(godownId) as any) : null;
    const outboxId = `out-${Date.now()}`;
    const adjPayload = JSON.stringify({
      id: outboxId,
      outboxId,
      kind: 'stock_journal',
      refId: itemId,
      itemName: it.name,
      godownId,
      godownName: godownRow?.name || 'Main Location',
      deltaQty,
      unit: it.unit || 'pcs',
      rate: it.rate || 0,
      reason: reason || 'Mobile stock adjustment',
      date: new Date().toISOString().slice(0, 10),
    });
    db.prepare(`
      INSERT INTO outbox_items (id, companyId, kind, refId, status, attempts, lastError, payload)
      VALUES (?, ?, 'stock_journal', ?, 'queued', 1, NULL, ?)
    `).run(outboxId, compId, itemId, adjPayload);

    // Audit log
    const tenantId = user?.tenantId || 'platform';
    const actorId = user?.id || 'staff';
    db.prepare(`
      INSERT INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`act-${Date.now()}`, tenantId, compId, actorId, 'stock_adjusted', `${itemId} (${deltaQty > 0 ? '+' : ''}${deltaQty}${reason ? `: ${reason}` : ''})`, new Date().toISOString(), 'Desktop');

    res.json({ success: true });
  });

  // 7. Godowns
  app.get('/api/godowns', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'stock.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing stock.view permission' });
    }
    let query = 'SELECT * FROM godowns WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
    }
    let rows = db.prepare(query).all(...params) as any[];
    if (rows.length === 0) {
      const targetCompanyId =
        req.query.companyId && req.query.companyId !== 'all'
          ? (req.query.companyId as string)
          : user?.tenantId
          ? (db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(user.tenantId) as any)?.id
          : null;
      if (targetCompanyId) {
        const defaultGodown = {
          id: `g-${targetCompanyId}-main`,
          companyId: targetCompanyId,
          name: 'Main Location',
        };
        try {
          db.prepare('INSERT OR IGNORE INTO godowns (id, companyId, name) VALUES (?, ?, ?)').run(
            defaultGodown.id,
            defaultGodown.companyId,
            defaultGodown.name
          );
          rows = [defaultGodown];
        } catch {}
      }
    }
    res.json(rows);
  });

  // 8. Delivery Challans
  app.get('/api/challans', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'challan.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing challan.view permission' });
    }
    let query = 'SELECT * FROM challans WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
      if (Array.isArray(user.companyIds) && user.companyIds.length > 0) {
        const placeholders = user.companyIds.map(() => '?').join(',');
        query += ` AND companyId IN (${placeholders})`;
        params.push(...user.companyIds);
      }
    }
    if (req.query.type && req.query.type !== 'all') {
      query += ' AND type = ?';
      params.push(req.query.type);
    }
    query += ' ORDER BY date DESC';
    const rows = db.prepare(query).all(...params) as any[];
    let challans: Challan[] = rows.map(r => ({
      ...r,
      lines: JSON.parse(r.lines || '[]'),
    }));

    if (req.query.q && typeof req.query.q === 'string' && req.query.q.trim()) {
      const q = req.query.q.trim().toLowerCase();
      const allParties = db.prepare('SELECT id, name FROM parties').all() as Array<{ id: string; name: string }>;
      const partyNameMap = new Map(allParties.map(p => [p.id, (p.name || '').toLowerCase()]));
      challans = challans.filter(c => {
        const pName = partyNameMap.get(c.partyId) || '';
        return (
          c.number.toLowerCase().includes(q) ||
          pName.includes(q) ||
          (c.vehicleNo?.toLowerCase().includes(q) ?? false) ||
          (c.lrNo?.toLowerCase().includes(q) ?? false) ||
          c.lines.some(l => l.description.toLowerCase().includes(q))
        );
      });
    }

    const itemIds = req.query.itemIds;
    if (itemIds) {
      const ids = Array.isArray(itemIds)
        ? (itemIds as string[])
        : (itemIds as string).split(',').map(s => s.trim());
      challans = challans.filter(c => c.lines.some(l => ids.includes(l.itemId)));
    }

    const total = challans.length;
    res.setHeader('X-Total-Count', total.toString());
    const limit = req.query.limit !== undefined ? Math.max(1, parseInt(req.query.limit as string, 10) || 50) : undefined;
    const offset = req.query.offset !== undefined ? Math.max(0, parseInt(req.query.offset as string, 10) || 0) : 0;
    const paged = limit !== undefined ? challans.slice(offset, offset + limit) : challans;
    const hasMore = offset + paged.length < total;
    res.setHeader('X-Has-More', String(hasMore));
    if (req.query.format === 'paginated') {
      return res.json({ items: paged, total, limit: limit ?? total, offset, hasMore });
    }
    res.json(paged);
  });

  app.get('/api/challans/:id', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'challan.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing challan.view permission' });
    }
    const r = db.prepare('SELECT * FROM challans WHERE id = ?').get(req.params.id) as any;
    if (!r) return res.status(404).json({ error: 'Challan not found' });
    if (r.companyId && !canAccessCompany(user, r.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access denied' });
    }
    const challan: Challan = {
      ...r,
      lines: JSON.parse(r.lines || '[]'),
    };
    res.json(challan);
  });

  app.post('/api/challans', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'challan.create')) {
      return res.status(403).json({ error: 'Forbidden: Missing challan.create permission' });
    }
    const body = req.body;
    const id = body.id || `ch-${Date.now()}`;
    const tenantId = user?.tenantId || 'platform';
    const partyRow = body.partyId ? (db.prepare('SELECT companyId FROM parties WHERE id = ?').get(body.partyId) as any) : null;
    const defaultComp = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(tenantId) as any;
    const requestedCompId = body.companyId && body.companyId !== 'all' ? body.companyId : null;
    const companyId = requestedCompId || partyRow?.companyId || defaultComp?.id || 'c1';
    if (requestedCompId && !canAccessCompany(user, requestedCompId)) {
      return res.status(403).json({ error: 'Forbidden: Cannot create challan in another organization' });
    }
    const actorId = user?.id || body.createdBy || 'staff';
    const status = body.status || 'queued';
    const challanType = body.type || 'delivery';
    const prefix = challanType === 'sales' ? 'SC' : challanType === 'purchase' ? 'PC' : 'DC';
    const existingCount = (db.prepare('SELECT count(*) as cnt FROM challans WHERE companyId = ? AND type = ?').get(companyId, challanType) as any)?.cnt || 0;
    const autoNumber = `${prefix}/${String(existingCount + 46).padStart(3, '0')}/26-27`;
    const parsedLines = Array.isArray(body.lines) ? body.lines : [];
    const resolvedGodownId =
      body.godownId ||
      (db.prepare('SELECT id FROM godowns WHERE companyId = ? LIMIT 1').get(companyId) as any)?.id ||
      `g-${companyId}-main`;

    const insert = db.prepare(`
      INSERT INTO challans (id, companyId, type, number, date, partyId, godownId, lines, vehicleNo, lrNo, transporter, narration, status, failureReason, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      companyId,
      challanType,
      body.number || autoNumber,
      body.date || new Date().toISOString().split('T')[0],
      body.partyId,
      resolvedGodownId,
      JSON.stringify(parsedLines),
      body.vehicleNo || null,
      body.lrNo || null,
      body.transporter || null,
      body.narration || null,
      status,
      null,
      actorId
    );

    // Automatically update stock balances when challan is queued/synced (not draft)
    if (status !== 'draft' && resolvedGodownId) {
      const direction = challanType === 'purchase' ? 1 : -1;
      for (const line of parsedLines) {
        if (line.itemId && typeof line.qty === 'number') {
          const delta = direction * line.qty;
          db.prepare(`
            INSERT INTO stock_balances (itemId, godownId, qty)
            VALUES (?, ?, ?)
            ON CONFLICT(itemId, godownId) DO UPDATE SET qty = qty + ?
          `).run(line.itemId, resolvedGodownId, delta, delta);
        }
      }
    }

    if (status === 'queued') {
      db.prepare(`
        INSERT INTO outbox_items (id, companyId, kind, refId, status, attempts, lastError)
        VALUES (?, ?, 'challan', ?, 'queued', 1, NULL)
      `).run(`out-${Date.now()}`, companyId, id);
    }

    // Audit log
    db.prepare(`
      INSERT INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`act-${Date.now()}`, tenantId, companyId, actorId, 'created_challan', `${body.number || autoNumber}`, new Date().toISOString(), 'Desktop');

    const created = db.prepare('SELECT * FROM challans WHERE id = ?').get(id) as any;
    res.status(201).json({ ...created, lines: JSON.parse(created.lines || '[]') });
  });

  app.patch('/api/challans/:id/status', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'challan.create')) {
      return res.status(403).json({ error: 'Forbidden: Missing challan.create permission' });
    }
    const existing = db.prepare('SELECT * FROM challans WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Challan not found' });
    if (existing.companyId && !canAccessCompany(user, existing.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
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
    const user = getRequestUser(req);
    if (!hasPermission(user, 'challan.create')) {
      return res.status(403).json({ error: 'Forbidden: Missing challan.create permission' });
    }
    const existing = db.prepare('SELECT * FROM challans WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Challan not found' });
    if (existing.companyId && !canAccessCompany(user, existing.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
    db.prepare("UPDATE challans SET status = 'queued', failureReason = NULL WHERE id = ?").run(req.params.id);
    const outRes = db.prepare("UPDATE outbox_items SET status = 'queued', attempts = attempts + 1, lastError = NULL WHERE refId = ?").run(req.params.id);
    if (outRes.changes === 0) {
      db.prepare(`
        INSERT INTO outbox_items (id, companyId, kind, refId, status, attempts, lastError)
        VALUES (?, ?, 'challan', ?, 'queued', 1, NULL)
      `).run(`out-${Date.now()}`, existing.companyId, req.params.id);
    }
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
      query += ' AND (companyId IN (SELECT id FROM companies WHERE tenantId = ?) OR assignedToUserId = ?)';
      params.push(user.tenantId, user.id);
      if (Array.isArray(user.companyIds) && user.companyIds.length > 0) {
        const placeholders = user.companyIds.map(() => '?').join(',');
        query += ` AND (companyId IN (${placeholders}) OR assignedToUserId = ?)`;
        params.push(...user.companyIds, user.id);
      }
    }

    if (req.query.status) {
      query += ' AND status = ?';
      params.push(req.query.status);
    }

    // Strict task visibility: non-admin staff can only ever view tasks assigned to them,
    // and explicit assignedToUserId filters are honored for all users.
    const isAdminRole = user && (user.role === 'owner' || user.role === 'admin' || user.role === 'dev');
    if (user && !isAdminRole) {
      query += ' AND assignedToUserId = ?';
      params.push(user.id);
    } else if (req.query.assignedToUserId) {
      query += ' AND assignedToUserId = ?';
      params.push(req.query.assignedToUserId);
    }

    if (req.query.challanId) {
      query += ' AND challanId = ?';
      params.push(req.query.challanId);
    }

    query += ' ORDER BY createdAt DESC';
    const rows = db.prepare(query).all(...params) as any[];
    const total = rows.length;
    res.setHeader('X-Total-Count', total.toString());
    const limit = req.query.limit !== undefined ? Math.max(1, parseInt(req.query.limit as string, 10) || 50) : undefined;
    const offset = req.query.offset !== undefined ? Math.max(0, parseInt(req.query.offset as string, 10) || 0) : 0;
    const paged = limit !== undefined ? rows.slice(offset, offset + limit) : rows;
    const hasMore = offset + paged.length < total;
    res.setHeader('X-Has-More', String(hasMore));
    if (req.query.format === 'paginated') {
      return res.json({ items: paged, total, limit: limit ?? total, offset, hasMore });
    }
    res.json(paged);
  });

  app.get('/api/tasks/:id', (req, res) => {
    const user = getRequestUser(req);
    const r = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
    if (!r) return res.status(404).json({ error: 'Task not found' });
    if (r.companyId && r.companyId !== 'all' && !canAccessCompany(user, r.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access denied' });
    }
    const isAdminRole = user && (user.role === 'owner' || user.role === 'admin' || user.role === 'dev');
    if (user && !isAdminRole && r.assignedToUserId !== user.id && r.assignedByUserId !== user.id) {
      return res.status(403).json({ error: 'Forbidden: Task is only visible to the assigned user' });
    }
    res.json(r);
  });

  app.post('/api/tasks', (req, res) => {
    const user = getRequestUser(req);
    const body = req.body;
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }
    if (!body.assignedToUserId || typeof body.assignedToUserId !== 'string') {
      return res.status(400).json({ error: 'assignedToUserId is required' });
    }

    const id = body.id || `task-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const tenantId = user?.tenantId || 'platform';

    // Verify assignee exists and belongs to the same tenant (unless dev)
    const assignee = db.prepare('SELECT id, tenantId, name FROM users WHERE id = ?').get(body.assignedToUserId) as any;
    if (assignee && user && user.role !== 'dev' && user.tenantId && assignee.tenantId && assignee.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cannot assign task to a user outside your organization' });
    }

    // Resolve concrete companyId (never store 'all')
    let linkedChallan: any = null;
    if (body.challanId) {
      linkedChallan = db.prepare('SELECT id, companyId, number FROM challans WHERE id = ?').get(body.challanId) as any;
    }
    const defaultComp = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(tenantId) as any;
    const requestedCompanyId = body.companyId && body.companyId !== 'all' ? body.companyId : null;
    const companyId = requestedCompanyId || linkedChallan?.companyId || defaultComp?.id || 'c1';

    if (requestedCompanyId && !canAccessCompany(user, requestedCompanyId)) {
      return res.status(403).json({ error: 'Forbidden: Cannot create task in another organization' });
    }
    const assignedByUserId = user?.id || body.assignedByUserId || 'staff';

    db.prepare(`
      INSERT INTO tasks (id, companyId, title, description, assignedToUserId, assignedByUserId, challanId, photoUrl, status, priority, createdAt, completedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      companyId,
      body.title.trim(),
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

    // Auto-create notification strictly for the assigned user
    const notifId = `notif-${Date.now()}`;
    db.prepare(`
      INSERT INTO notifications (id, userId, companyId, title, body, taskId, challanId, photoUrl, read, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      notifId,
      body.assignedToUserId,
      companyId,
      'New Task Assigned',
      body.title.trim(),
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
    const user = getRequestUser(req);
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (existing.companyId && existing.companyId !== 'all' && !canAccessCompany(user, existing.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
    const isAdminRole = user && (user.role === 'owner' || user.role === 'admin' || user.role === 'dev');
    if (user && !isAdminRole && existing.assignedToUserId !== user.id && existing.assignedByUserId !== user.id) {
      return res.status(403).json({ error: 'Forbidden: Only the assigned user can update this task' });
    }

    const { status, photoUrl, description } = req.body;
    const completedAt = status === 'completed' ? new Date().toISOString() : (status === 'pending' || status === 'in_progress' ? null : existing.completedAt);

    db.prepare(`
      UPDATE tasks
      SET status = COALESCE(?, status),
          photoUrl = COALESCE(?, photoUrl),
          description = COALESCE(?, description),
          completedAt = ?
      WHERE id = ?
    `).run(
      status ?? null,
      photoUrl ?? null,
      description ?? null,
      completedAt ?? null,
      req.params.id
    );

    // Notify assigner when task transitions to completed
    if (
      status === 'completed' &&
      existing.status !== 'completed' &&
      existing.assignedByUserId &&
      existing.assignedByUserId !== (user?.id || existing.assignedToUserId)
    ) {
      const notifId = `notif-done-${Date.now()}`;
      const actorName = user?.name || 'Assignee';
      db.prepare(`
        INSERT INTO notifications (id, userId, companyId, title, body, taskId, challanId, photoUrl, read, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        notifId,
        existing.assignedByUserId,
        existing.companyId,
        'Task Completed',
        `${actorName} completed: "${existing.title}"`,
        existing.id,
        existing.challanId || null,
        photoUrl || existing.photoUrl || null,
        0,
        new Date().toISOString()
      );
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json(task);
  });

  // 10. Notifications
  app.get('/api/notifications', (req, res) => {
    const user = getRequestUser(req);
    let rows: any[];
    if (user && user.role !== 'dev' && user.tenantId) {
      rows = db.prepare(`
        SELECT n.* FROM notifications n
        LEFT JOIN companies c ON n.companyId = c.id
        WHERE c.tenantId = ? OR n.userId = ?
        ORDER BY n.createdAt DESC
      `).all(user.tenantId, user.id) as any[];
    } else {
      rows = db.prepare('SELECT * FROM notifications ORDER BY createdAt DESC').all() as any[];
    }

    const isAdminRole = user && (user.role === 'owner' || user.role === 'admin' || user.role === 'dev');
    if (user && !isAdminRole) {
      // Non-admin staff strictly only ever receive their own notifications
      rows = rows.filter(r => r.userId === user.id);
    } else if (req.query.userId) {
      rows = rows.filter(r => r.userId === req.query.userId);
    }

    if (req.query.companyId && req.query.companyId !== 'all') {
      rows = rows.filter(r => r.companyId === req.query.companyId || r.companyId === 'all');
    }
    res.json(rows.map(r => ({ ...r, read: Boolean(r.read) })));
  });

  app.post('/api/notifications/:id/read', (req, res) => {
    const user = getRequestUser(req);
    const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id) as any;
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    if (notif.companyId && notif.companyId !== 'all' && !canAccessCompany(user, notif.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
    if (user && user.role !== 'dev' && notif.userId !== user.id) {
      return res.status(403).json({ error: 'Forbidden: Cannot mark another user notification as read' });
    }
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/notifications/read-all', (req, res) => {
    const user = getRequestUser(req);
    const isAdminRole = user && (user.role === 'owner' || user.role === 'admin' || user.role === 'dev');
    const targetUserId = isAdminRole && req.body?.userId ? req.body.userId : user?.id;
    if (targetUserId) {
      db.prepare('UPDATE notifications SET read = 1 WHERE userId = ?').run(targetUserId);
    }
    res.json({ success: true });
  });

  // 11. Reminders & Due Date Rules
  app.get('/api/reminders/rules', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'reminders.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing reminders.view permission' });
    }
    let r: any = null;
    if (user && user.role !== 'dev' && user.tenantId) {
      r = db.prepare('SELECT * FROM reminder_rules WHERE tenantId = ?').get(user.tenantId);
      if (!r) {
        return res.json({
          tenantId: user.tenantId,
          enabled: true,
          whatsappEnabled: false,
          defaultDueDays: 30,
          steps: [
            { offsetDays: -3, template: 'due_soon', enabled: true },
            { offsetDays: 0, template: 'due_today', enabled: true },
            { offsetDays: 3, template: 'overdue', enabled: true },
          ],
          quietHours: { from: '20:00', to: '09:00', days: [0] },
          minAmount: 100000,
          stopWhenPaid: true,
        });
      }
    } else {
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
    if (!hasPermission(user, 'reminders.configure')) {
      return res.status(403).json({ error: 'Forbidden: Missing reminders.configure permission' });
    }
    const body = req.body;
    const targetTenantId = user && user.role !== 'dev' && user.tenantId ? user.tenantId : (body.tenantId || user?.tenantId || 'platform');
    const existing = db.prepare('SELECT * FROM reminder_rules WHERE tenantId = ?').get(targetTenantId) as any;

    if (!existing) {
      db.prepare(`
        INSERT INTO reminder_rules (tenantId, enabled, whatsappEnabled, defaultDueDays, steps, quietHours, minAmount, stopWhenPaid)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        targetTenantId,
        body.enabled !== undefined ? (body.enabled ? 1 : 0) : 1,
        body.whatsappEnabled !== undefined ? (body.whatsappEnabled ? 1 : 0) : 0,
        body.defaultDueDays ?? 30,
        JSON.stringify(body.steps || []),
        JSON.stringify(body.quietHours || { from: '20:00', to: '09:00', days: [0] }),
        body.minAmount ?? 100000
      );
    } else {
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
    }

    const updated = db.prepare('SELECT * FROM reminder_rules WHERE tenantId = ?').get(targetTenantId) as any;
    res.json({
      ...updated,
      enabled: Boolean(updated.enabled),
      whatsappEnabled: Boolean(updated.whatsappEnabled ?? 0),
      steps: JSON.parse(updated.steps || '[]'),
      quietHours: JSON.parse(updated.quietHours || '{}'),
      stopWhenPaid: true,
    });
  });

  app.get('/api/reminders/replies', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'reminders.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing reminders.view permission' });
    }
    let rows: any[];
    if (user && user.role !== 'dev' && user.tenantId) {
      rows = db.prepare(`
        SELECT rr.* FROM reminder_replies rr
        JOIN parties p ON rr.partyId = p.id
        WHERE p.tenantId = ?
      `).all(user.tenantId) as any[];
    } else {
      rows = db.prepare('SELECT * FROM reminder_replies').all() as any[];
    }
    res.json(rows.map(r => ({ ...r, messages: JSON.parse(r.messages || '[]') })));
  });

  app.post('/api/reminders/send', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'reminders.send')) {
      return res.status(403).json({ error: 'Forbidden: Missing reminders.send permission' });
    }
    const { partyId, billId, template } = req.body;
    const party = partyId ? (db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId) as any) : null;
    if (party && user && user.role !== 'dev' && user.tenantId && party.tenantId && party.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cannot send reminder for another organization' });
    }
    const messageId = `msg-${Date.now()}`;
    const companyId = party?.companyId || 'c1';
    db.prepare(`
      INSERT INTO reminder_messages (id, companyId, partyId, billId, template, sentAt, status, failureReason)
      VALUES (?, ?, ?, ?, ?, ?, 'sent', NULL)
    `).run(messageId, companyId, partyId || 'unknown', billId || null, template || 'overdue', new Date().toISOString());

    res.json({ success: true, messageId });
  });

  app.get('/api/reminders/messages', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'reminders.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing reminders.view permission' });
    }
    let query = 'SELECT * FROM reminder_messages WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
    }
    query += ' ORDER BY sentAt DESC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  app.post('/api/reminders/replies/:threadId/messages', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'reminders.send')) {
      return res.status(403).json({ error: 'Forbidden: Missing reminders.send permission' });
    }
    const thread = db.prepare('SELECT * FROM reminder_replies WHERE id = ?').get(req.params.threadId) as any;
    if (!thread) {
      return res.status(404).json({ error: 'Reply thread not found' });
    }
    if (thread.companyId && !canAccessCompany(user, thread.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
    const messages = JSON.parse(thread.messages || '[]');
    messages.push({
      from: 'us',
      text: req.body.text,
      at: new Date().toISOString(),
    });
    db.prepare('UPDATE reminder_replies SET messages = ?, unread = 0 WHERE id = ?').run(JSON.stringify(messages), req.params.threadId);
    res.json({ success: true });
  });

  // 12. Notebooks (Strictly isolated per user)
  app.get('/api/notebooks', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'notebook.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing notebook.view permission' });
    }
    const ownerUserId = user?.id || 'owner';
    let query = 'SELECT * FROM notebooks WHERE (userId = ? OR (userId IS NULL AND updatedBy = ?))';
    const params: any[] = [ownerUserId, ownerUserId];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
    } else if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(user.tenantId);
    }
    let rows = db.prepare(query).all(...params) as any[];

    if (rows.length === 0) {
      let targetCompanyId = req.query.companyId && req.query.companyId !== 'all' ? (req.query.companyId as string) : '';
      if (!targetCompanyId) {
        if (user && user.tenantId && user.role !== 'dev') {
          const c = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(user.tenantId) as any;
          targetCompanyId = c?.id || '';
        } else {
          const c = db.prepare('SELECT id FROM companies LIMIT 1').get() as any;
          targetCompanyId = c?.id || 'c1';
        }
      }
      const defaultNb = {
        id: `nb-${ownerUserId}-${Date.now()}`,
        companyId: targetCompanyId,
        userId: ownerUserId,
        title: 'Material & Delivery Calculation Notebook',
        columns: JSON.stringify([
          { id: 'c-desc', key: 'desc', title: 'Description', type: 'text' },
          { id: 'c-qty', key: 'qty', title: 'Qty', type: 'number', total: 'sum' },
          { id: 'c-rate', key: 'rate', title: 'Rate (₹)', type: 'number' },
          { id: 'c-total', key: 'total', title: 'Total (₹)', type: 'computed', formula: '{qty} * {rate}', total: 'sum' },
        ]),
        rows: JSON.stringify([
          {
            id: 'r-1',
            cells: {
              desc: { raw: 'Servo Motor 550W (Batch A)', value: 'Servo Motor 550W (Batch A)' },
              qty: { raw: '10*2', value: '20' },
              rate: { raw: '4200', value: '4200' },
              total: { raw: '{qty} * {rate}', value: '84000' },
            },
          },
        ]),
        updatedAt: new Date().toISOString(),
        updatedBy: ownerUserId,
      };
      try {
        db.prepare(
          'INSERT INTO notebooks (id, companyId, userId, title, columns, rows, updatedAt, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          defaultNb.id,
          defaultNb.companyId,
          defaultNb.userId,
          defaultNb.title,
          defaultNb.columns,
          defaultNb.rows,
          defaultNb.updatedAt,
          defaultNb.updatedBy
        );
        rows = [defaultNb];
      } catch {}
    }

    res.json(
      rows.map(r => ({
        ...r,
        userId: r.userId || r.updatedBy,
        columns: JSON.parse(r.columns || '[]'),
        rows: JSON.parse(r.rows || '[]'),
      }))
    );
  });

  app.get('/api/notebooks/:id', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'notebook.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing notebook.view permission' });
    }
    const ownerUserId = user?.id || 'owner';
    const r = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(req.params.id) as any;
    if (!r) {
      return res.status(404).json({ error: 'Notebook not found' });
    }
    if (r.companyId && !canAccessCompany(user, r.companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access denied' });
    }
    const recordOwnerId = r.userId || r.updatedBy;
    if (user && recordOwnerId && recordOwnerId !== user.id) {
      return res.status(403).json({ error: "Forbidden: Cannot access another user's private notebook" });
    }
    res.json({
      ...r,
      userId: recordOwnerId || ownerUserId,
      columns: JSON.parse(r.columns || '[]'),
      rows: JSON.parse(r.rows || '[]'),
    });
  });

  // 12b. Outbox
  app.get('/api/outbox', (req, res) => {
    const user = getRequestUser(req);
    let query = 'SELECT * FROM outbox_items WHERE 1=1';
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

  // 12c. Single Notebook Endpoint (Isolated per user)
  app.get('/api/notebook', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'notebook.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing notebook.view permission' });
    }
    const ownerUserId = user?.id || 'owner';
    let r = db
      .prepare('SELECT * FROM notebooks WHERE (userId = ? OR (userId IS NULL AND updatedBy = ?)) ORDER BY updatedAt DESC LIMIT 1')
      .get(ownerUserId, ownerUserId) as any;
    if (!r) {
      let targetCompanyId = '';
      if (user && user.tenantId && user.role !== 'dev') {
        const c = db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(user.tenantId) as any;
        targetCompanyId = c?.id || '';
      } else {
        const c = db.prepare('SELECT id FROM companies LIMIT 1').get() as any;
        targetCompanyId = c?.id || 'c1';
      }
      r = {
        id: `nb-${ownerUserId}-${Date.now()}`,
        companyId: targetCompanyId,
        userId: ownerUserId,
        title: 'Material & Delivery Calculation Notebook',
        columns: JSON.stringify([
          { id: 'c-desc', key: 'desc', title: 'Description', type: 'text' },
          { id: 'c-qty', key: 'qty', title: 'Qty', type: 'number', total: 'sum' },
          { id: 'c-rate', key: 'rate', title: 'Rate (₹)', type: 'number' },
          { id: 'c-total', key: 'total', title: 'Total (₹)', type: 'computed', formula: '{qty} * {rate}', total: 'sum' },
        ]),
        rows: JSON.stringify([
          {
            id: 'r-1',
            cells: {
              desc: { raw: 'Servo Motor 550W (Batch A)', value: 'Servo Motor 550W (Batch A)' },
              qty: { raw: '10*2', value: '20' },
              rate: { raw: '4200', value: '4200' },
              total: { raw: '{qty} * {rate}', value: '84000' },
            },
          },
        ]),
        updatedAt: new Date().toISOString(),
        updatedBy: ownerUserId,
      };
      try {
        db.prepare(
          'INSERT INTO notebooks (id, companyId, userId, title, columns, rows, updatedAt, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(r.id, r.companyId, r.userId, r.title, r.columns, r.rows, r.updatedAt, r.updatedBy);
      } catch {}
    }
    res.json({
      ...r,
      userId: r.userId || r.updatedBy,
      columns: JSON.parse(r.columns || '[]'),
      rows: JSON.parse(r.rows || '[]'),
    });
  });

  app.put('/api/notebook', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'notebook.edit')) {
      return res.status(403).json({ error: 'Forbidden: Missing notebook.edit permission' });
    }
    const nb = req.body;
    const ownerUserId = user?.id || nb.userId || nb.updatedBy || 'staff';
    const existing = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(nb.id) as any;
    if (existing) {
      if (existing.companyId && !canAccessCompany(user, existing.companyId)) {
        return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
      }
      const existingOwner = existing.userId || existing.updatedBy;
      if (user && existingOwner && existingOwner !== user.id) {
        return res.status(403).json({ error: "Forbidden: Cannot modify another user's private notebook" });
      }
    }
    const defaultComp = user?.tenantId
      ? (db.prepare('SELECT id FROM companies WHERE tenantId = ? LIMIT 1').get(user.tenantId) as any)
      : null;
    const companyId = existing?.companyId || nb.companyId || defaultComp?.id || 'c1';
    if (!canAccessCompany(user, companyId)) {
      return res.status(403).json({ error: 'Forbidden: Cannot save notebook to another organization' });
    }

    const savedId = nb.id || `nb-${ownerUserId}-${Date.now()}`;
    const updatedAt = new Date().toISOString();
    const savedNb = {
      id: savedId,
      companyId,
      userId: ownerUserId,
      title: nb.title || 'Untitled Notebook',
      columns: nb.columns || [],
      rows: nb.rows || [],
      updatedAt,
      updatedBy: ownerUserId,
    };

    db.prepare(`
      INSERT INTO notebooks (id, companyId, userId, title, columns, rows, updatedAt, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        columns = excluded.columns,
        rows = excluded.rows,
        updatedAt = excluded.updatedAt,
        updatedBy = excluded.updatedBy,
        userId = COALESCE(notebooks.userId, excluded.userId)
    `).run(
      savedNb.id,
      savedNb.companyId,
      savedNb.userId,
      savedNb.title,
      JSON.stringify(savedNb.columns),
      JSON.stringify(savedNb.rows),
      savedNb.updatedAt,
      savedNb.updatedBy
    );
    res.json(savedNb);
  });

  // 13. Activities
  app.get('/api/activity', (req, res) => {
    const user = getRequestUser(req);
    if (!hasPermission(user, 'activity.view')) {
      return res.status(403).json({ error: 'Forbidden: Missing activity.view permission' });
    }
    let query = 'SELECT * FROM activities WHERE 1=1';
    const params: any[] = [];
    if (user && user.role !== 'dev' && user.tenantId) {
      query += ' AND tenantId = ?';
      params.push(user.tenantId);
    }
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND (companyId IS NULL OR companyId = ?)';
      params.push(req.query.companyId);
    }
    query += ' ORDER BY at DESC';
    const rows = db.prepare(query).all(...params);
    const total = rows.length;
    res.setHeader('X-Total-Count', total.toString());
    const limit = req.query.limit !== undefined ? Math.max(1, parseInt(req.query.limit as string, 10) || 50) : undefined;
    const offset = req.query.offset !== undefined ? Math.max(0, parseInt(req.query.offset as string, 10) || 0) : 0;
    const paged = limit !== undefined ? rows.slice(offset, offset + limit) : rows;
    const hasMore = offset + paged.length < total;
    res.setHeader('X-Has-More', String(hasMore));
    if (req.query.format === 'paginated') {
      return res.json({ items: paged, total, limit: limit ?? total, offset, hasMore });
    }
    res.json(paged);
  });

  // 14. Users / Staff
  app.get('/api/users', (req, res) => {
    const user = getRequestUser(req);
    let rows: any[];
    if (user && user.role !== 'dev') {
      if (req.query.tenantId && req.query.tenantId !== user.tenantId) {
        return res.status(403).json({ error: 'Forbidden: Cannot list users of another organization' });
      }
      rows = db.prepare('SELECT * FROM users WHERE tenantId = ?').all(user.tenantId) as any[];
    } else if (req.query.tenantId) {
      rows = db.prepare('SELECT * FROM users WHERE tenantId = ?').all(req.query.tenantId) as any[];
    } else {
      rows = db.prepare('SELECT * FROM users').all() as any[];
    }
    res.json(
      rows.map(r => {
        const { pin: _pin, ...safeUser } = r;
        return {
          ...safeUser,
          customRoleName: r.customRoleName || undefined,
          customPermissions: r.customPermissions ? JSON.parse(r.customPermissions) : undefined,
          companyIds: safeParseCompanyIds(r.companyIds),
          active: Boolean(r.active),
        };
      })
    );
  });

  function sanitizeCustomPermissions(perms: any, callerUser: any): string | null {
    if (!Array.isArray(perms)) return null;
    const allowed = perms.filter((p: any) => {
      if (typeof p !== 'string') return false;
      // clients.manage is strictly for dev super-admin
      if (p === 'clients.manage' && callerUser.role !== 'dev') return false;
      // Administrative permissions (users.manage, settings.manage) can only be granted by owner or dev
      if ((p === 'users.manage' || p === 'settings.manage') && callerUser.role !== 'owner' && callerUser.role !== 'dev') {
        return false;
      }
      return (PERMISSION_KEYS as readonly string[]).includes(p);
    });
    return allowed.length > 0 ? JSON.stringify(allowed) : null;
  }

  app.patch('/api/users/:id/role', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden: Admin, Owner, or Dev role required to update roles' });
    }
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'dev' && target.tenantId !== user.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification denied' });
    }
    // Prevent privilege escalation: Admin cannot change role of owner/admin or self, or promote to owner/dev
    if (
      user.role === 'admin' &&
      (target.role === 'owner' || target.role === 'admin' || req.body.role === 'owner' || req.body.role === 'admin' || req.body.role === 'dev' || target.id === user.id)
    ) {
      return res.status(403).json({ error: 'Forbidden: Admins cannot promote or alter owner/admin accounts' });
    }
    if (user.role !== 'dev' && req.body.role === 'dev') {
      return res.status(403).json({ error: 'Forbidden: Only Dev super admin can grant dev role' });
    }
    const allowedRoles = ['owner', 'admin', 'accounts', 'sales', 'stock_keeper', 'viewer'];
    if (user.role === 'dev') allowedRoles.push('dev');
    if (!allowedRoles.includes(req.body.role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
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
    if (user.role === 'admin' && (target.role === 'owner' || target.role === 'admin' || req.body.role === 'owner' || req.body.role === 'admin')) {
      return res.status(403).json({ error: 'Forbidden: Admin cannot modify or promote owner/admin accounts' });
    }
    if (user.role !== 'dev' && req.body.role === 'dev') {
      return res.status(403).json({ error: 'Forbidden: Only Dev super admin can assign dev role' });
    }

    const body = req.body;
    const updatedRole = body.role ?? target.role;
    const updatedCustomRoleName =
      body.customRoleName !== undefined ? (body.customRoleName ? String(body.customRoleName).trim() : null) : target.customRoleName;
    const updatedCustomPerms =
      body.customPermissions !== undefined ? sanitizeCustomPermissions(body.customPermissions, user) : target.customPermissions;
    const updatedName = body.name ?? target.name;
    const updatedPhone = body.phone !== undefined ? String(body.phone).trim() : target.phone;
    const updatedCompanyIds = body.companyIds !== undefined ? JSON.stringify(body.companyIds) : target.companyIds;
    const updatedActive = body.active !== undefined ? (body.active ? 1 : 0) : target.active;
    const updatedPin = body.pin ? hashPin(String(body.pin)) : target.pin;

    db.prepare(`
      UPDATE users
      SET name = ?, phone = ?, role = ?, customRoleName = ?, customPermissions = ?, companyIds = ?, active = ?, pin = ?
      WHERE id = ?
    `).run(updatedName, updatedPhone, updatedRole, updatedCustomRoleName, updatedCustomPerms, updatedCompanyIds, updatedActive, updatedPin, req.params.id);

    if (updatedActive === 0) {
      db.prepare('DELETE FROM auth_tokens WHERE userId = ?').run(req.params.id);
    }

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
    if (user.role !== 'dev' && body.role === 'dev') {
      return res.status(403).json({ error: 'Forbidden: Only Dev super admin can assign dev role' });
    }
    if (user.role === 'admin' && (body.role === 'owner' || body.role === 'admin')) {
      return res.status(403).json({ error: 'Forbidden: Admin cannot create owner or admin accounts' });
    }
    const id = body.id || `u-${Date.now()}`;
    const tenantId = user && user.role !== 'dev' && user.tenantId ? user.tenantId : (body.tenantId || user?.tenantId || 'platform');
    const rawPin = body.pin || (body.role === 'dev' ? '0000' : '1234');
    const pin = hashPin(rawPin);
    const customRoleName = body.customRoleName ? String(body.customRoleName).trim() : null;
    const customPermissions = sanitizeCustomPermissions(body.customPermissions, user);

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
    const user = getRequestUser(req);
    res.json(getTenantPermissionsMatrix(user?.tenantId));
  });

  app.put('/api/permissions', (req, res) => {
    const user = getRequestUser(req);
    if (!user || (user.role !== 'owner' && user.role !== 'dev')) {
      return res.status(403).json({ error: 'Forbidden: Owner or Dev role required to alter permission matrices' });
    }
    const perms = req.body;
    // Strip clients.manage for non-dev callers to prevent platform privilege escalation
    if (user.role !== 'dev' && typeof perms === 'object' && perms !== null) {
      for (const r of Object.keys(perms)) {
        if (perms[r] && typeof perms[r] === 'object') {
          perms[r]['clients.manage'] = false;
        }
      }
    }
    const tenantKey = user.tenantId ? `custom_permissions_${user.tenantId}` : 'custom_permissions';
    db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(tenantKey, JSON.stringify(perms));
    res.json(perms);
  });

  // 15. Tally Sync Endpoints (Agent Integration)
  app.get('/api/sync/info', (req, res) => {
    const user = getRequestUser(req);
    const agentAuth = resolveAgentAuth(req, user);
    const companyId = req.query.companyId as string | undefined;
    const scopedTenantId = (user && user.role !== 'dev' ? user.tenantId : undefined) || (!agentAuth.isGlobal ? agentAuth.tenantId : undefined);
    let companies: any[];
    if (companyId) {
      companies = db.prepare('SELECT id, tenantId, name, tallyName, lastSyncedAt, agentStatus FROM companies WHERE id = ?').all(companyId);
      if (scopedTenantId) {
        companies = companies.filter((c: any) => c.tenantId === scopedTenantId);
      }
    } else if (scopedTenantId) {
      companies = db.prepare('SELECT id, tenantId, name, tallyName, lastSyncedAt, agentStatus FROM companies WHERE tenantId = ?').all(scopedTenantId);
    } else {
      companies = db.prepare('SELECT id, tenantId, name, tallyName, lastSyncedAt, agentStatus FROM companies').all();
    }
    res.json({
      companies,
      serverTime: new Date().toISOString(),
    });
  });

  app.post('/api/sync/push', (req, res) => {
    const user = getRequestUser(req);
    const agentAuth = resolveAgentAuth(req, user);
    const { companyId, alterId, parties, bills, stockItems } = req.body;
    const now = new Date().toISOString();
    if (!companyId) {
      return res.status(400).json({ error: 'Missing companyId: Tally agent must connect to a specific company/organization' });
    }
    const compRow = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId) as any;
    if (!compRow) {
      return res.status(404).json({ error: `Company ${companyId} not found` });
    }
    if (!agentAuth.isGlobal && agentAuth.tenantId && compRow.tenantId && compRow.tenantId !== agentAuth.tenantId) {
      return res.status(403).json({ error: 'Forbidden: Agent key is not authorized for this company' });
    }
    const resolvedCompanyId = compRow.id;
    const defaultTenantId = compRow.tenantId || user?.tenantId || agentAuth.tenantId || 'platform';

    let partiesUpdated = 0;
    let billsUpdated = 0;
    let stockUpdated = 0;

    if (Array.isArray(parties)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO parties (id, tenantId, companyId, name, city, phones, gstin, creditDays, collectorId, remindersPaused, notes, promiseToPay)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of parties) {
        const existing = db.prepare('SELECT tenantId, companyId, collectorId, remindersPaused, promiseToPay FROM parties WHERE id = ?').get(p.id) as any;
        const safePartyId =
          existing && existing.tenantId && existing.tenantId !== defaultTenantId
            ? `${resolvedCompanyId}_${p.id}`
            : p.id;
        stmt.run(
          safePartyId,
          defaultTenantId,
          resolvedCompanyId,
          p.name,
          p.city || '',
          JSON.stringify(p.phones || []),
          p.gstin || null,
          p.creditDays || 30,
          existing?.collectorId ?? null,
          existing?.remindersPaused ?? 0,
          p.notes || '',
          existing?.promiseToPay ?? null
        );
        partiesUpdated++;
      }
    }

    if (Array.isArray(bills)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO bills (id, companyId, partyId, billNo, date, dueDate, dueDays, amount, pending, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const activeSyncedBillIds: string[] = [];
      for (const b of bills) {
        const existingBill = db.prepare('SELECT companyId FROM bills WHERE id = ?').get(b.id) as any;
        const safeBillId =
          existingBill && existingBill.companyId && existingBill.companyId !== resolvedCompanyId
            ? `${resolvedCompanyId}_${b.id}`
            : b.id;
        stmt.run(safeBillId, resolvedCompanyId, b.partyId, b.billNo, b.date, b.dueDate, b.dueDays || 30, b.amount, b.pending, b.source || 'tally_bill');
        activeSyncedBillIds.push(safeBillId);
        billsUpdated++;
      }

      // Reconcile settled/paid bills when a full Tally bill snapshot is pushed
      if (req.body.reconcilePaidBills) {
        if (activeSyncedBillIds.length > 0) {
          const placeholders = activeSyncedBillIds.map(() => '?').join(',');
          db.prepare(
            `UPDATE bills SET pending = 0 WHERE companyId = ? AND source = 'tally_bill' AND pending > 0 AND id NOT IN (${placeholders})`
          ).run(resolvedCompanyId, ...activeSyncedBillIds);
        } else {
          db.prepare(
            `UPDATE bills SET pending = 0 WHERE companyId = ? AND source = 'tally_bill' AND pending > 0`
          ).run(resolvedCompanyId);
        }
      }
    }

    if (Array.isArray(stockItems)) {
      const stmt = db.prepare(`
        INSERT INTO stock_items (id, companyId, name, partNo, unit, itemGroup, rate, reorderLevel, alias)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          companyId = excluded.companyId,
          name = excluded.name,
          partNo = COALESCE(excluded.partNo, stock_items.partNo),
          unit = COALESCE(excluded.unit, stock_items.unit),
          itemGroup = COALESCE(excluded.itemGroup, stock_items.itemGroup),
          rate = CASE WHEN excluded.rate > 0 THEN excluded.rate ELSE stock_items.rate END,
          reorderLevel = CASE WHEN excluded.reorderLevel > 0 THEN excluded.reorderLevel ELSE stock_items.reorderLevel END,
          alias = COALESCE(excluded.alias, stock_items.alias)
      `);
      for (const s of stockItems) {
        const existingItem = db.prepare('SELECT companyId FROM stock_items WHERE id = ?').get(s.id) as any;
        const safeItemId =
          existingItem && existingItem.companyId && existingItem.companyId !== resolvedCompanyId
            ? `${resolvedCompanyId}_${s.id}`
            : s.id;
        stmt.run(safeItemId, resolvedCompanyId, s.name, s.partNo || null, s.unit || 'pcs', s.group || 'General', s.rate || 0, s.reorderLevel || 0, s.alias || null);
        if (s.closingQty !== undefined) {
          const defaultGodown = db.prepare('SELECT id FROM godowns WHERE companyId = ? LIMIT 1').get(resolvedCompanyId) as any;
          const godownId = defaultGodown?.id || `g-${resolvedCompanyId}-main`;
          db.prepare(`
            INSERT INTO stock_balances (itemId, godownId, qty)
            VALUES (?, ?, ?)
            ON CONFLICT(itemId, godownId) DO UPDATE SET qty = ?
          `).run(safeItemId, godownId, s.closingQty, s.closingQty);
        }
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
    if (defaultTenantId) {
      db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(`lastSeenAt_${defaultTenantId}`, now);
      db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(`status_${defaultTenantId}`, 'online');
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
    // Return pending queued challans and stock_journal adjustments waiting to be written to Tally XML
    const user = getRequestUser(req);
    const agentAuth = resolveAgentAuth(req, user);
    const companyId = req.query.companyId as string | undefined;
    const scopedTenantId = (user && user.role !== 'dev' ? user.tenantId : undefined) || (!agentAuth.isGlobal ? agentAuth.tenantId : undefined);
    let challanQuery = "SELECT * FROM challans WHERE status = 'queued'";
    let outboxQuery = "SELECT * FROM outbox_items WHERE status = 'queued' AND kind = 'stock_journal'";
    const params: any[] = [];
    if (companyId && companyId !== 'all') {
      challanQuery += ' AND companyId = ?';
      outboxQuery += ' AND companyId = ?';
      params.push(companyId);
    } else if (scopedTenantId) {
      challanQuery += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      outboxQuery += ' AND companyId IN (SELECT id FROM companies WHERE tenantId = ?)';
      params.push(scopedTenantId);
    }
    const challanRows = db.prepare(challanQuery).all(...params) as any[];
    const partyRows = db.prepare('SELECT id, name FROM parties').all() as Array<{ id: string; name: string }>;
    const godownRows = db.prepare('SELECT id, name FROM godowns').all() as Array<{ id: string; name: string }>;
    const partyNameMap = new Map(partyRows.map(p => [p.id, p.name]));
    const godownNameMap = new Map(godownRows.map(g => [g.id, g.name]));

    const challanItems = challanRows.map(r => ({
      ...r,
      kind: 'challan',
      partyName: partyNameMap.get(r.partyId) || r.partyId,
      godownName: r.godownId ? godownNameMap.get(r.godownId) : undefined,
      lines: JSON.parse(r.lines || '[]'),
    }));

    let stockJournalItems: any[] = [];
    try {
      const outboxRows = db.prepare(outboxQuery).all(...params) as any[];
      stockJournalItems = outboxRows
        .map(o => {
          if (o.payload) {
            try {
              return JSON.parse(o.payload);
            } catch {}
          }
          const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(o.refId) as any;
          return {
            id: o.id,
            outboxId: o.id,
            kind: 'stock_journal',
            refId: o.refId,
            itemName: item?.name || o.refId,
            godownName: 'Main Location',
            deltaQty: 0,
            unit: item?.unit || 'pcs',
            rate: item?.rate || 0,
            date: new Date().toISOString().slice(0, 10),
          };
        });
    } catch {}

    res.json([...challanItems, ...stockJournalItems]);
  });

  app.post('/api/sync/ack', (req, res) => {
    const user = getRequestUser(req);
    const agentAuth = resolveAgentAuth(req, user);
    const { challanId, outboxId, kind, status, failureReason } = req.body;
    const targetId = challanId || outboxId;
    const existing = targetId ? (db.prepare('SELECT * FROM challans WHERE id = ?').get(targetId) as any) : null;
    if (existing && !agentAuth.isGlobal && agentAuth.tenantId && existing.companyId) {
      const comp = db.prepare('SELECT tenantId FROM companies WHERE id = ?').get(existing.companyId) as any;
      if (comp && comp.tenantId && comp.tenantId !== agentAuth.tenantId) {
        return res.status(403).json({ error: 'Forbidden: Agent key cannot acknowledge challan of another organization' });
      }
    }
    const existingOutbox = (outboxId || targetId)
      ? (db.prepare('SELECT * FROM outbox_items WHERE id = ? OR refId = ?').get(outboxId || targetId, targetId) as any)
      : null;
    if (existingOutbox && !agentAuth.isGlobal && agentAuth.tenantId && existingOutbox.companyId) {
      const comp = db.prepare('SELECT tenantId FROM companies WHERE id = ?').get(existingOutbox.companyId) as any;
      if (comp && comp.tenantId && comp.tenantId !== agentAuth.tenantId) {
        return res.status(403).json({ error: 'Forbidden: Agent key cannot acknowledge outbox item of another organization' });
      }
    }
    const nextStatus = status || 'synced';
    if (kind !== 'stock_journal' && challanId) {
      db.prepare('UPDATE challans SET status = ?, failureReason = ? WHERE id = ?').run(
        nextStatus,
        failureReason || null,
        challanId
      );
    }
    db.prepare('UPDATE outbox_items SET status = ?, lastError = ? WHERE id = ? OR refId = ?').run(
      nextStatus,
      failureReason || null,
      outboxId || targetId,
      targetId
    );
    res.json({ success: true, challanId: targetId, outboxId: outboxId || targetId, status: nextStatus });
  });

  // 17. Database Backups
  app.get('/api/backup/json', (req, res) => {
    const user = getRequestUser(req);
    const tables = [
      'companies',
      'users',
      'parties',
      'bills',
      'ledger_lines',
      'godowns',
      'stock_items',
      'stock_balances',
      'challans',
      'outbox_items',
      'tasks',
      'notebooks',
      'reminder_rules',
      'reminder_messages',
      'reminder_replies',
      'activities',
    ];
    const backup: Record<string, any[]> = {};
    for (const table of tables) {
      try {
        if (!user || user.role === 'dev') {
          const rows = db.prepare(`SELECT * FROM ${table}`).all() as any[];
          backup[table] = table === 'users' ? rows.map(({ pin: _p, ...u }) => u) : rows;
        } else {
          // Tenant-scoped backup export
          const tenantId = user.tenantId;
          if (['companies', 'users', 'parties', 'reminder_rules', 'activities'].includes(table)) {
            const rows = db.prepare(`SELECT * FROM ${table} WHERE tenantId = ?`).all(tenantId) as any[];
            backup[table] = table === 'users' ? rows.map(({ pin: _p, ...u }) => u) : rows;
          } else if (['bills', 'ledger_lines', 'godowns', 'stock_items', 'challans', 'outbox_items', 'tasks', 'notebooks', 'reminder_messages'].includes(table)) {
            backup[table] = db.prepare(`SELECT * FROM ${table} WHERE companyId IN (SELECT id FROM companies WHERE tenantId = ?)`).all(tenantId);
          } else if (table === 'stock_balances') {
            backup[table] = db.prepare(`SELECT * FROM stock_balances WHERE itemId IN (SELECT id FROM stock_items WHERE companyId IN (SELECT id FROM companies WHERE tenantId = ?))`).all(tenantId);
          } else if (table === 'reminder_replies') {
            backup[table] = db.prepare(`SELECT rr.* FROM reminder_replies rr JOIN parties p ON rr.partyId = p.id WHERE p.tenantId = ?`).all(tenantId);
          } else {
            backup[table] = [];
          }
        }
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
    const user = getRequestUser(req);
    if (!user || user.role !== 'dev') {
      return res.status(403).json({ error: 'Forbidden: Only Dev super admin can download full multi-tenant SQLite database' });
    }
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
          try {
            fs.unlinkSync(path.join(backupDir, f.name));
          } catch {}
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
    if (!user || user.role !== 'dev') {
      return res.status(403).json({ error: 'Forbidden: Only Dev super admin can download raw multi-tenant snapshot files' });
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
