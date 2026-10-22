import express from 'express';
import cors from 'cors';
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
} from '@saas/shared';

export function createApp(dbPath?: string): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const db = getDB();

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 2. Companies
  app.get('/api/companies', (req, res) => {
    const rows = db.prepare('SELECT * FROM companies').all();
    res.json(rows);
  });

  // 2b. Parties
  app.get('/api/parties', (req, res) => {
    let query = 'SELECT * FROM parties WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
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

  app.patch('/api/parties/:id', (req, res) => {
    const body = req.body;
    db.prepare(`
      UPDATE parties
      SET notes = COALESCE(?, notes),
          promiseToPay = COALESCE(?, promiseToPay),
          remindersPaused = COALESCE(?, remindersPaused),
          collectorId = COALESCE(?, collectorId)
      WHERE id = ?
    `).run(
      body.notes,
      body.promiseToPay,
      body.remindersPaused !== undefined ? (body.remindersPaused ? 1 : 0) : null,
      body.collectorId,
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
    let query = 'SELECT * FROM bills WHERE 1=1';
    const params: any[] = [];
    if (req.query.companyId && req.query.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(req.query.companyId);
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
    const rows = db.prepare('SELECT * FROM agent_state').all() as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const agent: Agent = {
      version: map.version || '1.4.2',
      status: (map.status as 'online' | 'offline') || 'online',
      lastSeenAt: map.lastSeenAt || new Date().toISOString(),
      pairingCode: map.pairingCode,
      pairingExpiresAt: map.pairingExpiresAt,
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
    const now = new Date().toISOString();
    db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('lastSeenAt', ?)").run(now);
    
    const ledgersCount = (db.prepare('SELECT count(*) as cnt FROM parties').get() as any).cnt;
    const vouchersCount = (db.prepare('SELECT count(*) as cnt FROM bills').get() as any).cnt;
    const stockCount = (db.prepare('SELECT count(*) as cnt FROM stock_items').get() as any).cnt;

    db.prepare(`
      INSERT INTO sync_batches (companyId, syncedAt, alterId, vouchersCount, ledgersCount, stockCount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('c1', now, 10542, vouchersCount, ledgersCount, stockCount);

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
    const bills = db.prepare('SELECT * FROM bills').all() as any[];
    const parties = db.prepare('SELECT * FROM parties').all() as any[];
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

    res.json({
      totalReceivables,
      totalOverdue,
      notDuePercentage: totalReceivables ? Math.round((notDue / totalReceivables) * 100) : 0,
      latePercentage: totalReceivables ? Math.round((late1_30 / totalReceivables) * 100) : 0,
      over30Percentage: totalReceivables ? Math.round((late30Plus / totalReceivables) * 100) : 0,
      needsAttention: [
        {
          id: 'attn-1',
          type: 'overdue',
          title: '3 accounts overdue > 45 days',
          subtitle: '₹ 10.9L total pending across 3 parties',
          actionLabel: 'Send Reminders',
          actionPath: '/reminders',
        },
        {
          id: 'attn-2',
          type: 'stock',
          title: '2 items below reorder level',
          subtitle: 'SV MACHINE, 130K MACHINE running low',
          actionLabel: 'View Stock',
          actionPath: '/stock',
        },
      ],
      mostOverdue: overdueList.slice(0, 5),
    });
  });

  // 5. Collections
  app.get('/api/collections', (req, res) => {
    const rawParties = db.prepare('SELECT * FROM parties').all() as any[];
    const rawBills = db.prepare('SELECT * FROM bills').all() as any[];
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
    const items = db.prepare('SELECT * FROM stock_items').all() as any[];
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
    const { itemId, godownId, deltaQty, reason } = req.body;
    db.prepare(`
      INSERT INTO stock_balances (itemId, godownId, qty)
      VALUES (?, ?, ?)
      ON CONFLICT(itemId, godownId) DO UPDATE SET qty = qty + ?
    `).run(itemId, godownId, deltaQty, deltaQty);

    // Audit log
    db.prepare(`
      INSERT INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`act-${Date.now()}`, 'tenant-1', 'c1', 'u1', 'stock_adjusted', `${itemId} (${deltaQty > 0 ? '+' : ''}${deltaQty})`, new Date().toISOString(), 'Desktop');

    res.json({ success: true });
  });

  // 7. Godowns
  app.get('/api/godowns', (req, res) => {
    const rows = db.prepare('SELECT * FROM godowns').all();
    res.json(rows);
  });

  // 8. Delivery Challans
  app.get('/api/challans', (req, res) => {
    const rows = db.prepare('SELECT * FROM challans ORDER BY date DESC').all() as any[];
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
    const body = req.body;
    const id = body.id || `ch-${Date.now()}`;
    const insert = db.prepare(`
      INSERT INTO challans (id, companyId, type, number, date, partyId, godownId, lines, vehicleNo, lrNo, transporter, narration, status, failureReason, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      body.companyId || 'c1',
      body.type || 'delivery',
      body.number || `DC/${Math.floor(100 + Math.random() * 900)}/26-27`,
      body.date || '2026-10-17',
      body.partyId,
      body.godownId || null,
      JSON.stringify(body.lines || []),
      body.vehicleNo || null,
      body.lrNo || null,
      body.transporter || null,
      body.narration || null,
      body.status || 'queued',
      null,
      body.createdBy || 'u1'
    );

    // Audit log
    db.prepare(`
      INSERT INTO activities (id, tenantId, companyId, actorId, action, target, at, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`act-${Date.now()}`, 'tenant-1', body.companyId || 'c1', body.createdBy || 'u1', 'created_challan', id, new Date().toISOString(), 'Desktop');

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
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

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
    const body = req.body;
    const id = body.id || `task-${Date.now()}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO tasks (id, companyId, title, description, assignedToUserId, assignedByUserId, challanId, photoUrl, status, priority, createdAt, completedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.companyId || 'c1',
      body.title,
      body.description || null,
      body.assignedToUserId,
      body.assignedByUserId || 'u1',
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
      body.companyId || 'c1',
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
    `).run(status, photoUrl, description, completedAt, req.params.id);

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
    const r = db.prepare('SELECT * FROM reminder_rules').get() as any;
    if (!r) return res.status(404).json({ error: 'Rules not found' });
    const rule: ReminderRule = {
      tenantId: r.tenantId,
      enabled: Boolean(r.enabled),
      defaultDueDays: r.defaultDueDays || 30,
      steps: JSON.parse(r.steps || '[]'),
      quietHours: JSON.parse(r.quietHours || '{}'),
      minAmount: r.minAmount,
      stopWhenPaid: true,
    };
    res.json(rule);
  });

  app.put('/api/reminders/rules', (req, res) => {
    const body = req.body;
    db.prepare(`
      UPDATE reminder_rules
      SET enabled = ?,
          defaultDueDays = ?,
          steps = ?,
          quietHours = ?,
          minAmount = ?
      WHERE tenantId = ?
    `).run(
      body.enabled ? 1 : 0,
      body.defaultDueDays || 30,
      JSON.stringify(body.steps || []),
      JSON.stringify(body.quietHours || {}),
      body.minAmount || 500000,
      body.tenantId || 'tenant-1'
    );
    const updated = db.prepare('SELECT * FROM reminder_rules WHERE tenantId = ?').get(body.tenantId || 'tenant-1') as any;
    res.json({
      ...updated,
      enabled: Boolean(updated.enabled),
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
    const rows = db.prepare('SELECT * FROM notebooks').all() as any[];
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
    res.json([
      {
        id: 'out-1',
        companyId: 'c1',
        kind: 'stock_journal',
        refId: 'item-tai',
        status: 'synced',
        attempts: 1,
      },
    ]);
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
      nb.updatedBy || 'u1',
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
    const rows = db.prepare('SELECT * FROM users').all() as any[];
    res.json(rows.map(r => ({
      ...r,
      companyIds: JSON.parse(r.companyIds || '[]'),
      active: Boolean(r.active),
    })));
  });

  app.patch('/api/users/:id/role', (req, res) => {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, req.params.id);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    res.json({ ...u, companyIds: JSON.parse(u.companyIds), active: Boolean(u.active) });
  });

  app.post('/api/users', (req, res) => {
    const body = req.body;
    const id = body.id || `u-${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, tenantId, name, phone, role, companyIds, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'tenant-1', body.name, body.phone, body.role, JSON.stringify(body.companyIds || 'all'), 1);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    res.status(201).json({ ...u, companyIds: JSON.parse(u.companyIds), active: Boolean(u.active) });
  });

  // 15. Tally Sync Endpoints (Agent Integration)
  app.post('/api/sync/push', (req, res) => {
    const { companyId, alterId, parties, bills, stockItems } = req.body;
    const now = new Date().toISOString();

    let partiesUpdated = 0;
    let billsUpdated = 0;
    let stockUpdated = 0;

    if (Array.isArray(parties)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO parties (id, tenantId, companyId, name, city, phones, gstin, creditDays, collectorId, remindersPaused, notes, promiseToPay)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of parties) {
        stmt.run(p.id, p.tenantId || 'tenant-1', companyId, p.name, p.city || '', JSON.stringify(p.phones || []), p.gstin || null, p.creditDays || 30, null, 0, p.notes || '', null);
        partiesUpdated++;
      }
    }

    if (Array.isArray(bills)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO bills (id, companyId, partyId, billNo, date, dueDate, dueDays, amount, pending, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const b of bills) {
        stmt.run(b.id, companyId, b.partyId, b.billNo, b.date, b.dueDate, b.dueDays || 30, b.amount, b.pending, b.source || 'tally_bill');
        billsUpdated++;
      }
    }

    if (Array.isArray(stockItems)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO stock_items (id, companyId, name, partNo, unit, itemGroup, rate, reorderLevel, alias)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of stockItems) {
        stmt.run(s.id, companyId, s.name, s.partNo || null, s.unit || 'pcs', s.group || 'General', s.rate || 0, s.reorderLevel || 0, s.alias || null);
        stockUpdated++;
      }
    }

    db.prepare(`
      INSERT INTO sync_batches (companyId, syncedAt, alterId, vouchersCount, ledgersCount, stockCount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(companyId, now, alterId || 0, billsUpdated, partiesUpdated, stockUpdated);

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

  // Serve static web app if dist folder exists (Single-Server Unified Deployment)
  const candidatePaths = [
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'dist/public'),
  ];
  const webDistPath = candidatePaths.find(p => fs.existsSync(p));
  if (webDistPath) {
    app.use(express.static(webDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  return app;
}
