import { describe, expect, it, beforeEach } from 'vitest';
import { TallyClient } from '../src/tally/client.js';
import { StateStore } from '../src/sync/state.js';
import { SyncEngine } from '../src/sync/engine.js';
import path from 'path';
import fs from 'fs';

describe('Sync Engine', () => {
  const testStatePath = path.resolve(process.cwd(), 'test-agent-state.json');

  beforeEach(() => {
    if (fs.existsSync(testStatePath)) {
      fs.unlinkSync(testStatePath);
    }
    const bak = `${testStatePath}.bak`;
    if (fs.existsSync(bak)) {
      fs.unlinkSync(bak);
    }
    const tmp = `${testStatePath}.tmp`;
    if (fs.existsSync(tmp)) {
      fs.unlinkSync(tmp);
    }
  });

  it('runs initial sync and progresses AlterID', async () => {
    const store = new StateStore(testStatePath);
    const client = new TallyClient({ mock: true });
    const engine = new SyncEngine({ client, store });

    const payload = await engine.runSyncOnce();

    expect(payload.company.name).toBe('Manohar Traders');
    expect(payload.ledgers.length).toBe(5);
    expect(payload.bills.length).toBe(5);
    expect(payload.challans?.length).toBe(2);
    expect(payload.stockItems.length).toBe(4);
    expect(payload.maxAlterId).toBe(1480);

    // State should now hold AlterID 1480
    const state = store.get();
    expect(state.lastAlterId).toBe(1480);
    expect(state.status).toBe('online');

    // Second sync also fetches all live ledgers & stock items (so voucher entries in Tally that change
    // closingBalance or closingQty without altering Master $AlterId are always synced!)
    const payload2 = await engine.runSyncOnce();
    expect(payload2.ledgers.length).toBe(5);
    expect(payload2.stockItems.length).toBe(4);
    expect(payload2.maxAlterId).toBe(1480);

    // Clean up test file
    if (fs.existsSync(testStatePath)) {
      fs.unlinkSync(testStatePath);
    }
  });

  it('pushes stock adjustment to Tally simulator', async () => {
    const store = new StateStore(testStatePath);
    const client = new TallyClient({ mock: true });
    const engine = new SyncEngine({ client, store });

    const result = await engine.pushStockAdjustment({
      date: '20261017',
      voucherNumber: 'ADJ/001',
      narration: 'Damaged piece',
      itemName: 'Servo Motor 550W (Direct Drive)',
      godownName: 'Shop Godown',
      qty: -1,
      unit: 'pcs',
      rateRupees: 4200,
    });

    expect(result.success).toBe(true);
    expect(result.created).toBe(1);

    // Clean up
    if (fs.existsSync(testStatePath)) {
      fs.unlinkSync(testStatePath);
    }
  });

  it('pushes company-prefixed IDs to cloud and pulls both challans and stock_journal adjustments', async () => {
    const store = new StateStore(testStatePath);
    const client = new TallyClient({ mock: true });

    let pushedBody: any = null;
    const ackBodies: any[] = [];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/sync/push')) {
        pushedBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({ success: true, partiesUpdated: 5, billsUpdated: 4, stockUpdated: 4 }),
          { status: 200 }
        );
      }
      if (urlStr.includes('/api/agent/sync')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (urlStr.includes('/api/sync/pull')) {
        return new Response(
          JSON.stringify([
            {
              id: 'ch-test-1',
              kind: 'challan',
              type: 'sales',
              number: 'CH/001',
              partyName: 'Sample Garments',
              date: '2026-10-27',
              narration: 'Test Challan',
              lines: [{ description: 'Servo Motor', qty: 2, unit: 'pcs', rate: 420000 }],
            },
            {
              id: 'out-stock-1',
              outboxId: 'out-stock-1',
              kind: 'stock_journal',
              refId: 'item-1',
              itemName: 'Servo Motor 550W (Direct Drive)',
              godownName: 'Main Godown',
              deltaQty: -2,
              unit: 'pcs',
              rate: 420000,
              reason: 'Damaged in transit',
              date: '2026-10-27',
            },
          ]),
          { status: 200 }
        );
      }
      if (urlStr.includes('/api/sync/ack')) {
        ackBodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return originalFetch(url, init);
    };

    try {
      const engine = new SyncEngine({
        client,
        store,
        cloudUrl: 'https://test-cloud.example.com',
        companyId: 'comp-1',
        agentSecretKey: 'secret-key-1',
      });

      await engine.runSyncOnce();

      expect(pushedBody).toBeDefined();
      expect(pushedBody.companyId).toBe('comp-1');
      expect(pushedBody.parties.length).toBeGreaterThan(0);
      expect(pushedBody.parties[0].id.startsWith('p-comp-1-')).toBe(true);
      expect(pushedBody.bills.length).toBeGreaterThan(0);
      expect(pushedBody.bills[0].id.startsWith('b-comp-1-')).toBe(true);
      expect(pushedBody.bills[0].amount).toBeGreaterThan(0);
      expect(pushedBody.stockItems.length).toBeGreaterThan(0);
      expect(pushedBody.stockItems[0].id.startsWith('s-comp-1-')).toBe(true);

      expect(ackBodies.length).toBe(2);
      expect(ackBodies[0].challanId).toBe('ch-test-1');
      expect(ackBodies[0].status).toBe('synced');
      expect(ackBodies[1].outboxId).toBe('out-stock-1');
      expect(ackBodies[1].kind).toBe('stock_journal');
      expect(ackBodies[1].status).toBe('synced');
    } finally {
      globalThis.fetch = originalFetch;
      if (fs.existsSync(testStatePath)) {
        fs.unlinkSync(testStatePath);
      }
    }
  });

  it('handles remote RESET_ALTER_ID command and resets lastAlterId to 0', async () => {
    const store = new StateStore(testStatePath);
    store.update({ lastAlterId: 10500, status: 'online' });
    expect(store.get().lastAlterId).toBe(10500);

    const client = new TallyClient({ mock: true });
    const engine = new SyncEngine({ client, store, companyId: 'comp-1' });

    engine.handleCloudCommands([{ type: 'RESET_ALTER_ID', companyId: 'comp-1' }]);

    expect(store.get().lastAlterId).toBe(0);

    // Clean up
    if (fs.existsSync(testStatePath)) {
      fs.unlinkSync(testStatePath);
    }
    const bakPath = `${testStatePath}.bak`;
    if (fs.existsSync(bakPath)) {
      fs.unlinkSync(bakPath);
    }
  });

  it('atomically saves state file and maintains .bak backup copy for recovery', () => {
    const store = new StateStore(testStatePath);
    store.update({ lastAlterId: 4200, status: 'online', companyName: 'Manohar Test' });

    expect(fs.existsSync(testStatePath)).toBe(true);
    const bakPath = `${testStatePath}.bak`;

    // Perform another update to trigger backup creation
    store.update({ lastAlterId: 4300 });
    expect(fs.existsSync(bakPath)).toBe(true);

    // Corrupt primary state file by truncating to 0 bytes (simulating power failure)
    fs.writeFileSync(testStatePath, '');

    // Instantiating a new store should recover from .bak backup and heal primary file on disk!
    const recoveredStore = new StateStore(testStatePath);
    expect(recoveredStore.get().lastAlterId).toBe(4300);
    expect(fs.readFileSync(testStatePath, 'utf-8').length).toBeGreaterThan(0);
    expect(JSON.parse(fs.readFileSync(testStatePath, 'utf-8')).lastAlterId).toBe(4300);

    // Clean up
    if (fs.existsSync(testStatePath)) fs.unlinkSync(testStatePath);
    if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
  });

  it('StateStore.reset() safely clears AlterID without destroying credentials or pairing', () => {
    const store = new StateStore(testStatePath);
    store.update({
      companyId: 'comp-manohar-1',
      cloudUrl: 'https://manohar.evolveexpert.com',
      agentSecretKey: 'sec-agt-9999',
      pairingKey: '948201',
      companyName: 'Manohar Traders',
      lastAlterId: 19820,
      lastSyncedAt: '2026-11-01T10:00:00Z',
      companies: [
        {
          companyId: 'comp-sub-2',
          companyName: 'Sub Branch',
          lastAlterId: 450,
          lastSyncedAt: '2026-11-01T10:00:00Z',
        },
      ],
      status: 'online',
    });

    store.reset();

    const state = store.get();
    expect(state.lastAlterId).toBe(0);
    expect(state.lastSyncedAt).toBeUndefined();
    expect(state.companyId).toBe('comp-manohar-1');
    expect(state.cloudUrl).toBe('https://manohar.evolveexpert.com');
    expect(state.agentSecretKey).toBe('sec-agt-9999');
    expect(state.pairingKey).toBe('948201');
    expect(state.companyName).toBe('Manohar Traders');
    expect(state.status).toBe('offline');
    expect(state.companies?.[0]?.lastAlterId).toBe(0);
    expect(state.companies?.[0]?.lastSyncedAt).toBeUndefined();

    // Clean up
    if (fs.existsSync(testStatePath)) fs.unlinkSync(testStatePath);
    const bakPath = `${testStatePath}.bak`;
    if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
  });

  it('SyncEngine.pushToCloud sends closingBalance and excludes Sundry Creditors from bills', async () => {
    const store = new StateStore(testStatePath);
    const client = new TallyClient({ mock: true });
    let pushedBody: any = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/sync/push')) {
        pushedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, commands: [] }), { status: 200 });
    };

    try {
      const engine = new SyncEngine({
        client,
        store,
        cloudUrl: 'https://test-cloud.example.com',
        companyId: 'comp-1',
      });

      // Synthetic payload with a customer debtor and a supplier creditor
      const testPayload = {
        company: { name: 'Manohar Traders', financialYearFrom: '2026-04-01', booksFrom: '2026-04-01' },
        ledgers: [
          {
            name: 'Customer Debtor Ltd',
            parent: 'Sundry Debtors',
            openingBalance: 100000,
            closingBalance: 8500000, // ₹85,000 in paise
            alterId: 101,
            isSundryDebtor: true,
            isSundryCreditor: false,
          },
          {
            name: 'Supplier Creditor Corp',
            parent: 'Sundry Creditors',
            openingBalance: 0,
            closingBalance: -4500000,
            alterId: 102,
            isSundryDebtor: false,
            isSundryCreditor: true,
          },
        ],
        bills: [
          {
            partyName: 'Customer Debtor Ltd',
            billNo: 'INV/2026/01',
            billDate: '2026-10-01',
            dueDate: '2026-10-31',
            openingAmount: 8500000,
            pendingAmount: 8500000,
            isOverdue: false,
            daysOverdue: 0,
          },
          {
            partyName: 'Supplier Creditor Corp',
            billNo: 'SUP/BILL/99',
            billDate: '2026-10-05',
            dueDate: '2026-11-05',
            openingAmount: 4500000,
            pendingAmount: 4500000,
            isOverdue: false,
            daysOverdue: 0,
          },
        ],
        stockItems: [],
        maxAlterId: 102,
        syncedAt: new Date().toISOString(),
        durationMs: 50,
      };

      await engine.pushToCloud(testPayload as any);

      expect(pushedBody).toBeDefined();
      // Verify closingBalance is present on parties
      const debtorParty = pushedBody.parties.find((p: any) => p.name === 'Customer Debtor Ltd');
      expect(debtorParty).toBeDefined();
      expect(debtorParty.closingBalance).toBe(8500000);

      // Verify bills exclude Sundry Creditor bills
      expect(pushedBody.bills.length).toBe(1);
      expect(pushedBody.bills[0].billNo).toBe('INV/2026/01');
      expect(pushedBody.bills.find((b: any) => b.billNo === 'SUP/BILL/99')).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      if (fs.existsSync(testStatePath)) fs.unlinkSync(testStatePath);
      const bakPath = `${testStatePath}.bak`;
      if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
    }
  });

  it('auto-discovers multiple open companies in TallyPrime and syncs each to its mapped companyId', async () => {
    const store = new StateStore(testStatePath);
    store.update({
      companyId: 'c1',
      companyName: 'Manohar Traders',
      lastAlterId: 0,
      status: 'online',
    });

    const client = new TallyClient({ mock: true });
    // Override getOpenCompanies and getCompanyInfo to simulate 2 open Tally companies
    client.getOpenCompanies = async () => [
      { name: 'Manohar Traders', financialYearFrom: '2026-04-01', booksFrom: '2026-04-01' },
      { name: 'Manohar Hosiery Works', financialYearFrom: '2026-04-01', booksFrom: '2026-04-01' },
    ];
    const origGetCompanyInfo = client.getCompanyInfo.bind(client);
    client.getCompanyInfo = async (companyName?: string) => {
      if (companyName && companyName.includes('Hosiery')) {
        return { name: 'Manohar Hosiery Works', financialYearFrom: '2026-04-01', booksFrom: '2026-04-01' };
      }
      return origGetCompanyInfo(companyName);
    };

    const pushedPayloads: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/sync/push')) {
        const body = JSON.parse(init.body);
        pushedPayloads.push(body);
        const resolvedId = body.companyName === 'Manohar Hosiery Works' ? 'c-manohar-hosiery' : 'c1';
        return new Response(
          JSON.stringify({
            success: true,
            companyId: resolvedId,
            companyName: body.companyName,
            partiesUpdated: body.parties.length,
            billsUpdated: body.bills.length,
            stockUpdated: body.stockItems.length,
            tenantCompanies: [
              { companyId: 'c1', companyName: 'Manohar Traders', tallyName: 'Manohar Traders' },
              { companyId: 'c-manohar-hosiery', companyName: 'Manohar Hosiery Works', tallyName: 'Manohar Hosiery Works' },
            ],
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes('/api/sync/pull')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, commands: [] }), { status: 200 });
    };

    try {
      const engine = new SyncEngine({
        client,
        store,
        cloudUrl: 'https://test-cloud.example.com',
        companyId: 'c1',
      });

      await engine.runSyncOnce();

      // Both open companies should have been pushed separately
      expect(pushedPayloads.length).toBe(2);
      expect(pushedPayloads[0].companyName).toBe('Manohar Traders');
      expect(pushedPayloads[0].companyId).toBe('c1');
      expect(pushedPayloads[1].companyName).toBe('Manohar Hosiery Works');

      // State should record both open companies and their resolved companyIds
      const updatedState = store.get();
      expect(updatedState.openTallyCompanies).toEqual(['Manohar Traders', 'Manohar Hosiery Works']);
      expect(updatedState.companies?.some((c) => c.companyId === 'c-manohar-hosiery')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (fs.existsSync(testStatePath)) fs.unlinkSync(testStatePath);
      const bakPath = `${testStatePath}.bak`;
      if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
    }
  });

  it('sends all data for whatever company is open in Tally even when Web App companyName is completely different', async () => {
    const store = new StateStore(testStatePath);
    store.update({
      companyId: 'c1',
      companyName: 'Different Name In Web App',
      lastAlterId: 9999,
      status: 'online',
    });

    const client = new TallyClient({ mock: true });
    let pushedBody: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/sync/push')) {
        pushedBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            success: true,
            companyId: 'c1',
            companyName: pushedBody.companyName,
            partiesUpdated: pushedBody.parties.length,
            billsUpdated: pushedBody.bills.length,
            stockUpdated: pushedBody.stockItems.length,
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes('/api/sync/pull')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, commands: [] }), { status: 200 });
    };

    try {
      const engine = new SyncEngine({
        client,
        store,
        cloudUrl: 'https://test-cloud.example.com',
        companyId: 'c1',
      });

      const payload = await engine.runSyncOnce();

      expect(payload.company.name).toBe('Manohar Traders');
      expect(payload.ledgers.length).toBe(5);
      expect(payload.bills.length).toBe(5);
      expect(payload.challans?.length).toBe(2);
      expect(payload.stockItems.length).toBe(4);

      expect(pushedBody).toBeDefined();
      expect(pushedBody.companyId).toBe('c1');
      expect(pushedBody.companyName).toBe('Manohar Traders');
      expect(pushedBody.parties.length).toBe(5);
      expect(pushedBody.bills.length).toBe(5);
      expect(pushedBody.challans.length).toBe(2);
      expect(pushedBody.stockItems.length).toBe(4);
      expect(store.get().companyName).toBe('Manohar Traders');
    } finally {
      globalThis.fetch = originalFetch;
      if (fs.existsSync(testStatePath)) fs.unlinkSync(testStatePath);
      const bakPath = `${testStatePath}.bak`;
      if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
    }
  });
});
