import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { buildAllVouchersQuery } from '../src/tally/templates.js';
import { TallyClient } from '../src/tally/client.js';
import { SyncEngine } from '../src/sync/engine.js';
import { StateStore } from '../src/sync/state.js';

describe('Livekeeping Voucher Chunking & Agent Resilience Suite', () => {
  it('1. buildAllVouchersQuery constructs XML with VoucherTypeFilter when voucherType is specified', () => {
    const xmlAll = buildAllVouchersQuery(100, 'Manohar Traders');
    expect(xmlAll).toContain('<ID>AllVouchersCollection</ID>');
    expect(xmlAll).toContain('$$Number:$AlterId &gt; 100');
    expect(xmlAll).not.toContain('VoucherTypeFilter');

    const xmlSales = buildAllVouchersQuery(100, 'Manohar Traders', undefined, undefined, 'Sales');
    expect(xmlSales).toContain('<FILTER>VoucherTypeFilter</FILTER>');
    expect(xmlSales).toContain('$$IsSysNameEqual:$VoucherTypeName:"Sales"');

    const xmlReceipt = buildAllVouchersQuery(200, 'Manohar Traders', undefined, undefined, 'Receipt');
    expect(xmlReceipt).toContain('<FILTER>VoucherTypeFilter</FILTER>');
    expect(xmlReceipt).toContain('$$IsSysNameEqual:$VoucherTypeName:"Receipt"');
  });

  it('2. TallyClient.getAllVouchersChunked iterates standard voucher types and aggregates results', async () => {
    const client = new TallyClient({ mock: false });
    const queriedTypes: string[] = [];

    // Mock getAllVouchers
    client.getAllVouchers = async (
      minAlter: number = 0,
      comp?: string,
      from?: string,
      to?: string,
      vType?: string
    ) => {
      if (vType) queriedTypes.push(vType);
      if (vType === 'Sales') {
        return {
          vouchers: [
            { id: 'v1', voucherType: 'Sales', voucherNumber: '1', date: '2026-10-01', amount: 1000, alterId: 101 },
          ],
          maxAlterId: 101,
        };
      }
      if (vType === 'Receipt') {
        return {
          vouchers: [
            { id: 'v2', voucherType: 'Receipt', voucherNumber: '2', date: '2026-10-02', amount: 500, alterId: 105 },
          ],
          maxAlterId: 105,
        };
      }
      return { vouchers: [], maxAlterId: minAlter };
    };

    const result = await client.getAllVouchersChunked(0, 'Manohar Traders', ['Sales', 'Purchase', 'Receipt']);

    expect(queriedTypes).toEqual(['Sales', 'Purchase', 'Receipt']);
    expect(result.vouchers.length).toBe(2);
    expect(result.maxAlterId).toBe(105);
    expect(result.vouchers.map((v) => v.id)).toEqual(['v1', 'v2']);
  });

  it('3. SyncEngine.pushToCloud sends gzip-compressed payload with vouchers and groups when payload exceeds 50KB', async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBodyBuffer: Buffer | null = null;

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('/api/sync/push')) {
        capturedHeaders = init?.headers || {};
        capturedBodyBuffer = Buffer.isBuffer(init?.body) ? init.body : Buffer.from(init?.body || '');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, companyId: 'comp-1' }),
      } as any;
    }) as any;

    try {
      const store = new StateStore('test-agent-state-temp.json');
      const client = new TallyClient({ mock: true });
      const engine = new SyncEngine({
        client,
        store,
        cloudUrl: 'https://test-cloud.example.com',
        companyId: 'comp-1',
      });

      // Generate a payload that exceeds 50KB
      const largeLedgers = Array.from({ length: 500 }, (_, i) => ({
        name: `Customer Long Name Account ${i} ${'X'.repeat(100)}`,
        parent: 'Sundry Debtors',
        closingBalance: 100000 + i,
        alterId: i + 1,
      }));

      const syncPayload: any = {
        company: { name: 'Manohar Traders' },
        ledgers: largeLedgers,
        bills: [],
        stockItems: [],
        challans: [],
        vouchers: [
          {
            id: 'vch-1',
            voucherType: 'Sales',
            voucherNumber: 'INV-1',
            date: '2026-11-01',
            amount: 50000,
          },
        ],
        groups: [
          { name: 'Sundry Debtors', parent: 'Current Assets' },
        ],
        deletedVoucherMasterIds: [],
        maxAlterId: 500,
        syncedAt: new Date().toISOString(),
        durationMs: 100,
      };

      await engine.pushToCloud(syncPayload, 'comp-1');

      expect(capturedHeaders['Content-Encoding']).toBe('gzip');
      expect(capturedHeaders['Content-Type']).toBe('application/json');

      // Decompress the captured body and verify vouchers and groups are present
      expect(capturedBodyBuffer).not.toBeNull();
      const gunzipped = zlib.gunzipSync(capturedBodyBuffer!);
      const parsed = JSON.parse(gunzipped.toString('utf-8'));

      expect(parsed.vouchers).toBeDefined();
      expect(parsed.vouchers.length).toBe(1);
      expect(parsed.vouchers[0].voucherNumber).toBe('INV-1');

      expect(parsed.groups).toBeDefined();
      expect(parsed.groups.length).toBe(1);
      expect(parsed.groups[0].name).toBe('Sundry Debtors');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
