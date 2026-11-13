import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  TallyCompanyInfo,
  TallyLedger,
  TallyBill,
  TallyStockItem,
  TallyChallanSync,
  VoucherImportResult,
  VoucherManifestItem,
  TallySyncVoucher,
  TallyGroup,
} from '../types.js';
import {
  buildCompanyInfoQuery,
  buildOpenCompaniesQuery,
  buildLedgersQuery,
  buildBillsQuery,
  buildVouchersQuery,
  buildStockItemsQuery,
  buildVoucherManifestQuery,
  buildVouchersIncrementalQuery,
  buildAllVouchersQuery,
  buildGroupsQuery,
} from './templates.js';
import {
  parseCompanyInfoResponse,
  parseOpenCompaniesResponse,
  parseLedgersResponse,
  parseBillsResponse,
  parseVouchersResponse,
  parseStockItemsResponse,
  parseVoucherImportResponse,
  parseVoucherManifestResponse,
  parseAllVouchersResponse,
  parseGroupsResponse,
} from './parser.js';
import {
  getMockCompanyInfoXml,
  getMockOpenCompaniesXml,
  getMockLedgersXml,
  getMockBillsXml,
  getMockVouchersXml,
  getMockStockItemsXml,
  getMockVoucherImportResponseXml,
  getMockVoucherManifestXml,
  getMockIncrementalVouchersXml,
} from './mock.js';

const execAsync = promisify(exec);

export interface TallyClientOptions {
  url?: string; // defaults to http://127.0.0.1:9000
  mock?: boolean; // force simulator mode
  timeoutMs?: number;
}

export const CANDIDATE_TALLY_PORTS = [9000, 25853, 9999, 9001, 9002];

export async function parseTallyIniPort(iniPath: string): Promise<number | null> {
  try {
    if (!fs.existsSync(iniPath)) return null;
    const content = fs.readFileSync(iniPath, 'utf8');
    const match = content.match(/^(?:TallyServerPort|TallyPort|TallyODBCPort|Port)\s*=\s*(\d+)/im);
    if (match && match[1]) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port < 65536) return port;
    }
  } catch {}
  return null;
}

