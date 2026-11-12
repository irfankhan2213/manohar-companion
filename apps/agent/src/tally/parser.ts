import { XMLParser } from 'fast-xml-parser';
import { rupeesToPaise, getDaysOverdue } from '@saas/shared';
import {
  TallyCompanyInfo,
  TallyLedger,
  TallyBill,
  TallyStockItem,
  TallyChallanSync,
  TallyChallanLine,
  VoucherImportResult,
} from '../types.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false, // Keep values as strings to avoid floating point truncation
});

// Helper to safely extract string text from any fast-xml-parser node (string, object with #text or attributes)
export function extractXmlText(node: any): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (typeof node === 'object') {
    if (node['#text'] !== undefined) return extractXmlText(node['#text']);
    if (node._ !== undefined) return extractXmlText(node._);
    for (const k of Object.keys(node)) {
      if (!k.startsWith('@_')) {
        const val = extractXmlText(node[k]);
        if (val) return val;
      }
    }
  }
  return '';
}

// Helper to convert unknown/array to array
function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// Convert Tally amount string to paise integer
export function parseTallyAmount(amountStr?: any): number {
  if (amountStr === undefined || amountStr === null || amountStr === '') return 0;
  const text = extractXmlText(amountStr);
  if (!text) return 0;
  // Strip any unit suffix after '/' (e.g. "4200.00 / 10 pcs" or "850 / set") before extracting numeric value
  const beforeSlash = text.split('/')[0] || '';
  const raw = beforeSlash.replace(/,/g, '').trim();
  // Handle Dr / Cr suffixes and negative signs
  const isCr = /(?:cr|credit)\.?$/i.test(raw);
  const isDr = /(?:dr|debit)\.?$/i.test(raw);
  const isTrailingMinus = /-\s*$/.test(raw) || raw.endsWith('-');
  const isLeadingMinus = raw.startsWith('-');
  const numOnly = raw.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(numOnly);
  if (isNaN(parsed)) return 0;

  const paise = rupeesToPaise(Math.abs(parsed));
  // In Tally, debit is positive (receivable), credit is negative
  if (isCr || isTrailingMinus || isLeadingMinus) return -paise;
  if (isDr) return paise;
  return parsed < 0 ? -paise : paise;
}

// Convert Tally Ledger balance to paise integer with correct debtor/creditor sign convention.
// In Tally XML, Debit balances (money customers owe) are exported with a minus sign or "Dr" (e.g. "-329430.00" or "329430.00 Dr").
// In business terms and SaaS collections, Debit is POSITIVE (money receivable from customers).
// Credit balances (money owed to suppliers or customer advance) are exported without minus or with "Cr".
export function parseTallyLedgerBalance(amountStr?: any, isDebtor: boolean = true): number {
  if (amountStr === undefined || amountStr === null || amountStr === '') return 0;
  const text = extractXmlText(amountStr);
  if (!text) return 0;
  const raw = text.replace(/,/g, '').trim();

  const isCr = /(?:cr|credit)\.?$/i.test(raw);
  const isDr = /(?:dr|debit)\.?$/i.test(raw);
  const isNegativeInXml = raw.startsWith('-') || /-\s*$/.test(raw) || raw.endsWith('-');
  const numOnly = raw.replace(/[^\d.]/g, '');
  const parsed = parseFloat(numOnly);
  if (isNaN(parsed) || parsed === 0) return 0;

  const paise = rupeesToPaise(parsed);

  if (isDebtor) {
    // For Sundry Debtors (Customers):
    // Standard Debit balance (money customer owes us) is exported in Tally XML as negative (e.g. "-329430.00"), "Dr", or unsigned.
    // In SaaS / Collections, money receivable from customers must be POSITIVE (+32943000).
    // Only if customer has an explicit credit balance (advance payment / credit note marked "Cr") is it negative.
    if (isCr) {
      return -paise;
    }
    return paise;
  } else {
    // For Sundry Creditors (Suppliers):
    // In double-entry convention: Debit is +, Credit is -
    // A normal creditor has a Credit balance (we owe supplier) -> -paise.
    // If explicitly Dr or negative in Tally XML (advance paid to supplier) -> +paise.
    if (isDr || (isNegativeInXml && !isCr)) {
      return paise;
    }
    return -paise;
  }
}

