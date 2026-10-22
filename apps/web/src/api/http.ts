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
  User,
} from '@saas/shared';
import { ApiClient, HomeSummary } from './client.js';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
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
    createPairingCode: () => fetchJSON<{ code: string; expiresAt: string }>('/agent/pairing-code', { method: 'POST' }),
    triggerSync: () => fetchJSON<{ success: boolean; syncedAt: string; ledgersCount: number; vouchersCount: number }>('/agent/sync', { method: 'POST' }),
  },
  home: {
    summary: (companyId: Id | 'all') => fetchJSON<HomeSummary>(`/home/summary?companyId=${companyId}`),
  },
  parties: {
    list: (companyId: Id | 'all', query?: string) => {
      const q = query ? `&q=${encodeURIComponent(query)}` : '';
      return fetchJSON<Party[]>(`/parties?companyId=${companyId}${q}`);
    },
    get: (id: Id) => fetchJSON<Party>(`/parties/${id}`),
    update: (id: Id, updates: Partial<Party>) =>
      fetchJSON<Party>(`/parties/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  },
  bills: {
    list: (companyId: Id | 'all', partyId?: Id) => {
      const p = partyId ? `&partyId=${partyId}` : '';
      return fetchJSON<Bill[]>(`/bills?companyId=${companyId}${p}`);
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
      list: async (_companyId: Id | 'all', query?: string) => {
        const q = query ? `?q=${encodeURIComponent(query)}` : '';
        const list = await fetchJSON<Array<{ item: StockItem; totalQty: number; balances: StockBalance[]; lowStock: boolean }>>(`/stock${q}`);
        return list.map(l => l.item);
      },
      get: async (id: Id) => {
        try {
          const detail = await fetchJSON<{ item: StockItem; balances: StockBalance[] }>(`/stock/${id}`);
          return detail;
        } catch {
          return null;
        }
      },
    },
    adjust: (itemId: Id, godownId: Id, deltaQty: number, reason: string) =>
      fetchJSON<void>('/stock/adjust', {
        method: 'POST',
        body: JSON.stringify({ itemId, godownId, deltaQty, reason }),
      }),
  },
  challans: {
    list: (companyId: Id | 'all', _query?: string, type?: 'sales' | 'purchase' | 'delivery' | 'all', itemIds?: string[]) => {
      const params = new URLSearchParams();
      if (companyId && companyId !== 'all') params.append('companyId', companyId);
      if (type && type !== 'all') params.append('type', type);
      if (itemIds && itemIds.length > 0) params.append('itemIds', itemIds.join(','));
      return fetchJSON<Challan[]>(`/challans?${params.toString()}`);
    },
    get: (id: Id) => fetchJSON<Challan>(`/challans/${id}`),
    create: (data: Omit<Challan, 'id'>) =>
      fetchJSON<Challan>('/challans', { method: 'POST', body: JSON.stringify(data) }),
    retry: (id: Id) => fetchJSON<Challan>(`/challans/${id}/retry`, { method: 'POST' }),
  },
  tasks: {
    list: (companyId: Id | 'all', filter?: { challanId?: string; assignedToUserId?: string; status?: 'pending' | 'in_progress' | 'completed' }) => {
      const params = new URLSearchParams();
      if (companyId && companyId !== 'all') params.append('companyId', companyId);
      if (filter?.challanId) params.append('challanId', filter.challanId);
      if (filter?.assignedToUserId) params.append('assignedToUserId', filter.assignedToUserId);
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
    updateRole: (id: Id, role: Role) =>
      fetchJSON<User>(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    create: (data: Omit<User, 'id'>) =>
      fetchJSON<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
    login: (phone: string, pin: string) =>
      fetchJSON<{ success: boolean; user?: User; error?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, pin }),
      }),
  },
  permissions: {
    get: () => fetchJSON<Record<Role, Record<string, boolean>>>('/permissions'),
    update: (perms: Record<Role, Record<string, boolean>>) =>
      fetchJSON<Record<Role, Record<string, boolean>>>('/permissions', {
        method: 'PUT',
        body: JSON.stringify(perms),
      }),
  },
};
