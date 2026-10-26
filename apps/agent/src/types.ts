import { Paise } from '@saas/shared';

export interface TallyCompanyInfo {
  name: string;
  financialYearFrom: string;
  booksFrom: string;
  guid?: string;
}

export interface TallyLedger {
  name: string;
  parent: string;
  openingBalance: Paise;
  closingBalance: Paise;
  phone?: string;
  email?: string;
  gstin?: string;
  creditDays?: number;
  alterId: number;
  isSundryDebtor: boolean;
  isSundryCreditor: boolean;
}

export interface TallyBill {
  partyName: string;
  billNo: string;
  billDate: string;
  dueDate: string;
  pendingAmount: Paise;
  isOverdue: boolean;
  daysOverdue: number;
}

export interface TallyStockItem {
  name: string;
  parent?: string;
  partNo?: string;
  closingQty: number;
  baseUnits: string;
  closingRate: Paise;
  closingValue: Paise;
  alterId: number;
}

export interface TallySyncPayload {
  company: TallyCompanyInfo;
  ledgers: TallyLedger[];
  bills: TallyBill[];
  stockItems: TallyStockItem[];
  maxAlterId: number;
  syncedAt: string;
  durationMs: number;
}

export interface AgentConfig {
  tallyUrl: string; // e.g. "http://127.0.0.1:9000"
  cloudUrl?: string; // e.g. "https://manohar.evolveexpert.com"
  companyId?: string; // e.g. "c-1793000752410"
  agentSecretKey?: string; // e.g. "dev-agent-secret-key"
  stateFilePath?: string;
  pollIntervalMs?: number;
  mockMode?: boolean;
}

export interface AgentState {
  cloudUrl?: string;
  companyId?: string;
  agentSecretKey?: string;
  tenantId?: string;
  companyName?: string;
  pairingKey?: string;
  lastAlterId: number;
  lastSyncedAt?: string;
  status: 'online' | 'offline';
  cloudStatus?: 'connected' | 'disconnected' | 'error';
  lastCloudSyncAt?: string;
  lastSyncStats?: {
    partiesUpdated: number;
    billsUpdated: number;
    stockUpdated: number;
  };
}

export interface VoucherImportResult {
  success: boolean;
  created: number;
  altered: number;
  errors: number;
  message?: string;
}
