import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
import {
  FIXED_TODAY,
  INITIAL_TENANTS,
  INITIAL_COMPANIES,
  INITIAL_AGENT,
  INITIAL_USERS,
  INITIAL_PARTIES,
  INITIAL_BILLS,
  INITIAL_GODOWNS,
  INITIAL_STOCK,
  INITIAL_BALANCES,
  INITIAL_RULES,
  INITIAL_REPLY_THREADS,
  INITIAL_CHALLANS,
  INITIAL_NOTEBOOKS,
  INITIAL_ACTIVITIES,
  INITIAL_TASKS,
  INITIAL_NOTIFICATIONS,
  INITIAL_LEDGER_SAMPLE,
  Tenant,
  Company,
  User,
  Party,
  Bill,
  Godown,
  StockItem,
  StockBalance,
  Challan,
  Task,
  Notification,
  ReminderRule,
  ReplyThread,
  Notebook,
  ActivityEvent,
  Agent,
} from '@saas/shared';

export interface Database {
  exec(sql: string): void;
  prepare(sql: string): any;
  close(): void;
}

function hashDefaultPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(pin, salt, 32);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

let dbInstance: any = null;

export function getDB(): any {
  if (!dbInstance) {
    dbInstance = initDatabase();
  }
  return dbInstance;
}

export function pruneDatabaseTelemetry(db: any) {
  try {
    const nowIso = new Date().toISOString();
    // 1. Prune expired auth tokens
    db.prepare('DELETE FROM auth_tokens WHERE expiresAt < ?').run(nowIso);

    // 2. Prune expired pairing codes in agent_state
    const pairingRows = db.prepare("SELECT key, value FROM agent_state WHERE key LIKE 'pairing_%'").all() as Array<{ key: string; value: string }>;
    for (const r of pairingRows) {
      try {
        const parsed = JSON.parse(r.value);
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
          db.prepare('DELETE FROM agent_state WHERE key = ?').run(r.key);
        }
      } catch {}
    }

    // 3. Keep only latest 500 sync_batches rows per company to prevent cross-tenant telemetry eviction
    db.prepare(`
      DELETE FROM sync_batches
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY IFNULL(companyId, '') ORDER BY id DESC) AS rn
          FROM sync_batches
        )
        WHERE rn > 500
      )
    `).run();

    // 4. Prune orphaned stock balances where godown branch does not match item company
    db.prepare(`
      DELETE FROM stock_balances
      WHERE rowid IN (
        SELECT b.rowid
        FROM stock_balances b
        JOIN godowns g ON b.godownId = g.id
        JOIN stock_items s ON b.itemId = s.id
        WHERE g.companyId != s.companyId
      )
    `).run();

    // 5. Note: activities (audit trail) are deliberately preserved for compliance and statutory record retention (never pruned)
  } catch {}
}