// Convert Tally date string (e.g. "20261015" or "15-Oct-2026") to YYYY-MM-DD without UTC timezone drift
export function parseTallyDate(dateStr?: any): string {
  const text = extractXmlText(dateStr);
  if (!text) return new Date().toISOString().slice(0, 10);
  const clean = text.trim();
  if (/^\d{8}$/.test(clean)) {
    // YYYYMMDD
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  // Try JS Date using local calendar components so IST (+05:30) midnight does not shift back 1 day in UTC
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return clean;
}

export function parseCompanyInfoResponse(xmlString: string): TallyCompanyInfo {
  const parsed = xmlParser.parse(xmlString);
  const envelope = parsed?.ENVELOPE || parsed?.envelope;
  const body = envelope?.BODY || envelope?.body;
  const data = body?.DATA || body?.data;

  // Prefer exact current company name from Tally
  const companyName =
    extractXmlText(data?.COMPNAMEFIELD) ||
    extractXmlText(data?.COMPANYNAME) ||
    extractXmlText(body?.DESC?.STATICVARIABLES?.SVCURRENTCOMPANY) ||
    extractXmlText(data?.TALLYMESSAGE?.COMPANY?.NAME) ||
    '';

  const fromDate = parseTallyDate(extractXmlText(data?.COMPYEARFIELD) || '20260401');
  const booksFrom = parseTallyDate(extractXmlText(data?.COMPBOOKSFIELD) || fromDate);

  return {
    name: companyName.trim(),
    financialYearFrom: fromDate,
    booksFrom: booksFrom,
  };
}

export function parseOpenCompaniesResponse(xmlString: string): TallyCompanyInfo[] {
  const parsed = xmlParser.parse(xmlString);
  const envelope = parsed?.ENVELOPE || parsed?.envelope;
  const body = envelope?.BODY || envelope?.body;
  const data = body?.DATA || body?.data;

  const messages = toArray(data?.TALLYMESSAGE || data?.COLLECTION?.COMPANY || data?.COMPANY);
  const companies: TallyCompanyInfo[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    const rawComp = msg?.COMPANY || msg;
    if (!rawComp || typeof rawComp !== 'object') continue;

    const name = extractXmlText(rawComp['@_NAME'] || rawComp.NAME || rawComp.COMPANYNAME);
    if (!name) continue;
    const cleanName = name.trim();
    if (!cleanName || cleanName === '[object Object]' || seen.has(cleanName.toLowerCase())) continue;
    seen.add(cleanName.toLowerCase());

    const fromDate = parseTallyDate(extractXmlText(rawComp.STARTINGFROM || rawComp.COMPYEARFIELD) || '20260401');
    const booksFrom = parseTallyDate(extractXmlText(rawComp.BOOKSFROM || rawComp.COMPBOOKSFIELD) || fromDate);
    const guid = extractXmlText(rawComp.GUID) || undefined;

    companies.push({
      name: cleanName,
      financialYearFrom: fromDate,
      booksFrom,
      guid,
    });
  }

  return companies;
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

    const name = extractXmlText(rawLedger['@_NAME'] || rawLedger.NAME);
    if (!name || name === '[object Object]') continue;

    const parent = extractXmlText(rawLedger.PARENT);
    const parentLower = parent.toLowerCase();
    const isDebtor = parentLower.includes('debtor') || parentLower.includes('customer');
    const isCreditor = parentLower.includes('creditor') || parentLower.includes('supplier');

    const alterId = parseInt(extractXmlText(rawLedger.ALTERID) || '0', 10) || 0;
    const phone = extractXmlText(rawLedger.LEDGERPHONE || rawLedger.PHONE) || undefined;
    const email = extractXmlText(rawLedger.EMAIL) || undefined;
    const gstin = extractXmlText(rawLedger.PARTYGSTIN || rawLedger.GSTIN) || undefined;
    const creditDays = parseInt(extractXmlText(rawLedger.BILLCREDITPERIOD) || '30', 10) || 30;

    ledgers.push({
      name: name.trim(),
      parent,
      openingBalance: parseTallyLedgerBalance(rawLedger.OPENINGBALANCE, isDebtor),
      closingBalance: parseTallyLedgerBalance(rawLedger.CLOSINGBALANCE, isDebtor),
      phone,
      email,
      gstin,
      creditDays,
      alterId,
      isSundryDebtor: isDebtor,
      isSundryCreditor: isCreditor,
    });
  }

  return ledgers;
}

