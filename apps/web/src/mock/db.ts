import {
  calculateAgingSummary,
  Challan,
  getAgingBucket,
  getDaysOverdue,
  Id,
  Notebook,
  OutboxItem,
  Party,
  StockBalance,
} from '@saas/shared';
import { ApiClient, HomeSummary } from '../api/client.js';
import {
  FIXED_TODAY,
  INITIAL_AGENT,
  INITIAL_BALANCES,
  INITIAL_BILLS,
  INITIAL_CHALLANS,
  INITIAL_COMPANIES,
  INITIAL_GODOWNS,
  INITIAL_LEDGER_SAMPLE,
  INITIAL_NOTEBOOKS,
  INITIAL_PARTIES,
  INITIAL_REPLY_THREADS,
  INITIAL_RULES,
  INITIAL_STOCK,
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
}

const STORAGE_KEY = 'mock-db-v3';

function loadDB(): MockDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
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
  },
  agent: {
    status: async () => ({ ...db.agent }),
    createPairingCode: async () => ({
      code: '839201',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }),
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
    list: async (companyId, query, type) => {
      let list =
        companyId === 'all'
          ? db.challans
          : db.challans.filter((c) => c.companyId === companyId);

      if (type && type !== 'all') {
        list = list.filter((c) => c.type === type);
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
            (c.lrNo?.toLowerCase().includes(q) ?? false)
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
    list: async () => [],
  },
  users: {
    list: async () => db.users,
  },
};
