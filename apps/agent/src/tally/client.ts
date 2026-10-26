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

  private async postXml(xmlPayload: string): Promise<string> {
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
        return this.postXml(xmlPayload);
      }
      throw new Error(`Cannot reach Tally at ${this.url}: ${err.message}. Ensure TallyPrime is open with port 9000 enabled.`);
    }
  }

  public async ping(): Promise<{ ok: boolean; company?: string; error?: string }> {
    if (this.mock) {
      return { ok: true, company: 'Manohar Traders (Mock Mode)' };
    }
    try {
      const xml = await this.postXml(buildCompanyInfoQuery());
      const info = parseCompanyInfoResponse(xml);
      return { ok: true, company: info.name };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  public async getCompanyInfo(): Promise<TallyCompanyInfo> {
    const xml = await this.postXml(buildCompanyInfoQuery());
    return parseCompanyInfoResponse(xml);
  }

  public async getLedgers(lastAlterId: number = 0): Promise<TallyLedger[]> {
    const xml = await this.postXml(buildLedgersQuery(lastAlterId));
    return parseLedgersResponse(xml);
  }

  public async getBills(today?: string): Promise<TallyBill[]> {
    const xml = await this.postXml(buildBillsQuery());
    return parseBillsResponse(xml, today);
  }

  public async getStockItems(lastAlterId: number = 0): Promise<TallyStockItem[]> {
    const xml = await this.postXml(buildStockItemsQuery(lastAlterId));
    return parseStockItemsResponse(xml);
  }

  public async postVoucher(voucherXml: string): Promise<VoucherImportResult> {
    const xml = await this.postXml(voucherXml);
    return parseVoucherImportResponse(xml);
  }
}
