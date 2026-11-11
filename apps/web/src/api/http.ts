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
  setCustomPermissions,
} from '@saas/shared';
import { ApiClient, HomeSummary } from './client.js';
import { useAppStore } from '../app/store.js';

const getApiBase = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') {
    return '/api';
  }
  return 'http://localhost:3001/api';
};

const API_BASE = getApiBase();

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const { authToken: token, currentTenant } = useAppStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (currentTenant?.id && currentTenant.id !== 'platform') {
    headers['X-Tenant-Id'] = currentTenant.id;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    if (res.status === 401 && !url.includes('/auth/login')) {
      useAppStore.getState().logout();
    }
    const errorText = await res.text();
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }
  return res.json();
}

export const httpApiClient: ApiClient = {
  companies: {
    list: () => fetchJSON<Company[]>('/companies'),
    get: (id: Id) => fetchJSON<Company>(`/companies/${id}`),
    create: (data: Partial<Company>) =>
      fetchJSON<Company>('/companies', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: Id, updates: Partial<Company>) =>
      fetchJSON<Company>(`/companies/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  },
  agent: {
    status: () => fetchJSON<Agent>('/agent/status'),
    createPairingCode: (companyId?: string) =>
      fetchJSON<{ code: string; expiresAt: string; companyId?: string; companyName?: string }>(
        '/agent/pairing-code',
        { method: 'POST', body: JSON.stringify({ companyId }) }
      ),
    triggerSync: () => fetchJSON<{ success: boolean; syncedAt: string; ledgersCount: number; vouchersCount: number }>('/agent/sync', { method: 'POST' }),
    resetAlterId: (companyId?: string) =>
      fetchJSON<{ success: boolean; message: string; companyId?: string }>('/agent/reset-alter-id', {
        method: 'POST',
        body: JSON.stringify({ companyId }),
      }),
  },
  home: {
    summary: (companyId: Id | 'all') => fetchJSON<HomeSummary>(`/home/summary?companyId=${companyId}`),
  },
  parties: {
    list: (companyId: Id | 'all', query?: string, type?: 'debtor' | 'creditor') => {
      const q = query ? `&q=${encodeURIComponent(query)}` : '';
      const t = type ? `&type=${encodeURIComponent(type)}` : '';
      return fetchJSON<Party[]>(`/parties?companyId=${companyId}${q}${t}`);
    },
    get: async (id: Id) => {
      try {
        return await fetchJSON<Party>(`/parties/${id}`);
      } catch {
        return null as any;
      }
    },
    create: (data: Partial<Party>) =>
      fetchJSON<Party>('/parties', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: Id, updates: Partial<Party>) =>
      fetchJSON<Party>(`/parties/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  },
  bills: {
    list: (
      companyId: Id | 'all',
      partyIdOrOptions?: Id | { partyId?: Id; partyName?: string; startDate?: string; endDate?: string; q?: string },
      options?: { partyId?: Id; partyName?: string; startDate?: string; endDate?: string; q?: string }
    ) => {
      const params = new URLSearchParams();
      if (companyId && companyId !== 'all') params.append('companyId', companyId);

      const opts = typeof partyIdOrOptions === 'object' && partyIdOrOptions !== null
        ? partyIdOrOptions
        : { partyId: partyIdOrOptions, ...options };

      if (opts.partyId) params.append('partyId', opts.partyId);
      if (opts.partyName) params.append('partyName', opts.partyName);
      if (opts.startDate) params.append('startDate', opts.startDate);
      if (opts.endDate) params.append('endDate', opts.endDate);
      if (opts.q) params.append('q', opts.q);

      const qs = params.toString() ? `?${params.toString()}` : '';
      return fetchJSON<Bill[]>(`/bills${qs}`);
    },
  },
  ledger: {
    get: (partyId: Id) => fetchJSON<LedgerLine[]>(`/ledger/${partyId}`),
  },
  reminders: {
    rules: {
      get: () => fetchJSON<ReminderRule>('/reminders/rules'),
      update: (rule: Partial<ReminderRule>) =>
        fetchJSON<ReminderRule>('/reminders/rules', { method: 'PUT', body: JSON.stringify(rule) }),
    },
    send: (partyId: Id, billId?: Id) =>
      fetchJSON<{ success: boolean; messageId: string }>('/reminders/send', {
        method: 'POST',
        body: JSON.stringify({ partyId, billId }),
      }),
    messages: {
      list: (companyId: Id | 'all') => fetchJSON<ReminderMessage[]>(`/reminders/messages?companyId=${companyId}`),
    },
    replies: {
      list: (companyId: Id | 'all') => fetchJSON<ReplyThread[]>(`/reminders/replies?companyId=${companyId}`),
      send: (threadId: Id, text: string) =>
        fetchJSON<void>(`/reminders/replies/${threadId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text }),
        }),
    },
  },
  stock: {
    items: {
      list: async (companyId: Id | 'all', query?: string) => {
        const params = new URLSearchParams();
        if (companyId && companyId !== 'all') params.set('companyId', companyId);
        if (query) params.set('q', query);
        const qs = params.toString() ? `?${params.toString()}` : '';
        const list = await fetchJSON<Array<{ item: StockItem; totalQty: number; balances: StockBalance[]; lowStock: boolean }>>(`/stock${qs}`);
        return list.map(l => ({ ...l.item, totalQty: l.totalQty, balances: l.balances }));
      },
      get: async (id: Id) => {
        try {
          const detail = await fetchJSON<{ item: StockItem; balances: StockBalance[] }>(`/stock/${id}`);
          return detail;
        } catch {
          return null;
        }
      },
      create: (data: any) =>
        fetchJSON<StockItem>('/stock', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (id: Id, data: any) =>
        fetchJSON<StockItem>(`/stock/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      delete: (id: Id) =>
        fetchJSON<{ success: boolean }>(`/stock/${id}`, {
          method: 'DELETE',
        }),
    },
    adjust: (itemId: Id, godownId: Id, deltaQty: number, reason: string) =>
      fetchJSON<void>('/stock/adjust', {
        method: 'POST',
        body: JSON.stringify({ itemId, godownId, deltaQty, reason }),
      }),
  },
  challans: {
    list: (
      companyId: Id | 'all',
      query?: string,
      type?: 'sales' | 'purchase' | 'delivery' | 'all',
      itemIds?: string[],
      options?: { partyId?: string; partyName?: string; startDate?: string; endDate?: string }
    ) => {
      const params = new URLSearchParams();
      if (companyId && companyId !== 'all') params.append('companyId', companyId);
      if (query && query.trim()) params.append('q', query.trim());
      if (type && type !== 'all') params.append('type', type);
      if (itemIds && itemIds.length > 0) params.append('itemIds', itemIds.join(','));
      if (options?.partyId) params.append('partyId', options.partyId);
      if (options?.partyName) params.append('partyName', options.partyName);
      if (options?.startDate) params.append('startDate', options.startDate);
      if (options?.endDate) params.append('endDate', options.endDate);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return fetchJSON<Challan[]>(`/challans${qs}`);
    },
    get: (id: Id) => fetchJSON<Challan>(`/challans/${id}`),
    create: (data: Omit<Challan, 'id'>) =>
      fetchJSON<Challan>('/challans', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: Id, updates: Partial<Challan>) =>
      fetchJSON<Challan>(`/challans/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    retry: (id: Id) => fetchJSON<Challan>(`/challans/${id}/retry`, { method: 'POST' }),
    updateStatus: (id: Id, status: Challan['status'], failureReason?: string) =>
      fetchJSON<Challan>(`/challans/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, failureReason }),
      }),
    delete: (id: Id) =>
      fetchJSON<{ success: boolean; id: string }>(`/challans/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: (
      companyId: Id | 'all',
      filter?: {
        challanId?: string;
        assignedToUserId?: string;
        assignedByUserId?: string;
        status?: 'pending' | 'in_progress' | 'completed';
      }
    ) => {
      const params = new URLSearchParams();
      if (companyId && companyId !== 'all') params.append('companyId', companyId);
      if (filter?.challanId) params.append('challanId', filter.challanId);
      if (filter?.assignedToUserId) params.append('assignedToUserId', filter.assignedToUserId);
      if (filter?.assignedByUserId) params.append('assignedByUserId', filter.assignedByUserId);
      if (filter?.status) params.append('status', filter.status);
      return fetchJSON<Task[]>(`/tasks?${params.toString()}`);
    },
    get: (id: Id) => fetchJSON<Task>(`/tasks/${id}`),
    create: (data: Omit<Task, 'id' | 'createdAt'>) =>
      fetchJSON<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: Id, updates: Partial<Task>) =>
      fetchJSON<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  },
  notifications: {
    list: (userId?: string, companyId?: Id | 'all') => {
      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (companyId && companyId !== 'all') params.append('companyId', companyId);
      return fetchJSON<Notification[]>(`/notifications?${params.toString()}`);
    },
    markAsRead: (id: string) => fetchJSON<void>(`/notifications/${id}/read`, { method: 'POST' }),
    markAllAsRead: (userId?: string) =>
      fetchJSON<void>('/notifications/read-all', { method: 'POST', body: JSON.stringify({ userId }) }),
  },
  notebooks: {
    list: (companyId: Id | 'all') => fetchJSON<Notebook[]>(`/notebooks?companyId=${companyId}`),
    get: (id: Id) => fetchJSON<Notebook>(`/notebooks/${id}`),
    save: (notebook: Notebook) =>
      fetchJSON<Notebook>('/notebook', { method: 'PUT', body: JSON.stringify(notebook) }),
    delete: (id: Id) =>
      fetchJSON<{ success: boolean }>(`/notebooks/${id}`, { method: 'DELETE' }),
  },
  activity: {
    list: (companyId: Id | 'all') => fetchJSON<ActivityEvent[]>(`/activity?companyId=${companyId}`),
  },
  godowns: {
    list: (companyId: Id | 'all') => fetchJSON<Godown[]>(`/godowns?companyId=${companyId}`),
  },
  outbox: {
    list: (companyId: Id | 'all') => fetchJSON<OutboxItem[]>(`/outbox?companyId=${companyId}`),
  },
  users: {
    list: () => fetchJSON<User[]>('/users'),
    update: (id: Id, data: Partial<User>) =>
      fetchJSON<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateRole: (id: Id, role: Role) =>
      fetchJSON<User>(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    create: (data: Partial<User> & { name: string; phone: string; role: Role }) =>
      fetchJSON<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: Id) =>
      fetchJSON<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),
  },
  permissions: {
    get: async () => {
      const perms = await fetchJSON<Record<Role, Record<string, boolean>>>('/permissions');
      setCustomPermissions(perms as any);
      return perms;
    },
    update: async (perms: Record<Role, Record<string, boolean>>) => {
      const updated = await fetchJSON<Record<Role, Record<string, boolean>>>('/permissions', {
        method: 'PUT',
        body: JSON.stringify(perms),
      });
      setCustomPermissions(updated as any);
      return updated;
    },
  },
  auth: {
    login: (phone: string, pin: string) =>
      fetchJSON<{
        success: boolean;
        token?: string;
        user?: User;
        tenant?: Tenant;
        companies?: Company[];
        error?: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, pin }),
      }),
    me: () => fetchJSON<{ user: User; tenant: Tenant; companies: Company[] }>('/auth/me'),
    logout: () => fetchJSON<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  },
  dev: {
    clients: {
      list: () => fetchJSON<Array<Tenant & { companies: Company[]; owner: any }>>('/dev/clients'),
      create: (data: {
        name: string;
        ownerName: string;
        ownerPhone: string;
        ownerPin?: string;
        tallyCompanyName?: string;
        financialYear?: string;
      }) =>
        fetchJSON<{ success: boolean; tenant: Tenant; owner: User; company: Company }>(
          '/dev/clients',
          {
            method: 'POST',
            body: JSON.stringify(data),
          }
        ),
    },
  },
};
