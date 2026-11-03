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
  });

  it('runs initial sync and progresses AlterID', async () => {
    const store = new StateStore(testStatePath);
    const client = new TallyClient({ mock: true });
    const engine = new SyncEngine({ client, store });

    const payload = await engine.runSyncOnce();

    expect(payload.company.name).toBe('Manohar Traders');
    expect(payload.ledgers.length).toBe(5);
    expect(payload.bills.length).toBe(4);
    expect(payload.stockItems.length).toBe(4);
    expect(payload.maxAlterId).toBe(1480);

    // State should now hold AlterID 1480
    const state = store.get();
    expect(state.lastAlterId).toBe(1480);
    expect(state.status).toBe('online');

    // Second sync should fetch 0 new items because AlterID is 1480
    const payload2 = await engine.runSyncOnce();
    expect(payload2.ledgers.length).toBe(0);
    expect(payload2.stockItems.length).toBe(0);
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
});
