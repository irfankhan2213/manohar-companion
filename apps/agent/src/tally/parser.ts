import { XMLParser } from 'fast-xml-parser';
import { rupeesToPaise, getDaysOverdue } from '@saas/shared';
import {
  TallyCompanyInfo,
  TallyLedger,
  TallyBill,
  TallyStockItem,
  VoucherImportResult,
} from '../types.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false, // Keep values as strings to avoid floating point truncation
});

// Helper to convert unknown/array to array
function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// Convert Tally amount string to paise integer
export function parseTallyAmount(amountStr?: string | number): number {
  if (!amountStr) return 0;
  const raw = String(amountStr).replace(/,/g, '').trim();
  // Handle Dr / Cr suffixes
  const isCr = /cr$/i.test(raw);
  const isDr = /dr$/i.test(raw);
  const numOnly = raw.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(numOnly);
  if (isNaN(parsed)) return 0;

  const paise = rupeesToPaise(Math.abs(parsed));
  // In Tally, debit is positive (receivable), credit is negative
  if (isCr) return -paise;
  if (isDr) return paise;
  return parsed < 0 ? -paise : paise;
}

// Convert Tally date string (e.g. "20261015" or "15-Oct-2026") to YYYY-MM-DD
export function parseTallyDate(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const clean = dateStr.trim();
  if (/^\d{8}$/.test(clean)) {
    // YYYYMMDD
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  // Try JS Date
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return clean;
}

export function parseCompanyInfoResponse(xmlString: string): TallyCompanyInfo {
  const parsed = xmlParser.parse(xmlString);
  const envelope = parsed?.ENVELOPE || parsed?.envelope;
  const body = envelope?.BODY || envelope?.body;
  const data = body?.DATA || body?.data;

  // Sometimes Tally returns directly in fields
  const companyName =
    data?.COMPANYNAME ||
    body?.DESC?.STATICVARIABLES?.SVCURRENTCOMPANY ||
    data?.COMPNAMEFIELD ||
    'Manohar Traders';

  const fromDate = parseTallyDate(data?.COMPYEARFIELD || '20260401');
  const booksFrom = parseTallyDate(data?.COMPBOOKSFIELD || '20260401');

  return {
    name: String(companyName).trim(),
    financialYearFrom: fromDate,
    booksFrom: booksFrom,
  };
}

export function parseLedgersResponse(xmlString: string): TallyLedger[] {
  const parsed = xmlParser.parse(xmlString);
  const envelope = parsed?.ENVELOPE || parsed?.envelope;
  const body = envelope?.BODY || envelope?.body;
  const data = body?.DATA || body?.data;

  // Tally collections are usually nested inside TALLYMESSAGE -> LEDGER
  const messages = toArray(data?.TALLYMESSAGE || data?.COLLECTION?.LEDGER);
  const ledgers: TallyLedger[] = [];

  for (const msg of messages) {
    const rawLedger = msg?.LEDGER || msg;
    if (!rawLedger || typeof rawLedger !== 'object') continue;

    const name = rawLedger['@_NAME'] || rawLedger.NAME;
    if (!name) continue;

    const parent = String(rawLedger.PARENT || '').trim();
    const parentLower = parent.toLowerCase();
    const isDebtor = parentLower.includes('debtor') || parentLower.includes('customer');
    const isCreditor = parentLower.includes('creditor') || parentLower.includes('supplier');

    const alterId = parseInt(String(rawLedger.ALTERID || '0'), 10) || 0;
    const phone = rawLedger.LEDGERPHONE || rawLedger.PHONE;
    const email = rawLedger.EMAIL;
    const gstin = rawLedger.PARTYGSTIN || rawLedger.GSTIN;
    const creditDays = parseInt(String(rawLedger.BILLCREDITPERIOD || '30'), 10) || 30;

    ledgers.push({
      name: String(name).trim(),
      parent,
      openingBalance: parseTallyAmount(rawLedger.OPENINGBALANCE),
      closingBalance: parseTallyAmount(rawLedger.CLOSINGBALANCE),
      phone: phone ? String(phone).trim() : undefined,
      email: email ? String(email).trim() : undefined,
      gstin: gstin ? String(gstin).trim() : undefined,
      creditDays,
      alterId,
      isSundryDebtor: isDebtor,
      isSundryCreditor: isCreditor,
    });
  }

  return ledgers;
}

export function parseBillsResponse(xmlString: string, today: string = '2026-10-17'): TallyBill[] {
  const parsed = xmlParser.parse(xmlString);
  const envelope = parsed?.ENVELOPE || parsed?.envelope;
  const body = envelope?.BODY || envelope?.body;
  const data = body?.DATA || body?.data;

  const messages = toArray(data?.TALLYMESSAGE || data?.COLLECTION?.BILLS);
  const bills: TallyBill[] = [];

  for (const msg of messages) {
    const rawBill = msg?.BILLS || msg;
    if (!rawBill || typeof rawBill !== 'object') continue;

    const partyName = rawBill.PARENT || rawBill['@_PARENT'];
    const billNo = rawBill.BILLREF || rawBill['@_BILLREF'];
    if (!partyName || !billNo) continue;

    const billDate = parseTallyDate(rawBill.BILLDATE);
    const dueDate = parseTallyDate(rawBill.BILLDUE || rawBill.BILLDATE);
    const amount = parseTallyAmount(rawBill.CLOSINGBALANCE);
    const daysLate = getDaysOverdue(dueDate, today);

    bills.push({
      partyName: String(partyName).trim(),
      billNo: String(billNo).trim(),
      billDate,
      dueDate,
      pendingAmount: Math.abs(amount),
      isOverdue: daysLate > 0,
      daysOverdue: Math.max(0, daysLate),
    });
  }

  return bills;
}

export function parseStockItemsResponse(xmlString: string): TallyStockItem[] {
  const parsed = xmlParser.parse(xmlString);
  const envelope = parsed?.ENVELOPE || parsed?.envelope;
  const body = envelope?.BODY || envelope?.body;
  const data = body?.DATA || body?.data;

  const messages = toArray(data?.TALLYMESSAGE || data?.COLLECTION?.STOCKITEM);
  const stockItems: TallyStockItem[] = [];

  for (const msg of messages) {
    const rawItem = msg?.STOCKITEM || msg;
    if (!rawItem || typeof rawItem !== 'object') continue;

    const name = rawItem['@_NAME'] || rawItem.NAME;
    if (!name) continue;

    // e.g. "100 pcs" -> 100
    const rawQtyStr = String(rawItem.CLOSINGBALANCE || '0');
    const qtyMatch = rawQtyStr.match(/([-+]?\d+(\.\d+)?)/);
    const closingQty = qtyMatch && qtyMatch[1] ? parseFloat(qtyMatch[1]) : 0;

    const baseUnits = String(rawItem.BASEUNITS || 'pcs').trim();
    const closingRate = parseTallyAmount(rawItem.CLOSINGRATE);
    const closingValue = parseTallyAmount(rawItem.CLOSINGVALUE);
    const alterId = parseInt(String(rawItem.ALTERID || '0'), 10) || 0;

    stockItems.push({
      name: String(name).trim(),
      parent: rawItem.PARENT ? String(rawItem.PARENT).trim() : undefined,
      partNo: rawItem.PARTNO ? String(rawItem.PARTNO).trim() : undefined,
      closingQty,
      baseUnits,
      closingRate,
      closingValue,
      alterId,
    });
  }

  return stockItems;
}

export function parseVoucherImportResponse(xmlString: string): VoucherImportResult {
  const parsed = xmlParser.parse(xmlString);
  const resp = parsed?.RESPONSE || parsed?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;

  const created = parseInt(String(resp?.CREATED || '0'), 10) || 0;
  const altered = parseInt(String(resp?.ALTERED || '0'), 10) || 0;
  const errors = parseInt(String(resp?.ERRORS || '0'), 10) || 0;

  // Check for error lines
  const lineErrors = resp?.LINEERROR ? toArray(resp.LINEERROR).join('; ') : undefined;

  return {
    success: errors === 0 && (created > 0 || altered > 0),
    created,
    altered,
    errors,
    message: lineErrors,
  };
}
