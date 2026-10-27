import {
  calculateAgingSummary,
  Challan,
  getAgingBucket,
  getDaysOverdue,
  Id,
  Notebook,
  Notification,
  OutboxItem,
  Party,
  StockBalance,
  Task,
  ROLE_PERMISSIONS,
  setCustomPermissions,
} from '@saas/shared';
import { ApiClient, HomeSummary } from '../api/client.js';
import {
  FIXED_TODAY,
  INITIAL_ACTIVITIES,
  INITIAL_AGENT,
  INITIAL_BALANCES,
  INITIAL_BILLS,
  INITIAL_CHALLANS,
  INITIAL_COMPANIES,
  INITIAL_GODOWNS,
  INITIAL_LEDGER_SAMPLE,
  INITIAL_NOTEBOOKS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PARTIES,
  INITIAL_REPLY_THREADS,
  INITIAL_RULES,
  INITIAL_STOCK,
  INITIAL_TASKS,
  INITIAL_USERS,
} from './seed.js';

interface MockDB {
  companies: typeof INITIAL_COMPANIES;
  agent: typeof INITIAL_AGENT;
  users: typeof INITIAL_USERS;
  parties: typeof INITIAL_PARTIES;
  bills: typeof INITIAL_BILLS;
  godowns: typeof INITIAL_GODOWNS;
  stock: typeof INITIAL_STOCK;
  balances: typeof INITIAL_BALANCES;
  outbox: OutboxItem[];
  rules: typeof INITIAL_RULES;
  replyThreads: typeof INITIAL_REPLY_THREADS;
  challans: Challan[];
  notebooks: Notebook[];
  activities: typeof INITIAL_ACTIVITIES;
  tasks: Task[];
  notifications: Notification[];
}

const STORAGE_KEY = 'mock-db-v6';

function loadDB(): MockDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed.stock?.some((s: any) => s.id === 'item-tai') &&
        parsed.challans?.some((c: any) => c.id === 'ch-6') &&
        parsed.tasks &&
        parsed.notifications
      ) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return {
    companies: INITIAL_COMPANIES,
    agent: INITIAL_AGENT,
    users: INITIAL_USERS,
    parties: INITIAL_PARTIES,
    bills: INITIAL_BILLS,
    godowns: INITIAL_GODOWNS,
    stock: INITIAL_STOCK,
    balances: INITIAL_BALANCES,
    outbox: [
      {
        id: 'out-1',
        companyId: 'c1',
        kind: 'stock_journal',
        refId: 'item-1',
        status: 'synced',
        attempts: 1,
      },
    ],
    rules: INITIAL_RULES,
    replyThreads: INITIAL_REPLY_THREADS,
    challans: INITIAL_CHALLANS,
    notebooks: INITIAL_NOTEBOOKS,
    activities: INITIAL_ACTIVITIES,
    tasks: INITIAL_TASKS,
    notifications: INITIAL_NOTIFICATIONS,
  };
}

let db = loadDB();

function saveDB() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore
  }
}

export function resetMockDB() {
  localStorage.removeItem(STORAGE_KEY);
  db = loadDB();
}