export async function discoverTallyPortFromRegistry(): Promise<number | null> {
  if (process.platform !== 'win32') return null;

  // 1. Try querying Windows Registry for Tally installation path
  const regKeys = [
    'HKLM\\SOFTWARE\\Tally Solutions',
    'HKLM\\SOFTWARE\\WOW6432Node\\Tally Solutions',
    'HKCU\\Software\\Tally Solutions',
  ];

  for (const regKey of regKeys) {
    try {
      const { stdout } = await execAsync(`reg query "${regKey}" /s`, { timeout: 2500 });
      const portMatch = stdout.match(/(?:TallyServerPort|TallyPort|Port)\s+REG_\w+\s+(\d+)/i);
      if (portMatch && portMatch[1]) {
        const port = parseInt(portMatch[1], 10);
        if (port > 0 && port < 65536) return port;
      }
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        const pathMatch = line.match(/([a-zA-Z]:\\[^"]+)/);
        if (pathMatch && pathMatch[1]) {
          const candidateDir = pathMatch[1].trim();
          const iniInDir = path.join(candidateDir, 'tally.ini');
          const port = await parseTallyIniPort(iniInDir);
          if (port) return port;
        }
      }
    } catch {}
  }

  // 2. Check standard installation directories on Windows
  const standardPaths = [
    'C:\\Program Files\\TallyPrime\\tally.ini',
    'C:\\Program Files\\Tally.ERP9\\tally.ini',
    'C:\\Program Files (x86)\\TallyPrime\\tally.ini',
    'C:\\Program Files (x86)\\Tally.ERP9\\tally.ini',
    'C:\\TallyPrime\\tally.ini',
    'C:\\Tally.ERP9\\tally.ini',
    'D:\\TallyPrime\\tally.ini',
    'D:\\Tally.ERP9\\tally.ini',
  ];

  for (const p of standardPaths) {
    const port = await parseTallyIniPort(p);
    if (port) return port;
  }

  return null;
}

/**
 * Normalizes a Tally company name by stripping trailing FY suffixes like "- (from 1-Apr-2026)" or "(2026-27)"
 */
export function normalizeTallyCompanyName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\s*-\s*\(from.*?\)/gi, '')
    .replace(/\s*\(\s*\d{2,4}\s*-\s*\d{2,4}\s*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchFuzzyCompanyName(requestedName: string | undefined, activeCompanies: string[]): string | undefined {
  if (!requestedName) return activeCompanies[0];
  const reqNorm = normalizeTallyCompanyName(requestedName);
  if (!reqNorm) return requestedName;

  for (const cand of activeCompanies) {
    if (cand.toLowerCase().trim() === requestedName.toLowerCase().trim()) {
      return cand;
    }
  }
  for (const cand of activeCompanies) {
    const candNorm = normalizeTallyCompanyName(cand);
    if (candNorm === reqNorm || candNorm.includes(reqNorm) || reqNorm.includes(candNorm)) {
      return cand;
    }
  }
  return requestedName;
}

export class TallyClient {
  private url: string;
  private mock: boolean;
  private timeoutMs: number;

  constructor(options: TallyClientOptions = {}) {
    this.url = options.url || 'http://127.0.0.1:25853';
    this.mock = options.mock ?? false;
    this.timeoutMs = options.timeoutMs || 30000;
  }

  public setMockMode(mock: boolean) {
    this.mock = mock;
  }

  public isMockMode(): boolean {
    return this.mock;
  }

  public getUrl(): string {
    return this.url;
  }

  public setUrl(url: string) {
    if (url && typeof url === 'string') {
      this.url = url.trim();
    }
  }

  public getActivePort(): number {
    try {
      const u = new URL(this.url);
      return parseInt(u.port || '25853', 10) || 25853;
    } catch {
      return 25853;
    }
  }

  /**
   * Automatically scans candidate ports ([9000, 25853, 9999, 9001, 9002], Windows registry, tally.ini)
   */
  public async discoverActivePort(): Promise<string | null> {
    if (this.mock) return this.url;

    const portsToProbe: number[] = [];
    const seenPorts = new Set<number>();

    const addPort = (p?: number | null) => {
      if (p && p > 0 && p < 65536 && !seenPorts.has(p)) {
        seenPorts.add(p);
        portsToProbe.push(p);
      }
    };

    addPort(this.getActivePort());

    try {
      const regPort = await discoverTallyPortFromRegistry();
      if (regPort) addPort(regPort);
    } catch {}

    for (const p of CANDIDATE_TALLY_PORTS) {
      addPort(p);
    }

    const probeXml = buildCompanyInfoQuery();
    for (const port of portsToProbe) {
      const candidateUrl = `http://127.0.0.1:${port}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1200);
        const resp = await fetch(candidateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml;charset=utf-8' },
          body: probeXml,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (resp.ok) {
          const text = await resp.text();
          if (text.includes('<ENVELOPE') || text.includes('<COMPANY') || text.includes('<STATICVARIABLES>')) {
            this.url = candidateUrl;
            return candidateUrl;
          }
        }
      } catch {}
    }
    return null;
  }

  private async postXml(xmlPayload: string, allowPortScan: boolean = true): Promise<string> {
    if (this.mock) {
      // Determine request type from payload
      if (xmlPayload.includes('ListOfOpenCompanies')) return getMockOpenCompaniesXml();
      if (xmlPayload.includes('CompanyInfo')) return getMockCompanyInfoXml();
      if (xmlPayload.includes('VoucherManifestCollection')) {
        return getMockVoucherManifestXml();
      }
      if (xmlPayload.includes('IncrementalVouchersCollection')) {
        const alterMatch = xmlPayload.match(/VoucherAlterFilter">.*?(\d+)/);
        const minAlter = alterMatch && alterMatch[1] ? parseInt(alterMatch[1], 10) : 0;
        return getMockIncrementalVouchersXml(minAlter);
      }
      if (xmlPayload.includes('CustomLedgerCollection')) {
        const alterMatch = xmlPayload.match(/AlterId &gt; (\d+)/);
        const lastAlter = alterMatch && alterMatch[1] ? parseInt(alterMatch[1], 10) : 0;
        return getMockLedgersXml(lastAlter);
      }
      if (xmlPayload.includes('BillsCollection')) return getMockBillsXml();
      if (xmlPayload.includes('CustomVouchersCollection')) return getMockVouchersXml();
      if (xmlPayload.includes('CustomStockCollection')) {
        const alterMatch = xmlPayload.match(/StockAlterFilter">.*?(\d+)/);
        const lastAlter = alterMatch && alterMatch[1] ? parseInt(alterMatch[1], 10) : 0;
        return getMockStockItemsXml(lastAlter);
      }
      if (xmlPayload.includes('TALLYREQUEST>Import</TALLYREQUEST>')) {
        return getMockVoucherImportResponseXml();
      }
      return getMockCompanyInfoXml();
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const resp = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml;charset=utf-8',
        },
        body: xmlPayload,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`Tally server responded with status ${resp.status}`);
      }

      return await resp.text();
    } catch (err: any) {
      if (this.mock) {
        return this.postXml(xmlPayload, false);
      }
      // If connection failed on default port, auto-scan candidate ports once
      if (allowPortScan) {
        const discovered = await this.discoverActivePort();
        if (discovered) {
          return this.postXml(xmlPayload, false);
        }
      }
      throw new Error(`Cannot reach Tally at ${this.url}: ${err.message}. Ensure TallyPrime is open with connectivity enabled on port 25853 or 9000.`);
    }
  }

  public async ping(): Promise<{ ok: boolean; company?: string; port?: number; error?: string }> {
    if (this.mock) {
      return { ok: true, company: 'Manohar Traders (Mock Mode)', port: 9000 };
    }
    try {
      const xml = await this.postXml(buildCompanyInfoQuery());
      const info = parseCompanyInfoResponse(xml);
      return { ok: true, company: info.name, port: this.getActivePort() };
    } catch (err: any) {
      return { ok: false, port: this.getActivePort(), error: err.message };
    }
  }

  public async getCompanyInfo(companyName?: string): Promise<TallyCompanyInfo> {
    const xml = await this.postXml(buildCompanyInfoQuery(companyName));
    return parseCompanyInfoResponse(xml);
  }

  public async getOpenCompanies(): Promise<TallyCompanyInfo[]> {
    try {
      const xml = await this.postXml(buildOpenCompaniesQuery());
      const openList = parseOpenCompaniesResponse(xml);
      if (openList.length > 0) {
        return openList;
      }
    } catch {}
    try {
      const active = await this.getCompanyInfo();
      return active?.name ? [active] : [];
    } catch {
      return [];
    }
  }

  public async getLedgers(lastAlterId: number = 0, companyName?: string): Promise<TallyLedger[]> {
    const xml = await this.postXml(buildLedgersQuery(lastAlterId, companyName));
    return parseLedgersResponse(xml);
  }

  public async getBills(today?: string, companyName?: string): Promise<TallyBill[]> {
    const xml = await this.postXml(buildBillsQuery(companyName));
    return parseBillsResponse(xml, today);
  }

  public async getVouchers(today?: string, companyName?: string): Promise<{ challans: TallyChallanSync[]; bills: TallyBill[] }> {
    const xml = await this.postXml(buildVouchersQuery(companyName));
    return parseVouchersResponse(xml, today);
  }

  public async getVoucherManifest(companyName?: string): Promise<VoucherManifestItem[]> {
    const xml = await this.postXml(buildVoucherManifestQuery(companyName));
    return parseVoucherManifestResponse(xml);
  }

  public async getVouchersIncremental(
    minAlterId: number = 0,
    companyName?: string,
    fromDate?: string,
    toDate?: string
  ): Promise<{ challans: TallyChallanSync[]; bills: TallyBill[]; maxAlterId: number }> {
    const xml = await this.postXml(buildVouchersIncrementalQuery(minAlterId, companyName, fromDate, toDate));
    const result = parseVouchersResponse(xml);
    let maxAlter = minAlterId;
    if (result.maxAlterId && result.maxAlterId > maxAlter) {
      maxAlter = result.maxAlterId;
    }
    for (const c of result.challans) {
      if (c.alterId && c.alterId > maxAlter) maxAlter = c.alterId;
    }
    return { ...result, maxAlterId: maxAlter };
  }

  public async getStockItems(lastAlterId: number = 0, companyName?: string): Promise<TallyStockItem[]> {
    const xml = await this.postXml(buildStockItemsQuery(lastAlterId, companyName));
    return parseStockItemsResponse(xml);
  }

  public async getAllVouchers(
    minAlterId: number = 0,
    companyName?: string,
    fromDate?: string,
    toDate?: string
  ): Promise<{ vouchers: TallySyncVoucher[]; maxAlterId: number }> {
    const xml = await this.postXml(buildAllVouchersQuery(minAlterId, companyName, fromDate, toDate));
    return parseAllVouchersResponse(xml);
  }

  public async getGroups(companyName?: string): Promise<TallyGroup[]> {
    const xml = await this.postXml(buildGroupsQuery(companyName));
    return parseGroupsResponse(xml);
  }

  public async postVoucher(voucherXml: string): Promise<VoucherImportResult> {
    const xml = await this.postXml(voucherXml);
    return parseVoucherImportResponse(xml);
  }
}
