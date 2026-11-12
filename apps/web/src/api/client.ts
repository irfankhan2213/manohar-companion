import {
  ActivityEvent,
  Agent,
  Bill,
  Challan,
  Company,
  Godown,
  Id,
  LedgerLine,
  Notebook,
  Notification,
  OutboxItem,
  Party,
  ReminderMessage,
  ReminderRule,
  ReplyThread,
  Role,
  StockBalance,
  StockItem,
  Task,
  Tenant,
  User,
} from '@saas/shared';

export interface HomeSummary {
  totalReceivables: number; // in paise
  totalDebit?: number; // in paise
  totalCredit?: number; // in paise
  totalOverdue: number; // in paise
  notDuePercentage: number;
  latePercentage: number;
  over30Percentage: number;
  whatsappAttached?: boolean;
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
    get?: (id: Id) => Promise<Company | null>;
    create?: (data: Partial<Company>) => Promise<Company>;
    update?: (id: Id, updates: Partial<Company>) => Promise<Company>;
  };
  agent: {
    status: () => Promise<Agent>;
    createPairingCode: (companyId?: string) => Promise<{ code: string; expiresAt: string; companyId?: string; companyName?: string }>;
    triggerSync: () => Promise<{
      success: boolean;
      syncedAt: string;
      ledgersCount: number;
      vouchersCount: number;
    }>;
    resetAlterId: (companyId?: string) => Promise<{ success: boolean; message: string; companyId?: string }>;
  };
  home: {
    summary: (companyId: Id | 'all') => Promise<HomeSummary>;
  };
  parties: {
    list: (companyId: Id | 'all', query?: string, type?: 'debtor' | 'creditor') => Promise<Party[]>;
    get: (id: Id) => Promise<Party | null>;
    create: (data: Partial<Party>) => Promise<Party>;
    update: (id: Id, updates: Partial<Party>) => Promise<Party>;
  };
  bills: {
    list: (
      companyId: Id | 'all',
      partyIdOrOptions?: Id | { partyId?: Id; partyName?: string; startDate?: string; endDate?: string; q?: string },
      options?: { partyId?: Id; partyName?: string; startDate?: string; endDate?: string; q?: string }
    ) => Promise<Bill[]>;
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
      list: (companyId: Id | 'all', query?: string) => Promise<Array<StockItem & { totalQty?: number; balances?: StockBalance[] }>>;
      get: (id: Id) => Promise<{ item: StockItem; balances: StockBalance[] } | null>;
      create: (data: Partial<StockItem> & { name: string; unit?: string; group?: string; rate?: number; balances?: Array<{ godownId: string; qty: number }> }) => Promise<StockItem>;
      update: (id: Id, data: Partial<StockItem> & { balances?: Array<{ godownId: string; qty: number }> }) => Promise<StockItem>;
      delete: (id: Id) => Promise<{ success: boolean }>;
    };
    adjust: (itemId: Id, godownId: Id, deltaQty: number, reason: string) => Promise<void>;
  };
  challans: {
    list: (
      companyId: Id | 'all',
      query?: string,
      type?: 'sales' | 'purchase' | 'delivery' | 'all',
      itemIds?: string[],
      options?: { partyId?: string; partyName?: string; startDate?: string; endDate?: string }
    ) => Promise<Challan[]>;
    get: (id: Id) => Promise<Challan | null>;
    create: (data: Omit<Challan, 'id'>) => Promise<Challan>;
    update?: (id: Id, updates: Partial<Challan>) => Promise<Challan>;
    retry: (id: Id) => Promise<Challan>;
    updateStatus?: (id: Id, status: Challan['status'], failureReason?: string) => Promise<Challan>;
    delete?: (id: Id) => Promise<{ success: boolean; id: string }>;
  };
  tasks: {
    list: (
      companyId: Id | 'all',
      filter?: {
        challanId?: string;
        assignedToUserId?: string;
        assignedByUserId?: string;
        status?: 'pending' | 'in_progress' | 'completed';
      }
    ) => Promise<Task[]>;
    get: (id: Id) => Promise<Task | null>;
    create: (data: Omit<Task, 'id' | 'createdAt'>) => Promise<Task>;
    update: (id: Id, updates: Partial<Task>) => Promise<Task>;
  };
  notifications: {
    list: (userId?: string, companyId?: Id | 'all') => Promise<Notification[]>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: (userId?: string) => Promise<void>;
  };
  notebooks: {
    list: (companyId: Id | 'all') => Promise<Notebook[]>;
    get: (id: Id) => Promise<Notebook | null>;
    save: (notebook: Notebook) => Promise<Notebook>;
    delete?: (id: Id) => Promise<{ success: boolean }>;
  };
  activity: {
    list: (companyId: Id | 'all') => Promise<ActivityEvent[]>;
  };
  godowns: {
    list: (companyId: Id | 'all') => Promise<Godown[]>;
  };
  outbox: {
    list: (companyId: Id | 'all') => Promise<OutboxItem[]>;
  };
  users: {
    list: () => Promise<User[]>;
    update?: (id: Id, data: Partial<User>) => Promise<User>;
    updateRole?: (id: Id, role: Role) => Promise<User>;
    create?: (data: Partial<User> & { name: string; phone: string; role: Role }) => Promise<User>;
    delete?: (id: Id) => Promise<{ success: boolean }>;
  };
  permissions?: {
    get: () => Promise<Record<Role, Record<string, boolean>>>;
    update: (perms: Record<Role, Record<string, boolean>>) => Promise<Record<Role, Record<string, boolean>>>;
  };
  auth: {
    login: (phone: string, pin: string) => Promise<{
      success: boolean;
      token?: string;
      user?: User;
      tenant?: Tenant;
      companies?: Company[];
      error?: string;
    }>;
    me: () => Promise<{ user: User; tenant: Tenant; companies: Company[] }>;
    logout: () => Promise<{ success: boolean }>;
  };
  dev: {
    clients: {
      list: () => Promise<Array<Tenant & { companies: Company[]; owner: any }>>;
      create: (data: {
        name: string;
        ownerName: string;
        ownerPhone: string;
        ownerPin?: string;
        tallyCompanyName?: string;
        financialYear?: string;
      }) => Promise<{ success: boolean; tenant: Tenant; owner: User; company: Company }>;
    };
  };
}
