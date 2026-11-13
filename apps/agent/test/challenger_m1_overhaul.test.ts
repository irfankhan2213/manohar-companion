import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { AddressInfo } from 'net';
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
import {
  parseCompanyInfoResponse,
  parseVoucherManifestResponse,
  parseVouchersResponse,
} from '../src/tally/parser.js';
import { StateStore } from '../src/sync/state.js';
import { SyncEngine } from '../src/sync/engine.js';

describe('CHALLENGER M1-1: Desktop Tally Connector Empirical Verification', () => {
  const testStatePath = path.resolve(process.cwd(), 'test-challenger-agent-state.json');

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

  describe('1. Empirical Candidate Port Probing Matrix', () => {
    it('exact candidate ports list matches [9000, 25853, 9999, 9001, 9002]', () => {
      expect(CANDIDATE_TALLY_PORTS).toEqual([9000, 25853, 9999, 9001, 9002]);
    });

    // Test discovery for each candidate port individually
    const portsToTest = [9000, 25853, 9999, 9001, 9002];
    for (const port of portsToTest) {
      it(`probes and dynamically discovers Tally when listening on port ${port}`, async () => {
        const client = new TallyClient({ url: 'http://127.0.0.1:18888', timeoutMs: 1500 });
        const origFetch = globalThis.fetch;

        globalThis.fetch = async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes(`:${port}`)) {
            return new Response(
              `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><DATA><COMPANYNAME>Manohar Traders (${port})</COMPANYNAME></DATA></BODY></ENVELOPE>`,
              { status: 200, headers: { 'Content-Type': 'text/xml' } }
            );
          }
          throw new Error('ECONNREFUSED');
        };

        try {
          const discovered = await client.discoverActivePort();
          expect(discovered).toBe(`http://127.0.0.1:${port}`);
          expect(client.getUrl()).toBe(`http://127.0.0.1:${port}`);
          expect(client.getActivePort()).toBe(port);
        } finally {
          globalThis.fetch = origFetch;
        }
      });
    }

    it('probes initially configured non-candidate port first before candidates', async () => {
      const probeOrder: string[] = [];
      const client = new TallyClient({ url: 'http://127.0.0.1:10550', timeoutMs: 1500 });
      const origFetch = globalThis.fetch;

      globalThis.fetch = async (url: any) => {
        const urlStr = String(url);
        probeOrder.push(urlStr);
        // Only port 9999 responds
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
        // Initial probe must be the configured port (10550)
        expect(probeOrder[0]).toBe('http://127.0.0.1:10550');
        // Followed by candidate ports
        expect(probeOrder).toContain('http://127.0.0.1:9000');
        expect(probeOrder).toContain('http://127.0.0.1:25853');
        expect(probeOrder).toContain('http://127.0.0.1:9999');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('gracefully returns null without throwing when all ports are offline', async () => {
      const client = new TallyClient({ url: 'http://127.0.0.1:9000', timeoutMs: 1000 });
      const origFetch = globalThis.fetch;

      globalThis.fetch = async () => {
        throw new Error('ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:9000');
      };

      try {
        const discovered = await client.discoverActivePort();
        expect(discovered).toBeNull();
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('rejects foreign non-Tally HTTP services (e.g. nginx HTML) on candidate ports and continues scanning', async () => {
      const client = new TallyClient({ url: 'http://127.0.0.1:9000', timeoutMs: 1500 });
      const origFetch = globalThis.fetch;

      globalThis.fetch = async (url: any) => {
        const urlStr = String(url);
        // Candidate 9000 has a web server returning HTML
        if (urlStr.includes(':9000')) {
          return new Response(
            `<!DOCTYPE html><html><head><title>Welcome to nginx!</title></head><body><h1>Welcome to nginx!</h1></body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
          );
        }
        // Candidate 25853 is down
        if (urlStr.includes(':25853')) {
          throw new Error('ECONNREFUSED');
        }
        // Candidate 9999 is genuine Tally
        if (urlStr.includes(':9999')) {
          return new Response(
            `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><DATA><COMPANYNAME>Manohar Traders</COMPANYNAME></DATA></BODY></ENVELOPE>`,
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          );
        }
        throw new Error('ECONNREFUSED');
      };

      try {
        const discovered = await client.discoverActivePort();
        // Port 9000 returned 200 OK HTML but was correctly rejected because it lacked Tally XML markers!
        expect(discovered).toBe('http://127.0.0.1:9999');
        expect(client.getActivePort()).toBe(9999);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('skips candidate ports returning HTTP 500 or 404 errors', async () => {
      const client = new TallyClient({ url: 'http://127.0.0.1:9000', timeoutMs: 1500 });
      const origFetch = globalThis.fetch;

      globalThis.fetch = async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes(':9000')) {
          return new Response('Internal Server Error', { status: 500 });
        }
        if (urlStr.includes(':25853')) {
          return new Response('Not Found', { status: 404 });
        }
        if (urlStr.includes(':9999')) {
          return new Response(
            `<ENVELOPE><BODY><DATA><COMPANYNAME>Manohar Traders</COMPANYNAME></DATA></BODY></ENVELOPE>`,
            { status: 200 }
          );
        }
        throw new Error('ECONNREFUSED');
      };

      try {
        const discovered = await client.discoverActivePort();
        expect(discovered).toBe('http://127.0.0.1:9999');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('recovers dynamically via postXml auto-scan when primary port fails', async () => {
      // Start with dead port 9000
      const client = new TallyClient({ url: 'http://127.0.0.1:9000', timeoutMs: 1500 });
      const origFetch = globalThis.fetch;

      globalThis.fetch = async (url: any) => {
        const urlStr = String(url);
        // Primary port 9000 fails
        if (urlStr.includes(':9000')) {
          throw new Error('ECONNREFUSED');
        }
        // Auto-scan discovers port 9999
        if (urlStr.includes(':9999')) {
          return new Response(
            `<ENVELOPE><BODY><DATA><COMPANYNAME>Manohar Traders</COMPANYNAME><COMPYEARFIELD>20260401</COMPYEARFIELD></DATA></BODY></ENVELOPE>`,
            { status: 200 }
          );
        }
        throw new Error('ECONNREFUSED');
      };

      try {
        const comp = await client.getCompanyInfo();
        expect(comp.name).toBe('Manohar Traders');
        expect(client.getUrl()).toBe('http://127.0.0.1:9999');
        expect(client.getActivePort()).toBe(9999);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('2. Real HTTP Socket Listener Stress Tests', () => {
    let mockServer: http.Server | null = null;
    let serverPort: number = 0;

    afterEach(async () => {
      if (mockServer) {
        await new Promise<void>((resolve) => mockServer!.close(() => resolve()));
        mockServer = null;
      }
    });

    it('probes and connects to a real TCP HTTP loopback server', async () => {
      mockServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/xml' });
          res.end(
            `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><DATA><COMPANYNAME>Manohar Traders Real Loopback</COMPANYNAME></DATA></BODY></ENVELOPE>`
          );
        });
      });

      await new Promise<void>((resolve) => mockServer!.listen(0, '127.0.0.1', () => resolve()));
      serverPort = (mockServer.address() as AddressInfo).port;

      const client = new TallyClient({ url: `http://127.0.0.1:${serverPort}`, timeoutMs: 3000 });
      const discovered = await client.discoverActivePort();
      expect(discovered).toBe(`http://127.0.0.1:${serverPort}`);

      const ping = await client.ping();
      expect(ping.ok).toBe(true);
      expect(ping.company).toBe('Manohar Traders Real Loopback');
      expect(ping.port).toBe(serverPort);
    });

    it('handles socket disconnection / TCP abort gracefully during probe', async () => {
      mockServer = http.createServer((req, res) => {
        req.socket.destroy();
      });

      await new Promise<void>((resolve) => mockServer!.listen(0, '127.0.0.1', () => resolve()));
      serverPort = (mockServer.address() as AddressInfo).port;

      const client = new TallyClient({ url: `http://127.0.0.1:${serverPort}`, timeoutMs: 1000 });
      const discovered = await client.discoverActivePort();
      expect(discovered).toBeNull();
    });
  });

  describe('3. Windows Registry Mock Fallbacks & INI Parser Resilience', () => {
    it('parses valid Tally INI key variants without leading indentation', async () => {
      const testCases = [
        { content: '[Tally]\nPort = 9999\n', expected: 9999 },
        { content: 'TallyServerPort=9000', expected: 9000 },
        { content: 'TallyPort = 25853\r\n', expected: 25853 },
        { content: 'TallyODBCPort   =   9002  ', expected: 9002 },
        { content: '; Configuration\n[Settings]\nport=9001\n', expected: 9001 },
      ];

      for (const tc of testCases) {
        const tmpPath = path.resolve(process.cwd(), `test-ini-${Math.random().toString(36).slice(2)}.ini`);
        try {
          fs.writeFileSync(tmpPath, tc.content, 'utf8');
          const port = await parseTallyIniPort(tmpPath);
          expect(port).toBe(tc.expected);
        } finally {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        }
      }
    });

    it('OBSERVATION: demonstrates that leading whitespace before key in tally.ini fails to match due to missing \\s* in regex', async () => {
      const indentedContent = '  Port = 9999\n';
      const tmpPath = path.resolve(process.cwd(), `test-ini-indent-${Math.random().toString(36).slice(2)}.ini`);
      try {
        fs.writeFileSync(tmpPath, indentedContent, 'utf8');
        const port = await parseTallyIniPort(tmpPath);
        // Current implementation: /^(?:TallyServerPort...)/ without leading \\s* returns null on indented lines
        expect(port).toBeNull();
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    });

    it('rejects invalid, boundary, or corrupt port numbers in tally.ini', async () => {
      const invalidCases = [
        'Port = 0\n',
        'Port = 65536\n',
        'Port = 70000\n',
        'Port = -9000\n',
        'Port = abc\n',
        'Port = \n',
        '',
        'SomeOtherKey = 9000\n',
      ];

      for (const content of invalidCases) {
        const tmpPath = path.resolve(process.cwd(), `test-ini-invalid-${Math.random().toString(36).slice(2)}.ini`);
        try {
          fs.writeFileSync(tmpPath, content, 'utf8');
          const port = await parseTallyIniPort(tmpPath);
          expect(port).toBeNull();
        } finally {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        }
      }
    });

    it('returns null safely on non-Windows platforms for registry queries', async () => {
      const regPort = await discoverTallyPortFromRegistry();
      if (process.platform !== 'win32') {
        expect(regPort).toBeNull();
      }
    });
  });

  describe('4. Port 9999 Preservation & Suppression Audit', () => {
    it('preserves port 9999 in StateStore across serialize/deserialize cycles', () => {
      const store = new StateStore(testStatePath);
      store.update({
        tallyPort: 9999,
        tallyUrl: 'http://127.0.0.1:9999',
        companyName: 'Manohar Traders',
      });

      const loadedStore = new StateStore(testStatePath);
      const state = loadedStore.get();
      expect(state.tallyPort).toBe(9999);
      expect(state.tallyUrl).toBe('http://127.0.0.1:9999');
      expect(state.tallyPort).not.toBe(25853);
    });

    it('TallyClient retains port 9999 without falling back to 25853', () => {
      const client = new TallyClient({ url: 'http://127.0.0.1:9999' });
      expect(client.getActivePort()).toBe(9999);
      expect(client.getUrl()).toBe('http://127.0.0.1:9999');
    });

    it('AUDIT: verifies port 9999 suppression is removed in apps/web/src/features/settings/SettingsScreen.tsx', () => {
      const settingsScreenPath = path.resolve(process.cwd(), '../web/src/features/settings/SettingsScreen.tsx');
      expect(fs.existsSync(settingsScreenPath)).toBe(true);

      const settingsContent = fs.readFileSync(settingsScreenPath, 'utf8');
      const hasSuppression = settingsContent.includes('agent.tallyPort !== 9999 ? agent.tallyPort : 25853');
      expect(hasSuppression).toBe(false);
    });
  });

  describe('5. Unconditional Multi-Company Scoping & XML Safety', () => {
    it('properly XML-escapes special characters in company name for SVCURRENTCOMPANY', () => {
      const specialCompName = 'M/s Manohar & Sons <Retail> "Main" \'Branch\'';
      const xml = buildCompanyInfoQuery(specialCompName);

      expect(xml).toContain('<SVCURRENTCOMPANY>M/s Manohar &amp; Sons &lt;Retail&gt; &quot;Main&quot; &apos;Branch&apos;</SVCURRENTCOMPANY>');
      expect(xml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
    });

    it('stock journal and delivery challan mutation templates retain BOTH SVEXPORTFORMAT and SVCURRENTCOMPANY', () => {
      const compName = 'Manohar Traders (Ludhiana)';

      const stockJournalXml = buildStockJournalVoucherXml({
        date: '2026-10-15',
        sourceGodown: 'Main Location',
        destinationGodown: 'Shop Godown',
        itemName: 'Cotton Yarn 40s',
        qty: 50,
        rate: 240,
        narration: 'Inter-godown transfer',
        companyName: compName,
      });

      expect(stockJournalXml).toContain('<SVCURRENTCOMPANY>Manohar Traders (Ludhiana)</SVCURRENTCOMPANY>');
      expect(stockJournalXml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');

      const challanXml = buildDeliveryChallanVoucherXml({
        challanNumber: 'DC/2026/001',
        date: '2026-10-15',
        partyName: 'Amritsar Textiles',
        items: [
          {
            itemName: 'Cotton Yarn 40s',
            qty: 100,
            rateRupees: 250,
            unit: 'kg',
            godownName: 'Main Location',
          },
        ],
        narration: 'Delivery challan dispatch',
        companyName: compName,
      });

      expect(challanXml).toContain('<SVCURRENTCOMPANY>Manohar Traders (Ludhiana)</SVCURRENTCOMPANY>');
      expect(challanXml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
    });
  });

  describe('6. Incremental AlterId & Deletion Manifest Purge Resilience', () => {
    it('generates incremental voucher query with correct TDL formula and date bounds', () => {
      const xml = buildVouchersIncrementalQuery(250000, 'Manohar Traders', '20260401', '20261112');
      expect(xml).toContain('$$Number:$AlterId &gt; 250000');
      expect(xml).toContain('<SVFROMDATE>20260401</SVFROMDATE>');
      expect(xml).toContain('<SVTODATE>20261112</SVTODATE>');
      expect(xml).toContain('<SVCURRENTCOMPANY>Manohar Traders</SVCURRENTCOMPANY>');
    });

    it('correctly handles zero minAlterId without crashing or emitting invalid XML', () => {
      const xml = buildVouchersIncrementalQuery(0, 'Manohar Traders');
      expect(xml).toContain('$$Number:$AlterId &gt; 0');
      expect(xml).toContain('<SVCURRENTCOMPANY>Manohar Traders</SVCURRENTCOMPANY>');
    });

    it('parses empty voucher manifest response cleanly without throwing', () => {
      const emptyXml = `<ENVELOPE><BODY><DATA><COLLECTION></COLLECTION></DATA></BODY></ENVELOPE>`;
      const items = parseVoucherManifestResponse(emptyXml);
      expect(items).toEqual([]);
    });

    it('parses manifest with varied voucher formats and GUIDs', () => {
      const sampleXml = `
        <ENVELOPE>
          <BODY>
            <DATA>
              <COLLECTION>
                <VOUCHER>
                  <MASTERID>1001</MASTERID>
                  <ALTERID>5001</ALTERID>
                  <VOUCHERNUMBER>DC-1001</VOUCHERNUMBER>
                  <VOUCHERTYPENAME>Delivery Note</VOUCHERTYPENAME>
                  <DATE>20261015</DATE>
                  <GUID>guid-1001-abc</GUID>
                </VOUCHER>
                <VOUCHER>
                  <MASTERID>1002</MASTERID>
                  <ALTERID>5002</ALTERID>
                  <VOUCHERNUMBER>DC-1002</VOUCHERNUMBER>
                  <VOUCHERTYPENAME>Delivery Note</VOUCHERTYPENAME>
                  <DATE>20261016</DATE>
                </VOUCHER>
              </COLLECTION>
            </DATA>
          </BODY>
        </ENVELOPE>
      `;
      const items = parseVoucherManifestResponse(sampleXml);
      expect(items.length).toBe(2);
      expect(items[0]).toEqual({
        masterId: '1001',
        alterId: 5001,
        voucherNumber: 'DC-1001',
        voucherTypeName: 'Delivery Note',
        date: '2026-10-15',
        guid: 'guid-1001-abc',
      });
      expect(items[1]?.masterId).toBe('1002');
      expect(items[1]?.voucherTypeName).toBe('Delivery Note');
      expect(items[1]?.guid).toBeUndefined();
    });
  });
});
