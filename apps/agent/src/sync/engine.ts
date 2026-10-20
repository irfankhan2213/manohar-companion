import { TallyClient } from '../tally/client.js';
import { StateStore } from './state.js';
import { TallySyncPayload, VoucherImportResult } from '../types.js';
import {
  StockAdjustmentVoucherParams,
  DeliveryChallanVoucherParams,
  buildStockJournalVoucherXml,
  buildDeliveryChallanVoucherXml,
} from '../tally/templates.js';

export interface SyncEngineOptions {
  client: TallyClient;
  store: StateStore;
  pollIntervalMs?: number;
  onSyncComplete?: (payload: TallySyncPayload) => void;
  onSyncError?: (error: Error) => void;
}

export class SyncEngine {
  private client: TallyClient;
  private store: StateStore;
  private pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private onSyncComplete?: (payload: TallySyncPayload) => void;
  private onSyncError?: (error: Error) => void;

  constructor(options: SyncEngineOptions) {
    this.client = options.client;
    this.store = options.store;
    this.pollIntervalMs = options.pollIntervalMs || 30000;
    this.onSyncComplete = options.onSyncComplete;
    this.onSyncError = options.onSyncError;
  }

  public async runSyncOnce(): Promise<TallySyncPayload> {
    const startTime = Date.now();
    const currentState = this.store.get();
    const lastAlterId = currentState.lastAlterId || 0;

    try {
      // 1. Fetch Company Info
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

      // 6. Update local state
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