export function initDatabase(dbPath: string = 'manohar.sqlite'): any {
  const db = new DatabaseSync(dbPath);
  dbInstance = db;

  // SQLite Performance & Concurrency Optimization Pragmas (WAL + Normal sync + 5s busy_timeout)
  if (dbPath !== ':memory:') {
    try {
      db.exec('PRAGMA journal_mode = WAL;');
    } catch {}
  }
  db.exec('PRAGMA synchronous = NORMAL;');
  try {
    db.exec('PRAGMA busy_timeout = 5000;');
  } catch {}

  // 1. Create Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT,
      ownerName TEXT,
      ownerPhone TEXT,
      status TEXT DEFAULT 'active',
      plan TEXT DEFAULT 'pro',
      maxCompanies INTEGER DEFAULT 5,
      maxUsers INTEGER DEFAULT 15,
      trialEndsAt TEXT,
      isDemo INTEGER DEFAULT 0,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      userId TEXT,
      tenantId TEXT,
      role TEXT,
      expiresAt TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      tenantId TEXT,
      name TEXT,
      tallyName TEXT,
      financialYear TEXT,
      gstin TEXT,
      address TEXT,
      phone TEXT,
      lastSyncedAt TEXT,
      agentStatus TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenantId TEXT,
      name TEXT,
      phone TEXT,
      pin TEXT DEFAULT '1234',
      role TEXT,
      customRoleName TEXT,
      customPermissions TEXT,
      companyIds TEXT,
      active INTEGER
    );

    CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY,
      tenantId TEXT,
      companyId TEXT,
      name TEXT,
      city TEXT,
      phones TEXT,
      customPhones TEXT DEFAULT '[]',
      parentGroup TEXT DEFAULT 'Sundry Debtors',
      partyType TEXT DEFAULT 'debtor',
      gstin TEXT,
      creditDays INTEGER,
      collectorId TEXT,
      remindersPaused INTEGER,
      notes TEXT,
      promiseToPay TEXT,
      closingBalance INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      partyId TEXT,
      billNo TEXT,
      date TEXT,
      dueDate TEXT,
      dueDays INTEGER,
      amount INTEGER,
      pending INTEGER,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS ledger_lines (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      partyId TEXT,
      date TEXT,
      particulars TEXT,
      voucherType TEXT,
      voucherNo TEXT,
      debit INTEGER,
      credit INTEGER
    );

    CREATE TABLE IF NOT EXISTS godowns (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_items (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      name TEXT,
      partNo TEXT,
      unit TEXT,
      itemGroup TEXT,
      rate INTEGER,
      purchaseRate INTEGER DEFAULT 0,
      reorderLevel REAL,
      alias TEXT,
      hsnCode TEXT,
      gstRate REAL DEFAULT 0,
      description TEXT,
      customValues TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS stock_balances (
      itemId TEXT,
      godownId TEXT,
      qty REAL,
      PRIMARY KEY (itemId, godownId)
    );

    CREATE TABLE IF NOT EXISTS challans (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      type TEXT,
      number TEXT,
      date TEXT,
      partyId TEXT,
      godownId TEXT,
      lines TEXT,
      roundOff INTEGER DEFAULT 0,
      vehicleNo TEXT,
      lrNo TEXT,
      transporter TEXT,
      narration TEXT,
      status TEXT,
      failureReason TEXT,
      createdBy TEXT
    );

    CREATE TABLE IF NOT EXISTS outbox_items (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      kind TEXT,
      refId TEXT,
      status TEXT,
      attempts INTEGER DEFAULT 1,
      lastError TEXT,
      payload TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      title TEXT,
      description TEXT,
      assignedToUserId TEXT,
      assignedByUserId TEXT,
      challanId TEXT,
      photoUrl TEXT,
      status TEXT,
      priority TEXT,
      createdAt TEXT,
      completedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT,
      companyId TEXT,
      title TEXT,
      body TEXT,
      taskId TEXT,
      challanId TEXT,
      photoUrl TEXT,
      read INTEGER,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS reminder_rules (
      tenantId TEXT PRIMARY KEY,
      enabled INTEGER,
      whatsappEnabled INTEGER DEFAULT 0,
      defaultDueDays INTEGER,
      steps TEXT,
      quietHours TEXT,
      minAmount INTEGER,
      stopWhenPaid INTEGER
    );

    CREATE TABLE IF NOT EXISTS reminder_messages (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      partyId TEXT,
      billId TEXT,
      template TEXT,
      sentAt TEXT,
      status TEXT,
      failureReason TEXT
    );

    CREATE TABLE IF NOT EXISTS reminder_replies (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      partyId TEXT,
      unread INTEGER,
      lastCustomerMessageAt TEXT,
      messages TEXT
    );

    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      userId TEXT,
      title TEXT,
      content TEXT DEFAULT '',
      tables TEXT DEFAULT '[]',
      columns TEXT,
      rows TEXT,
      updatedAt TEXT,
      updatedBy TEXT
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      tenantId TEXT,
      companyId TEXT,
      actorId TEXT,
      action TEXT,
      target TEXT,
      at TEXT,
      device TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT,
      syncedAt TEXT,
      alterId INTEGER,
      vouchersCount INTEGER,
      ledgersCount INTEGER,
      stockCount INTEGER
    );
  `);

  try {
    db.prepare('ALTER TABLE notebooks ADD COLUMN userId TEXT').run();
  } catch {}
  try {
    db.prepare("ALTER TABLE notebooks ADD COLUMN content TEXT DEFAULT ''").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE notebooks ADD COLUMN tables TEXT DEFAULT '[]'").run();
  } catch {}

  try {
    db.prepare('ALTER TABLE outbox_items ADD COLUMN payload TEXT').run();
  } catch {}

  try {
    db.prepare('ALTER TABLE reminder_rules ADD COLUMN whatsappEnabled INTEGER DEFAULT 0').run();
  } catch {}

  try {
    db.prepare("ALTER TABLE users ADD COLUMN pin TEXT DEFAULT '1234'").run();
  } catch {}

  try {
    db.prepare('ALTER TABLE users ADD COLUMN customRoleName TEXT').run();
  } catch {}

  try {
    db.prepare('ALTER TABLE users ADD COLUMN customPermissions TEXT').run();
  } catch {}

  try {
    db.prepare('ALTER TABLE companies ADD COLUMN address TEXT').run();
  } catch {}

  try {
    db.prepare('ALTER TABLE companies ADD COLUMN phone TEXT').run();
  } catch {}

  try {
    db.prepare('ALTER TABLE stock_items ADD COLUMN purchaseRate INTEGER DEFAULT 0').run();
  } catch {}

  try {
    db.prepare('ALTER TABLE stock_items ADD COLUMN hsnCode TEXT').run();
  } catch {}

  try {
    db.prepare('ALTER TABLE stock_items ADD COLUMN gstRate REAL DEFAULT 0').run();
  } catch {}

  try {
    db.prepare('ALTER TABLE stock_items ADD COLUMN description TEXT').run();
  } catch {}

  try {
    db.prepare("ALTER TABLE stock_items ADD COLUMN customValues TEXT DEFAULT '{}'").run();
  } catch {}

  try {
    db.prepare("ALTER TABLE tenants ADD COLUMN plan TEXT DEFAULT 'pro'").run();
  } catch {}
  try {
    db.prepare('ALTER TABLE tenants ADD COLUMN maxCompanies INTEGER DEFAULT 5').run();
  } catch {}
  try {
    db.prepare('ALTER TABLE tenants ADD COLUMN maxUsers INTEGER DEFAULT 15').run();
  } catch {}
  try {
    db.prepare('ALTER TABLE tenants ADD COLUMN trialEndsAt TEXT').run();
  } catch {}
  try {
    db.prepare('ALTER TABLE tenants ADD COLUMN isDemo INTEGER DEFAULT 0').run();
  } catch {}
  try {
    db.prepare('ALTER TABLE parties ADD COLUMN closingBalance INTEGER DEFAULT 0').run();
  } catch {}
  try {
    db.prepare("ALTER TABLE parties ADD COLUMN customPhones TEXT DEFAULT '[]'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE parties ADD COLUMN parentGroup TEXT DEFAULT 'Sundry Debtors'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE parties ADD COLUMN partyType TEXT DEFAULT 'debtor'").run();
  } catch {}
  try {
    db.prepare('ALTER TABLE challans ADD COLUMN roundOff INTEGER DEFAULT 0').run();
  } catch {}

  // 2. Create Indexes safely after column migrations
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bills_company ON bills (companyId);
      CREATE INDEX IF NOT EXISTS idx_bills_date ON bills (date);
      CREATE INDEX IF NOT EXISTS idx_bills_party ON bills (partyId);
      CREATE INDEX IF NOT EXISTS idx_bills_comp_party_bill ON bills (companyId, partyId, billNo);
      CREATE INDEX IF NOT EXISTS idx_ledger_party ON ledger_lines (partyId);
      CREATE INDEX IF NOT EXISTS idx_parties_company ON parties (companyId);
      CREATE INDEX IF NOT EXISTS idx_parties_tenant ON parties (tenantId);
      CREATE INDEX IF NOT EXISTS idx_stock_company ON stock_items (companyId);
      CREATE INDEX IF NOT EXISTS idx_challans_company ON challans (companyId);
      CREATE INDEX IF NOT EXISTS idx_challans_date ON challans (date);
      CREATE INDEX IF NOT EXISTS idx_challans_party ON challans (partyId);
      CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks (companyId);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (userId);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenantId);
      CREATE INDEX IF NOT EXISTS idx_notebooks_user ON notebooks (userId);
      CREATE INDEX IF NOT EXISTS idx_notebooks_user_comp ON notebooks (userId, companyId);
      CREATE INDEX IF NOT EXISTS idx_sync_batches_company ON sync_batches (companyId, syncedAt);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens (expiresAt);
    `);
  } catch {}

  // Prune expired tokens, pairing codes, and unbounded sync_batches telemetry
  pruneDatabaseTelemetry(db);
  if (dbPath !== ':memory:') {
    setInterval(() => {
      try {
        pruneDatabaseTelemetry(db);
      } catch {}
    }, 6 * 60 * 60 * 1000).unref();
  }

  // Ensure dev user and platform tenant exist in database (with scrypt-hashed PIN)
  try {
    const insTenant = db.prepare(`
      INSERT OR IGNORE INTO tenants (id, name, ownerName, ownerPhone, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insTenant.run('platform', 'Platform Management', 'Dev Admin', '+91 99999 00000', 'active', '2026-04-01T00:00:00Z');

    const devPin = process.env.DEV_ADMIN_PIN || '0000';
    db.prepare(`
      INSERT OR IGNORE INTO users (id, tenantId, name, phone, pin, role, companyIds, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('u-dev', 'platform', 'Dev Admin', '+91 99999 00000', hashDefaultPin(devPin), 'dev', 'all', 1);
  } catch {}

  // 2. In automated test environment, populate test fixtures if empty
  if (process.env.NODE_ENV === 'test') {
    const count = db.prepare('SELECT count(*) as cnt FROM companies').get() as { cnt: number };
    if (count.cnt === 0) {
      seedDatabase(db);
    }
  }

  return db;
}

export function seedDatabase(db: any) {
  // Tenants
  const insertTenant = db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name, ownerName, ownerPhone, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const t of INITIAL_TENANTS) {
    insertTenant.run(t.id, t.name, t.ownerName, t.ownerPhone, t.status, t.createdAt);
  }

  // Companies
  const insertCompany = db.prepare(`
    INSERT OR IGNORE INTO companies (id, tenantId, name, tallyName, financialYear, gstin, address, phone, lastSyncedAt, agentStatus)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of INITIAL_COMPANIES) {
    insertCompany.run(
      c.id,
      c.tenantId,
      c.name,
      c.tallyName,
      c.financialYear,
      c.gstin || null,
      c.address || null,
      c.phone || null,
      c.lastSyncedAt,
      c.agentStatus
    );
  }

  // Users (hash seeded PINs with scrypt on insert)
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, tenantId, name, phone, pin, role, companyIds, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const u of INITIAL_USERS) {
    const rawPin = u.pin || (u.role === 'dev' ? '0000' : '1234');
    const storedPin = rawPin.startsWith('scrypt:') ? rawPin : hashDefaultPin(rawPin);
    insertUser.run(
      u.id,
      u.tenantId,
      u.name,
      u.phone,
      storedPin,
      u.role,
      JSON.stringify(u.companyIds),
      u.active ? 1 : 0
    );
  }

  // Parties
  const insertParty = db.prepare(`
    INSERT OR IGNORE INTO parties (id, tenantId, companyId, name, city, phones, customPhones, parentGroup, partyType, gstin, creditDays, collectorId, remindersPaused, notes, promiseToPay)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of INITIAL_PARTIES) {
    insertParty.run(
      p.id,
      p.tenantId,
      p.companyId,
      p.name,
      p.city,
      JSON.stringify(p.phones),
      JSON.stringify(p.customPhones || []),
      p.parentGroup || 'Sundry Debtors',
      p.partyType || 'debtor',
      p.gstin || null,
      p.creditDays,
      p.collectorId || null,
      p.remindersPaused ? 1 : 0,
      p.notes,
      p.promiseToPay || null
    );
  }

  // Bills
  const insertBill = db.prepare(`
    INSERT OR IGNORE INTO bills (id, companyId, partyId, billNo, date, dueDate, dueDays, amount, pending, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const b of INITIAL_BILLS) {
    insertBill.run(b.id, b.companyId, b.partyId, b.billNo, b.date, b.dueDate, b.dueDays || 30, b.amount, b.pending, b.source);
  }

  // Ledger Lines (seed sample ledger lines for initial parties)
  const insertLedger = db.prepare(`
    INSERT OR IGNORE INTO ledger_lines (id, companyId, partyId, date, particulars, voucherType, voucherNo, debit, credit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  if (Array.isArray(INITIAL_LEDGER_SAMPLE) && INITIAL_PARTIES.length > 0) {
    const firstParty = INITIAL_PARTIES[0]!;
    INITIAL_LEDGER_SAMPLE.forEach((line, idx) => {
      insertLedger.run(
        `ll-${firstParty.id}-${idx + 1}`,
        firstParty.companyId,
        firstParty.id,
        line.date,
        line.particulars,
        line.voucherType,
        line.voucherNo,
        line.debit,
        line.credit
      );
    });
  }

  // Godowns
  const insertGodown = db.prepare(`
    INSERT OR IGNORE INTO godowns (id, companyId, name)
    VALUES (?, ?, ?)
  `);
  for (const g of INITIAL_GODOWNS) {
    insertGodown.run(g.id, g.companyId, g.name);
  }

  // Stock Items
  const insertStock = db.prepare(`
    INSERT OR IGNORE INTO stock_items (id, companyId, name, partNo, unit, itemGroup, rate, reorderLevel, alias, hsnCode, gstRate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of INITIAL_STOCK) {
    insertStock.run(
      s.id,
      s.companyId,
      s.name,
      s.partNo || null,
      s.unit,
      s.group,
      s.rate,
      s.reorderLevel,
      s.alias || null,
      (s as any).hsnCode || null,
      typeof (s as any).gstRate === 'number' ? (s as any).gstRate : 18
    );
  }

  // Stock Balances
  const insertBalance = db.prepare(`
    INSERT OR IGNORE INTO stock_balances (itemId, godownId, qty)
    VALUES (?, ?, ?)
  `);
  for (const b of INITIAL_BALANCES) {
    insertBalance.run(b.itemId, b.godownId, b.qty);
  }

  // Challans
  const insertChallan = db.prepare(`
    INSERT OR IGNORE INTO challans (id, companyId, type, number, date, partyId, godownId, lines, roundOff, vehicleNo, lrNo, transporter, narration, status, failureReason, createdBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ch of INITIAL_CHALLANS) {
    insertChallan.run(
      ch.id,
      ch.companyId,
      ch.type,
      ch.number,
      ch.date,
      ch.partyId,
      ch.godownId || null,
      JSON.stringify(ch.lines),
      ch.roundOff || 0,
      ch.vehicleNo || null,
      ch.lrNo || null,
      ch.transporter || null,
      ch.narration || null,
      ch.status,
      ch.failureReason || null,
      ch.createdBy
    );
  }

  // Tasks
  const insertTask = db.prepare(`
    INSERT OR IGNORE INTO tasks (id, companyId, title, description, assignedToUserId, assignedByUserId, challanId, photoUrl, status, priority, createdAt, completedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of INITIAL_TASKS) {
    insertTask.run(
      t.id,
      t.companyId,
      t.title,
      t.description || null,
      t.assignedToUserId,
      t.assignedByUserId,
      t.challanId || null,
      t.photoUrl || null,
      t.status,
      t.priority,
      t.createdAt,
      t.completedAt || null
    );
  }

  // Notifications
  const insertNotification = db.prepare(`
    INSERT OR IGNORE INTO notifications (id, userId, companyId, title, body, taskId, challanId, photoUrl, read, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const n of INITIAL_NOTIFICATIONS) {
    insertNotification.run(
      n.id,
      n.userId,
      n.companyId,
      n.title,
      n.body,
      n.taskId || null,
      n.challanId || null,
      n.photoUrl || null,
      n.read ? 1 : 0,
      n.createdAt
    );
  }

  // Reminder Rules
  const insertRules = db.prepare(`
    INSERT OR IGNORE INTO reminder_rules (tenantId, enabled, defaultDueDays, steps, quietHours, minAmount, stopWhenPaid)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertRules.run(
    INITIAL_RULES.tenantId,
    INITIAL_RULES.enabled ? 1 : 0,
    INITIAL_RULES.defaultDueDays || 30,
    JSON.stringify(INITIAL_RULES.steps),
    JSON.stringify(INITIAL_RULES.quietHours),
    INITIAL_RULES.minAmount,
    1
  );

  // Reminder Replies
  const insertReply = db.prepare(`
    INSERT OR IGNORE INTO reminder_replies (id, companyId, partyId, unread, lastCustomerMessageAt, messages)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const r of INITIAL_REPLY_THREADS) {
    insertReply.run(r.id, r.companyId, r.partyId, r.unread, r.lastCustomerMessageAt, JSON.stringify(r.messages));
  }

  // Notebooks
  const insertNotebook = db.prepare(`
    INSERT OR IGNORE INTO notebooks (id, companyId, userId, title, columns, rows, updatedAt, updatedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const nb of INITIAL_NOTEBOOKS) {
    insertNotebook.run(
      nb.id,
      nb.companyId,
      (nb as any).userId || nb.updatedBy || 'u1',
      nb.title,
      JSON.stringify(nb.columns),
      JSON.stringify(nb.rows),
      nb.updatedAt,
      nb.updatedBy
    );
  }

  // Activities
  const insertActivity = db.prepare(`
    INSERT OR IGNORE INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of INITIAL_ACTIVITIES) {
    insertActivity.run(a.id, a.tenantId, a.companyId || null, a.actorId, a.action, a.target, a.at, a.device);
  }

  // Agent State
  const insertAgentState = db.prepare(`
    INSERT OR IGNORE INTO agent_state (key, value)
    VALUES (?, ?)
  `);
  insertAgentState.run('version', INITIAL_AGENT.version);
  insertAgentState.run('status', INITIAL_AGENT.status);
  insertAgentState.run('lastSeenAt', INITIAL_AGENT.lastSeenAt);
}