export function parseBillsResponse(xmlString: string, today: string = new Date().toISOString().slice(0, 10)): TallyBill[] {
  const parsed = xmlParser.parse(xmlString);
  const envelope = parsed?.ENVELOPE || parsed?.envelope;
  const body = envelope?.BODY || envelope?.body;
  const data = body?.DATA || body?.data;

  // Handle all Tally XML collection variants (COLLECTION.BILL, COLLECTION.BILLS, TALLYMESSAGE, etc.)
  let messages: any[] = [];
  if (data?.COLLECTION?.BILL) {
    messages = toArray(data.COLLECTION.BILL);
  } else if (data?.COLLECTION?.BILLS) {
    messages = toArray(data.COLLECTION.BILLS);
  } else if (data?.TALLYMESSAGE) {
    messages = toArray(data.TALLYMESSAGE).flatMap((m: any) => toArray(m?.BILL || m?.BILLS || m));
  } else if (data?.BILL) {
    messages = toArray(data.BILL);
  } else if (data?.BILLS) {
    messages = toArray(data.BILLS);
  }
  const bills: TallyBill[] = [];

  for (const msg of messages) {
    const rawBill = msg?.BILL || msg?.BILLS || msg;
    if (!rawBill || typeof rawBill !== 'object') continue;

    const partyName = extractXmlText(
      rawBill.PARENT || rawBill.PARTYLEDGERNAME || rawBill.PARTYNAME || rawBill['@_PARENT']
    );
    const billNo = extractXmlText(
      rawBill.BILLREF || rawBill.NAME || rawBill.BILLNO || rawBill['@_BILLREF'] || rawBill['@_NAME']
    );
    if (!partyName || !billNo || partyName === '[object Object]' || billNo === '[object Object]') continue;

    const billDate = parseTallyDate(rawBill.BILLDATE || rawBill.DATE);
    const dueDate = parseTallyDate(rawBill.BILLDUE || rawBill.BILLDATE || rawBill.DATE);

    // Dr / Cr and ISDEBIT sign handling
    const isDebitRaw = rawBill.ISDEBIT !== undefined ? rawBill.ISDEBIT : rawBill['@_ISDEBIT'];
    let isDebit: boolean | undefined = undefined;
    if (isDebitRaw !== undefined && isDebitRaw !== null) {
      const s = extractXmlText(isDebitRaw).trim().toLowerCase();
      if (s === 'yes' || s === 'true' || s === '1') isDebit = true;
      if (s === 'no' || s === 'false' || s === '0') isDebit = false;
    }

    const parsedClosing = parseTallyAmount(rawBill.CLOSINGBALANCE);
    const parsedOpening = parseTallyAmount(rawBill.OPENINGBALANCE);

    let closingAmount = parsedClosing;
    if (isDebit === false && closingAmount > 0) {
      closingAmount = -closingAmount;
    } else if (isDebit === true && closingAmount < 0) {
      closingAmount = Math.abs(closingAmount);
    }

    let openingAmount = parsedOpening;
    if (isDebit === false && openingAmount > 0) {
      openingAmount = -openingAmount;
    } else if (isDebit === true && openingAmount < 0) {
      openingAmount = Math.abs(openingAmount);
    }
    if (openingAmount === 0 && closingAmount !== 0) {
      openingAmount = closingAmount;
    }

    const isPending = closingAmount > 0;
    const daysLate = isPending ? getDaysOverdue(dueDate, today) : 0;

    bills.push({
      partyName: partyName.trim(),
      billNo: billNo.trim(),
      billDate,
      dueDate,
      openingAmount,
      pendingAmount: closingAmount,
      isOverdue: isPending && daysLate > 0,
      daysOverdue: Math.max(0, daysLate),
    });
  }

  return bills;
}

