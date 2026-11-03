import { TallyClient } from '../tally/client.js';
import { StateStore } from './state.js';
import { TallySyncPayload, VoucherImportResult } from '../types.js';
import {
  StockAdjustmentVoucherParams,
  DeliveryChallanVoucherParams,
  buildStockJournalVoucherXml,
  buildDeliveryChallanVoucherXml,
} from '../tally/templates.js';

function slugify(text: string): string {
  const ascii = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii) return ascii;
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
  }
  return `item-${Math.abs(hash).toString(36)}`;
}

export interface SyncEngineOptions {
  client: TallyClient;
  store: StateStore;
  cloudUrl?: string;
  companyId?: string;
  agentSecretKey?: string;
  pollIntervalMs?: number;
  onSyncComplete?: (payload: TallySyncPayload) => void;
  onSyncError?: (error: Error) => void;
}

export class SyncEngine {
  private client: TallyClient;
  private store: StateStore;
  private cloudUrl?: string;
  private companyId?: string;
  private agentSecretKey?: string;
  private pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private onSyncComplete?: (payload: TallySyncPayload) => void;
  private onSyncError?: (error: Error) => void;

  constructor(options: SyncEngineOptions) {
    this.client = options.client;
    this.store = options.store;
    this.cloudUrl = options.cloudUrl || process.env.CLOUD_URL || options.store.get().cloudUrl;
    this.companyId = options.companyId || process.env.COMPANY_ID || options.store.get().companyId;
    this.agentSecretKey = options.agentSecretKey || process.env.AGENT_KEY || options.store.get().agentSecretKey || 'dev-agent-secret-key';
    this.pollIntervalMs = options.pollIntervalMs || 30000;
    this.onSyncComplete = options.onSyncComplete;
    this.onSyncError = options.onSyncError;
  }

  public async runSyncOnce(): Promise<TallySyncPayload> {
    const startTime = Date.now();
    const currentState = this.store.get();
    const lastAlterId = currentState.lastAlterId || 0;

    try {
      // 1. Fetch Company Info from Tally
      const company = await this.client.getCompanyInfo();

      // 2. Fetch Ledgers incrementally where AlterID > lastAlterId
      const ledgers = await this.client.getLedgers(lastAlterId);

      // 3. Fetch Bills Outstanding
      const bills = await this.client.getBills();

      // 4. Fetch Stock Items incrementally where AlterID > lastAlterId
      const stockItems = await this.client.getStockItems(lastAlterId);

      // 5. Compute max AlterID seen across new ledgers & stock items
      let maxAlterId = lastAlterId;
      for (const l of ledgers) {
        if (l.alterId > maxAlterId) maxAlterId = l.alterId;
      }
      for (const s of stockItems) {
        if (s.alterId > maxAlterId) maxAlterId = s.alterId;
      }

      const nowIso = new Date().toISOString();
      const payload: TallySyncPayload = {
        company,
        ledgers,
        bills,
        stockItems,
        maxAlterId,
        syncedAt: nowIso,
        durationMs: Date.now() - startTime,
      };

      // 6. Push data to SaaS Cloud if configured
      if (this.cloudUrl) {
        await this.pushToCloud(payload);
        await this.pullOutboxFromCloud();
      }

      // 7. Update local state after successful cloud push
      this.store.update({
        companyName: company.name,
        lastAlterId: maxAlterId,
        lastSyncedAt: nowIso,
        status: 'online',
      });

      this.onSyncComplete?.(payload);
      return payload;
    } catch (err: any) {
      this.store.update({ status: 'offline' });
      this.onSyncError?.(err);
      throw err;
    }
  }

