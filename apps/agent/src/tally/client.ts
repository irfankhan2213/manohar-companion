import {
  TallyCompanyInfo,
  TallyLedger,
  TallyBill,
  TallyStockItem,
  VoucherImportResult,
} from '../types.js';
import {
  buildCompanyInfoQuery,
  buildLedgersQuery,
  buildBillsQuery,
  buildStockItemsQuery,
} from './templates.js';
import {
  parseCompanyInfoResponse,
  parseLedgersResponse,
  parseBillsResponse,
  parseStockItemsResponse,
  parseVoucherImportResponse,
} from './parser.js';
import {
  getMockCompanyInfoXml,
  getMockLedgersXml,
  getMockBillsXml,
  getMockStockItemsXml,
  getMockVoucherImportResponseXml,
} from './mock.js';

export interface TallyClientOptions {
  url?: string; // defaults to http://127.0.0.1:9000
  mock?: boolean; // force simulator mode
  timeoutMs?: number;
}

const CANDIDATE_TALLY_PORTS = [9000, 9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9999];

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
    this.url = options.url || 'http://127.0.0.1:9000';
    this.mock = options.mock ?? false;
    this.timeoutMs = options.timeoutMs || 8000;
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

  public getActivePort(): number {
    try {
      const u = new URL(this.url);
      return parseInt(u.port || '9000', 10) || 9000;
    } catch {
      return 9000;
    }
  }

  /**
   * Automatically scans local ports 9000-9010 & 9999 when the configured port is unreachable
   */
  public async discoverActivePort(): Promise<string | null> {
    if (this.mock) return this.url;
    const probeXml = buildCompanyInfoQuery();
    for (const port of CANDIDATE_TALLY_PORTS) {
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
          this.url = candidateUrl;
          return candidateUrl;
        }
      } catch {}
    }
    return null;
  }

  private async postXml(xmlPayload: string, allowPortScan: boolean = true): Promise<string> {
    if (this.mock) {
      // Determine request type from payload
      if (xmlPayload.includes('CompanyInfo')) return getMockCompanyInfoXml();
      if (xmlPayload.includes('CustomLedgerCollection')) {
        const alterMatch = xmlPayload.match(/AlterId &gt; (\d+)/);
        const lastAlter = alterMatch && alterMatch[1] ? parseInt(alterMatch[1], 10) : 0;
        return getMockLedgersXml(lastAlter);
      }
      if (xmlPayload.includes('BillsCollection')) return getMockBillsXml();
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
      // If connection failed on default port, auto-scan ports 9000-9010 & 9999 once
      if (allowPortScan) {
        const discovered = await this.discoverActivePort();
        if (discovered) {
          return this.postXml(xmlPayload, false);
        }
      }
      throw new Error(`Cannot reach Tally at ${this.url}: ${err.message}. Ensure TallyPrime is open with connectivity enabled on port 9000-9010.`);
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

  public async getLedgers(lastAlterId: number = 0, companyName?: string): Promise<TallyLedger[]> {
    const xml = await this.postXml(buildLedgersQuery(lastAlterId, companyName));
    return parseLedgersResponse(xml);
  }

  public async getBills(today?: string, companyName?: string): Promise<TallyBill[]> {
    const xml = await this.postXml(buildBillsQuery(companyName));
    return parseBillsResponse(xml, today);
  }

  public async getStockItems(lastAlterId: number = 0, companyName?: string): Promise<TallyStockItem[]> {
    const xml = await this.postXml(buildStockItemsQuery(lastAlterId, companyName));
    return parseStockItemsResponse(xml);
  }

  public async postVoucher(voucherXml: string): Promise<VoucherImportResult> {
    const xml = await this.postXml(voucherXml);
    return parseVoucherImportResponse(xml);
  }
}