export function parseVouchersResponse(
  xmlString: string,
  today: string = new Date().toISOString().slice(0, 10)
): { challans: TallyChallanSync[]; bills: TallyBill[] } {
  const parsed = xmlParser.parse(xmlString);
  const envelope = parsed?.ENVELOPE || parsed?.envelope;
  const body = envelope?.BODY || envelope?.body;
  const data = body?.DATA || body?.data;

  let messages: any[] = [];
  if (data?.COLLECTION?.VOUCHER) {
    messages = toArray(data.COLLECTION.VOUCHER);
  } else if (data?.TALLYMESSAGE) {
    messages = toArray(data.TALLYMESSAGE).flatMap((m: any) => toArray(m?.VOUCHER || m));
  } else if (data?.VOUCHER) {
    messages = toArray(data.VOUCHER);
  }

  const challans: TallyChallanSync[] = [];
  const bills: TallyBill[] = [];

  for (const v of messages) {
    if (!v || typeof v !== 'object') continue;
    const vchType = extractXmlText(v.VOUCHERTYPENAME || v['@_VCHTYPE'] || v.VCHTYPE);
    const vchTypeLower = vchType.toLowerCase();
    const vchNumber = extractXmlText(v.VOUCHERNUMBER || v['@_VOUCHERNUMBER'] || v.NAME);
    if (!vchNumber || vchNumber === '[object Object]') continue;

    const dateStr = parseTallyDate(v.DATE || v['@_DATE']);
    const partyName = extractXmlText(
      v.PARTYLEDGERNAME || v.PARTYNAME || v.BASICBUYERNAME || v['@_PARTYLEDGERNAME']
    );
    if (!partyName || partyName === '[object Object]') continue;

    const narration = extractXmlText(v.NARRATION);

    // Extract inventory entries (ALLINVENTORYENTRIES.LIST or INVENTORYENTRIES.LIST or ALLINVENTORYENTRIES)
    const rawInvList = toArray(
      v['ALLINVENTORYENTRIES.LIST'] ||
      v['INVENTORYENTRIES.LIST'] ||
      v.ALLINVENTORYENTRIES ||
      v.INVENTORYENTRIES
    );

    const lines: TallyChallanLine[] = [];
    let totalInvAmount = 0;

    for (const inv of rawInvList) {
      if (!inv || typeof inv !== 'object') continue;
      const itemName = extractXmlText(inv.STOCKITEMNAME || inv.ITEMNAME);
      if (!itemName || itemName === '[object Object]') continue;

      const rawQtyStr = extractXmlText(inv.BILLEDQTY || inv.ACTUALQTY || inv.QTY);
      const qtyMatch = rawQtyStr.match(/([-+]?\d+(\.\d+)?)/);
      const qty = qtyMatch && qtyMatch[1] ? Math.abs(parseFloat(qtyMatch[1])) : 1;
      const unit = rawQtyStr.replace(/[-+]?\d+(\.\d+)?/g, '').trim() || 'pcs';

      const ratePaise = Math.abs(parseTallyAmount(inv.RATE));
      let amountPaise = Math.abs(parseTallyAmount(inv.AMOUNT));
      if (amountPaise === 0 && ratePaise > 0 && qty > 0) {
        amountPaise = Math.round(ratePaise * qty);
      }
      totalInvAmount += amountPaise;

      lines.push({
        itemName,
        qty,
        unit,
        rate: ratePaise,
        amount: amountPaise,
      });
    }

    // Delivery Challan / Delivery Note
    const isDeliveryChallan =
      vchTypeLower.includes('delivery') ||
      vchTypeLower.includes('dispatch') ||
      (vchTypeLower.includes('challan') && !vchTypeLower.includes('receipt') && !vchTypeLower.includes('purchase'));

    // Receipt Note / Purchase Challan
    const isReceiptChallan =
      vchTypeLower.includes('receipt note') ||
      vchTypeLower.includes('grn') ||
      vchTypeLower.includes('goods receipt') ||
      (vchTypeLower.includes('challan') && (vchTypeLower.includes('purchase') || vchTypeLower.includes('receipt')));

    if (isDeliveryChallan || isReceiptChallan) {
      challans.push({
        number: vchNumber.trim(),
        date: dateStr,
        partyName: partyName.trim(),
        type: isDeliveryChallan ? 'sales' : 'purchase',
        status: 'delivered',
        lines,
        notes: narration || undefined,
        roundOff: 0,
      });
    }

    // Sales Invoice or Purchase Invoice
    const isSales = vchTypeLower.includes('sales') && !vchTypeLower.includes('order');
    const isPurchase = vchTypeLower.includes('purchase') && !vchTypeLower.includes('order');

    if (isSales || isPurchase) {
      let billAmount = totalInvAmount;
      if (billAmount === 0) {
        const rawLedgers = toArray(v['LEDGERENTRIES.LIST'] || v.LEDGERENTRIES);
        for (const le of rawLedgers) {
          const lName = extractXmlText(le.LEDGERNAME);
          if (lName && lName.toLowerCase() === partyName.toLowerCase()) {
            billAmount = Math.abs(parseTallyAmount(le.AMOUNT));
            break;
          }
        }
      }

      if (billAmount > 0) {
        bills.push({
          partyName: partyName.trim(),
          billNo: vchNumber.trim(),
          billDate: dateStr,
          dueDate: dateStr,
          openingAmount: billAmount,
          pendingAmount: billAmount,
          isOverdue: false,
          daysOverdue: 0,
        });
      }
    }
  }

  return { challans, bills };
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

    const name = extractXmlText(rawItem['@_NAME'] || rawItem.NAME);
    if (!name || name === '[object Object]') continue;

    // e.g. "100 pcs" -> 100
    const rawQtyStr = extractXmlText(rawItem.CLOSINGBALANCE);
    const qtyMatch = rawQtyStr.match(/([-+]?\d+(\.\d+)?)/);
    const closingQty = qtyMatch && qtyMatch[1] ? parseFloat(qtyMatch[1]) : 0;

    const rawUnits = extractXmlText(rawItem.BASEUNITS);
    const baseUnits = rawUnits && rawUnits !== '[object Object]' ? rawUnits : 'pcs';

    const rawParent = extractXmlText(rawItem.PARENT);
    const parent = rawParent && rawParent !== '[object Object]' ? rawParent : undefined;

    const rawPartNo = extractXmlText(rawItem.PARTNO);
    const partNo = rawPartNo && rawPartNo !== '[object Object]' ? rawPartNo : undefined;

    const closingRate = parseTallyAmount(rawItem.CLOSINGRATE);
    const closingValue = parseTallyAmount(rawItem.CLOSINGVALUE);
    const alterId = parseInt(extractXmlText(rawItem.ALTERID) || '0', 10) || 0;

    stockItems.push({
      name: name.trim(),
      parent,
      partNo,
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

  const created = parseInt(extractXmlText(resp?.CREATED) || '0', 10) || 0;
  const altered = parseInt(extractXmlText(resp?.ALTERED) || '0', 10) || 0;
  const errors = parseInt(extractXmlText(resp?.ERRORS) || '0', 10) || 0;

  // Check for error lines
  const lineErrors = resp?.LINEERROR ? toArray(resp.LINEERROR).map(extractXmlText).join('; ') : undefined;

  return {
    success: errors === 0 && (created > 0 || altered > 0),
    created,
    altered,
    errors,
    message: lineErrors,
  };
}
