import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TallyClient, matchFuzzyCompanyName, normalizeTallyCompanyName } from '../tally/client.js';
import { StateStore } from './state.js';
import {
  TallySyncPayload,
  VoucherImportResult,
  TallyCompanyInfo,
  TallyLedger,
  TallyBill,
  TallyStockItem,
  CompanySyncConfig,
} from '../types.js';
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
  private syncCount: number = 0;
  private pendingAlterIdReset: boolean = false;
  private knownCreditors: Set<string> = new Set();
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

  /**
   * Over-The-Air (OTA) silent self-updater for tally-agent.mjs.
   * Compares local bundle SHA-256 with Cloud /api/agent/version and atomically replaces bundle if changed.
   */
  public async checkAndApplyOtaUpdate(): Promise<boolean> {
    if (!this.cloudUrl || this.client.isMockMode()) return false;
    try {
      let scriptPath = '';
      try {
        if (typeof import.meta !== 'undefined' && import.meta.url) {
          scriptPath = fileURLToPath(import.meta.url);
        }
      } catch {}
      const mjsPath =
        scriptPath && scriptPath.endsWith('tally-agent.mjs')
          ? scriptPath
          : path.resolve(process.cwd(), 'tally-agent.mjs');
      if (!fs.existsSync(mjsPath)) return false;

      const localBuf = fs.readFileSync(mjsPath);
      const localSha = crypto.createHash('sha256').update(localBuf).digest('hex');

      const key = this.agentSecretKey || this.store.get().agentSecretKey || 'dev-agent-secret-key';
      const verRes = await fetch(`${this.cloudUrl}/api/agent/version`, {
        headers: { 'x-agent-key': key },
      });
      if (!verRes.ok) return false;
      const verData: any = await verRes.json();
      if (!verData?.sha256 || verData.sha256 === 'unknown' || verData.sha256 === localSha) {
        this.store.update({ bundleSha256: localSha });
        return false;
      }

      // Download updated bundle
      const bundleRes = await fetch(`${this.cloudUrl}/api/agent/bundle`, {
        headers: { 'x-agent-key': key },
      });
      if (!bundleRes.ok) return false;
      const newBuf = Buffer.from(await bundleRes.arrayBuffer());
      const downloadedSha = crypto.createHash('sha256').update(newBuf).digest('hex');
      if (downloadedSha !== verData.sha256 || newBuf.length < 1000) {
        return false;
      }

      const tmpPath = `${mjsPath}.tmp`;
      fs.writeFileSync(tmpPath, newBuf);

      // Create backup copy of currently working bundle before replacing
      try {
        if (fs.existsSync(mjsPath)) {
          fs.copyFileSync(mjsPath, `${mjsPath}.bak`);
        }
      } catch (backupErr: any) {
        console.warn(`[OTA] Failed to create tally-agent.mjs.bak backup: ${backupErr.message}`);
      }

      try {
        fs.renameSync(tmpPath, mjsPath);
      } catch {
        fs.copyFileSync(tmpPath, mjsPath);
        try {
          fs.unlinkSync(tmpPath);
        } catch {}
      }
      this.store.update({ bundleSha256: downloadedSha });
      console.log(`[OTA] Updated tally-agent.mjs to latest cloud bundle (${downloadedSha.slice(0, 8)}).`);
      if (this.isRunning) {
        console.log('[OTA] Exiting with code 42 so watchdog supervisor restarts updated agent...');
        process.exit(42);
      }
      return true;
    } catch {
      return false;
    }
  }

  private findCompanyConfigByName(name: string | undefined, list: CompanySyncConfig[] = []): CompanySyncConfig | undefined {
    if (!name) return undefined;
    const norm = normalizeTallyCompanyName(name);
    if (!norm) return undefined;
    return list.find((c) => {
      const cNorm = normalizeTallyCompanyName(c.tallyName || c.companyName);
      return cNorm && (cNorm === norm || cNorm.includes(norm) || norm.includes(cNorm));
    });
  }

  public async runSyncOnce(): Promise<TallySyncPayload> {
    const startTime = Date.now();
    const currentState = this.store.get();

    this.syncCount += 1;
    if (this.syncCount === 1 || this.syncCount % 20 === 0) {
      await this.checkAndApplyOtaUpdate();
    }

    try {
      // 1. Fetch active Company Info & Discover ALL Open Companies in TallyPrime directly
      // Never filter or require matching the Web App's companyName — always take whatever company is open in TallyPrime
      const company: TallyCompanyInfo = await this.client.getCompanyInfo();

      let openCompanies: TallyCompanyInfo[] = [];
      try {
        openCompanies = await this.client.getOpenCompanies();
      } catch {
        openCompanies = company?.name ? [company] : [];
      }

      const openNamesSet = new Set<string>();
      const openCompanyNames: string[] = [];
      for (const oc of [company, ...openCompanies]) {
        if (oc?.name && !openNamesSet.has(oc.name.toLowerCase())) {
          openNamesSet.add(oc.name.toLowerCase());
          openCompanyNames.push(oc.name);
        }
      }

      const targetCompany = company?.name;
      const activePort = this.client.getActivePort();

      // Always map the active Tally company to the paired companyId (or a previously synced entry for this Tally company)
      const knownList: CompanySyncConfig[] = Array.isArray(currentState.companies) ? [...currentState.companies] : [];
      const matchedConfig = this.findCompanyConfigByName(targetCompany, knownList);
      const primaryCompanyId = matchedConfig?.companyId || this.companyId || currentState.companyId;

      // If Tally's open company name differs from the last synced companyName in state (e.g. Web App had a different name),
      // start from AlterID 0 (or matchedConfig.lastAlterId) so ALL ledgers and stock items are exported
      const isSameAsPreviousSync =
        Boolean(currentState.companyName && targetCompany) &&
        normalizeTallyCompanyName(currentState.companyName || '') === normalizeTallyCompanyName(targetCompany || '');
      const lastAlterId = isSameAsPreviousSync
        ? (currentState.lastAlterId || 0)
        : (matchedConfig?.lastAlterId || 0);

      if (company?.name) {
        this.store.update({
          companyName: company.name,
          tallyPort: activePort,
          openTallyCompanies: openCompanyNames.length > 0 ? openCompanyNames : [company.name],
        });
      }

      // 2. CRITICAL RACE FIX: Pull queued mobile outbox items (stock adjustments & challans) FIRST
      // and write them to Tally BEFORE reading Tally's closing stock & ledger balances!
      if (this.cloudUrl && primaryCompanyId) {
        await this.pullOutboxFromCloud(primaryCompanyId, targetCompany);
      }

      // 3. Always fetch all Ledgers (from AlterID 0) because voucher entries in Tally (Sales, Receipt, Payment, Journal)
      // change a Ledger's CLOSINGBALANCE without incrementing the Ledger master's $AlterId!
      const ledgers: TallyLedger[] = await this.client.getLedgers(0);

      // 4. Fetch Bills Outstanding from the currently active Tally company without SVCURRENTCOMPANY name filtering
      const bills: TallyBill[] = await this.client.getBills();

      // 5. Always fetch all Stock Items (from AlterID 0) because voucher entries in Tally (Sales, Purchase, Challan, Stock Journal)
      // change a StockItem's CLOSINGBALANCE quantity without incrementing the StockItem master's $AlterId!
      const stockItems: TallyStockItem[] = await this.client.getStockItems(0);

      // 6. Compute max AlterID seen across new ledgers & stock items
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

      // 7. Push fresh Tally snapshot to SaaS Cloud
      let resolvedPrimaryId = primaryCompanyId;
      if (this.cloudUrl) {
        const pushResultId = await this.pushToCloud(payload, primaryCompanyId);
        if (pushResultId) resolvedPrimaryId = pushResultId;
      }

      // Record primary company sync in knownList
      const syncedNamesNorm = new Set<string>();
      const syncedCompanyIds = new Set<string>();
      if (targetCompany) syncedNamesNorm.add(normalizeTallyCompanyName(targetCompany));
      if (resolvedPrimaryId) syncedCompanyIds.add(resolvedPrimaryId);

      if (resolvedPrimaryId && targetCompany) {
        const existingIdx = knownList.findIndex(
          (c) => c.companyId === resolvedPrimaryId || normalizeTallyCompanyName(c.tallyName || c.companyName) === normalizeTallyCompanyName(targetCompany)
        );
        const updatedEntry: CompanySyncConfig = {
          companyId: resolvedPrimaryId,
          companyName: targetCompany,
          tallyName: targetCompany,
          lastAlterId: this.pendingAlterIdReset ? 0 : maxAlterId,
          lastSyncedAt: nowIso,
        };
        if (existingIdx >= 0) {
          knownList[existingIdx] = updatedEntry;
        } else {
          knownList.push(updatedEntry);
        }
      }

      // 8. Multi-company secondary sync loop:
      // Only sync additional companies that are ACTUALLY open in TallyPrime right now (via openCompanyNames)
      const additionalTargets: Array<{ companyId?: string; tallyName: string; lastAlterId: number }> = [];

      for (const openCompName of openCompanyNames) {
        const openNorm = normalizeTallyCompanyName(openCompName);
        if (!openNorm || syncedNamesNorm.has(openNorm)) continue;
        const matchedCfg = this.findCompanyConfigByName(openCompName, knownList);
        const candidateId =
          matchedCfg?.companyId && !syncedCompanyIds.has(matchedCfg.companyId)
            ? matchedCfg.companyId
            : undefined;
        additionalTargets.push({
          companyId: candidateId,
          tallyName: openCompName,
          lastAlterId: matchedCfg?.lastAlterId || 0,
        });
        if (candidateId) syncedCompanyIds.add(candidateId);
        syncedNamesNorm.add(openNorm);
      }

      for (const extra of additionalTargets) {
        try {
          const extraTarget = extra.tallyName;
          if (this.cloudUrl && extra.companyId) {
            await this.pullOutboxFromCloud(extra.companyId, extraTarget);
          }
          const extraInfo = await this.client.getCompanyInfo(extraTarget);
          if (extraInfo?.name) {
            const extraLedgers = await this.client.getLedgers(0, extraTarget);
            const extraBills = await this.client.getBills(undefined, extraTarget);
            const extraStock = await this.client.getStockItems(0, extraTarget);
            let extraMaxAlter = extra.lastAlterId || 0;
            for (const l of extraLedgers) if (l.alterId > extraMaxAlter) extraMaxAlter = l.alterId;
            for (const s of extraStock) if (s.alterId > extraMaxAlter) extraMaxAlter = s.alterId;
            let resolvedExtraId = extra.companyId;
            if (this.cloudUrl) {
              const cloudId = await this.pushToCloud(
                {
                  company: extraInfo,
                  ledgers: extraLedgers,
                  bills: extraBills,
                  stockItems: extraStock,
                  maxAlterId: extraMaxAlter,
                  syncedAt: nowIso,
                  durationMs: Date.now() - startTime,
                },
                extra.companyId
              );
              if (cloudId) resolvedExtraId = cloudId;
              // If newly mapped by cloud, pull its outbox too
              if (!extra.companyId && resolvedExtraId) {
                await this.pullOutboxFromCloud(resolvedExtraId, extraInfo.name);
              }
            }
            if (resolvedExtraId) {
              const idx = knownList.findIndex(
                (c) => c.companyId === resolvedExtraId || normalizeTallyCompanyName(c.tallyName || c.companyName) === normalizeTallyCompanyName(extraInfo.name)
              );
              const entry: CompanySyncConfig = {
                companyId: resolvedExtraId,
                companyName: extraInfo.name,
                tallyName: extraInfo.name,
                lastAlterId: extraMaxAlter,
                lastSyncedAt: nowIso,
              };
              if (idx >= 0) knownList[idx] = entry;
              else knownList.push(entry);
            }
          }
        } catch {
          // Sister company might not be open in Tally right now; continue gracefully
        }
      }

      // 9. Update local state after successful cloud push
      const newAlterId = this.pendingAlterIdReset ? 0 : maxAlterId;
      this.pendingAlterIdReset = false;
      this.store.update({
        companyName: company.name,
        lastAlterId: newAlterId,
        lastSyncedAt: nowIso,
        status: 'online',
        tallyPort: activePort,
        openTallyCompanies: openCompanyNames.length > 0 ? openCompanyNames : [company.name],
        companies: knownList.length > 0 ? knownList : currentState.companies,
      });

      this.onSyncComplete?.(payload);
      return payload;
    } catch (err: any) {
      this.store.update({ status: 'offline' });
      // Always notify SaaS Cloud that the agent process is online and connected,
      // even when local Tally XML port (e.g. 127.0.0.1:9000) is closed or unreachable.
      if (this.cloudUrl) {
        await this.sendCloudHeartbeat(false, err?.message || 'Local Tally unreachable');
      }
      this.onSyncError?.(err);
      throw err;
    }
  }

  public async sendCloudHeartbeat(tallyOk: boolean, tallyError?: string): Promise<void> {
    if (!this.cloudUrl) return;
    const state = this.store.get();
    const companyId = this.companyId || state.companyId;
    const companyName = state.companyName;
    const key = this.agentSecretKey || state.agentSecretKey || 'dev-agent-secret-key';
    try {
      const res = await fetch(`${this.cloudUrl}/api/agent/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-key': key,
        },
        body: JSON.stringify({
          companyId,
          companyName,
          tallyStatus: tallyOk ? 'online' : 'offline',
          tallyError: tallyError || null,
          tallyPort: this.client.getActivePort(),
          openTallyCompanies: state.openTallyCompanies || (companyName ? [companyName] : []),
        }),
      });
      if (res.ok) {
        const syncRes: any = await res.json().catch(() => ({}));
        if (Array.isArray(syncRes?.commands) && syncRes.commands.length > 0) {
          this.handleCloudCommands(syncRes.commands);
        }
        this.store.update({
          cloudStatus: 'connected',
          lastCloudSyncAt: new Date().toISOString(),
        });
      }
    } catch {}
  }

  /**
   * Handle remote commands delivered from SaaS cloud (e.g. RESET_ALTER_ID).
   */
  public handleCloudCommands(commands: Array<{ type: string; companyId?: string; [key: string]: any }>): void {
    for (const cmd of commands) {
      if (cmd.type === 'RESET_ALTER_ID') {
        const targetDesc = cmd.companyId ? `company ${cmd.companyId}` : 'all companies';
        console.log(`[SyncEngine] [REMOTE COMMAND] Received RESET_ALTER_ID for ${targetDesc}. Resetting lastAlterId to 0.`);
        this.pendingAlterIdReset = true;
        const currentState = this.store.get();
        if (!cmd.companyId || cmd.companyId === this.companyId || cmd.companyId === currentState.companyId) {
          this.store.update({ lastAlterId: 0 });
        }
        if (Array.isArray(currentState.companies)) {
          const updated = currentState.companies.map((c) => {
            if (!cmd.companyId || c.companyId === cmd.companyId) {
              return { ...c, lastAlterId: 0 };
            }
            return c;
          });
          this.store.update({ companies: updated });
        }
      }
    }
  }

  public async pushToCloud(payload: TallySyncPayload, targetCompanyId?: string): Promise<string | undefined> {
    if (!this.cloudUrl) return targetCompanyId;

    const state = this.store.get();
    const companyId = targetCompanyId || this.companyId || state.companyId;
    const companyName = payload.company?.name || state.companyName;
    const key = this.agentSecretKey || state.agentSecretKey || 'dev-agent-secret-key';
    const companyPrefix = companyId ? `${slugify(companyId)}-` : (companyName ? `${slugify(companyName)}-` : '');

    // Map ledgers (Sundry Debtors & Creditors) to Parties with company-scoped IDs to prevent cross-company collisions
    for (const l of payload.ledgers) {
      if (l.isSundryCreditor || l.parent.toLowerCase().includes('creditor') || l.parent.toLowerCase().includes('supplier')) {
        this.knownCreditors.add(l.name.toLowerCase().trim());
      }
    }

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
        closingBalance: l.closingBalance || 0,
      }));

    // Map bills to Bills with company-scoped IDs and preserved opening invoice amounts,
    // excluding supplier payables (Sundry Creditors) so they are not lumped into customer receivables
    const bills = payload.bills
      .filter((b) => {
        const nameLower = b.partyName.toLowerCase().trim();
        return (
          !this.knownCreditors.has(nameLower) &&
          !nameLower.includes('sundry creditor') &&
          !nameLower.includes('creditor')
        );
      })
      .map((b) => ({
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
        companyName,
        alterId: payload.maxAlterId,
        reconcilePaidBills: true,
        parties,
        bills,
        stockItems,
      }),
    });

    if (!pushRes.ok) {
      const err = await pushRes.text();
      throw new Error(`Cloud sync push failed (${pushRes.status}): ${err}`);
    }

    const pushData: any = await pushRes.json().catch(() => ({}));
    if (Array.isArray(pushData?.commands) && pushData.commands.length > 0) {
      this.handleCloudCommands(pushData.commands);
    }

    // Merge any server-discovered tenant companies into local state
    if (Array.isArray(pushData?.tenantCompanies) && pushData.tenantCompanies.length > 0) {
      const currentList: CompanySyncConfig[] = Array.isArray(this.store.get().companies)
        ? [...(this.store.get().companies || [])]
        : [];
      for (const tc of pushData.tenantCompanies) {
        if (!tc?.companyId) continue;
        const exists = currentList.some((c) => c.companyId === tc.companyId);
        if (!exists) {
          currentList.push({
            companyId: tc.companyId,
            companyName: tc.companyName || tc.tallyName || 'Tally Company',
            tallyName: tc.tallyName || tc.companyName,
            lastAlterId: 0,
          });
        }
      }
      this.store.update({ companies: currentList });
    }

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
    await this.sendCloudHeartbeat(true);
    return pushData?.companyId || companyId;
  }

  public async pullOutboxFromCloud(targetCompanyId?: string, overrideCompanyName?: string): Promise<number> {
    if (!this.cloudUrl) return 0;
    const companyId = targetCompanyId || this.companyId || this.store.get().companyId;
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
    const cmdHeader = pullRes.headers.get('x-agent-commands');
    if (cmdHeader) {
      try {
        const cmds = JSON.parse(cmdHeader);
        if (Array.isArray(cmds) && cmds.length > 0) {
          this.handleCloudCommands(cmds);
        }
      } catch {}
    }
    const queuedItems: any[] = await pullRes.json();
    let syncedCount = 0;

    for (const item of queuedItems) {
      try {
        const formattedDate = item.date
          ? item.date.replace(/-/g, '')
          : new Date().toISOString().slice(0, 10).replace(/-/g, '');

        const targetCompanyName = overrideCompanyName || item.companyName || this.store.get().companyName;
        let result: VoucherImportResult;
        if (item.kind === 'stock_journal') {
          result = await this.pushStockAdjustment({
            companyName: targetCompanyName,
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
            companyName: targetCompanyName,
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
