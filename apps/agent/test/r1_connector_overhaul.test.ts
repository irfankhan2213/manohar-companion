import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  TallyClient,
  CANDIDATE_TALLY_PORTS,
  parseTallyIniPort,
  discoverTallyPortFromRegistry,
} from '../src/tally/client.js';
import {
  buildCompanyInfoQuery,
  buildLedgersQuery,
  buildBillsQuery,
  buildVouchersQuery,
  buildStockItemsQuery,
  buildVoucherManifestQuery,
  buildVouchersIncrementalQuery,
  buildStockJournalVoucherXml,
  buildDeliveryChallanVoucherXml,
} from '../src/tally/templates.js';
import { parseVoucherManifestResponse } from '../src/tally/parser.js';
import { StateStore } from '../src/sync/state.js';
import { SyncEngine } from '../src/sync/engine.js';

describe('R1: Desktop Tally Connector Overhaul', () => {
  const testStatePath = path.resolve(process.cwd(), 'test-r1-agent-state.json');

  beforeEach(() => {
    for (const p of [testStatePath, `${testStatePath}.bak`, `${testStatePath}.tmp`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  afterEach(() => {
    for (const p of [testStatePath, `${testStatePath}.bak`, `${testStatePath}.tmp`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  describe('1. Dynamic Tally Port Discovery & Port 9999 Support', () => {
    it('defines candidate ports containing 9000, 25853, 9999, 9001, 9002', () => {
      expect(CANDIDATE_TALLY_PORTS).toEqual([9000, 25853, 9999, 9001, 9002]);
    });

    it('parses port from mock tally.ini configuration file', async () => {
      const tmpIni = path.resolve(process.cwd(), 'test-tally.ini');
      try {
        fs.writeFileSync(tmpIni, '[Tally]\nPort = 9999\nTallyServerPort = 9999\n');
        const port = await parseTallyIniPort(tmpIni);
        expect(port).toBe(9999);
      } finally {
        if (fs.existsSync(tmpIni)) fs.unlinkSync(tmpIni);
      }
    });

    it('gracefully handles missing or invalid tally.ini file', async () => {
      const port = await parseTallyIniPort('/path/does/not/exist/tally.ini');
      expect(port).toBeNull();
    });

    it('probes candidate ports and discovers responsive port 9999 without suppression', async () => {
      const client = new TallyClient({ url: 'http://127.0.0.1:9000', timeoutMs: 2000 });
      const origFetch = globalThis.fetch;

      globalThis.fetch = async (url: any, init: any) => {
        const urlStr = String(url);
        // Simulate port 9000 and 25853 being down, but port 9999 being active Tally
        if (urlStr.includes(':9999')) {
          return new Response(
            `<ENVELOPE><BODY><DATA><COMPANYNAME>Manohar Traders</COMPANYNAME></DATA></BODY></ENVELOPE>`,
            { status: 200 }
          );
        }
        throw new Error('Connection refused');
      };

      try {
        const discovered = await client.discoverActivePort();
        expect(discovered).toBe('http://127.0.0.1:9999');
        expect(client.getUrl()).toBe('http://127.0.0.1:9999');
        expect(client.getActivePort()).toBe(9999);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('allows port 9999 to be set in StateStore without resetting to 25853', () => {
      const store = new StateStore(testStatePath);
      store.update({ tallyPort: 9999, tallyUrl: 'http://127.0.0.1:9999' });
      const state = store.get();
      expect(state.tallyPort).toBe(9999);
      expect(state.tallyUrl).toBe('http://127.0.0.1:9999');
    });
  });

  describe('2. Unconditional Multi-Company Scoping with <SVCURRENTCOMPANY>', () => {
    it('always scopes every query template with SVCURRENTCOMPANY when companyName is provided', () => {
      const comp = 'Manohar Traders (Ludhiana)';

      const compInfoXml = buildCompanyInfoQuery(comp);
      expect(compInfoXml).toContain(`<SVCURRENTCOMPANY>Manohar Traders (Ludhiana)</SVCURRENTCOMPANY>`);
      expect(compInfoXml).toContain(`<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>`);

      const ledgersXml = buildLedgersQuery(100, comp);
      expect(ledgersXml).toContain(`<SVCURRENTCOMPANY>Manohar Traders (Ludhiana)</SVCURRENTCOMPANY>`);
      expect(ledgersXml).toContain(`<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>`);

      const billsXml = buildBillsQuery(comp);
      expect(billsXml).toContain(`<SVCURRENTCOMPANY>Manohar Traders (Ludhiana)</SVCURRENTCOMPANY>`);
      expect(billsXml).toContain(`<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>`);

      const vouchersXml = buildVouchersQuery(comp);
      expect(vouchersXml).toContain(`<SVCURRENTCOMPANY>Manohar Traders (Ludhiana)</SVCURRENTCOMPANY>`);
      expect(vouchersXml).toContain(`<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>`);

      const stockXml = buildStockItemsQuery(50, comp);
      expect(stockXml).toContain(`<SVCURRENTCOMPANY>Manohar Traders (Ludhiana)</SVCURRENTCOMPANY>`);
      expect(stockXml).toContain(`<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>`);

      const manifestXml = buildVoucherManifestQuery(comp);
      expect(manifestXml).toContain(`<SVCURRENTCOMPANY>Manohar Traders (Ludhiana)</SVCURRENTCOMPANY>`);
      expect(manifestXml).toContain(`<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>`);

      const incVouchersXml = buildVouchersIncrementalQuery(50, comp);
      expect(incVouchersXml).toContain(`<SVCURRENTCOMPANY>Manohar Traders (Ludhiana)</SVCURRENTCOMPANY>`);
      expect(incVouchersXml).toContain(`<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>`);
    });

    it('SyncEngine passes targetCompany unconditionally even when only 1 company is open', async () => {
      const store = new StateStore(testStatePath);
      const client = new TallyClient({ mock: true });

      const queriedTargets: Array<{ fn: string; company?: string }> = [];

      const origGetLedgers = client.getLedgers.bind(client);
      client.getLedgers = async (alterId?: number, companyName?: string) => {
        queriedTargets.push({ fn: 'getLedgers', company: companyName });
        return origGetLedgers(alterId, companyName);
      };

      const origGetBills = client.getBills.bind(client);
      client.getBills = async (today?: string, companyName?: string) => {
        queriedTargets.push({ fn: 'getBills', company: companyName });
        return origGetBills(today, companyName);
      };

      const origGetStock = client.getStockItems.bind(client);
      client.getStockItems = async (alterId?: number, companyName?: string) => {
        queriedTargets.push({ fn: 'getStockItems', company: companyName });
        return origGetStock(alterId, companyName);
      };

      // Only 1 company open in Tally:
      client.getOpenCompanies = async () => [
        { name: 'Manohar Traders', financialYearFrom: '2026-04-01', booksFrom: '2026-04-01' },
      ];

      const engine = new SyncEngine({ client, store });
      await engine.runSyncOnce();

      // All queries must have received 'Manohar Traders' as companyName, NEVER undefined!
      expect(queriedTargets.length).toBeGreaterThan(0);
      for (const q of queriedTargets) {
        expect(q.company).toBe('Manohar Traders');
      }
    });
  });

  describe('3. Incremental Sync and AlterId Tracking', () => {
    it('generates incremental voucher collection with numeric formula filter', () => {
      const xml = buildVouchersIncrementalQuery(1480, 'Manohar Traders', '20260401', '20261031');
      expect(xml).toContain('<ID>IncrementalVouchersCollection</ID>');
      expect(xml).toContain('<SVFROMDATE>20260401</SVFROMDATE>');
      expect(xml).toContain('<SVTODATE>20261031</SVTODATE>');
      expect(xml).toContain('$$Number:$AlterId &gt; 1480');
    });

    it('fetches incremental vouchers and progresses maxAlterId', async () => {
      const client = new TallyClient({ mock: true });
      const result = await client.getVouchersIncremental(1470, 'Manohar Traders');
      expect(result.challans.length).toBe(2);
      expect(result.maxAlterId).toBe(1473);
    });
  });

  describe('4. Voucher Manifest & Deletion Purging', () => {
    it('parses voucher manifest and detects deleted vouchers', async () => {
      const store = new StateStore(testStatePath);
      // Pre-seed state with previously active voucher master IDs: ['9001', '9002', '9003', '9004-deleted']
      store.update({
        companyName: 'Manohar Traders',
        activeVoucherMasterIds: ['9001', '9002', '9003', '9004-deleted'],
        lastAlterId: 1470,
        status: 'online',
      });

      const client = new TallyClient({ mock: true });
      // In mock, manifest returns 9001, 9002, 9003. So 9004-deleted is missing from Tally!

      let pushedDeletedIds: string[] | undefined;
      const origFetch = globalThis.fetch;
      globalThis.fetch = async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/sync/push')) {
          const body = JSON.parse(init.body);
          pushedDeletedIds = body.deletedVoucherMasterIds;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (urlStr.includes('/api/sync/pull')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };

      try {
        const engine = new SyncEngine({
          client,
          store,
          cloudUrl: 'https://test-cloud.example.com',
          companyId: 'comp-1',
        });

        await engine.runSyncOnce();

        // 9004-deleted was dropped from the manifest and must be reported as deleted!
        expect(pushedDeletedIds).toEqual(['9004-deleted']);

        // Updated state must now reflect the new active manifest IDs (both voucherNumber and masterId)
        const updatedState = store.get();
        expect(updatedState.activeVoucherMasterIds).toEqual([
          'DC/001/26-27',
          '9001',
          'RN/001/26-27',
          '9002',
          'INV/MOCK/101',
          '9003',
        ]);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('reports both voucherNumber and masterId in deletedVoucherMasterIds for server deletion matching', async () => {
      const store = new StateStore(testStatePath);
      // Pre-seed state with both voucherNumber and masterId for DC-999 / 9999
      store.update({
        companyName: 'Manohar Traders',
        activeVoucherMasterIds: ['DC/001/26-27', '9001', 'DC/DEL/99', '9099-deleted'],
        lastAlterId: 1470,
        status: 'online',
      });

      const client = new TallyClient({ mock: true });
      let pushedDeletedIds: string[] | undefined;
      const origFetch = globalThis.fetch;
      globalThis.fetch = async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/sync/push')) {
          const body = JSON.parse(init.body);
          pushedDeletedIds = body.deletedVoucherMasterIds;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      };

      try {
        const engine = new SyncEngine({
          client,
          store,
          cloudUrl: 'https://test-cloud.example.com',
          companyId: 'comp-1',
        });

        await engine.runSyncOnce();

        // Both DC/DEL/99 and 9099-deleted must be in pushed deleted IDs
        expect(pushedDeletedIds).toContain('DC/DEL/99');
        expect(pushedDeletedIds).toContain('9099-deleted');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('advances maxAlterId across parsed vouchers in incremental query even if non-challan', async () => {
      const client = new TallyClient({ mock: true });
      // Non-challan vouchers returned in XML
      const nonChallanXml = `<ENVELOPE>
        <BODY>
          <DATA>
            <COLLECTION>
              <VOUCHER>
                <MASTERID>9100</MASTERID>
                <ALTERID>2500</ALTERID>
                <VOUCHERNUMBER>INV/2026/01</VOUCHERNUMBER>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
              </VOUCHER>
            </COLLECTION>
          </DATA>
        </BODY>
      </ENVELOPE>`;
      (client as any).postXml = async () => nonChallanXml;

      const incResult = await client.getVouchersIncremental(1000, 'Manohar Traders');
      expect(incResult.challans.length).toBe(0);
      // maxAlterId should advance to 2500 despite 0 challans
      expect(incResult.maxAlterId).toBe(2500);
    });

    it('guards prevActiveIds against multi-company bleed when company changes', async () => {
      const store = new StateStore(testStatePath);
      // State was last synced with Company A
      store.update({
        companyName: 'Company A',
        activeVoucherMasterIds: ['CO-A-01', 'CO-A-02'],
        lastAlterId: 1000,
        status: 'online',
        companies: [],
      });

      const client = new TallyClient({ mock: true });
      // Tally now returns Company B
      client.getCompanyInfo = async () => ({
        name: 'Company B',
        formalName: 'Company B Ltd',
        financialYearFrom: '2026-04-01',
        booksFrom: '2026-04-01',
      });
      client.getOpenCompanies = async () => [{ name: 'Company B', financialYearFrom: '2026-04-01', booksFrom: '2026-04-01' }];
      client.getVoucherManifest = async () => [
        { masterId: 'CO-B-01', alterId: 50, voucherNumber: 'CO-B-01' },
      ];

      let pushedDeletedIds: string[] | undefined;
      const origFetch = globalThis.fetch;
      globalThis.fetch = async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/sync/push')) {
          const body = JSON.parse(init.body);
          pushedDeletedIds = body.deletedVoucherMasterIds;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      };

      try {
        const engine = new SyncEngine({
          client,
          store,
          cloudUrl: 'https://test-cloud.example.com',
          companyId: 'comp-b',
        });

        await engine.runSyncOnce();

        // Company B must NOT inherit Company A's active vouchers, so NO false deletions pushed!
        expect(pushedDeletedIds).toEqual([]);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});
