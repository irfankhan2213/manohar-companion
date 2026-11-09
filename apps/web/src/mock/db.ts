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
  StockItem,
  Task,
  ROLE_PERMISSIONS,
  setCustomPermissions,
} from '@saas/shared';
import { ApiClient, HomeSummary } from '../api/client.js';
import { useAppStore } from '../app/store.js';
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
let lastLoggedInUserId: string | null = null;

function sanitizeUser<T extends Record<string, any>>(u: T): T {
  const { pin: _pin, ...safe } = u;
  return safe as T;
}

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
  lastLoggedInUserId = null;
  db = loadDB();
}

export const mockApiClient: ApiClient = {
  companies: {
    list: async () => [...db.companies],
    get: async (id) => db.companies.find((c) => c.id === id) || null,
    create: async (data) => {
      const currentTenantId =
        useAppStore.getState().currentTenant?.id ||
        useAppStore.getState().currentUser?.tenantId ||
        'tenant-1';
      const newCompany = {
        id: `c-${Date.now()}`,
        tenantId: currentTenantId,
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
    createPairingCode: async (companyId?: string) => {
      const comp = companyId ? db.companies.find((c) => c.id === companyId) : db.companies[0];
      return {
        code: '839201',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        companyId: comp?.id || companyId || 'c1',
        companyName: comp?.name || 'Manohar Traders',
      };
    },
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
    resetAlterId: async (companyId?: string) => {
      return {
        success: true,
        message: `Queued RESET_ALTER_ID command for company ${companyId || 'default'}`,
        companyId,
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
          actionLabel: db.rules.whatsappEnabled ? 'Send Reminders' : 'View Dues',
          actionPath: db.rules.whatsappEnabled ? '/reminders' : '/collections',
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
        whatsappAttached: Boolean(db.rules.whatsappEnabled),
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
        tenantId: data.tenantId || useAppStore.getState().currentUser?.tenantId || 'tenant-1',
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
          thread.unread = 0;
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
        return list.map((item) => {
          const balances = db.balances.filter((b: StockBalance) => b.itemId === item.id);
          const totalQty = balances.reduce((acc, b) => acc + b.qty, 0);
          return {
            ...item,
            totalQty,
            balances,
          };
        });
      },
      get: async (id) => {
        const item = db.stock.find((s) => s.id === id);
        if (!item) return null;
        const balances = db.balances.filter((b: StockBalance) => b.itemId === id);
        return { item, balances };
      },
      create: async (data: any) => {
        const activeCompanyId = useAppStore.getState().currentCompanyId;
        const resolvedCompanyId = data.companyId || (activeCompanyId !== 'all' ? activeCompanyId : 'c1');
        const newItem: StockItem = {
          id: data.id || `item-${Date.now()}`,
          companyId: resolvedCompanyId,
          name: data.name,
          partNo: data.partNo,
          unit: data.unit || 'pcs',
          group: data.group || 'General',
          rate: typeof data.rate === 'number' ? data.rate : 0,
          purchaseRate: typeof data.purchaseRate === 'number' ? data.purchaseRate : undefined,
          reorderLevel: typeof data.reorderLevel === 'number' ? data.reorderLevel : 0,
          alias: data.alias,
          hsnCode: data.hsnCode,
          gstRate: data.gstRate,
          description: data.description,
          customValues: data.customValues || {},
        };
        db.stock.unshift(newItem);
        if (Array.isArray(data.balances)) {
          for (const b of data.balances) {
            db.balances.push({ itemId: newItem.id, godownId: b.godownId, qty: b.qty });
          }
        }
        saveDB();
        return newItem;
      },
      update: async (id: string, data: any) => {
        const item = db.stock.find((s) => s.id === id);
        if (!item) throw new Error('Stock item not found');
        if (data.name !== undefined) item.name = data.name;
        if (data.partNo !== undefined) item.partNo = data.partNo;
        if (data.unit !== undefined) item.unit = data.unit;
        if (data.group !== undefined) item.group = data.group;
        if (data.rate !== undefined) item.rate = data.rate;
        if (data.purchaseRate !== undefined) item.purchaseRate = data.purchaseRate;
        if (data.reorderLevel !== undefined) item.reorderLevel = data.reorderLevel;
        if (data.alias !== undefined) item.alias = data.alias;
        if (data.hsnCode !== undefined) item.hsnCode = data.hsnCode;
        if (data.gstRate !== undefined) item.gstRate = data.gstRate;
        if (data.description !== undefined) item.description = data.description;
        if (data.customValues !== undefined) item.customValues = data.customValues;

        if (Array.isArray(data.balances)) {
          for (const b of data.balances) {
            const idx = db.balances.findIndex((bal) => bal.itemId === id && bal.godownId === b.godownId);
            if (idx >= 0 && db.balances[idx]) {
              db.balances[idx].qty = b.qty;
            } else {
              db.balances.push({ itemId: id, godownId: b.godownId, qty: b.qty });
            }
          }
        }
        saveDB();
        return item;
      },
      delete: async (id: string) => {
        const idx = db.stock.findIndex((s) => s.id === id);
        if (idx >= 0) {
          db.stock.splice(idx, 1);
        }
        db.balances = db.balances.filter((b) => b.itemId !== id);
        saveDB();
        return { success: true };
      },
    },
    adjust: async (itemId, godownId, deltaQty, reason) => {
      const balanceIdx = db.balances.findIndex(
        (b: StockBalance) => b.itemId === itemId && b.godownId === godownId
      );
      if (balanceIdx >= 0 && db.balances[balanceIdx]) {
        db.balances[balanceIdx].qty += deltaQty;
      } else {
        db.balances.push({ itemId, godownId, qty: deltaQty });
      }

      const targetItem = db.stock.find((s) => s.id === itemId);
      const targetGodown = db.godowns.find((g) => g.id === godownId);
      const activeCompanyId = useAppStore.getState().currentCompanyId;
      const resolvedCompanyId =
        targetItem?.companyId ||
        targetGodown?.companyId ||
        (activeCompanyId !== 'all' ? activeCompanyId : 'c1');

      const outboxItem: OutboxItem = {
        id: `out-${Date.now()}`,
        companyId: resolvedCompanyId,
        kind: 'stock_journal',
        refId: itemId,
        status: 'queued',
        attempts: 1,
      };
      db.outbox.unshift(outboxItem);

      const currentUser = useAppStore.getState().currentUser;
      db.activities.unshift({
        id: `act-${Date.now()}`,
        tenantId: currentUser?.tenantId || 'tenant-1',
        companyId: resolvedCompanyId,
        actorId: currentUser?.id || 'u1',
        action: 'stock_adjusted',
        target: `${targetItem?.name || itemId} (${deltaQty > 0 ? '+' : ''}${deltaQty}${reason ? `: ${reason}` : ''})`,
        at: new Date().toISOString(),
        device: 'Desktop',
      });
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
      const party = db.parties.find((p) => p.id === data.partyId);
      const resolvedCompanyId =
        data.companyId && data.companyId !== 'all'
          ? data.companyId
          : party?.companyId || db.companies[0]?.id || 'c1';
      const resolvedGodownId =
        data.godownId ||
        db.godowns.find((g) => g.companyId === resolvedCompanyId)?.id ||
        db.godowns[0]?.id ||
        'g1';

      const newChallan: Challan = {
        ...data,
        companyId: resolvedCompanyId,
        godownId: resolvedGodownId,
        id: newId,
        number: data.number || formattedNum,
      };

      db.challans.unshift(newChallan);

      // Automatically update stock balances when challan is queued or synced
      if (newChallan.status !== 'draft' && resolvedGodownId) {
        const direction = newChallan.type === 'purchase' ? 1 : -1;
        for (const line of newChallan.lines) {
          const delta = direction * line.qty;
          const balIdx = db.balances.findIndex(
            (b) => b.itemId === line.itemId && b.godownId === resolvedGodownId
          );
          if (balIdx >= 0 && db.balances[balIdx]) {
            db.balances[balIdx]!.qty += delta;
          } else {
            db.balances.push({
              itemId: line.itemId,
              godownId: resolvedGodownId,
              qty: delta,
            });
          }
        }
      }

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
      const existing = db.challans[idx]!;

      // If transitioning from draft to queued, apply stock balance adjustments now
      if (existing.status === 'draft') {
        const resolvedGodownId =
          existing.godownId ||
          db.godowns.find((g) => g.companyId === existing.companyId)?.id ||
          db.godowns[0]?.id ||
          'g1';
        const direction = existing.type === 'purchase' ? 1 : -1;
        for (const line of existing.lines) {
          const delta = direction * line.qty;
          const balIdx = db.balances.findIndex(
            (b) => b.itemId === line.itemId && b.godownId === resolvedGodownId
          );
          if (balIdx >= 0 && db.balances[balIdx]) {
            db.balances[balIdx]!.qty += delta;
          } else {
            db.balances.push({
              itemId: line.itemId,
              godownId: resolvedGodownId,
              qty: delta,
            });
          }
        }
      }

      db.challans[idx]!.status = 'queued';
      db.challans[idx]!.failureReason = undefined;

      const outboxItem: OutboxItem = {
        id: `out-${Date.now()}`,
        companyId: db.challans[idx]!.companyId,
        kind: 'challan',
        refId: id,
        status: 'queued',
        attempts: existing.status === 'draft' ? 1 : 2,
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
    list: async (companyId) => {
      const currentUser = useAppStore.getState().currentUser;
      let matched =
        companyId === 'all'
          ? db.notebooks
          : db.notebooks.filter((n) => n.companyId === companyId);

      if (currentUser?.id) {
        matched = matched.filter(
          (n) =>
            (n.userId || n.updatedBy) === currentUser.id ||
            ((n.userId === 'u-owner' || n.updatedBy === 'u-owner' || n.userId === 'u1' || n.updatedBy === 'u1') &&
              (currentUser.id === 'u1' || currentUser.role === 'owner'))
        );
      }

      if (matched.length === 0) {
        const targetCompanyId = companyId === 'all' ? (db.companies[0]?.id || 'c1') : companyId;
        const ownerUserId = currentUser?.id || 'u1';
        const defaultNb: Notebook = {
          id: `nb-${ownerUserId}-${Date.now()}`,
          companyId: targetCompanyId,
          userId: ownerUserId,
          title: 'Material & Delivery Calculation Notebook',
          updatedAt: new Date().toISOString(),
          updatedBy: ownerUserId,
          columns: [
            { id: 'c-desc', key: 'desc', title: 'Description', type: 'text' },
            { id: 'c-qty', key: 'qty', title: 'Qty', type: 'number', total: 'sum' },
            { id: 'c-rate', key: 'rate', title: 'Rate (₹)', type: 'number' },
            { id: 'c-total', key: 'total', title: 'Total (₹)', type: 'computed', formula: '{qty} * {rate}', total: 'sum' },
          ],
          rows: [
            {
              id: 'r-1',
              cells: {
                desc: { raw: 'Servo Motor 550W (Batch A)', value: 'Servo Motor 550W (Batch A)' },
                qty: { raw: '10*2', value: '20' },
                rate: { raw: '4200', value: '4200' },
                total: { raw: '{qty} * {rate}', value: '84000' },
              },
            },
          ],
        };
        db.notebooks.push(defaultNb);
        saveDB();
        matched = [defaultNb];
      }
      return matched;
    },
    get: async (id) => {
      const currentUser = useAppStore.getState().currentUser;
      const nb = db.notebooks.find((n) => n.id === id) ?? null;
      if (!nb) return null;
      if (
        currentUser?.id &&
        (nb.userId || nb.updatedBy) !== currentUser.id &&
        !((nb.userId === 'u-owner' || nb.updatedBy === 'u-owner' || nb.userId === 'u1' || nb.updatedBy === 'u1') &&
          (currentUser.id === 'u1' || currentUser.role === 'owner'))
      ) {
        return null;
      }
      return nb;
    },
    save: async (nb) => {
      const currentUser = useAppStore.getState().currentUser;
      const withOwner: Notebook = {
        ...nb,
        userId: nb.userId || currentUser?.id || nb.updatedBy || 'u1',
        updatedBy: currentUser?.id || nb.updatedBy || 'u1',
      };
      const idx = db.notebooks.findIndex((n) => n.id === withOwner.id);
      if (idx >= 0) {
        db.notebooks[idx] = withOwner;
      } else {
        db.notebooks.unshift(withOwner);
      }
      saveDB();
      return withOwner;
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
    list: async () => db.users.map((u) => sanitizeUser(u)),
    update: async (id, data) => {
      const u = db.users.find((user) => user.id === id);
      if (u) {
        Object.assign(u, data);
        saveDB();
        return sanitizeUser(u);
      }
      throw new Error('User not found');
    },
    updateRole: async (id, role) => {
      const u = db.users.find((user) => user.id === id);
      if (u) {
        u.role = role;
        saveDB();
        return sanitizeUser(u);
      }
      throw new Error('User not found');
    },
    create: async (data) => {
      const newUser = {
        id: `u-${Date.now()}`,
        tenantId: useAppStore.getState().currentUser?.tenantId || 'tenant-1',
        companyIds: 'all' as const,
        active: true,
        ...data,
      };
      db.users.push(newUser as any);
      saveDB();
      return sanitizeUser(newUser as any);
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
      const tenantId =
        useAppStore.getState().currentTenant?.id ||
        useAppStore.getState().currentUser?.tenantId ||
        'tenant-1';
      const scopedKey = `manohar_custom_permissions_${tenantId}`;
      const stored = localStorage.getItem(scopedKey) || localStorage.getItem('manohar_custom_permissions');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const merged = { ...ROLE_PERMISSIONS, ...parsed };
          setCustomPermissions(merged as any);
          return merged;
        } catch {}
      }
      setCustomPermissions(ROLE_PERMISSIONS);
      return ROLE_PERMISSIONS;
    },
    update: async (perms) => {
      const currentUser = useAppStore.getState().currentUser;
      const tenantId =
        useAppStore.getState().currentTenant?.id ||
        currentUser?.tenantId ||
        'tenant-1';
      const sanitizedPerms = JSON.parse(JSON.stringify(perms));
      if (currentUser?.role !== 'dev' && typeof sanitizedPerms === 'object' && sanitizedPerms !== null) {
        for (const r of Object.keys(sanitizedPerms)) {
          if (sanitizedPerms[r] && typeof sanitizedPerms[r] === 'object') {
            sanitizedPerms[r]['clients.manage'] = false;
          }
        }
      }
      localStorage.setItem(`manohar_custom_permissions_${tenantId}`, JSON.stringify(sanitizedPerms));
      localStorage.setItem('manohar_custom_permissions', JSON.stringify(sanitizedPerms));
      setCustomPermissions(sanitizedPerms as any);
      return sanitizedPerms;
    },
  },
  auth: {
    login: async (phone, pin) => {
      const clean = (p: string) => (p ? p.replace(/\D/g, '') : '');
      const matchingUsers = db.users.filter(
        (user) =>
          clean(user.phone).endsWith(clean(phone)) ||
          clean(phone).endsWith(clean(user.phone))
      );
      if (matchingUsers.length === 0) {
        return { success: false, error: 'Staff phone number not found' };
      }
      const activeUsers = matchingUsers.filter((u) => u.active !== false);
      if (activeUsers.length === 0) {
        return { success: false, error: 'Account deactivated' };
      }
      const u = activeUsers.find((user) => {
        const userPin = (user as any).pin || (user.role === 'dev' ? '0000' : '1234');
        return pin === userPin;
      });
      if (!u) {
        return { success: false, error: 'Invalid 4-digit PIN' };
      }
      lastLoggedInUserId = u.id;
      const tenant = {
        id: u.tenantId || 'tenant-1',
        name: u.role === 'dev' ? 'Platform Management' : 'Manohar Traders Group',
        ownerName: u.name,
        ownerPhone: u.phone,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
      };
      const companies =
        u.role === 'dev'
          ? db.companies
          : db.companies.filter(
              (c) =>
                (!c.tenantId || c.tenantId === u.tenantId) &&
                (u.companyIds === 'all' || !Array.isArray(u.companyIds) || u.companyIds.includes(c.id))
            );
      return {
        success: true,
        token: `mock_tok_${u.id}_${Date.now()}`,
        user: sanitizeUser(u),
        tenant,
        companies,
      };
    },
    me: async () => {
      const storeUser = useAppStore.getState().currentUser;
      const targetId = storeUser?.id || lastLoggedInUserId;
      const found = targetId ? db.users.find((u) => u.id === targetId) : undefined;
      const user = found || storeUser || db.users[0]!;
      if (user.active === false) {
        throw new Error('Account deactivated');
      }
      const tenant = {
        id: user.tenantId || 'tenant-1',
        name: user.role === 'dev' ? 'Platform Management' : 'Manohar Traders Group',
        ownerName: user.name,
        ownerPhone: user.phone,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
      };
      const companies =
        user.role === 'dev'
          ? db.companies
          : db.companies.filter(
              (c) =>
                (!c.tenantId || c.tenantId === user.tenantId) &&
                (user.companyIds === 'all' || !Array.isArray(user.companyIds) || user.companyIds.includes(c.id))
            );
      return {
        user: sanitizeUser(user),
        tenant,
        companies,
      };
    },
    logout: async () => {
      lastLoggedInUserId = null;
      return { success: true };
    },
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
        saveDB();
        return { success: true, tenant, owner: sanitizeUser(owner as any), company };
      },
    },
  },
  tasks: {
    list: async (companyId, filter) => {
      const currentUser = useAppStore.getState().currentUser;
      let list =
        companyId === 'all'
          ? db.tasks
          : db.tasks.filter((t) => t.companyId === companyId || t.companyId === 'all');

      if (filter?.challanId) {
        list = list.filter((t) => t.challanId === filter.challanId);
      }

      if (filter?.assignedByUserId) {
        list = list.filter((t) => t.assignedByUserId === filter.assignedByUserId);
      } else if (filter?.assignedToUserId) {
        list = list.filter((t) => t.assignedToUserId === filter.assignedToUserId);
      } else if (currentUser?.id) {
        list = list.filter(
          (t) =>
            t.assignedToUserId === currentUser.id ||
            t.assignedByUserId === currentUser.id
        );
      }

      if (filter?.status) {
        list = list.filter((t) => t.status === filter.status);
      }
      return list;
    },
    get: async (id) => {
      const currentUser = useAppStore.getState().currentUser;
      const task = db.tasks.find((t) => t.id === id) ?? null;
      if (!task) return null;
      if (currentUser?.id && task.assignedToUserId !== currentUser.id && task.assignedByUserId !== currentUser.id) {
        return null;
      }
      return task;
    },
    create: async (data) => {
      const challan = data.challanId ? db.challans.find((c) => c.id === data.challanId) : null;
      const resolvedCompanyId =
        data.companyId && data.companyId !== 'all'
          ? data.companyId
          : challan?.companyId || db.companies[0]?.id || 'c1';

      const newTask: Task = {
        ...data,
        companyId: resolvedCompanyId,
        id: `task-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      db.tasks.unshift(newTask);

      // Automatically generate a notification strictly for the assigned user!
      const assigner = db.users.find((u) => u.id === data.assignedByUserId);

      const newNotif: Notification = {
        id: `notif-${Date.now()}`,
        userId: data.assignedToUserId,
        companyId: resolvedCompanyId,
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
      const existing = db.tasks[idx]!;
      const currentUser = useAppStore.getState().currentUser;

      db.tasks[idx] = {
        ...existing,
        ...updates,
        ...(updates.status === 'completed' && !existing.completedAt
          ? { completedAt: new Date().toISOString() }
          : updates.status === 'pending'
          ? { completedAt: undefined }
          : {}),
      };

      if (
        updates.status === 'completed' &&
        existing.status !== 'completed' &&
        existing.assignedByUserId &&
        existing.assignedByUserId !== (currentUser?.id || existing.assignedToUserId)
      ) {
        const assigneeUser = db.users.find((u) => u.id === existing.assignedToUserId);
        db.notifications.unshift({
          id: `notif-done-${Date.now()}`,
          userId: existing.assignedByUserId,
          companyId: existing.companyId,
          title: 'Task Completed',
          body: `${assigneeUser?.name ?? 'Assignee'} completed: "${existing.title}"`,
          taskId: existing.id,
          challanId: existing.challanId,
          photoUrl: updates.photoUrl || existing.photoUrl,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      saveDB();
      return db.tasks[idx]!;
    },
  },
  notifications: {
    list: async (userId, companyId) => {
      const currentUser = useAppStore.getState().currentUser;
      const effectiveUserId = userId || currentUser?.id;
      let list = db.notifications;
      if (effectiveUserId) {
        list = list.filter((n) => n.userId === effectiveUserId);
      }
      if (companyId && companyId !== 'all') {
        list = list.filter((n) => n.companyId === companyId || n.companyId === 'all');
      }
      return list;
    },
    markAsRead: async (id) => {
      const currentUser = useAppStore.getState().currentUser;
      const target = db.notifications.find((n) => n.id === id);
      if (target && (!currentUser?.id || target.userId === currentUser.id)) {
        target.read = true;
        saveDB();
      }
    },
    markAllAsRead: async (userId) => {
      const currentUser = useAppStore.getState().currentUser;
      const effectiveUserId = userId || currentUser?.id;
      db.notifications.forEach((n) => {
        if (!effectiveUserId || n.userId === effectiveUserId) {
          n.read = true;
        }
      });
      saveDB();
    },
  },
};
