import {
  ActivityEvent,
  Agent,
  Bill,
  Challan,
  Company,
  Id,
  LedgerLine,
  Notebook,
  Party,
  ReminderMessage,
  ReminderRule,
  ReplyThread,
  StockBalance,
  StockItem,
  User,
} from '@saas/shared';

export interface HomeSummary {
  totalReceivables: number; // in paise
  totalOverdue: number; // in paise
  notDuePercentage: number;
  latePercentage: number;
  over30Percentage: number;
  needsAttention: Array<{
    id: string;
    type: 'overdue' | 'reply' | 'stock' | 'outbox';
    title: string;
    subtitle: string;
    actionLabel: string;
    actionPath: string;
  }>;
  mostOverdue: Array<{
    party: Party;
    amount: number;
    daysLate: number;
    invoiceRef?: string;
  }>;
  companyBreakdown?: Array<{
    company: Company;
    totalAmount: number;
    overdueAmount: number;
  }>;
}

export interface ApiClient {
  companies: {
    list: () => Promise<Company[]>;
  };
  agent: {
    status: () => Promise<Agent>;
    createPairingCode: () => Promise<{ code: string; expiresAt: string }>;
  };
  home: {
    summary: (companyId: Id | 'all') => Promise<HomeSummary>;
  };
  parties: {
    list: (companyId: Id | 'all', query?: string) => Promise<Party[]>;
    get: (id: Id) => Promise<Party | null>;
    update: (id: Id, updates: Partial<Party>) => Promise<Party>;
  };
  bills: {
    list: (companyId: Id | 'all', partyId?: Id) => Promise<Bill[]>;
  };
  ledger: {
    get: (partyId: Id) => Promise<LedgerLine[]>;
  };
  reminders: {
    rules: {
      get: () => Promise<ReminderRule>;
      update: (rule: Partial<ReminderRule>) => Promise<ReminderRule>;
    };
    send: (partyId: Id, billId?: Id) => Promise<{ success: boolean; messageId: string }>;
    messages: {
      list: (companyId: Id | 'all') => Promise<ReminderMessage[]>;
    };
    replies: {
      list: (companyId: Id | 'all') => Promise<ReplyThread[]>;
      send: (threadId: Id, text: string) => Promise<void>;
    };
  };
  stock: {
    items: {
      list: (companyId: Id | 'all', query?: string) => Promise<StockItem[]>;
      get: (id: Id) => Promise<{ item: StockItem; balances: StockBalance[] } | null>;
    };
    adjust: (itemId: Id, godownId: Id, deltaQty: number, reason: string) => Promise<void>;
  };
  challans: {
    list: (companyId: Id | 'all') => Promise<Challan[]>;
    get: (id: Id) => Promise<Challan | null>;
    create: (data: Omit<Challan, 'id' | 'status'>) => Promise<Challan>;
  };
  notebooks: {
    list: (companyId: Id | 'all') => Promise<Notebook[]>;
    get: (id: Id) => Promise<Notebook | null>;
    save: (notebook: Notebook) => Promise<Notebook>;
  };
  activity: {
    list: (companyId: Id | 'all') => Promise<ActivityEvent[]>;
  };
  users: {
    list: () => Promise<User[]>;
  };
}