export const mockApiClient: ApiClient = {
  companies: {
    list: async () => [...db.companies],
    get: async (id) => db.companies.find((c) => c.id === id) || null,
    create: async (data) => {
      const newCompany = {
        id: `c-${Date.now()}`,
        tenantId: 'tenant-1',
        name: data.name || 'New Company',
        tallyName: data.tallyName || data.name || 'New Company',
        financialYear: data.financialYear || '2026-27',
        gstin: data.gstin,
        address: data.address,
        phone: data.phone,
        lastSyncedAt: new Date().toISOString(),
        agentStatus: 'online' as const,
      };
      db.companies.push(newCompany);
      saveDB();
      return newCompany;
    },
    update: async (id, updates) => {
      const idx = db.companies.findIndex((c) => c.id === id);
      if (idx !== -1) {
        db.companies[idx] = { ...db.companies[idx]!, ...updates };
        saveDB();
        return db.companies[idx]!;
      }
      throw new Error('Company not found');
    },
  },
  agent: {
    status: async () => ({ ...db.agent }),
    createPairingCode: async () => ({
      code: '839201',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }),
    triggerSync: async () => {
      db.agent.lastSeenAt = new Date().toISOString();
      saveDB();
      return {
        success: true,
        syncedAt: db.agent.lastSeenAt,
        ledgersCount: db.parties.length,
        vouchersCount: db.bills.length + db.challans.length,
      };
    },
  },
  home: {
    summary: async (companyId: Id | 'all'): Promise<HomeSummary> => {
      const filteredBills =
        companyId === 'all'
          ? db.bills
          : db.bills.filter((b) => b.companyId === companyId);

      const aging = calculateAgingSummary(filteredBills, FIXED_TODAY);

      const notDuePct =
        aging.total > 0 ? Math.round((aging.notDue / aging.total) * 100) : 100;
      const latePct =
        aging.total > 0 ? Math.round((aging.late1to30 / aging.total) * 100) : 0;
      const over30Pct =
        aging.total > 0 ? Math.max(0, 100 - notDuePct - latePct) : 0;

      // Group bills by party to compute most overdue
      const partyMap = new Map<string, Party>();
      for (const p of db.parties) {
        partyMap.set(p.id, p);
      }

      const partyTotals = new Map<
        string,
        { party: Party; amount: number; maxDaysLate: number; invoiceRef?: string }
      >();

      for (const b of filteredBills) {
        const bucket = getAgingBucket(b.dueDate, FIXED_TODAY);
        if (bucket !== 'not_due') {
          const daysLate = getDaysOverdue(b.dueDate, FIXED_TODAY);
          const current = partyTotals.get(b.partyId) ?? {
            party: partyMap.get(b.partyId)!,
            amount: 0,
            maxDaysLate: 0,
            invoiceRef: b.billNo,
          };
          current.amount += b.pending;
          if (daysLate > current.maxDaysLate) {
            current.maxDaysLate = daysLate;
            current.invoiceRef = b.billNo;
          }
          partyTotals.set(b.partyId, current);
        }
      }

      const sortedMostOverdue = Array.from(partyTotals.values())
        .filter((item) => item.party !== undefined)
        .sort((a, b) => b.maxDaysLate - a.maxDaysLate)
        .slice(0, 5)
        .map((item) => ({
          party: item.party,
          amount: item.amount,
          daysLate: item.maxDaysLate,
          invoiceRef: item.invoiceRef,
        }));

      // Needs attention items
      const needsAttention: HomeSummary['needsAttention'] = [];
      const veryLateCount = filteredBills.filter(
        (b) => getDaysOverdue(b.dueDate, FIXED_TODAY) >= 30
      ).length;

      if (veryLateCount > 0) {
        needsAttention.push({
          id: 'attn-overdue',
          type: 'overdue',
          title: `${veryLateCount} bills are over 30 days`,
          subtitle: 'Urgent follow-up recommended',
          actionLabel: 'Review',
          actionPath: '/collections',
        });
      }

      const unreadReplies = db.replyThreads.filter((t) => t.unread > 0).length;
      if (unreadReplies > 0) {
        needsAttention.push({
          id: 'attn-replies',
          type: 'reply',
          title: `${unreadReplies} customer replies waiting`,
          subtitle: 'WhatsApp payment confirmations',
          actionLabel: 'Open',
          actionPath: '/reminders/replies',
        });
      }

      // Company breakdown when viewing 'all'
      let companyBreakdown: HomeSummary['companyBreakdown'];
      if (companyId === 'all') {
        companyBreakdown = db.companies.map((comp) => {
          const cBills = db.bills.filter((b) => b.companyId === comp.id);
          const cAging = calculateAgingSummary(cBills, FIXED_TODAY);
          return {
            company: comp,
            totalAmount: cAging.total,
            overdueAmount: cAging.overdue,
          };
        });
      }

      return {
        totalReceivables: aging.total,
        totalOverdue: aging.overdue,
        notDuePercentage: notDuePct,
        latePercentage: latePct,
        over30Percentage: over30Pct,
        needsAttention,
        mostOverdue: sortedMostOverdue,
        companyBreakdown,
      };
    },
  },
  parties: {
    list: async (companyId, query) => {
      let list =
        companyId === 'all'
          ? db.parties
          : db.parties.filter((p) => p.companyId === companyId);
      if (query && query.trim() !== '') {
        const q = query.toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.city.toLowerCase().includes(q)
        );
      }
      return list;
    },
    get: async (id) => db.parties.find((p) => p.id === id) ?? null,
    create: async (data: any) => {
      const p = {
        id: data.id || `p-${Date.now()}`,
        tenantId: data.tenantId || 'tenant-1',
        companyId: data.companyId || 'c1',
        name: data.name || '',
        city: data.city || 'Ludhiana',
        phones: data.phones || [],
        gstin: data.gstin || '',
        creditDays: data.creditDays || 30,
        collectorId: data.collectorId || 'u1',
        remindersPaused: Boolean(data.remindersPaused),
        notes: data.notes || '',
        promiseToPay: data.promiseToPay,
      };
      db.parties.unshift(p);
      saveDB();
      return p;
    },
    update: async (id, updates) => {
      const idx = db.parties.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error('Party not found');
      db.parties[idx] = { ...db.parties[idx]!, ...updates };
      saveDB();
      return db.parties[idx]!;
    },
  },
  bills: {
    list: async (companyId, partyId) => {
      let list =
        companyId === 'all'
          ? db.bills
          : db.bills.filter((b) => b.companyId === companyId);
      if (partyId) {
        list = list.filter((b) => b.partyId === partyId);
      }
      return list;
    },
  },
  ledger: {
    get: async (_partyId) => INITIAL_LEDGER_SAMPLE,
  },
  reminders: {
    rules: {
      get: async () => ({ ...db.rules }),
      update: async (updates) => {
        db.rules = { ...db.rules, ...updates };
        saveDB();
        return db.rules;
      },
    },
    send: async (_partyId, _billId) => {
      return { success: true, messageId: `msg-${Date.now()}` };
    },
    messages: {
      list: async () => [],
    },
    replies: {
      list: async () => db.replyThreads,
      send: async (threadId, text) => {
        const thread = db.replyThreads.find((t) => t.id === threadId);
        if (thread) {
          thread.messages.push({
            from: 'us',
            text,
            at: new Date().toISOString(),
          });
          saveDB();
        }
      },
    },
  },
  stock: {
    items: {
      list: async (companyId, query) => {
        let list =
          companyId === 'all'
            ? db.stock
            : db.stock.filter((s) => s.companyId === companyId);
        if (query) {
          const q = query.toLowerCase();
          list = list.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.partNo?.toLowerCase().includes(q)
          );
        }
        return list;
      },
      get: async (id) => {
        const item = db.stock.find((s) => s.id === id);
        if (!item) return null;
        const balances = db.balances.filter((b: StockBalance) => b.itemId === id);
        return { item, balances };
      },
    },
    adjust: async (itemId, godownId, deltaQty, _reason) => {
      const balanceIdx = db.balances.findIndex(
        (b: StockBalance) => b.itemId === itemId && b.godownId === godownId
      );
      if (balanceIdx >= 0 && db.balances[balanceIdx]) {
        db.balances[balanceIdx].qty += deltaQty;
      } else {
        db.balances.push({ itemId, godownId, qty: deltaQty });
      }

      const outboxItem: OutboxItem = {
        id: `out-${Date.now()}`,
        companyId: 'c1',
        kind: 'stock_journal',
        refId: itemId,
        status: 'queued',
        attempts: 1,
      };
      db.outbox.unshift(outboxItem);
      saveDB();

      setTimeout(() => {
        const item = db.outbox.find((o) => o.id === outboxItem.id);
        if (item) {
          item.status = 'synced';
          saveDB();
        }
      }, 4000);
    },
  },
  godowns: {
    list: async (companyId) =>
      companyId === 'all'
        ? db.godowns
        : db.godowns.filter((g) => g.companyId === companyId),
  },
  outbox: {
    list: async (companyId) =>
      companyId === 'all'
        ? db.outbox
        : db.outbox.filter((o) => o.companyId === companyId),
  },
  challans: {
    list: async (companyId, query, type, itemIds) => {
      let list =
        companyId === 'all'
          ? db.challans
          : db.challans.filter((c) => c.companyId === companyId);

      if (type && type !== 'all') {
        list = list.filter((c) => c.type === type);
      }

      if (itemIds && itemIds.length > 0) {
        list = list.filter((c) =>
          c.lines.some((line) => itemIds.includes(line.itemId))
        );
      }

      if (query && query.trim() !== '') {
        const q = query.toLowerCase();
        const partyMap = new Map(db.parties.map((p) => [p.id, p]));
        list = list.filter((c) => {
          const party = partyMap.get(c.partyId);
          return (
            c.number.toLowerCase().includes(q) ||
            (party?.name.toLowerCase().includes(q) ?? false) ||
            (c.vehicleNo?.toLowerCase().includes(q) ?? false) ||
            (c.lrNo?.toLowerCase().includes(q) ?? false) ||
            c.lines.some((l) => l.description.toLowerCase().includes(q))
          );
        });
      }

      return list;
    },
    get: async (id) => db.challans.find((c) => c.id === id) ?? null,
    create: async (data) => {
      const newId = `ch-${Date.now()}`;
      const prefix = data.type === 'sales' ? 'SC' : data.type === 'purchase' ? 'PC' : 'DC';
      const count = db.challans.filter((c) => c.type === data.type).length + 1;
      const formattedNum = `${prefix}/${String(count).padStart(3, '0')}/26-27`;

      const newChallan: Challan = {
        ...data,
        id: newId,
        number: data.number || formattedNum,
      };

      db.challans.unshift(newChallan);

      if (newChallan.status === 'queued') {
        const outboxItem: OutboxItem = {
          id: `out-${Date.now()}`,
          companyId: newChallan.companyId,
          kind: 'challan',
          refId: newId,
          status: 'queued',
          attempts: 1,
        };
        db.outbox.unshift(outboxItem);

        // Simulate agent sync after 3.5s
        setTimeout(() => {
          const ch = db.challans.find((c) => c.id === newId);
          if (ch && ch.status === 'queued') {
            ch.status = 'synced';
            saveDB();
          }
          const out = db.outbox.find((o) => o.id === outboxItem.id);
          if (out) {
            out.status = 'synced';
            saveDB();
          }
        }, 3500);
      }

      saveDB();
      return newChallan;
    },
    retry: async (id) => {
      const idx = db.challans.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error('Challan not found');

      db.challans[idx]!.status = 'queued';
      db.challans[idx]!.failureReason = undefined;

      const outboxItem: OutboxItem = {
        id: `out-${Date.now()}`,
        companyId: db.challans[idx]!.companyId,
        kind: 'challan',
        refId: id,
        status: 'queued',
        attempts: 2,
      };
      db.outbox.unshift(outboxItem);
      saveDB();

      setTimeout(() => {
        const ch = db.challans.find((c) => c.id === id);
        if (ch && ch.status === 'queued') {
          ch.status = 'synced';
          saveDB();
        }
        const out = db.outbox.find((o) => o.id === outboxItem.id);
        if (out) {
          out.status = 'synced';
          saveDB();
        }
      }, 3500);

      return db.challans[idx]!;
    },
  },
  notebooks: {
    list: async (companyId) =>
      companyId === 'all'
        ? db.notebooks
        : db.notebooks.filter((n) => n.companyId === companyId),
    get: async (id) => db.notebooks.find((n) => n.id === id) ?? null,
    save: async (nb) => {
      const idx = db.notebooks.findIndex((n) => n.id === nb.id);
      if (idx >= 0) {
        db.notebooks[idx] = nb;
      } else {
        db.notebooks.unshift(nb);
      }
      saveDB();
      return nb;
    },
  },
  activity: {
    list: async (companyId) => {
      if (companyId === 'all') return db.activities;
      return db.activities.filter(
        (a) => !a.companyId || a.companyId === companyId
      );
    },
  },
  users: {
    list: async () => db.users,
    update: async (id, data) => {
      const u = db.users.find((user) => user.id === id);
      if (u) {
        Object.assign(u, data);
        saveDB();
        return u;
      }
      throw new Error('User not found');
    },
    updateRole: async (id, role) => {
      const u = db.users.find((user) => user.id === id);
      if (u) {
        u.role = role;
        saveDB();
        return u;
      }
      throw new Error('User not found');
    },
    create: async (data) => {
      const newUser = {
        id: `u-${Date.now()}`,
        ...data,
      };
      db.users.push(newUser as any);
      saveDB();
      return newUser as any;
    },
    delete: async (id) => {
      const idx = db.users.findIndex((u) => u.id === id);
      if (idx !== -1) {
        db.users.splice(idx, 1);
        saveDB();
      }
      return { success: true };
    },
  },
  permissions: {
    get: async () => {
      const stored = localStorage.getItem('manohar_custom_permissions');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {}
      }
      return ROLE_PERMISSIONS;
    },
    update: async (perms) => {
      localStorage.setItem('manohar_custom_permissions', JSON.stringify(perms));
      setCustomPermissions(perms as any);
      return perms;
    },
  },
  auth: {
    login: async (phone, pin) => {
      const clean = (p: string) => p ? p.replace(/\D/g, '') : '';
      const u = db.users.find(
        (user) =>
          clean(user.phone).endsWith(clean(phone)) ||
          clean(phone).endsWith(clean(user.phone))
      );
      if (!u) return { success: false, error: 'Staff phone number not found' };
      const userPin = (u as any).pin || (u.role === 'dev' ? '0000' : '1234');
      if (pin !== userPin) {
        return { success: false, error: 'Invalid 4-digit PIN' };
      }
      const tenant = {
        id: u.tenantId || 'tenant-1',
        name: u.role === 'dev' ? 'Platform Management' : 'Manohar Traders Group',
        ownerName: u.name,
        ownerPhone: u.phone,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
      };
      return {
        success: true,
        token: `mock_tok_${Date.now()}`,
        user: u,
        tenant,
        companies: db.companies,
      };
    },
    me: async () => {
      const user = db.users[0]!;
      return {
        user,
        tenant: {
          id: user.tenantId || 'tenant-1',
          name: 'Manohar Traders Group',
          ownerName: user.name,
          ownerPhone: user.phone,
          status: 'active' as const,
          createdAt: new Date().toISOString(),
        },
        companies: db.companies,
      };
    },
    logout: async () => ({ success: true }),
  },
  dev: {
    clients: {
      list: async () => [
        {
          id: 'tenant-1',
          name: 'Manohar Traders Group',
          ownerName: 'Manohar Lal',
          ownerPhone: '+91 98140 11223',
          status: 'active' as const,
          createdAt: '2026-04-01T00:00:00Z',
          companies: db.companies,
          owner: {
            id: 'u1',
            name: 'Manohar Lal',
            phone: '+91 98140 11223',
            pin: '1234',
          },
        },
      ],
      create: async (data: any) => {
        const tenant = {
          id: `tenant-${Date.now()}`,
          name: data.name,
          ownerName: data.ownerName,
          ownerPhone: data.ownerPhone,
          status: 'active' as const,
          createdAt: new Date().toISOString(),
        };
        const owner = {
          id: `u-${Date.now()}`,
          tenantId: tenant.id,
          name: data.ownerName,
          phone: data.ownerPhone,
          pin: data.ownerPin || '1234',
          role: 'owner' as const,
          companyIds: 'all' as const,
          active: true,
        };
        const company = {
          id: `c-${Date.now()}`,
          tenantId: tenant.id,
          name: data.tallyCompanyName || data.name,
          tallyName: data.tallyCompanyName || data.name,
          financialYear: data.financialYear || '2026-27',
          lastSyncedAt: new Date().toISOString(),
          agentStatus: 'offline' as const,
        };
        db.users.push(owner as any);
        db.companies.push(company);
        return { success: true, tenant, owner, company };
      },
    },
  },
  tasks: {
    list: async (companyId, filter) => {
      let list =
        companyId === 'all'
          ? db.tasks
          : db.tasks.filter((t) => t.companyId === companyId);

      if (filter?.challanId) {
        list = list.filter((t) => t.challanId === filter.challanId);
      }
      if (filter?.assignedToUserId) {
        list = list.filter((t) => t.assignedToUserId === filter.assignedToUserId);
      }
      if (filter?.status) {
        list = list.filter((t) => t.status === filter.status);
      }
      return list;
    },
    get: async (id) => db.tasks.find((t) => t.id === id) ?? null,
    create: async (data) => {
      const newTask: Task = {
        ...data,
        id: `task-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      db.tasks.unshift(newTask);

      // Automatically generate a notification for the assigned user!
      const assigner = db.users.find((u) => u.id === data.assignedByUserId);
      const challan = data.challanId ? db.challans.find((c) => c.id === data.challanId) : null;

      const newNotif: Notification = {
        id: `notif-${Date.now()}`,
        userId: data.assignedToUserId,
        companyId: data.companyId,
        title: 'New Task Assigned',
        body: `${assigner?.name ?? 'Team Member'} assigned: "${data.title}"${
          challan ? ` on Challan ${challan.number}` : ''
        }`,
        taskId: newTask.id,
        challanId: data.challanId,
        photoUrl: data.photoUrl,
        read: false,
        createdAt: new Date().toISOString(),
      };
      db.notifications.unshift(newNotif);

      saveDB();
      return newTask;
    },
    update: async (id, updates) => {
      const idx = db.tasks.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error('Task not found');
      db.tasks[idx] = {
        ...db.tasks[idx]!,
        ...updates,
        ...(updates.status === 'completed' && !db.tasks[idx]!.completedAt
          ? { completedAt: new Date().toISOString() }
          : {}),
      };
      saveDB();
      return db.tasks[idx]!;
    },
  },
  notifications: {
    list: async (userId, companyId) => {
      let list = db.notifications;
      if (userId) {
        list = list.filter((n) => n.userId === userId);
      }
      if (companyId && companyId !== 'all') {
        list = list.filter((n) => n.companyId === companyId);
      }
      return list;
    },
    markAsRead: async (id) => {
      const target = db.notifications.find((n) => n.id === id);
      if (target) {
        target.read = true;
        saveDB();
      }
    },
    markAllAsRead: async (userId) => {
      db.notifications.forEach((n) => {
        if (!userId || n.userId === userId) {
          n.read = true;
        }
      });
      saveDB();
    },
  },
};