  public async pushToCloud(payload: TallySyncPayload): Promise<void> {
    if (!this.cloudUrl) return;

    const companyId = this.companyId || this.store.get().companyId;
    const key = this.agentSecretKey || this.store.get().agentSecretKey || 'dev-agent-secret-key';
    const companyPrefix = companyId ? `${slugify(companyId)}-` : '';

    // Map ledgers (Sundry Debtors & Creditors) to Parties with company-scoped IDs to prevent cross-company collisions
    const parties = payload.ledgers
      .filter((l) => l.isSundryDebtor || l.isSundryCreditor || l.parent.toLowerCase().includes('debtor') || l.parent.toLowerCase().includes('creditor'))
      .map((l) => ({
        id: `p-${companyPrefix}${slugify(l.name)}`,
        name: l.name,
        city: '',
        phones: l.phone ? [l.phone] : [],
        gstin: l.gstin || null,
        creditDays: l.creditDays || 30,
        notes: `Imported from Tally (${l.parent})`,
      }));

    // Map bills to Bills with company-scoped IDs and preserved opening invoice amounts
    const bills = payload.bills.map((b) => ({
      id: `b-${companyPrefix}${slugify(b.partyName)}-${slugify(b.billNo)}`,
      partyId: `p-${companyPrefix}${slugify(b.partyName)}`,
      billNo: b.billNo,
      date: b.billDate,
      dueDate: b.dueDate,
      dueDays: 30,
      amount: b.openingAmount ?? b.pendingAmount,
      pending: b.pendingAmount,
      source: 'tally_bill',
    }));

    // Map stock items with company-scoped IDs
    const stockItems = payload.stockItems.map((s) => ({
      id: `s-${companyPrefix}${slugify(s.name)}`,
      name: s.name,
      partNo: s.partNo || null,
      unit: s.baseUnits || 'pcs',
      group: s.parent || 'General',
      rate: s.closingRate || 0,
      closingQty: s.closingQty || 0,
      reorderLevel: 5,
      alias: null,
    }));

    const pushRes = await fetch(`${this.cloudUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-key': key,
      },
      body: JSON.stringify({
        companyId,
        alterId: payload.maxAlterId,
        parties,
        bills,
        stockItems,
      }),
    });

    if (!pushRes.ok) {
      const err = await pushRes.text();
      throw new Error(`Cloud sync push failed (${pushRes.status}): ${err}`);
    }

    const pushData: any = await pushRes.json();
    this.store.update({
      cloudStatus: 'connected',
      lastCloudSyncAt: new Date().toISOString(),
      lastSyncStats: {
        partiesUpdated: pushData.partiesUpdated || 0,
        billsUpdated: pushData.billsUpdated || 0,
        stockUpdated: pushData.stockUpdated || 0,
      },
    });

    // Ping agent state
    try {
      await fetch(`${this.cloudUrl}/api/agent/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-key': key,
        },
        body: JSON.stringify({ companyId }),
      });
    } catch {}
  }

  public async pullOutboxFromCloud(): Promise<number> {
    if (!this.cloudUrl) return 0;
    const companyId = this.companyId || this.store.get().companyId;
    const key = this.agentSecretKey || this.store.get().agentSecretKey || 'dev-agent-secret-key';

    const pullUrl = companyId
      ? `${this.cloudUrl}/api/sync/pull?companyId=${encodeURIComponent(companyId)}`
      : `${this.cloudUrl}/api/sync/pull`;

    const pullRes = await fetch(pullUrl, {
      headers: {
        'x-agent-key': key,
      },
    });

    if (!pullRes.ok) return 0;
    const queuedItems: any[] = await pullRes.json();
    let syncedCount = 0;

    for (const item of queuedItems) {
      try {
        const formattedDate = item.date
          ? item.date.replace(/-/g, '')
          : new Date().toISOString().slice(0, 10).replace(/-/g, '');

        let result: VoucherImportResult;
        if (item.kind === 'stock_journal') {
          result = await this.pushStockAdjustment({
            date: formattedDate,
            voucherNumber: item.number || item.id,
            narration: item.narration || item.reason || `Mobile Stock Adjustment (${item.id})`,
            itemName: item.itemName || item.refId,
            godownName: item.godownName || 'Main Location',
            qty: item.deltaQty ?? item.qty ?? 0,
            unit: item.unit || 'pcs',
            rateRupees: (item.rate || 0) / 100,
          });
        } else {
          result = await this.pushDeliveryChallan({
            date: formattedDate,
            voucherNumber: item.number || item.id,
            partyName: item.partyName || item.partyId,
            narration: item.narration || `Mobile Challan (${item.id})`,
            vehicleNo: item.vehicleNo,
            voucherType: item.type || 'delivery',
            items: (item.lines || []).map((l: any) => ({
              itemName: l.description || l.itemId,
              godownName: item.godownName,
              qty: l.qty || 1,
              unit: l.unit || 'pcs',
              rateRupees: (l.rate || 0) / 100,
            })),
          });
        }

        const status = result.success && result.errors === 0 ? 'synced' : 'failed';
        await fetch(`${this.cloudUrl}/api/sync/ack`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-agent-key': key,
          },
          body: JSON.stringify({
            challanId: item.id,
            outboxId: item.outboxId || item.id,
            kind: item.kind || 'challan',
            status,
            failureReason: status === 'failed' ? result.message || 'Tally XML import error' : null,
          }),
        });

        if (status === 'synced') syncedCount++;
      } catch (err: any) {
        console.error(`[SyncEngine] Failed to import item ${item.id} to Tally:`, err.message);
      }
    }

    return syncedCount;
  }

  // Push a stock adjustment to Tally
  public async pushStockAdjustment(params: StockAdjustmentVoucherParams): Promise<VoucherImportResult> {
    const xml = buildStockJournalVoucherXml(params);
    return await this.client.postVoucher(xml);
  }

  // Push a delivery challan to Tally
  public async pushDeliveryChallan(params: DeliveryChallanVoucherParams): Promise<VoucherImportResult> {
    const xml = buildDeliveryChallanVoucherXml(params);
    return await this.client.postVoucher(xml);
  }

  public startPolling(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const poll = async () => {
      try {
        await this.runSyncOnce();
      } catch (err: any) {
        console.error(`[SyncEngine] Poll failed: ${err.message}`);
      }

      if (this.isRunning) {
        this.pollTimer = setTimeout(poll, this.pollIntervalMs);
      }
    };

    // Run first sync immediately
    poll();
  }

  public stopPolling(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      state: this.store.get(),
      isMock: this.client.isMockMode(),
    };
  }
}
