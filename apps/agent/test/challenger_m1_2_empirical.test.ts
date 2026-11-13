import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  buildCompanyInfoQuery,
  buildOpenCompaniesQuery,
  buildLedgersQuery,
  buildBillsQuery,
  buildVouchersQuery,
  buildVoucherManifestQuery,
  buildVouchersIncrementalQuery,
  buildStockItemsQuery,
  buildStockJournalVoucherXml,
  buildDeliveryChallanVoucherXml,
  escapeXml,
} from '../src/tally/templates.js';
import {
  parseVoucherManifestResponse,
  parseVouchersResponse,
  parseCompanyInfoResponse,
} from '../src/tally/parser.js';
import { TallyClient, CANDIDATE_TALLY_PORTS } from '../src/tally/client.js';
import { StateStore } from '../src/sync/state.js';
import { SyncEngine } from '../src/sync/engine.js';

describe('CHALLENGER M1-2: Empirical Verification Suite (Desktop Tally Connector)', () => {
  const testStatePath = path.resolve(process.cwd(), 'test-m1-2-agent-state.json');

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

  describe('1. Unconditional <SVCURRENTCOMPANY> Scoping & <SVEXPORTFORMAT> Retention', () => {
    const targetComp = 'Manohar Traders (Ludhiana)';

    const queryTemplates: Array<{ name: string; generate: (comp?: string) => string }> = [
      { name: 'buildCompanyInfoQuery', generate: (c) => buildCompanyInfoQuery(c) },
      { name: 'buildLedgersQuery', generate: (c) => buildLedgersQuery(100, c) },
      { name: 'buildBillsQuery', generate: (c) => buildBillsQuery(c) },
      { name: 'buildVouchersQuery', generate: (c) => buildVouchersQuery(c) },
      { name: 'buildVoucherManifestQuery', generate: (c) => buildVoucherManifestQuery(c) },
      { name: 'buildVouchersIncrementalQuery', generate: (c) => buildVouchersIncrementalQuery(500, c, '20260401', '20261112') },
      { name: 'buildStockItemsQuery', generate: (c) => buildStockItemsQuery(200, c) },
    ];

    for (const { name, generate } of queryTemplates) {
      it(`${name} unconditionally embeds <SVCURRENTCOMPANY> when company is provided`, () => {
        const xml = generate(targetComp);
        expect(xml).toContain(`<SVCURRENTCOMPANY>${targetComp}</SVCURRENTCOMPANY>`);
        expect(xml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
      });

      it(`${name} retains <SVEXPORTFORMAT> even when company is omitted`, () => {
        const xml = generate(undefined);
        expect(xml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
        expect(xml).not.toContain('<SVCURRENTCOMPANY>');
      });
    }

    it('buildOpenCompaniesQuery retains <SVEXPORTFORMAT> XML envelope without company scoping', () => {
      const xml = buildOpenCompaniesQuery();
      expect(xml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
      expect(xml).not.toContain('<SVCURRENTCOMPANY>');
      expect(xml).toContain('<ID>ListOfOpenCompanies</ID>');
    });

    it('mutation templates (Stock Journal & Delivery Challan) retain BOTH SVEXPORTFORMAT and SVCURRENTCOMPANY', () => {
      const stockXml = buildStockJournalVoucherXml({
        date: '20261015',
        voucherNumber: 'SJ/001',
        narration: 'Inter-godown transfer',
        itemName: 'Direct Drive Servo Motor 550W',
        godownName: 'Main Godown',
        qty: 5,
        unit: 'pcs',
        rateRupees: 4200,
        companyName: targetComp,
      });

      expect(stockXml).toContain(`<SVCURRENTCOMPANY>${targetComp}</SVCURRENTCOMPANY>`);
      expect(stockXml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
      expect(stockXml).toContain('<TALLYREQUEST>Import</TALLYREQUEST>');

      const challanXml = buildDeliveryChallanVoucherXml({
        date: '20261015',
        voucherNumber: 'DC/001',
        partyName: 'Amritsar Textiles',
        narration: 'Sample delivery challan',
        companyName: targetComp,
        items: [
          {
            itemName: 'Direct Drive Servo Motor 550W',
            godownName: 'Main Godown',
            qty: 2,
            unit: 'pcs',
            rateRupees: 4200,
          },
        ],
      });

      expect(challanXml).toContain(`<SVCURRENTCOMPANY>${targetComp}</SVCURRENTCOMPANY>`);
      expect(challanXml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
      expect(challanXml).toContain('<TALLYREQUEST>Import</TALLYREQUEST>');
    });

    it('handles XML entities in company name safely without corrupting XML tags', () => {
      const rawComp = 'Manohar & Sons <Trading> "Ludhiana" \'HQ\'';
      const escapedComp = escapeXml(rawComp);
      expect(escapedComp).toBe('Manohar &amp; Sons &lt;Trading&gt; &quot;Ludhiana&quot; &apos;HQ&apos;');

      for (const { name, generate } of queryTemplates) {
        const xml = generate(rawComp);
        expect(xml).toContain(`<SVCURRENTCOMPANY>${escapedComp}</SVCURRENTCOMPANY>`);
      }
    });

    it('SyncEngine scopes EVERY query with targetCompany when only 1 company is open in Tally', async () => {
      const store = new StateStore(testStatePath);
      const client = new TallyClient({ mock: true });

      const auditLog: Array<{ method: string; companyArg?: string }> = [];

      client.getCompanyInfo = async (comp?: string) => {
        auditLog.push({ method: 'getCompanyInfo', companyArg: comp });
        return { name: 'Manohar Traders', financialYearFrom: '2026-04-01', booksFrom: '2026-04-01' };
      };
      client.getOpenCompanies = async () => [
        { name: 'Manohar Traders', financialYearFrom: '2026-04-01', booksFrom: '2026-04-01' },
      ];
      client.getVoucherManifest = async (comp?: string) => {
        auditLog.push({ method: 'getVoucherManifest', companyArg: comp });
        return [];
      };
      client.getLedgers = async (alterId?: number, comp?: string) => {
        auditLog.push({ method: 'getLedgers', companyArg: comp });
        return [];
      };
      client.getBills = async (today?: string, comp?: string) => {
        auditLog.push({ method: 'getBills', companyArg: comp });
        return [];
      };
      client.getVouchers = async (today?: string, comp?: string) => {
        auditLog.push({ method: 'getVouchers', companyArg: comp });
        return { challans: [], bills: [] };
      };
      client.getStockItems = async (alterId?: number, comp?: string) => {
        auditLog.push({ method: 'getStockItems', companyArg: comp });
        return [];
      };

      const engine = new SyncEngine({ client, store });
      await engine.runSyncOnce();

      // All collection queries MUST have received 'Manohar Traders' as companyArg, NEVER undefined
      const collectionCalls = auditLog.filter((x) => x.method !== 'getCompanyInfo');
      expect(collectionCalls.length).toBeGreaterThanOrEqual(4);
      for (const call of collectionCalls) {
        expect(call.companyArg).toBe('Manohar Traders');
      }
    });
  });

  describe('2. Incremental AlterId Mathematical Logic & Sort Bug Oracle', () => {
    it('generates TDL formula with $$Number cast for incremental vouchers, ledgers, and stock', () => {
      const vchXml = buildVouchersIncrementalQuery(1500, 'Manohar Traders');
      expect(vchXml).toContain('$$Number:$AlterId &gt; 1500');

      const ldgXml = buildLedgersQuery(1500, 'Manohar Traders');
      expect(ldgXml).toContain('$$Number:$AlterId &gt; 1500');

      const stkXml = buildStockItemsQuery(1500, 'Manohar Traders');
      expect(stkXml).toContain('$$Number:$AlterId &gt; 1500');
    });

    it('ORACLE: proves that $$Number prevents catastrophic lexicographical string sorting drops', () => {
      // Test dataset of Alter IDs
      const rawAlterIds = [5, 18, 20, 25, 99, 100, 250, 1000, 1470, 1500, 9999, 10000];
      const minAlterId = 20;

      // Uncast string comparison in Tally: $AlterId > "20"
      const stringComparisonMatches = rawAlterIds.filter((id) => String(id) > String(minAlterId));

      // Cast numeric comparison in Tally: $$Number:$AlterId > 20
      const numericComparisonMatches = rawAlterIds.filter((id) => Number(id) > minAlterId);

      // Demonstrates string comparison hazard:
      // False positive: "5" > "20" because "5" > "2" in ASCII!
      expect(stringComparisonMatches).toContain(5);

      // False negatives: "100", "1000", "1470", "1500", "10000" are DROPPED because "1" < "2"
      expect(stringComparisonMatches).not.toContain(100);
      expect(stringComparisonMatches).not.toContain(1000);
      expect(stringComparisonMatches).not.toContain(1470);
      expect(stringComparisonMatches).not.toContain(1500);
      expect(stringComparisonMatches).not.toContain(10000);

      // Numeric comparison correctly includes all 9 values > 20 without false positives:
      expect(numericComparisonMatches).toEqual([25, 99, 100, 250, 1000, 1470, 1500, 9999, 10000]);
      expect(numericComparisonMatches.length).toBe(9);
      expect(numericComparisonMatches).not.toContain(5);
      expect(stringComparisonMatches.length).toBe(5);
    });

    it('handles boundary AlterIds (0, large 32-bit int, large 64-bit safe int)', () => {
      const zeroXml = buildVouchersIncrementalQuery(0, 'Manohar Traders');
      expect(zeroXml).toContain('$$Number:$AlterId &gt; 0');

      const max32Xml = buildVouchersIncrementalQuery(2147483647, 'Manohar Traders');
      expect(max32Xml).toContain('$$Number:$AlterId &gt; 2147483647');

      const largeXml = buildVouchersIncrementalQuery(9007199254740991, 'Manohar Traders');
      expect(largeXml).toContain('$$Number:$AlterId &gt; 9007199254740991');
    });

    it('applies IsChallanFilter alongside VoucherAlterFilter in IncrementalVouchersCollection', () => {
      const xml = buildVouchersIncrementalQuery(100, 'Manohar Traders');
      expect(xml).toContain('<FILTER>IsChallanFilter, VoucherAlterFilter</FILTER>');
      expect(xml).toContain('NAME="IsChallanFilter"');
      expect(xml).toContain('$$IsDeliveryNote:$VoucherTypeName');
    });
  });

  describe('3. Lightweight Manifest Voucher Deletion Diffing', () => {
    it('detects deletion when local state has [V1, V2, V3] and manifest returns [V1, V3]', async () => {
      const store = new StateStore(testStatePath);
      store.update({
        companyName: 'Manohar Traders',
        activeVoucherMasterIds: ['V1', 'V2', 'V3'],
        lastAlterId: 1000,
        status: 'online',
      });

      const client = new TallyClient({ mock: true });
      // Manifest returns only V1 and V3 (V2 was deleted in Tally)
      client.getVoucherManifest = async () => [
        { masterId: 'V1', alterId: 1001, voucherNumber: 'V1' },
        { masterId: 'V3', alterId: 1003, voucherNumber: 'V3' },
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
          companyId: 'comp-test',
        });

        await engine.runSyncOnce();

        // V2 must be detected as deleted!
        expect(pushedDeletedIds).toEqual(['V2']);

        // Local state must be updated with remaining active IDs [V1, V3]
        const finalState = store.get();
        expect(finalState.activeVoucherMasterIds).toEqual(['V1', 'V3']);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('parses XML manifest response correctly with masterId and voucherNumber fallbacks', () => {
      const xml = `<ENVELOPE>
        <BODY>
          <DATA>
            <COLLECTION>
              <VOUCHER>
                <MASTERID>9001</MASTERID>
                <ALTERID>1471</ALTERID>
                <VOUCHERNUMBER>DC/001</VOUCHERNUMBER>
                <VOUCHERTYPENAME>Delivery Note</VOUCHERTYPENAME>
                <DATE>20261015</DATE>
              </VOUCHER>
              <VOUCHER>
                <VOUCHERNUMBER>RN/002</VOUCHERNUMBER>
                <ALTERID>1472</ALTERID>
                <VOUCHERTYPENAME>Receipt Note</VOUCHERTYPENAME>
              </VOUCHER>
            </COLLECTION>
          </DATA>
        </BODY>
      </ENVELOPE>`;

      const manifest = parseVoucherManifestResponse(xml);
      expect(manifest.length).toBe(2);
      expect(manifest[0]?.masterId).toBe('9001');
      expect(manifest[0]?.voucherNumber).toBe('DC/001');
      // Second voucher has no MASTERID, falls back to VOUCHERNUMBER
      expect(manifest[1]?.masterId).toBe('RN/002');
      expect(manifest[1]?.voucherNumber).toBe('RN/002');
    });
  });
});
